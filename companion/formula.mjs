/**
 * 公式渲染：TeX → SVG（MathJax）→ PNG（resvg-wasm）。
 *
 * 为什么放 companion：卡片是原生 GDI+ 窗口，公式必须以位图形式贴进去；
 * 渲染完全离线（WASM + 纯 JS），不联网、不落盘。
 * 字形在 MathJax 的 SVG 里是 **路径**（fontCache: 'none'），所以 resvg 不需要任何字体文件。
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** MathJax 的 viewBox 以 1/1000 em 为单位，em 就是传入的字号像素。 */
const UNITS_PER_EM = 1000

let runtime = null
let loading = null

/** 懒加载：只有真的遇到公式才付这 100ms 级的初始化成本。 */
export function ensureFormulaRenderer() {
  if (runtime !== null) return Promise.resolve(runtime)
  if (loading !== null) return loading
  loading = (async () => {
    const [mj, texMod, svgMod, adaptorMod, handlerMod, packagesMod, resvg] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
      import('@resvg/resvg-wasm'),
    ])
    const adaptor = adaptorMod.liteAdaptor()
    handlerMod.RegisterHTMLHandler(adaptor)
    const document = mj.mathjax.document('', {
      InputJax: new texMod.TeX({ packages: packagesMod.AllPackages }),
      OutputJax: new svgMod.SVG({ fontCache: 'none' }),
    })
    const wasmFile = require.resolve('@resvg/resvg-wasm/index_bg.wasm')
    await resvg.initWasm(fs.readFileSync(wasmFile))
    runtime = { document, adaptor, Resvg: resvg.Resvg }
    return runtime
  })()
  return loading
}

/**
 * 从一段文本里找出公式片段（保留原文偏移，供粘贴/复制时还原）。
 * 支持 $$…$$、\[…\]、\(…\)、$…$；纯价格（$5）不算公式。
 */
export function findFormulas(text) {
  const source = String(text ?? '')
  const out = []
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g
  let match
  while ((match = re.exec(source)) !== null) {
    if (match.index > 0 && source[match.index - 1] === '\\') continue
    const latex = match[1] ?? match[2] ?? match[3] ?? match[4]
    const display = match[1] !== undefined || match[2] !== undefined
    if (!looksLikeMath(latex, display)) continue
    out.push({
      start: match.index,
      end: match.index + match[0].length,
      latex: latex.trim(),
      display,
      raw: match[0],
    })
  }
  return out
}

/** 行内 `$…$` 容易和价格/普通美元符号混淆，这里只收「明显是数学」的内容。 */
function looksLikeMath(latex, display) {
  const body = String(latex ?? '').trim()
  if (body === '' || body.length > 2000) return false
  if (display) return true
  if (/^\s|\s$/.test(latex)) return false
  if (/^[\d.,]+$/.test(body)) return false
  // 必须带 LaTeX 特征：命令、上下标、花括号，或者确实有运算关系的等号/不等号
  if (/\\[a-zA-Z]+|[\^_{}]/.test(body)) return true
  if (/[=<>≈≤≥±]/.test(body) && /[a-zA-Z0-9]/.test(body)) return true
  return false
}

/**
 * 渲染一条公式为 PNG。
 * @returns {{ png: Buffer, width: number, height: number }} width/height 是像素（px 字号对应 em）。
 */
export async function renderFormula(latex, px) {
  const rt = await ensureFormulaRenderer()
  const size = Math.max(12, Math.min(96, Math.round(px)))
  const node = rt.document.convert(String(latex), { display: true })
  const markup = rt.adaptor.outerHTML(node)
  // 语法错误时 MathJax 会包一个 <merror>：这种宁可保留 LaTeX 原文，别把红字贴进卡片
  if (markup.includes('merror') || markup.includes('data-mjx-error')) throw new Error('公式语法有误，保留原样')
  const svgMatch = markup.match(/<svg[\s\S]*<\/svg>/)
  if (svgMatch === null) throw new Error('公式渲染失败：没有生成 SVG')
  const viewBoxMatch = svgMatch[0].match(/viewBox="([^"]+)"/)
  if (viewBoxMatch === null) throw new Error('公式渲染失败：SVG 缺少 viewBox')
  const box = viewBoxMatch[1].trim().split(/\s+/).map(Number)
  const width = Math.max(1, (box[2] / UNITS_PER_EM) * size)
  const height = Math.max(1, (box[3] / UNITS_PER_EM) * size)
  // viewBox 的 y=0 是基线：上沿负、下沿正 → 换算成"基线以上/以下"多少像素，供内联排版对齐。
  const ascent = Math.max(0, (-box[1] / UNITS_PER_EM) * size)
  const descent = Math.max(0, ((box[3] + box[1]) / UNITS_PER_EM) * size)
  const svg = svgMatch[0].replace(
    /^<svg[^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(2)}" height="${height.toFixed(2)}" viewBox="${box.join(' ')}">`,
  )
  const png = new rt.Resvg(svg, { fitTo: { mode: 'zoom', value: 1 } }).render().asPng()
  return { png: Buffer.from(png), width, height, ascent, descent }
}
