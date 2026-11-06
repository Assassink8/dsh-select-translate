/**
 * dsh-select-translate —— 宿主半边。
 *
 * 三件事：
 *  1. 在 `webServer` 上挂 `/dsh-select-translate/api/*`（**刻意不在 `/api` 下**——那个前缀被
 *     `@deepseek-ai/dsh-client-connection` 的鉴权栅栏占着，裸请求一律 401）。
 *  2. `POST /translate` 用 **`ctx.llm.stream`** 直接打模型（**不经过 agent**）：
 *     一次裸模型调用、token 级流式，没有工具、没有会话、不落盘。
 *  3. 拉起 / 看护伴生进程（全局取词那一半）。
 *
 * 翻译提示词刻意拆成"逐字节稳定的 system + 只在末尾变化的 user"，
 * 这样固定前缀能被上下文缓存命中。
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import {
  createSettingsStore,
  normalizeModel,
  normalizeApplicationPath,
  normalizeEffort,
  normalizeHotkey,
  DEFAULT_HOTKEY,
} from './settings.mjs'

export const name = 'dsh-select-translate'

/** 硬依赖：路由宿主 + 模型通道 + 子进程。 */
export const inject = ['webServer', 'llm', 'subprocess']

/**
 * DSH 插件设置页的字段（cordis 的 `Config` 约定）。
 *
 * 截图热键放在这里而不是翻译卡片的下拉里：它是"插件配置"，由 DSH 设置页写进 cordis 配置，
 * 重载插件后经 env 交给伴生进程。拿不到宿主提供的 schemastery 时不注册设置字段，其余功能照常。
 */
let Schema = null
try {
  ({ default: Schema } = await import('@deepseek-ai/schemastery'))
} catch {
  Schema = null
}

export const Config = Schema?.object
  ? Schema.object({
      // 只填末键：A–Z、0–9 或 F1–F12（前缀固定 Ctrl+Alt）。用输入框而不是下拉，避免 48 项长菜单。
      hotkey: Schema.string()
        .pattern(/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/)
        .default(DEFAULT_HOTKEY)
        .description('截图翻译热键的末键：前缀固定 Ctrl+Alt，填 A–Z、0–9 或 F1–F12（默认 S）。改完立即生效。'),
      // 标记 volatile：DSH 设置页只把 volatile 字段暴露成可写的配置表单（settings.describe → configForms）。
      // 不标的话字段只存在于 profile 补丁里，Web 设置页看不到。
    }).volatile()
  : undefined

const API_PREFIX = '/dsh-select-translate/api'

/**
 * 路由令牌。
 *
 * 这些路由挂在 `/api` 鉴权栅栏**之外**（§6 第 2 条），所以本机任何进程都能打。
 * 其中最要命的是 `/translate`（能花掉你的额度）与 `/system/restart`。
 *
 * 令牌每次启动随机生成、只在内存里 + 经 env 传给伴生进程；校验要求请求带
 * `x-dsh-select-translate-token` 头。**为什么是自定义头**：跨源网页要带自定义头就必须先过 CORS 预检，
 * 而我们从不回 CORS 头 → 浏览器根本不发这个请求。这是挡住"网页偷打本机端口"的关键，
 * 比把令牌塞进 query/body 强得多（后者用 `text/plain` 就能免预检发出）。
 *
 * 说清楚边界：**能扫本机端口、能读文件的本地进程仍然拿得到**（伴生进程会把令牌写进
 * 运行时文件给排障工具用）。这道锁防的是网页与顺手一发的脚本，不是同用户的恶意程序。
 */
const API_TOKEN = process.env.DSH_ST_TOKEN || randomBytes(32).toString('hex')

/** 当前令牌（伴生进程经 env 拿；排障工具从运行时文件读）。导出是为了单测。 */
export function getApiToken() {
  return API_TOKEN
}

/** 请求头里是否带了正确的令牌（常量时间比较，避免时序侧信道）。 */
export function isAuthorizedToken(headers) {
  const given = headers?.['x-dsh-select-translate-token']
  if (typeof given !== 'string' || given === '') return false
  const a = Buffer.from(given)
  const b = Buffer.from(API_TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}
/** 原文上限。**与 `companion/main.mjs` 的 MAX_TEXT 必须一致**（两边各自拦一道）。 */
const MAX_TEXT = 15000

/**
 * 本插件是否支持当前平台。
 *
 * 原生取词与卡片是 Windows 专属：UIA（COM）、GDI+、`user32`/`kernel32` 全靠 koffi 直调。
 * 其它平台如果照常加载，会 spawn 出一个必然崩溃的伴生进程 → 退出 → 退避重启，无尽循环、
 * 日志刷屏，而插件表现为"完全没用"。
 * 市场注册表**没有 OS 字段**（只能用描述写清"仅 Windows"），所以这一道守卫必须写在代码里。
 * 抽成函数是为了能单测（`apply` 里那条分支没法在非 Windows 机器上真跑）。
 */
export function isSupportedPlatform(platform = process.platform) {
  return platform === 'win32'
}

/**
 * 固定提示词：它是缓存前缀（方案 §4：固定前缀命中上下文缓存），**改一次就让缓存失效一次**。
 * 所以只在"提示词确实没覆盖某类输入"时才动，并同步更新 `test/host.test.mjs` 里钉死的那份。
 * 导出是为了让单测把它钉住。
 */
export const SYSTEM_PROMPT = [
  '你是一个翻译引擎。把用户给出的文本翻译成用户指定的语言。',
  '规则：',
  '1. 只输出译文。不要前言、不要解释、不要括号注释、不要语言标注、不要复述原文。',
  '2. 保留原文里的代码、变量名、文件路径、URL、命令与专有名词，不要翻译它们。',
  '3. 保持原文的结构：原文怎么分段，译文就怎么分段；段落之间保留一个空行。',
  '4. 原文若含编号或分条（1. / 2) / ① / - / •），译文按条分行输出，编号原样保留，不要合并成一段。',
  '5. 用该领域通行的译法；拿不准时保留原文。',
  '6. 公式原样保留：原文里用 $...$、$$...$$、\\(...\\)、\\[...\\] 写出的公式（包括其中的 LaTeX 命令），翻译时原样照抄，不要改写、不要翻译、不要去掉定界符；原文是独立成行的公式却没有定界符时，用 $$...$$ 包起来。',
  '7. 原文里的公式如果只是普通文本（PDF 文字层常见的压平形式，如 √ 后面的分子分母被拆到不同行、上标变成普通数字、希腊字母与 ∥ 混排），按数学含义还原成 LaTeX：分式用 \\frac，根号用 \\sqrt，范数用 \\left\\| \\right\\|，上下标还原，再按第 6 条输出。',
].join('\n')

/**
 * 纯公式选区的转写提示词：不翻译、不做解释，只要 LaTeX。
 */
export const FORMULA_PROMPT = [
  '你是一个数学公式转写器。把用户给出的内容转写成 LaTeX 公式。',
  '规则：',
  '1. 只输出 LaTeX，不要翻译、不要解释、不要加代码块围栏。',
  '2. 独立公式用 $$...$$ 包裹；如果原文是行内片段，用 $...$。',
  '3. 原文可能来自 PDF 文字层：分式被拆成多行、根号在分子前、上标被拍平成普通数字（如 ∥z∥22 表示 ‖z‖_2^2），请按数学含义还原。',
  '4. 变量名、希腊字母、求和/积分/范数保留原意，不要改成中文词语。',
  '5. 原文里的公式编号（如 (1)）保留在公式外侧或用 \\tag{}。',
  '6. 如果内容其实不是公式（是普通句子），就把该句子原样输出。',
].join('\n')

/**
 * 截图 OCR 出来的公式：识别结果本身可能已经错字/断行，规则要专门交代。
 */
export const FORMULA_PROMPT_OCR = [
  '你是一个数学公式转写器。输入来自截图 OCR，可能有空格、断行、上标丢失和个别错字。',
  '请按数学含义还原成 LaTeX。',
  '规则：',
  '1. 只输出 LaTeX，不要解释、不要代码块围栏。',
  '2. 独立公式用 $$...$$ 包裹；行内片段用 $...$。',
  '3. 典型 OCR 失真：字母间夹空格、上下标被拍平、分式被拆成两行、√ 与 ∥ 混排、分数线丢失；请还原分式、根号、范数、上下标。',
  '4. 不要翻译变量名和数学符号，不要补写原文没有的内容。',
  '5. 如果 OCR 内容其实不是公式，就把它当作普通文本原样输出。',
].join('\n')

/** 公式里高频出现的符号；用于判断选区是不是"一整段公式"。 */
const FORMULA_SYMBOL = /[√∫∮∑∏±×÷≤≥≈≠∞∂∇∈∉⊂⊆∪∩∼≃∥·θαβγδελσφωΓΔΣΠΦΨΩϵ−→⇒↔⌈⌉⌊⌋∝≡⊥]/g

/**
 * 选区是不是"一段公式"（而不是一句话）。
 * 依据：强符号密度 + 极少的汉字 + 长度有限；或者明显的"等式连等式"。
 */
export function looksLikeFormulaSelection(text) {
  const body = String(text ?? '').trim()
  if (body === '' || body.length > 600) return false
  const symbols = (body.match(FORMULA_SYMBOL) ?? []).length
  const cjk = (body.match(CJK_CHAR) ?? []).length
  if (cjk > 3) return false
  // 公式的"密度"：数字/运算符/括号占非空白字符的比例。普通句子即使夹一个 ∈ 也过不了。
  const mathChars = (body.match(/[0-9+\-*/=<>|^_{}()[\]\\]/g) ?? []).length + symbols
  const density = mathChars / Math.max(1, body.replace(/\s+/g, '').length)
  if (symbols >= 1 && density >= 0.35) return true
  if (symbols >= 2 && density >= 0.2) return true
  const equals = (body.match(/[=≈≤≥<>]/g) ?? []).length
  if (equals >= 2 && body.length <= 200) return true
  // 短小的等式（如 `z̃ = z̄ + n`、`P(A|B) = P(B|A)P(A)/P(B)`）：即使没有特殊符号也算公式
  if (equals >= 1 && body.length <= 60 && density >= 0.22) return true
  return false
}

/** 选系统提示词：整段公式只转 LaTeX；截图 OCR 的公式另有一份交代 OCR 失真的提示词。 */
export function choosePrompt({ text, ocr = false, formula = false }) {
  const formulaMode = formula === true || looksLikeFormulaSelection(text)
  if (!formulaMode) return SYSTEM_PROMPT
  return ocr === true ? FORMULA_PROMPT_OCR : FORMULA_PROMPT
}

/** 汉字（CJK 统一表意文字）。`auto` 判语种时**数个数**，不再"见到一个就当中文"。 */
const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g/** 拉丁词（英文等拉丁字母语言按"词"计量）。 */
const LATIN_WORD = /[A-Za-z][A-Za-z'’-]*/g

const COMPANION_ENTRY = fileURLToPath(new URL('./companion/main.mjs', import.meta.url))
const COMPANION_CWD = fileURLToPath(new URL('.', import.meta.url))
const PORT_PATTERN = /listening on http:\/\/127\.0\.0\.1:(\d+)/

/* ────────────────────────── 小工具 ────────────────────────── */

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function readBody(req, limit = 1 << 20) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.byteLength
    if (size > limit) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')
}

/** SSE 写口；响应已结束就静默丢弃。 */
function makeSink(res) {
  return {
    send(payload) {
      if (res.writableEnded === true) return
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    },
  }
}

/* ────────────────────────── 伴生进程 ────────────────────────── */

function koffiHint() {
  const argv1 = process.argv[1]
  return typeof argv1 === 'string' && argv1.endsWith('.js') ? argv1 : ''
}

/**
 * 伴生进程生命周期。
 *
 * 三处细节来自参考实现踩过的坑，一个都不能省：
 *  - `done` 回调要**认身份**（迟到的退出会抹掉新进程的状态）；
 *  - `restart` 里必须**复位 stopping**，否则看门狗永久失效；
 *  - 停不掉就 `taskkill /T /F` 补刀，避免两个伴生进程各自开一个浮层。
 */
function createCompanion(ctx, options = {}) {
  const maxRestarts = 5
  /** 每次 spawn 时把当前设置经 env 给伴生进程（拿不到就按默认）。 */
  const readSettings = options.settings ?? (() => ({ mode: 'auto' }))
  /** 截图热键来自插件配置（DSH 设置页），不写进 settings 文件。 */
  const readHotkey = options.hotkey ?? (() => DEFAULT_HOTKEY)
  let child = null
  let restartTimer = null
  let stopping = false
  let status = { state: 'stopped', restarts: 0 }

  function origin() {
    const port = ctx.webServer?.port
    return typeof port === 'number' && port > 0 ? `http://127.0.0.1:${port}` : ''
  }

  function forceKill(pid) {
    if (typeof pid !== 'number' || pid <= 0 || process.platform !== 'win32') return
    try {
      const killer = ctx.subprocess.spawn({
        argv: ['taskkill', '/pid', String(pid), '/T', '/F'],
        cwd: COMPANION_CWD,
        stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
        graceMs: 500,
      })
      void killer.done.catch(() => {})
    } catch {
      /* 补刀失败只能算了 */
    }
  }

  function start() {
    if (stopping || child !== null) return
    status = { ...status, state: 'starting', startedAt: Date.now(), lastError: undefined }
    let spawned
    try {
      spawned = ctx.subprocess.spawn({
        // process.execPath 在桌面端是 Electron 二进制；靠 ELECTRON_RUN_AS_NODE 让它当 Node 跑，
        // 这样既不猜 node 路径，也不会再拉起一个 GUI 实例。
        argv: [process.execPath, COMPANION_ENTRY],
        cwd: COMPANION_CWD,
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: 800,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          DSH_ST_KOFFI_HINT: koffiHint(),
          DSH_ST_ORIGIN: origin(),
          // 路由令牌：伴生进程要拿它去打 /translate 与 /settings（见 API_TOKEN 注释）
          DSH_ST_TOKEN: API_TOKEN,
          // 初始触发模式：伴生进程启动时就读到，免得"刚启动那一下"用的是默认模式
          DSH_ST_MODE: String(readSettings().mode ?? 'auto'),
          DSH_ST_MODEL: JSON.stringify(readSettings().model ?? null),
          DSH_ST_EFFORT: String(readSettings().effort ?? ''),
          // 截图翻译的末键（前缀固定 Ctrl+Alt，见 settings.mjs 的 HOTKEY_KEYS）
          DSH_ST_HOTKEY: String(readHotkey()),
          DSH_ST_DISABLED_APPS: JSON.stringify(readSettings().disabledApps ?? []),
        },
      })
    } catch (error) {
      status = { ...status, state: 'failed', lastError: error instanceof Error ? error.message : String(error) }
      return
    }
    child = spawned

    spawned.stdout?.on('data', (chunk) => {
      const match = PORT_PATTERN.exec(chunk.toString('utf8'))
      if (match === null) return
      status = { ...status, state: 'running', port: Number(match[1]) }
      ctx.logger?.info?.(`dsh-select-translate: companion ready on ${match[1]}`)
    })
    spawned.stderr?.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim()
      if (text !== '') status = { ...status, lastError: text.slice(-400) }
    })

    void spawned.done.then((outcome) => {
      if (child !== spawned) return // 认身份：老进程迟到的退出不许动新进程的状态
      child = null
      if (stopping) {
        status = { ...status, state: 'stopped', port: undefined }
        return
      }
      status = {
        ...status,
        state: 'failed',
        port: undefined,
        lastError: `companion exited (code=${outcome?.exitCode ?? 'null'})`,
      }
      ctx.logger?.warn?.(`dsh-select-translate: companion exited code=${outcome?.exitCode ?? 'null'}`)
      if (status.restarts < maxRestarts) {
        status.restarts += 1
        restartTimer = setTimeout(() => {
          restartTimer = null
          if (!stopping) start()
        }, Math.min(30000, 1000 * 2 ** status.restarts))
      }
    })
  }

  function stop() {
    stopping = true
    if (restartTimer !== null) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    const doomed = child
    child = null
    status = { ...status, state: 'stopped', port: undefined }
    if (doomed === null) return null
    try {
      doomed.terminate()
    } catch {
      /* 已经死了 */
    }
    return doomed
  }

  async function restart() {
    const doomed = stop()
    if (doomed !== null) {
      try {
        await doomed.waitForExit()
      } catch {
        /* 等不到就直接往下走，反正 start 会另起一个 */
      }
    }
    stopping = false // 不复位的话看门狗永久失效
    start()
    return status
  }

  /**
   * 把设置推给**正在跑**的伴生进程（用户切了 ⚡ 或改了配置时）。
   * 进程不在就当没发生：下次 spawn 会用 env 给到最新值。
   */
  async function pushSettings(patch) {
    const port = status.port
    if (status.state !== 'running' || typeof port !== 'number' || port <= 0) return false
    // 重试一次：本机短连接偶发 ECONNRESET（连接池坏连接），不该让"改模式"静默失效
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // 只带调用方明确给过的字段：热键推送不能顺手把 model/effort/disabledApps 清空
        const body = { ...patch }
        if ('model' in patch) body.model = patch.model ?? null
        if ('effort' in patch) body.effort = patch.effort ?? null
        if ('disabledApps' in patch) body.disabledApps = patch.disabledApps ?? []
        const response = await fetch(`http://127.0.0.1:${port}/settings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (response.ok === true) return true
      } catch {
        /* 换一次连接再试 */
      }
    }
    return false
  }

  return {
    start,
    stop,
    restart,
    pushSettings,
    status: () => ({ ...status }),
    install() {
      ctx.effect(
        () => {
          start()
          return () => {
            stop()
          }
        },
        'dsh-select-translate: companion',
      )
    },
  }
}

/* ────────────────────────── 模型通道 ────────────────────────── */

export function routeOf(ctx, settings = {}) {
  const custom = normalizeModel(settings.model)
  if (custom !== null) return custom
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (typeof selection?.provider === 'string' && typeof selection.model === 'string') {
      return { provider: selection.provider, model: selection.model, reasoningEffort: selection.reasoningEffort }
    }
  } catch {
    /* 服务缺席就走部署默认 */
  }
  return undefined
}

/**
 * 挑"最不思考"的一档。
 *
 * 我们想要"关掉深度思考"；DSH 里这个旋钮叫 `reasoningEffort`，
 * 有没有真正的"关"取决于模型能力——所以按名字优先找 off/none/minimal/low，
 * 找不到就取适配器给的第一项（列表按适配器偏好排序）。
 */
export function pickEffortFrom(efforts) {
  if (!Array.isArray(efforts) || efforts.length === 0) return undefined
  for (const wanted of ['off', 'none', 'disabled', 'minimal', 'low']) {
    const hit = efforts.find((effort) => String(effort?.id ?? '').toLowerCase() === wanted)
    if (hit !== undefined) return hit.id
  }
  return efforts[0]?.id
}

/** 模型声明的推理等级列表（拿不到就当"不支持"）。 */
export async function reasoningEfforts(ctx, provider, model) {
  try {
    const info = await ctx.llm.resolveModelInfo(provider, model)
    return Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : []
  } catch {
    return []
  }
}

export async function pickEffort(ctx, provider, model) {
  return pickEffortFrom(await reasoningEfforts(ctx, provider, model))
}

/**
 * 实际使用的推理等级：用户显式选过且**该模型支持**就用它；
 * 否则回落到自动（挑最省的一档）。换模型后旧设置不会把请求打挂。
 */
export async function resolveEffort(ctx, route, settings = {}) {
  const efforts = await reasoningEfforts(ctx, route.provider, route.model)
  const chosen = normalizeEffort(settings?.effort)
  if (chosen !== null && efforts.some((effort) => String(effort?.id ?? '') === chosen)) return chosen
  return pickEffortFrom(efforts)
}

/**
 * `auto` 时判断该译成哪种语言：**按"谁占主导"判，不是"有没有汉字"**。
 *
 * 旧实现是 `CJK.test(text)` —— 只要原文里出现**一个**汉字就判成"中文"，于是译成英文；
 * 结果"开头一句中文 + 后面一大段英文"的选区整段被当成中文，输出还是英文（实测踩过）。
 * 现在按信息量比：**约 2 个汉字 ≈ 1 个英文词**；汉字占主导才译成英文，否则译成中文。
 * 没有汉字 → 中文；没有拉丁词（纯中文/纯符号）→ 英文。
 */
export function detectTargetLanguage(text) {
  const source = String(text ?? '')
  const cjk = (source.match(CJK_CHAR) ?? []).length
  const words = (source.match(LATIN_WORD) ?? []).length
  if (cjk === 0) return 'zh'
  if (words === 0) return 'en'
  return cjk >= words * 2 ? 'en' : 'zh'
}

/**
 * 目标语言标签（写进提示词的"目标语言：…"）。
 *  - `auto`：按主导语言判定（见 `detectTargetLanguage`）；
 *  - `zh` / `en`：预设；
 *  - **其它字符串 = 用户自定义语种**（如 `日本語`），原样交给模型。
 */
export function targetLabel(target, text) {
  if (target === 'zh') return '中文（简体）'
  if (target === 'en') return 'English'
  if (target === 'auto') return detectTargetLanguage(text) === 'en' ? 'English' : '中文（简体）'
  return String(target)
}

/**
 * 目标语言参数：预设白名单 + **自定义语种**（自由字符串）。
 * 自由字符串要截断：它会原样进提示词，不能让任意长内容挤进来。
 */
export function normalizeTarget(value) {
  if (typeof value !== 'string') return 'auto'
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'auto') return 'auto'
  if (trimmed === 'zh' || trimmed === 'en') return trimmed
  return trimmed.slice(0, 24)
}

/**
 * 输出上限按原文长度动态估算。
 *
 * 固定值一定会出问题：**上限被截断时 `finish` 会是 `max-tokens`**（实测 3000 字输入配 1800 上限
 * 就截断了，输出到 3723 字还没收尾）。所以按长度放大，并把天花板抬到 8192（15000 字输入
 * 译成中文约 7500 字 ≈ 4000–5000 token，4096 不够）。
 * 下限仍保留 1024（短句不浪费额度）。
 */
export function maxTokensFor(text) {
  return Math.min(8192, Math.max(1024, Math.ceil(String(text).length * 0.8)))
}

/* ────────────────────────── 模型目录 ────────────────────────── */

/**
 * 卡片下拉里"可选模型"的清单（供应商 × 模型）。
 *
 * 只读 `ctx.llm` 已注册的适配器，不读设置、不落盘：当前选的是哪一条由卡片自己记着，
 * 这里只回答"有哪些可选项"。适配器可能现拉网络（OAuth 供应商会请求 models 接口），
 * 所以并发拉取、每家 4s 超时，结果整体缓存 30s；超时/失败只跳过那一家，不拖垮整个菜单。
 */
const MODEL_LIST_TIMEOUT_MS = 4000
const MODEL_LIST_CACHE_MS = 30_000
let modelListCache = { at: 0, models: null }

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms)
      timer.unref?.()
    }),
  ])
}

/** @returns {Promise<Array<{provider:string, providerName:string, model:string, name:string}>>} */
export async function listAvailableModels(llm) {
  const now = Date.now()
  if (modelListCache.models !== null && now - modelListCache.at < MODEL_LIST_CACHE_MS) {
    return modelListCache.models
  }
  let providers = []
  try {
    providers = typeof llm?.listProviders === 'function' ? (llm.listProviders() ?? []) : []
  } catch {
    providers = []
  }
  if (typeof llm?.listModels !== 'function') return []
  const groups = await Promise.all(
    providers.map(async (provider) => {
      const id = typeof provider?.id === 'string' ? provider.id : ''
      if (id === '') return []
      try {
        const models = await withTimeout(Promise.resolve(llm.listModels(id)), MODEL_LIST_TIMEOUT_MS)
        if (!Array.isArray(models)) return []
        const providerName = typeof provider?.name === 'string' && provider.name !== '' ? provider.name : id
        return models
          .filter((model) => typeof model?.id === 'string' && model.id !== '')
          .map((model) => ({
            provider: id,
            providerName,
            model: model.id,
            name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
          }))
      } catch {
        return []
      }
    }),
  )
  const seen = new Set()
  const models = []
  for (const group of groups) {
    for (const entry of group) {
      const key = entry.provider + '\u0000' + entry.model
      if (seen.has(key)) continue
      seen.add(key)
      models.push(entry)
    }
  }
  models.sort((a, b) => a.providerName.localeCompare(b.providerName) || a.name.localeCompare(b.name))
  // 空结果不缓存：供应商可能还在启动/登录，下一次打开菜单要能重新读到。
  if (models.length > 0) modelListCache = { at: now, models }
  return models
}

/* ────────────────────────── 路由 ────────────────────────── */

/**
 * 从模型信息里挑出"跟容量有关"的字段（排障用）。
 * 目的：`maxTokensFor` 的天花板现在是 8192，但**模型的真实输出上限是多少**只能问适配器，
 * 不该靠猜。这里不做任何解析，只把相关键暴露出来（未知结构就只给 keys）。
 */
export function modelLimits(info) {
  if (info === null || typeof info !== 'object') return null
  const out = { keys: Object.keys(info).slice(0, 40) }
  for (const key of ['maxOutputTokens', 'maxOutput', 'maxTokens', 'contextWindow', 'contextLength', 'context', 'maxInputTokens']) {
    if (info[key] !== undefined) out[key] = info[key]
  }
  for (const key of ['limits', 'capabilities', 'output']) {
    const value = info[key]
    if (value !== null && typeof value === 'object') out[key] = value
  }
  return out
}

async function handleStatus(ctx, res, companion, settings) {
  const route = routeOf(ctx, settings?.get())
  const model = route === undefined ? null : { provider: route.provider, model: route.model, reasoningEffort: await pickEffort(ctx, route.provider, route.model) }
  let limits = null
  if (route !== undefined) {
    try {
      limits = modelLimits(await ctx.llm.resolveModelInfo(route.provider, route.model))
    } catch {
      /* 拿不到就算了，别让排障端点也挂掉 */
    }
  }
  json(res, 200, {
    ok: true,
    plugin: name,
    companion: companion.status(),
    model: model === null ? null : { ...model, limits },
    settings: settings === undefined ? null : { ...settings.get(), file: settings.file },
  })
}

/** 翻译路由（导出以便单测 SSE 帧契约：伴生进程就是照这些帧解析的）。 */
export async function handleTranslate(ctx, req, res, settings = {}) {
  let args
  try {
    const parsed = JSON.parse((await readBody(req)) || '{}')
    const text = typeof parsed.text === 'string' ? parsed.text : ''
    if (text.trim() === '') throw new Error('text is empty')
    if (text.length > MAX_TEXT) throw new Error(`text is longer than ${MAX_TEXT} characters`)
    args = {
      text,
      target: normalizeTarget(parsed.target),
      requestId: typeof parsed.requestId === 'string' ? parsed.requestId : '',
    }
  } catch (error) {
    return json(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) })
  }

  const route = routeOf(ctx, settings)
  if (route === undefined) {
    return json(res, 503, { ok: false, message: '没有可用的默认模型，请先在 DSH 设置里配置模型' })
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })
  const sink = makeSink(res)

  // 客户端断开（Esc / 新一次划词）→ abort，模型调用随之取消
  const abort = new AbortController()
  res.on('close', () => abort.abort())

  // 推理等级：用户选过且模型支持就用，否则自动挑最省的（见 resolveEffort）
  const effort = await resolveEffort(ctx, route, settings)
  const startedAt = Date.now()
  let firstDeltaAt = 0
  let answer = ''
  let usage = null
  let finish = null

  sink.send({
    type: 'start',
    requestId: args.requestId,
    provider: route.provider,
    model: route.model,
    reasoningEffort: effort ?? null,
    // 卡片头部要显示"自动"到底判成了哪种语言（见 companion/card.mjs 的 targetText）。
    resolved: args.target === 'auto' ? detectTargetLanguage(args.text) : args.target,
  })

  try {
    // 首字看门狗 + 对冲（hedge）：
    // WorkBuddy 这类公网中继在高峰期排队，首字可能十几秒。到 6 秒还没首字时**不取消第一路**，
    // 而是并行再发一路，谁先出字谁赢、另一路立刻取消。
    // 这样既把长尾前移，又不会像"先掐再重试"那样把本来 8 秒会出字的请求误杀成 26 秒超时。
    const HEDGE_AFTER_MS = 6000
    const GROUP_DEADLINE_MS = 26000
    const MAX_GROUPS = 2
    // 划中的是一整段公式（PDF 文字层常见）时走"只转 LaTeX"的提示词，不翻译。
    // 截图 OCR 由伴生判定后显式带 `formula: true`（OCR 文本空格/错字多，本地密度判据不可靠）。
    const ocrMode = args.ocr === true
    const formulaMode = args.formula === true || looksLikeFormulaSelection(args.text)
    let attempts = 0
    let lastError = null
    let anyTimeout = false

    const runGroup = async () => {
      const streams = []
      const events = []
      let wake = null
      let timedOut = false

      const push = (event) => {
        events.push(event)
        if (wake !== null) {
          const fn = wake
          wake = null
          fn()
        }
      }

      const take = () => new Promise((resolve) => {
        if (events.length > 0) return resolve(events.shift())
        if (abort.signal.aborted) return resolve(null)
        const onAbort = () => {
          abort.signal.removeEventListener('abort', onAbort)
          wake = null
          resolve(null)
        }
        wake = () => {
          abort.signal.removeEventListener('abort', onAbort)
          resolve(events.length > 0 ? events.shift() : null)
        }
        abort.signal.addEventListener('abort', onAbort, { once: true })
      })

      const launch = () => {
        const controller = new AbortController()
        const record = { tag: streams.length, controller, ended: false }
        streams.push(record)
        ;(async () => {
          try {
            const stream = ctx.llm.stream({
              provider: route.provider,
              model: route.model,
              ...(effort === undefined ? {} : { reasoningEffort: effort }),
              system: choosePrompt({ text: args.text, ocr: ocrMode, formula: formulaMode }),
              messages: [
                {
                  role: 'user',
                  content: [{
                    type: 'text',
                    text: formulaMode
                      ? args.text
                      : `目标语言：${targetLabel(args.target, args.text)}\n\n${args.text}${ocrMode ? '\n\n（以上文字来自截图 OCR，可能有空格或个别错字；公式请按数学含义还原成 LaTeX。）' : ''}`,
                  }],
                },
              ],
              temperature: 0.3,
              maxTokens: maxTokensFor(args.text),
              signal: controller.signal,
            })
            for await (const chunk of stream) push({ tag: record.tag, kind: 'chunk', chunk })
          } catch (error) {
            push({ tag: record.tag, kind: 'error', error })
          } finally {
            record.ended = true
            push({ tag: record.tag, kind: 'end' })
          }
        })()
        return record
      }

      const first = launch()
      let hedgeTimer = setTimeout(() => {
        hedgeTimer = null
        if (firstDeltaAt === 0 && !abort.signal.aborted) launch()
      }, HEDGE_AFTER_MS)
      const deadlineTimer = setTimeout(() => {
        timedOut = true
        for (const stream of streams) stream.controller.abort()
      }, GROUP_DEADLINE_MS)

      let winner = null
      let answerText = ''
      let groupFinish = null
      let groupUsage = null
      let groupError = null
      let firstInGroup = 0

      const live = () => streams.some((stream) => !stream.ended)

      try {
        while (true) {
          const event = await take()
          // 客户端断开：取消所有在途流，交给外层按"取消"处理
          if (event === null) {
            for (const stream of streams) stream.controller.abort()
            return { aborted: true, answer: answerText, finish: groupFinish, usage: groupUsage, error: null, attempts: streams.length }
          }
          const { tag, kind, chunk, error } = event
          if (kind === 'chunk') {
            if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
              if (winner === null) {
                winner = tag
                if (firstDeltaAt === 0) firstDeltaAt = Date.now()
                if (firstInGroup === 0) firstInGroup = firstDeltaAt
                if (hedgeTimer !== null) {
                  clearTimeout(hedgeTimer)
                  hedgeTimer = null
                }
                // 输的那一路立刻取消：不再计费，也不会把它的 delta 混进来
                for (const stream of streams) {
                  if (stream.tag !== winner) stream.controller.abort()
                }
              }
              if (tag !== winner) continue
              answerText += chunk.text
              // delta 也必须带 requestId：两端客户端都只在"帧里带了 requestId"时才做比较，
              // 不带的话"迟到的旧译文不许盖到新卡片上"这条保护对 delta 等于没有。
              sink.send({ type: 'delta', text: chunk.text, requestId: args.requestId })
            } else if (chunk?.type === 'usage') {
              if (winner === null || tag === winner) groupUsage = chunk.usage ?? null
            } else if (chunk?.type === 'finish') {
              if (winner === null && firstInGroup === 0) winner = tag
              if (winner === null || tag === winner) groupFinish = chunk.reason ?? null
            }
          } else if (kind === 'error') {
            if (winner === tag) {
              groupError = error
              break
            }
            if (winner === null) {
              groupError = error
              // 还没人选赢且已经没有活流：这一组到此为止（空回答 / 失败）
              if (!live()) break
            }
          } else {
            // end
            if (winner !== null && tag === winner) break
            if (winner === null && !live()) break
          }
        }
      } finally {
        if (hedgeTimer !== null) clearTimeout(hedgeTimer)
        clearTimeout(deadlineTimer)
        for (const stream of streams) {
          if (!stream.ended) stream.controller.abort()
        }
      }

      return {
        aborted: false,
        timedOut,
        answer: answerText,
        finish: groupFinish,
        usage: groupUsage,
        error: winner !== null ? groupError : null,
        emptyError: winner === null ? groupError : null,
        attempts: streams.length,
        firstInGroup,
      }
    }

    let group = 0
    while (group < MAX_GROUPS && !abort.signal.aborted) {
      group += 1
      const result = await runGroup()
      if (result.aborted) return
      attempts = Math.max(attempts, result.attempts)

      // 一个字都没出（模型只回思考 / 组内所有路都失败）：没人看过内容，安全地再来一组
      if (result.answer === '' && group < MAX_GROUPS && !abort.signal.aborted && !result.timedOut) {
        ctx.logger?.warn?.(`dsh-select-translate: no first token yet (${result.emptyError?.message ?? 'empty answer'}), retrying (group ${group}/${MAX_GROUPS})`)
        lastError = result.emptyError ?? lastError
        continue
      }
      if (result.answer === '' && result.timedOut) {
        anyTimeout = true
        lastError = result.emptyError ?? lastError
        break
      }

      answer = result.answer
      finish = result.finish
      usage = result.usage
      lastError = result.error ?? null
      if (result.error !== null) throw result.error
      break
    }

    if (answer === '' && (anyTimeout || lastError !== null)) {
      if (anyTimeout && !abort.signal.aborted) {
        throw new Error(`模型 ${GROUP_DEADLINE_MS / 1000} 秒内没有返回首字（可能在中继排队），请重试`)
      }
      throw lastError ?? new Error('模型没有返回内容')
    }

    // 公式模式模型偶尔不带定界符：兜底包一层 $$…$$，让卡片能渲染（有 $ 时尊重模型输出）
    if (formulaMode && answer !== '' && !answer.includes('$')) {
      answer = '$$ ' + answer.trim() + ' $$'
    }

    sink.send({
      type: 'done',
      requestId: args.requestId,
      text: answer,
      usage,
      finish,
      // attempts > 1 = 首字看门狗触发过对冲（排障与用户提示用）
      timing: { totalMs: Date.now() - startedAt, firstTokenMs: firstDeltaAt === 0 ? null : firstDeltaAt - startedAt, attempts },
    })
  } catch (error) {
    // 正常取消（Esc / 新一次划词 / 关卡片）不算失败：别在日志里刷 warn，也别当成错误帧。
    if (abort.signal.aborted) {
      sink.send({ type: 'error', requestId: args.requestId, message: 'cancelled' })
    } else {
      // 只记 message，不把 error 对象整个交给宿主日志：适配器可能把请求体塞进 error，
      // 那样原文就会进 DSH 日志，与 README 的「不落盘」承诺自相矛盾。
      ctx.logger?.warn?.('dsh-select-translate: translate failed', error instanceof Error ? error.message : String(error))
      sink.send({ type: 'error', requestId: args.requestId, message: error instanceof Error ? error.message : String(error) })
    }
  } finally {
    res.end()
  }
}

export function apply(ctx, config = {}) {
  // 平台守卫（见 isSupportedPlatform）：非 Windows 直接静默降级——不 spawn、不注册路由。
  // 不这么做的话，macOS/Linux 上会陷入"伴生进程崩溃 → 退避重启"循环。
  if (!isSupportedPlatform()) {
    ctx.logger?.warn?.('dsh-select-translate: 本插件只在 Windows 上工作（UIA 取词 + GDI+ 原生卡片），已跳过加载')
    return
  }
  // 截图热键：插件配置里的值（设置页写 cordis 配置）优先，非法/缺失回落默认 S。
  // Config 是 volatile 对象，cordis 传给 apply 的是带 `.get()` 的实时视图；每次 spawn 都重读，
  // 这样设置页改完（不重载插件）也能让下一次拉起伴生时用上新键。
  const readConfig = () => (typeof config?.get === 'function' ? config.get() : config) ?? {}
  const readHotkey = () => normalizeHotkey(readConfig()?.hotkey) ?? DEFAULT_HOTKEY
  const settings = createSettingsStore()
  const companion = createCompanion(ctx, { settings: () => settings.get(), hotkey: readHotkey })
  companion.install()

  // 设置页改了热键：伴生已经在跑就热推给它的 /settings（它会注销旧键、注册新键），不用重启进程。
  let lastHotkey = readHotkey()
  const syncHotkey = () => {
    const next = readHotkey()
    if (next === lastHotkey) return
    lastHotkey = next
    void companion.pushSettings({ hotkey: next })
  }
  ctx.on?.('settings/document-updated', (id) => {
    if (id === name) syncHotkey()
  })
  // 兜底：settings 事件是在 settings 服务自己的上下文里 emit 的，插件 ctx 不一定收得到；
  // 2 秒轮询一次配置视图，保证设置页改键最多 2 秒后生效（读的是内存里的 schema 值，开销可忽略）。
  ctx.effect(() => {
    const timer = setInterval(syncHotkey, 2000)
    timer.unref?.()
    return () => clearInterval(timer)
  })

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: (req, res) => {
          void (async () => {
            const url = new URL(String(req.url ?? '/'), 'http://127.0.0.1')
            const method = String(req.method ?? 'GET').toUpperCase()
            try {
              // 路由令牌（见 API_TOKEN 注释）：`/ping` 放行（无害的存活探测），其余一律要带
              // `x-dsh-select-translate-token`。**用自定义头而不是 query/body** 是为了让跨源网页根本发不出请求 ——
              // 带自定义头的跨源请求会触发 CORS 预检，而我们从不回 CORS 头，浏览器直接拦下。
              if (url.pathname !== `${API_PREFIX}/ping` && !isAuthorizedToken(req.headers)) {
                return json(res, 401, { ok: false, message: 'unauthorized: missing or wrong x-dsh-select-translate-token' })
              }
              if (url.pathname === `${API_PREFIX}/ping`) return json(res, 200, { ok: true, plugin: name })
              if (url.pathname === `${API_PREFIX}/system/status` && method === 'GET') {
                return void (await handleStatus(ctx, res, companion, settings))
              }
              if (url.pathname === `${API_PREFIX}/system/restart` && method === 'POST') {
                return json(res, 200, { ok: true, companion: await companion.restart() })
              }
              // 设置：读 / 改。改完推给正在跑的伴生进程（进程不在就等下次 spawn 的 env）
              if (url.pathname === `${API_PREFIX}/settings` && method === 'GET') {
                return json(res, 200, { ok: true, ...settings.get(), file: settings.file })
              }
              // 卡片下拉的"可选模型"：只读已注册的供应商/模型，不落盘、不花钱
              if (url.pathname === `${API_PREFIX}/models` && method === 'GET') {
                return json(res, 200, { ok: true, models: await listAvailableModels(ctx.llm) })
              }
              // 推理等级：当前路由模型支持的档位（只读；模型不支持就返回空列表）
              if (url.pathname === `${API_PREFIX}/efforts` && method === 'GET') {
                const current = settings.get()
                const route = routeOf(ctx, current)
                if (route === undefined) {
                  return json(res, 200, { ok: true, provider: null, model: null, efforts: [], current: null, auto: null })
                }
                const efforts = await reasoningEfforts(ctx, route.provider, route.model)
                const chosen = normalizeEffort(current.effort)
                const usable = chosen !== null && efforts.some((effort) => String(effort?.id ?? '') === chosen)
                return json(res, 200, {
                  ok: true,
                  provider: route.provider,
                  model: route.model,
                  efforts: efforts
                    .map((effort) => ({ id: String(effort?.id ?? ''), name: typeof effort?.name === 'string' ? effort.name : '' }))
                    .filter((effort) => effort.id !== ''),
                  current: usable ? chosen : null,
                  auto: pickEffortFrom(efforts) ?? null,
                })
              }
              if (url.pathname === `${API_PREFIX}/applications` && method === 'POST') {
                let parsed
                try { parsed = JSON.parse((await readBody(req)) || '{}') } catch {
                  return json(res, 400, { ok: false, message: 'invalid JSON' })
                }
                const app = normalizeApplicationPath(parsed?.app)
                if (app === null || typeof parsed?.disabled !== 'boolean') {
                  return json(res, 400, { ok: false, message: 'app must be a full executable path; disabled must be boolean' })
                }
                const previous = settings.get().disabledApps ?? []
                const disabledApps = parsed.disabled ? [...previous, app] : previous.filter((path) => path !== app)
                const next = settings.patch({ disabledApps })
                const pushed = await companion.pushSettings(next)
                return json(res, 200, { ok: true, disabledApps: next.disabledApps ?? [], pushed })
              }
              if (url.pathname === `${API_PREFIX}/settings` && method === 'POST') {
                let parsed
                try {
                  parsed = JSON.parse((await readBody(req)) || '{}')
                } catch {
                  return json(res, 400, { ok: false, message: 'invalid JSON' })
                }
                if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                  return json(res, 400, { ok: false, message: 'settings must be an object' })
                }
                if (parsed.model !== undefined && parsed.model !== null && normalizeModel(parsed.model) === null) {
                  return json(res, 400, { ok: false, message: 'model requires a provider and model ID' })
                }
                const next = settings.patch(parsed)
                const pushed = await companion.pushSettings(next)
                return json(res, 200, { ok: true, ...next, pushed })
              }
              if (url.pathname === `${API_PREFIX}/translate`) {
                if (method !== 'POST') return json(res, 405, { ok: false, message: 'use POST' })
                return void (await handleTranslate(ctx, req, res, settings.get()))
              }
              return json(res, 404, { ok: false, message: 'not found' })
            } catch (error) {
              ctx.logger?.warn?.('dsh-select-translate: route failure', error)
              if (res.headersSent !== true) json(res, 500, { ok: false, message: 'internal error' })
              else if (res.writableEnded !== true) res.end()
            }
          })()
        },
      }),
    'dsh-select-translate: routes',
  )

  ctx.logger?.info?.('dsh-select-translate: activated')
}
