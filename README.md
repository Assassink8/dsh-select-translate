<div align="center">

<h1>划词翻译</h1>

<p><b>在任意 Windows 应用里选中文字 —— 译文就在鼠标旁出现。</b></p>

<p>不切窗口、不复制粘贴、不留记录。</p>

<p>
  <a href="https://www.npmjs.com/package/dsh-select-translate"><img src="https://img.shields.io/npm/v/dsh-select-translate?color=4d6bfe&label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/dsh-select-translate"><img src="https://img.shields.io/npm/dw/dsh-select-translate?color=4d6bfe" alt="downloads"></a>
  <a href="https://github.com/SHAN5246992ZHUI/dsh-select-translate/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/dsh-select-translate?color=4d6bfe" alt="license"></a>
  <img src="https://img.shields.io/badge/platform-Windows-4d6bfe" alt="platform">
  <a href="https://awesome-dsh-plugin.com/p/SHAN5246992ZHUI/dsh-select-translate/"><img src="https://img.shields.io/badge/DSH-plugin-4d6bfe" alt="DSH plugin"></a>
</p>

<img src="https://raw.githubusercontent.com/SHAN5246992ZHUI/dsh-select-translate/main/docs/card-translation.png" width="460" alt="划词翻译卡片">

</div>

## ✨ 它好在哪

- **即划即译** —— 选中、松手，卡片就出现在鼠标旁，首字实测 **0.3–0.7 秒**。
- **绝不打断你** —— 原生置顶卡片，**不抢焦点**：原文选区不会消失，边看边译、还能继续操作下面的应用。
- **长文也跟得上** —— 单次 **15000 字**。译文边流边显示，卡片自动跟着最新一行；想回看就滚轮，右侧细滚动条随滚动淡入。
- **保留原文结构** —— 分段、编号列表原样保留；PDF 里被文字层压成一整行的题目，也会按 `(a)` `1.` `①` 重新分条。
- **卡片随你调** —— 拖左右边缘即可改宽度，正文自动重排；也能切成**小图标模式**，点一下才翻译。
- **想译成什么就什么** —— 自动 / 中文 / English，或**自定义任意语种**（日本語、한국어、Français…）。
- **公式按版式显示** —— 译文里的 `$E=mc^2$`、`$$\int_0^1 x^2\,dx$$` 会渲染成数学排版，而不是一行 LaTeX 源码。
- **截图也能译** —— 按 `Ctrl+Alt+S` 弹出可拖框的半透明遮罩，框住屏幕上一块区域后松手，插件用 Windows 自带 OCR 取字后翻译；语种菜单里也有「截图翻译…」入口。
- **零构建** —— 原生 GDI+ 绘制，不编原生模块、不跑构建脚本；公式渲染用纯 JS 的 MathJax + WASM 版 resvg（不依赖系统字体）。

## 🚀 安装

**最简单**：DSH 桌面端 → 设置 → 插件市场 → 搜「划词翻译」→ 一键安装。
（本插件已被 [awesome-dsh-plugin](https://awesome-dsh-plugin.com/p/SHAN5246992ZHUI/dsh-select-translate/) 收录。）

命令行安装：

```powershell
dsh plugin --profile web add dsh-select-translate
```

也可以从源码装：

```powershell
dsh plugin --profile web add github:SHAN5246992ZHUI/dsh-select-translate
```

> 装完**重启 DSH**（宿主半边不会热加载）。已发布到 npm：[`dsh-select-translate`](https://www.npmjs.com/package/dsh-select-translate)。
> 装好即用，**没有需要配置的项**：触发方式（⚡）、目标语言（🌐 语种）、翻译模型（⛭ 模型）都在卡片头部调整。
> 卸载：市场里点卸载，或 `dsh plugin remove dsh-select-translate`。

## 🖱 怎么用

| 操作 | 效果 |
|---|---|
| **划词** | 鼠标旁弹出卡片，译文流式出现 |
| **Ctrl + Alt + S**（末键可改） | 截图翻译：屏幕变暗后拖出一个框，松手 → 系统 OCR 取字 → 翻译（图片、PDF 渲染页、视频字幕都行）。`Esc` 或右键取消；整段是公式时自动走公式转写 |
| 语种菜单 → **截图翻译…** | 和上面的热键等效（热键被别的软件占用时的入口） |
| **设置 → 插件 → 划词翻译** | 输入截图热键的末键（前缀固定 `Ctrl+Alt`，填 A–Z、0–9 或 F1–F12）；改完立即生效 |
| 拖卡片**左右边缘** | 改卡片宽度（300–900），正文自动重排 |
| **滚轮** | 翻长译文 |
| `Esc` / 点卡片外 / ✕ | 关闭，并**中断在途请求** |
| 头部 **⚡** | 即划即译 ↔ 小图标模式（选择会记住） |
| 头部 **📌** | 钉住：点外面不关；再划词时原地换内容 |
| 悬停 **⚡ / 📌** | 显示点击后的效果（关闭即划即译 / 置顶…） |
| 头部 **语种胶囊**（🌐） | 目标语言：自动 / 中文 / English / 自定义…；菜单底部还有「禁用此应用」 |
| 头部 **模型胶囊**（⛭） | 从 DSH 已配置模型里点选；没指定时显示「默认模型」。菜单第二行是「推理等级：…」 |
| 模型菜单 → **推理等级** | 自动（最省）/ 关闭思考 / 低 / 高 / 最大——按当前模型支持的能力列出 |
| 在已禁用应用中 **Shift + 划词** | 打开操作卡片，菜单中选「启用此应用」恢复 |
| 页脚 **复制 / 重译** | 复制译文 / 用同一段原文再译一次 |

选「自动」时，卡片头部会显示判定结果（例如 `自动·中文`），不用猜。

## 按应用禁用

在目标应用中划词，打开卡片头部**语种胶囊（🌐）**，点击菜单最下方的「禁用此应用 · 应用名」。小图标模式先点击图标打开卡片。禁用后收起卡片并取消当前翻译；该应用之后的普通划词不再取词、弹图标或请求模型。

需要恢复时，在该应用里**按住 Shift 拖选文字或双击选词**，打开的操作卡片不会读取选中文本或发起翻译；点击语种胶囊 →「启用此应用」即可恢复，下次普通划词生效。

规则按来源程序的完整可执行文件路径保存，适用于该程序的所有窗口（浏览器中包括全部网页），不按窗口标题匹配。同名但路径不同的程序独立处理。无法识别来源应用时，该操作不可用。应用禁用规则与模型设置一同保存在 `$DSH_HOME/dsh-select-translate.json`，无需去设置页手工配置。

## 🖼 两种触发方式

| 模式 | 行为 |
|---|---|
| **即划即译**（默认） | 划词停手就直接出卡片和译文 |
| **小图标** | 划词停手只亮一个 24px 小圆图标，**点它才翻译**；鼠标移开**不会**消失，点别处 / `Esc` / 重新划词时才收起 |

<img src="https://raw.githubusercontent.com/SHAN5246992ZHUI/dsh-select-translate/main/docs/icon-mode.png" width="520" alt="小图标模式">

## 📏 长文本

超过卡片高度后，视图跟着新译文往上顶——**最新一行永远在窗口里**，翻译结束回到开头；中途往上滚会暂停跟随，滚回底部恢复。

<img src="https://raw.githubusercontent.com/SHAN5246992ZHUI/dsh-select-translate/main/docs/streaming-follow.png" width="320" alt="流式跟随">

## 🔒 隐私

- 选中的文字只经 **DSH 宿主**发给**你自己配置的模型**，不经过任何第三方服务。
- **不落盘**：原文和译文都不写文件、不进会话日志、不进侧栏。伴生进程只在内存里留最近一次取词结果，重启即失。
- **取词完全不碰剪贴板**；剪贴板只在**你点「复制」**时被写入。
- 写盘只有两个小文件：触发模式、翻译模型和应用禁用规则 `$DSH_HOME/dsh-select-translate.json`，以及给本机排障工具用的运行时文件。
- 本机内部 HTTP 口需要随机令牌；带自定义头的跨源请求会被 CORS 预检挡在浏览器侧。

## ⚠️ 适用范围与已知限制

- **仅 Windows**。非 Windows 上插件会主动跳过加载，不会影响 DSH 启动。
- 需要 **DSH 桌面端**（纯 Web 端没有原生窗口）。
- **以管理员权限运行的应用取不到词**（Windows UIPI 限制），这是预期行为，不是故障。
- 取词走 UI Automation，**WPS / Office 不在支持范围**——取不到就安静地不弹。
- 单次原文上限 **15000 字**。

## ❓ 常见问题

<details>
<summary><b>会消耗我的模型额度吗？</b></summary>

会。每次划词都是一次真实的模型调用，走你自己在 DSH 里配置的模型。关卡片、再划词、点「重译」都会取消在途请求，避免白跑。
</details>

<details>
<summary><b>用的是哪个翻译模型？</b></summary>

默认跟随 DSH 当前默认模型，也可以给划词翻译单独指定模型：

1. 打开翻译卡片，点击头部**模型胶囊（⛭）**（没指定过时显示「默认模型」）。
2. 菜单会列出 DSH 里已配置的所有供应商与模型（如 `DeepSeek · deepseek-flash`），直接点选即可保存并重译；勾选标记表示当前正在使用的模型。列表较长时用滚轮翻页。
3. 选择「跟随默认模型」可恢复默认行为。列表读取失败、或想直接用列表里没有的模型时，点「手动输入…」后按 `供应商ID/模型ID` 填写（例如 `deepseek-official/deepseek-flash`），按 Enter 保存；Esc 或失焦取消输入。

语种和模型是两个独立的胶囊，互不影响：换模型不会改语种，换语种也不会丢模型。

模型选择会保存在 `$DSH_HOME/dsh-select-translate.json`（桌面端进程里没有 `DSH_HOME` 时回落到 `~/.dsh/dsh-select-translate.json`），重启后保留。使用 DSH 已有的供应商配置与密钥，无需另填 API Key；指定模型不可用时会显示错误，不自动改用其它模型。更新此功能后需完整重启 DSH 一次。
</details>

<details>
<summary><b>能调思考强度（推理等级）吗？</b></summary>

能。打开**模型胶囊（⛭）**，第二行就是「推理等级：…」，点进去按当前模型支持的能力选：

- **自动（模型默认）**：插件沿用最省的一档（优先 `off` / `low`），和之前的行为一致；
- **关闭思考 / 低 / 高 / 最大**：显式指定档位。档位名与可用范围来自模型的 `reasoning.efforts`，不支持的档位不会列出来。

换模型后，原来选的档位若不被新模型支持，会自动回落到「自动」，不会把请求打挂。推理等级和模型一起保存在 `$DSH_HOME/dsh-select-translate.json`。注意 `off` 只是关掉思维链，仍按 token 计费，只是更省。
</details>

<details>
<summary><b>支持公式（LaTeX）吗？</b></summary>

支持**文字层里的公式**：原文或译文里用 `$...$`、`$$...$$`、`\(...\)`、`\[...\]` 写出的公式会被识别，翻译完成后渲染成数学版式贴进卡片，而不是显示 `\frac{1}{3}` 这样的源码。

PDF 里的公式大多是**纯文本**而不是 LaTeX（分式拆到两行、根号跑到分子前、上标被拍平成普通数字）。遇到这类选区，插件改走「公式转写」提示词：让模型按数学含义还原成 LaTeX 再渲染。划中的是一整段公式时不翻译、只输出公式；混合段落仍正常翻译，公式按 LaTeX 保留。

- 渲染完全离线：MathJax 把 TeX 转 SVG，resvg-wasm 再转 PNG；字形是路径，不需要安装字体。
- 首次遇到公式会初始化渲染器（约 0.5–1 秒），之后每条公式毫秒级，并按字号缓存，同一公式不重复渲染。
- 公式语法有误、或渲染失败时，卡片保留 LaTeX 原文，不会出现红字或空白。
- 价格（如 `$5`、`$10`）不会被误当成公式。
- 只处理文字层。截图、扫描件里的公式是图片，需要 OCR 才能取出；整块截图可以用 `Ctrl+Alt+S` 走截图翻译，但 OCR 对公式的还原通常不如文字层准确。
- 公式渲染依赖 `mathjax-full` 与 `@resvg/resvg-wasm`（安装约 40MB，纯 JS/WASM，不需要编译环境）。
</details>

<details>
<summary><b>截图翻译怎么用？需要装 OCR 吗？</b></summary>

不需要装。按 `Ctrl+Alt+S`（或语种菜单里的「截图翻译…」），屏幕会变暗、出现一句提示，然后拖出一个框；松手后插件会：抓屏 → 用 Windows 自带的 `Windows.Media.Ocr` 识别框内文字 → 当成原文走正常翻译。

- 抓屏发生在**弹出遮罩之前**，所以遮罩、卡片、应用自己画的选区高亮都不会进图。
- 框选时有可见反馈：选中区域保持原样、周围压暗，边框旁实时显示尺寸；`Esc` 或右键取消，误点（小于 8px）也当取消。
- 用的是系统 OCR 语言包（中文 / English 等，取决于 Windows 已安装的 OCR 语言），识别中文时字间会插空格，插件会还原。
- 第一次用会拉起一个常驻辅助进程，约多花 0.5–1 秒；之后每次识别通常 0.3–1 秒。
- 公式截图可以识别成纯文本，但精度有限；框内整段像公式时，插件会走「OCR 公式转写」：把识别到的压平文本交给模型还原成 LaTeX，再按版式渲染。文字层里的公式仍建议直接划词。
- 热键前缀固定 `Ctrl+Alt`，末键可改：设置 → 插件 → 划词翻译 →「截图翻译热键」，在输入框里填 A–Z、0–9 或 F1–F12 里的一个键，回车或点走即保存、立即生效（热键是插件配置，不写进划词设置文件）。
- 热键 `Ctrl+Alt+S` 被别的软件占用时，状态里会记一条 `hotkey` 错误，改用菜单入口即可。
- 识别不出字时卡片会提示「截图里没有识别到文字」，换个框再试。
</details>

<details>
<summary><b>为什么在有些窗口里划词没反应？</b></summary>

目标应用没有向 UI Automation 暴露文本，或者它是以管理员权限运行的。WPS / Office 属于已知不支持的范围。
</details>

<details>
<summary><b>为什么 WorkBuddy 的中继模型第一次出字很慢？</b></summary>

WorkBuddy 走公网中继，高峰期会在中继队列里排队，首字可能从 2 秒拖到十几秒。插件做了**首字对冲**：6 秒还没出字时，不取消第一路，而是并行再发一路，谁先出字用谁、另一路立刻取消。所以本来 8 秒会出字的请求仍然 8 秒出字，只有两路都慢才等到 26 秒上限；已经出字后不会重发，不会出现重复译文。

另外，模型偶尔会「只回思考、正文为空」：这种情况会自动再来一组；两组都空时，卡片显示「模型没有返回内容（可点「重译」或换一个模型）」。

这不改变中继本身的排队，只是把长尾截短；想要稳定的低延迟，优先选不排队的中继（如 `openai-codex`）或把推理等级调到「自动」。
</details>

<details>
<summary><b>卡片为什么不抢焦点，还能不能打字？</b></summary>

卡片是原生分层窗口且刻意不激活，所以不会打断你。需要输入时（自定义语种）会另开一个小输入框，支持中文输入法。
</details>

## 🛠 开发

想改代码、跑测试、看实现细节，见 **[docs/DEVELOPMENT.md](https://github.com/SHAN5246992ZHUI/dsh-select-translate/blob/main/docs/DEVELOPMENT.md)**。

- 纯 JS，无构建步骤
- 单测 **168 个**（`pnpm test`；公式渲染另需 `mathjax-full` 与 `@resvg/resvg-wasm`）
- 真进程冒烟检查覆盖取词、落位、真译文、长文本、小图标模式、公式内联

## 📄 许可与致谢

本项目以 **MIT** 发布，见 [LICENSE](https://github.com/SHAN5246992ZHUI/dsh-select-translate/blob/main/LICENSE)。

取词内核衍生自 [dsh-selection-tools](https://github.com/fyisgod/dsh-selection-tools)（作者 [@fyisgod](https://github.com/fyisgod)，MIT）。
上游的许可原文与逐文件改动说明在 [THIRD-PARTY-NOTICES.md](https://github.com/SHAN5246992ZHUI/dsh-select-translate/blob/main/THIRD-PARTY-NOTICES.md)——

**感谢 @fyisgod 把这套 Windows 取词内核开源出来，这个插件能跑起来靠的就是它。**
