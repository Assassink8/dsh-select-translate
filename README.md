<div align="center">

<h1>划词翻译</h1>

<p><b>在任意 Windows 应用里选中文字 —— 译文就在鼠标旁出现。</b></p>

<p>不切窗口、不复制粘贴、不留记录。</p>

<p>
  <a href="https://www.npmjs.com/package/dsh-select-translate"><img src="https://img.shields.io/npm/v/dsh-select-translate?color=4d6bfe&label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/dsh-select-translate"><img src="https://img.shields.io/npm/dw/dsh-select-translate?color=4d6bfe" alt="downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/dsh-select-translate?color=4d6bfe" alt="license"></a>
  <img src="https://img.shields.io/badge/platform-Windows-4d6bfe" alt="platform">
  <a href="https://awesome-dsh-plugin.com/p/SHAN5246992ZHUI/dsh-select-translate/"><img src="https://img.shields.io/badge/DSH-plugin-4d6bfe" alt="DSH plugin"></a>
</p>

<img src="docs/card-translation.png" width="460" alt="划词翻译卡片">

</div>

## ✨ 它好在哪

- **即划即译** —— 选中、松手，卡片就出现在鼠标旁，首字实测 **0.3–0.7 秒**。
- **绝不打断你** —— 原生置顶卡片，**不抢焦点**：原文选区不会消失，边看边译、还能继续操作下面的应用。
- **长文也跟得上** —— 单次 **15000 字**。译文边流边显示，卡片自动跟着最新一行；想回看就滚轮，右侧细滚动条随滚动淡入。
- **保留原文结构** —— 分段、编号列表原样保留；PDF 里被文字层压成一整行的题目，也会按 `(a)` `1.` `①` 重新分条。
- **公式按版式显示** —— `$E=mc^2$`、`$$\int_0^1 x^2\,dx$$` 渲染成数学排版，而不是一行 LaTeX 源码；PDF 里被拍平的公式会先由模型还原成 LaTeX。
- **截图也能译** —— 按 `Ctrl+Alt+S`（末键可改）弹出压暗的框选层，框住屏幕区域松手，用 Windows 自带 OCR 取字后翻译。图片、PDF 渲染页、视频字幕、扫描件都行。
- **模型和语种分开选** —— 卡片头部是**语种**和**模型**两个独立胶囊，互不影响；模型直接从 DSH 已配置的列表里点选，不用手写 `供应商/模型`。
- **能调思考强度** —— 模型菜单里的「推理等级」：自动 / 关闭思考 / 低 / 高 / 最大，按当前模型支持的能力列出。
- **卡片随你调** —— 拖左右边缘改宽度（300–900），正文自动重排；也能切成**小图标模式**，点一下才翻译。
- **不落盘** —— 原文和译文不写文件、不进会话日志；取词不碰剪贴板。
- **零构建** —— 原生 GDI+ 绘制，不编原生模块、不跑构建脚本。公式渲染用纯 JS 的 MathJax + WASM 版 resvg，不依赖系统字体。

## 🚀 安装

**最简单**：DSH 桌面端 → 设置 → 插件市场 → 搜「划词翻译」→ 一键安装。
（本插件已被 [awesome-dsh-plugin](https://awesome-dsh-plugin.com/p/SHAN5246992ZHUI/dsh-select-translate/) 收录。）

命令行安装：

```powershell
dsh plugin --profile web add dsh-select-translate
```

从源码装（用本仓库）：

```powershell
dsh plugin --profile web add github:Assassink8/dsh-select-translate
```

> 装完**重启 DSH**（宿主半边不会热加载）。
> 装好即用：触发方式（⚡）、目标语种（🌐）、翻译模型（⛭）都在卡片头部调；截图热键在「设置 → 插件 → 划词翻译」里改。
> 卸载：市场里点卸载，或 `dsh plugin remove dsh-select-translate`。

## 🖱 怎么用

| 操作 | 效果 |
|---|---|
| **划词** | 鼠标旁弹出卡片，译文流式出现 |
| **Ctrl + Alt + S**（末键可改） | 截图翻译：屏幕变暗后拖出一个框，松手 → 系统 OCR 取字 → 翻译；`Esc` 或右键取消，整段是公式时自动走公式转写 |
| 语种菜单 → **截图翻译…** | 和热键等效（热键被别的软件占用时的入口） |
| **设置 → 插件 → 划词翻译** | 改截图热键的末键（前缀固定 `Ctrl+Alt`，可填 A–Z、0–9 或 F1–F12）；回车或点走即保存、立即生效 |
| 拖卡片**左右边缘** | 改卡片宽度，正文自动重排 |
| **滚轮** | 翻长译文；在模型/推理等级菜单里则翻列表 |
| `Esc` / 点卡片外 / ✕ | 关闭，并**中断在途请求** |
| 头部 **⚡** | 即划即译 ↔ 小图标模式（选择会记住） |
| 头部 **📌** | 钉住：点外面不关；再划词时原地换内容 |
| 悬停 **⚡ / 📌** | 显示点击后的效果 |
| 头部 **语种胶囊**（🌐） | 自动 / 中文 / English / 自定义…；菜单底部还有「禁用此应用」 |
| 头部 **模型胶囊**（⛭） | 从 DSH 已配置模型里点选；未指定时显示「默认模型」。菜单第二行是「推理等级：…」 |
| 模型菜单 → **推理等级** | 自动（最省）/ 关闭思考 / 低 / 高 / 最大——按当前模型支持的能力列出 |
| 在已禁用应用中 **Shift + 划词** | 打开操作卡片，菜单里选「启用此应用」恢复 |
| 页脚 **复制 / 重译** | 复制译文 / 用同一段原文再译一次 |

选「自动」时，卡片头部会显示判定结果（例如 `自动·中文`），不用猜。

## 🖼 截图翻译

1. 按 `Ctrl+Alt+S`（或打开语种胶囊 →「截图翻译…」）。
2. 屏幕压暗，拖出一个框；选中区域保持原样，蓝边旁实时显示 `宽 × 高`。
3. 松手后：抓屏 → Windows OCR 识别 → 当成原文正常翻译。

细节：

- 抓屏发生在**遮罩弹出之前**，所以遮罩、卡片、应用自己画的选区高亮都不会进图。
- `Esc`、右键、或框小于 8px 都当取消。
- OCR 用系统语言包（中文 / English 等，取决于 Windows 已装的语言）；中文识别出的字间空格会被还原。
- 第一次用会拉起一个常驻辅助进程，多花约 0.5–1 秒；之后每次通常 0.3–1 秒。
- 整段像公式时会走「OCR 公式转写」：模型把压平的文本还原成 LaTeX，再按版式渲染。精度有限，文字层公式仍建议直接划词。
- 热键前缀固定 `Ctrl+Alt`，末键在插件设置里改；热键被占用时状态里会记一条 `hotkey` 错误，用菜单入口即可。

## 🧮 公式

**文字层公式**：原文或译文里用 `$...$`、`$$...$$`、`\(...\)`、`\[...\]` 写出的公式，翻译完成后渲染成数学版式贴进卡片。

**PDF / 截图里的公式**：文字层里通常是纯文本（分式跨行、根号前置、上标被拍平）。整段是公式时，插件不翻译，改走公式转写提示词，让模型按数学含义还原成 LaTeX 再渲染；混合段落正常翻译，公式按 LaTeX 保留。

- 渲染完全离线：MathJax 把 TeX 转 SVG，resvg-wasm 再转 PNG；字形是路径，不需要安装字体。
- 首次遇到公式会初始化渲染器（约 0.5–1 秒），之后每条毫秒级，并按字号缓存。
- 语法错误或渲染失败时保留 LaTeX 原文，不会出现红字或空白。
- 价格（`$5`、`$10`）不会被误判成公式。
- 依赖 `mathjax-full` 与 `@resvg/resvg-wasm`（安装约 40MB，纯 JS/WASM，不需要编译环境）。

## 🎯 模型与推理等级

- 点模型胶囊会列出 DSH 里已配置的所有供应商与模型（如 `DeepSeek · deepseek-flash`）；点选即保存并重译，勾选标记表示当前模型。
- 「跟随默认模型」恢复默认；列表读取失败或想用列表外的模型时，选「手动输入…」，按 `供应商ID/模型ID` 填写。
- 模型菜单第二行是「推理等级：…」。档位来自模型的 `reasoning.efforts`，不支持的不会列出；换模型后原档位不被支持时自动回落到「自动」。
- 语种和模型是两个独立胶囊，互不影响。
- 模型与等级保存在 `$DSH_HOME/dsh-select-translate.json`；桌面端进程里没有 `DSH_HOME` 时回落到 `~/.dsh/dsh-select-translate.json`，重启后保留。

## 🔒 隐私

- 选中的文字只经 **DSH 宿主**发给**你自己配置的模型**，不经过任何第三方服务。
- **不落盘**：原文和译文都不写文件、不进会话日志、不进侧栏。伴生进程只在内存里留最近一次取词结果。
- **取词完全不碰剪贴板**；剪贴板只在**你点「复制」**时被写入。
- 落盘的只有两个小文件：`$DSH_HOME/dsh-select-translate.json`（模型、推理等级、触发模式、应用禁用规则）和供本机排障用的运行时文件。
- 宿主侧 HTTP 路由需要随机令牌；伴生进程只监听 `127.0.0.1` 的本机回环端口。

## ⚠️ 适用范围与已知限制

- **仅 Windows**；非 Windows 上插件主动跳过加载，不影响 DSH 启动。
- 需要 **DSH 桌面端**（纯 Web 端没有原生窗口）。
- **以管理员权限运行的应用取不到词**（Windows UIPI 限制），这是预期行为。
- 取词走 UI Automation：**WPS / Office、部分 Electron 应用**不暴露选区，取不到就安静地不弹。
- 单次原文上限 **15000 字**。
- 截图翻译需要系统装有对应语言的 OCR 语言包；图片公式的还原精度有限。

## ❓ 常见问题

<details>
<summary><b>会消耗我的模型额度吗？</b></summary>

会。每次划词都是一次真实的模型调用，走你自己在 DSH 里配置的模型。关卡片、再划词、点「重译」都会取消在途请求，避免白跑。
</details>

<details>
<summary><b>卡片为什么不抢焦点，还能不能打字？</b></summary>

卡片是原生分层窗口且刻意不激活，所以不会打断你。需要输入时（自定义语种、手动模型）会另开一个小输入框，支持中文输入法。
</details>

<details>
<summary><b>为什么在有些窗口里划词没反应？</b></summary>

目标应用没有向 UI Automation 暴露文本，或者它是以管理员权限运行的。WPS / Office、部分 Electron 应用属于已知不支持的范围。
</details>

<details>
<summary><b>为什么 WorkBuddy 的中继模型第一次出字很慢？</b></summary>

WorkBuddy 走公网中继，高峰期会在队列里排很久，首字可能从 2 秒拖到十几秒。插件做了**首字对冲**：6 秒还没出字时，不取消第一路，而是并行再发一路，谁先出字用谁、另一路立刻取消。所以本来 8 秒会出字的请求仍然 8 秒出字，只有两路都慢才等到 26 秒上限；已经出字后不会重发，不会出现重复译文。

模型偶尔会「只回思考、正文为空」：这种情况会自动再来一组；两组都空时，卡片提示「模型没有返回内容（可点「重译」或换一个模型）」。

这不改变中继本身的排队，只是把长尾截短；想要稳定低延迟，优先选不排队的中继，或把推理等级调到「自动」。
</details>

<details>
<summary><b>能自定义截图热键吗？</b></summary>

能。DSH 桌面端 → 设置 → 插件 → 划词翻译 →「截图翻译热键」输入框，前缀固定 `Ctrl+Alt`，填 A–Z、0–9 或 F1–F12 里的一个键，回车或点走即保存、立即生效。改完不需要重启。
</details>

<details>
<summary><b>为什么设置重启后会丢？</b></summary>

正常情况下不会：模型、推理等级、触发模式和应用禁用规则会写到 `$DSH_HOME/dsh-select-translate.json`。如果你的 DSH 进程里没有 `DSH_HOME`，会回落到 `~/.dsh/dsh-select-translate.json`。
</details>

## 🛠 开发

想改代码、跑测试、看实现细节，见 **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**。

- 纯 JS，无构建步骤
- 测试在 `test/`（`node --test test`），覆盖取词、排版、落位、设置与宿主协议
- 真进程冒烟检查覆盖取词、落位、真译文、长文本、小图标模式、公式内联

## 📄 许可与致谢

本项目以 **MIT** 发布，见 [LICENSE](LICENSE)。

取词内核衍生自 [dsh-selection-tools](https://github.com/fyisgod/dsh-selection-tools)（作者 [@fyisgod](https://github.com/fyisgod)，MIT）。
上游许可原文与逐文件改动说明在 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)——

**感谢 @fyisgod 把这套 Windows 取词内核开源出来，这个插件能跑起来靠的就是它。**
