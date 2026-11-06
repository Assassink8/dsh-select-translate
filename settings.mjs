/**
 * 插件设置（**宿主半边**）：默认值、校验、落盘。
 *
 * 为什么不用 DSH 官方的设置体系（结论来自 §5.5 的调研）：
 *  - 宿主可以 `export const Config` 声明可配置项，但**没有任何已发布客户端会按 schema 自动画页面**，
 *    要自己画设置页；而 `Config` 要用 schemastery/zod 构造 schema，插件目录里没有 node_modules，
 *    依赖解析不到 —— 所以这里走"自己写一份最小 JSON"（0.1.3 起不再有设置页，这份设置只由卡片头部 ⚡ 读写）；
 *  - 这与已发布的同类插件一致（`dsh-selection-tools` 就是 fs 写 `DSH_HOME/dsh-selection-tools.json`）。
 *
 * 文件位置：`$DSH_HOME/dsh-select-translate.json`（`DSH_HOME` 缺失时回落到 `~/.dsh`；再拿不到才纯内存）。
 * 全同步 IO：文件极小、只在启动与用户切开关时读写，省掉一整条异步管道。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, win32 } from 'node:path'

/** 默认设置。 */
export const DEFAULT_SETTINGS = { mode: 'auto' }

/** 触发模式：`auto` = 即划即译；`icon` = 划词出小图标、点击才译。 */
export const MODES = ['auto', 'icon']

/**
 * 截图翻译热键的"末键"（前缀固定 Ctrl+Alt）。
 * 只收单键：A–Z、0–9、F1–F12 —— 这样不用解析 "Ctrl+Alt+Shift+X" 这种组合字符串。
 */
export const HOTKEY_KEYS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]

export const DEFAULT_HOTKEY = 'S'

/** 校验并归一化末键；不认识就返回 null（调用方下落默认值）。 */
export function normalizeHotkey(raw) {
  if (typeof raw !== 'string') return null
  const value = raw.trim().toUpperCase()
  return HOTKEY_KEYS.includes(value) ? value : null
}

const NODE_FS = { readFileSync, writeFileSync, mkdirSync }

/** 仅保存 DSH 的供应商与模型 ID，认证信息继续由 DSH 管理。 */
export function normalizeModel(raw) {
  if (raw === null || typeof raw !== 'object') return null
  const provider = typeof raw.provider === 'string' ? raw.provider.trim() : ''
  const model = typeof raw.model === 'string' ? raw.model.trim() : ''
  if (!provider || !model || provider.length > 200 || model.length > 300 || /[\x00-\x1f\x7f]/.test(provider + model)) return null
  return { provider, model }
}

/**
 * 推理等级：DSH 的 `reasoningEffort` id（off/low/high/max…）。
 * `null` = 跟随插件默认（自动挑最省的一档），不是"关闭推理"。
 */
export function normalizeEffort(raw) {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (value === '' || value.length > 40 || /[\x00-\x1f\x7f]/.test(value)) return null
  return value
}

/** 输入格式为供应商 ID / 模型 ID；模型 ID 本身可以包含斜杠。 */
export function parseModelInput(value) {
  const text = String(value ?? '')
  const slash = text.indexOf('/')
  return slash < 0 ? null : normalizeModel({ provider: text.slice(0, slash), model: text.slice(slash + 1) })
}

/** Windows 可执行文件全路径，大小写和分隔符归一化；拒绝模糊文件名规则。 */
export function normalizeApplicationPath(value) {
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) return null
  const path = win32.normalize(value.trim()).toLowerCase()
  if (!/^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+\\)/.test(path) || !path.endsWith('.exe')) return null
  return path
}

export function normalizeDisabledApps(value) {
  return Array.isArray(value) ? [...new Set(value.map(normalizeApplicationPath).filter(Boolean))] : []
}

/** 未知字段丢掉，非法值回落默认，兼容仅含 mode 的旧设置。 */
export function normalizeSettings(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const model = normalizeModel(source.model)
  const effort = normalizeEffort(source.effort)
  const disabledApps = normalizeDisabledApps(source.disabledApps)
  return {
    mode: MODES.includes(source.mode) ? source.mode : DEFAULT_SETTINGS.mode,
    // 截图热键不放这里：它是"插件配置"（DSH 设置页写 cordis 配置），见 index.js 的 Config。
    ...(model === null ? {} : { model }),
    ...(effort === null ? {} : { effort }),
    ...(disabledApps.length ? { disabledApps } : {}),
  }
}

/**
 * DSH 的 home 目录：优先 `DSH_HOME`，没有就回落到 `~/.dsh`。
 *
 * 为什么必须回落：桌面端启动进程里经常没有 `DSH_HOME`（本机就是），
 * 只认环境变量会让设置变成"纯内存"——重启 DSH 后模型、语种、禁用的应用全丢。
 * 其它 DSH 插件也是这么处理的（`process.env.DSH_HOME ?? join(homedir(), '.dsh')`）。
 */
export function resolveDshHome(env = process.env) {
  const configured = typeof env?.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return configured === '' ? join(homedir(), '.dsh') : configured
}

/** 默认文件路径：`$DSH_HOME/dsh-select-translate.json`。 */
export function resolveSettingsFile(env = process.env) {
  return join(resolveDshHome(env), 'dsh-select-translate.json')
}

/**
 * 运行时文件：`$DSH_HOME/dsh-select-translate-runtime.json`。
 *
 * 伴生进程启动时把自己监听的随机端口与宿主下发的路由令牌写进去，**只给本机排障工具用**
 * （真进程冒烟脚本靠它拿端口 + 令牌）。它不扩大攻击面：网页读不到本机文件，
 * 能读文件的本地进程本来也能读别的。
 */
export function resolveRuntimeFile(env = process.env) {
  const file = resolveSettingsFile(env)
  return file === '' ? '' : join(dirname(file), 'dsh-select-translate-runtime.json')
}

/**
 * 建一个同步的设置存储。
 * @param options.file - 覆盖文件路径（测试用）。
 * @param options.env - 覆盖环境（测试用）。
 * @param options.fs - 覆盖 fs（`readFileSync` / `writeFileSync` / `mkdirSync`）；传 `null` 表示纯内存。
 */
export function createSettingsStore(options = {}) {
  const fs = options.fs === undefined ? NODE_FS : options.fs
  const file = options.file ?? resolveSettingsFile(options.env)
  let cache = null

  function readRaw() {
    if (fs === null || file === '') return null
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      // 文件不存在 / 不是合法 JSON / 读不动：一律当"还没有设置"
      return null
    }
  }

  /** 当前设置（首次读盘后进缓存）。 */
  function get() {
    if (cache === null) cache = normalizeSettings(readRaw())
    return cache
  }

  /** 合并一部分设置并落盘；写不进去也返回新值（只在内存里生效）。 */
  function patch(partial) {
    const next = normalizeSettings({ ...get(), ...(partial !== null && typeof partial === 'object' ? partial : {}) })
    cache = next
    if (fs !== null && file !== '') {
      try {
        const dir = dirname(file)
        if (dir !== '' && dir !== '.') fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8')
      } catch {
        /* 写不进去就算了：本次运行内仍然生效 */
      }
    }
    return next
  }

  return { file, get, patch }
}
