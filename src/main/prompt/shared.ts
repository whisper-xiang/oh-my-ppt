import { loadStyleSkill } from '../utils/style-skills'
import { formatLayoutIntentPrompt } from '@shared/layout-intent'
import type { DesignContract, SessionDeckGenerationContext } from '../tools/types'

export const PAGE_SEMANTIC_STRUCTURE = [
  '## 页面语义结构',
  '- 直接输出完整创意页面片段；系统会自动包裹 section[data-page-scaffold]、main[data-role="content"] 和标准 page frame。',
  '- 如果页面有明确标题，可以给第一个标题元素添加 data-role="title"；没有传统标题时不要为了校验硬造标题。',
  '- 主动添加 data-block-id 时保持页面内唯一（kebab-case：metric-1、summary、chart-main）；未添加时系统会自动补齐。',
  '',
  '布局决策：',
  '- 先判断本页叙事重心：数据展示、概念解释、信息对比、流程时间线、结论收束、封面/章节页。',
  '- 标题是阅读路径的一部分，不是固定装饰头部；它应该出现在最能引导阅读的位置。',
  '- 数据页可以让图表/指标成为主视觉，标题靠边或与关键数字组合。',
  '- 对比页优先考虑分区结构，标题服务于对比关系。',
  '- 概念页可以使用中心主视觉、侧栏标题、图文交错或卡片组合。',
  '- 总结页和封面页可以让标题占据视觉重心。',
  '- 在同一套视觉语言下保持变化，不要机械重复同一标题位置和同一网格。',
  '',
  '标题可读性底线：',
  '- 竖排仅限 2-6 个中文字符的短标签。',
  '- 标题包含英文、数字、年份、中英混排或长句时必须横排。',
  '- 完整标题优先保证可读性，不要为了装饰牺牲阅读。'
].join('\n')

export const CONTENT_LANGUAGE_RULES = [
  '## Content language',
  '- The language of these instructions is not the output language. Do not imitate the prompt language.',
  '- If the user explicitly requests a language, use that language.',
  "- Otherwise, use the dominant language of the user's latest request and provided source materials.",
  '- If source materials are primarily English, write slide titles, body text, outlines, and user-facing summaries in English. Do not translate them into Chinese.',
  '- If source materials are primarily Chinese, write slide titles, body text, outlines, and user-facing summaries in Chinese.',
  '- For mixed-language materials, prefer the latest user instruction language.',
  '- Preserve proper nouns, brand names, technical terms, quoted source text, and metrics when appropriate.'
].join('\n')

export const STABLE_HTML_FRAGMENT_PROTOCOL = [
  '## Stable HTML fragment protocol',
  '- Submit only the creative body fragment. The tool will add section[data-page-scaffold], main[data-role="content"], data-block-id attributes, and the runtime page frame.',
  '- Do not include <!doctype>, <html>, <head>, <body>, section[data-page-scaffold], main[data-role="content"], .ppt-page-root, .ppt-page-content, .ppt-page-fit-scope, or data-ppt-guard-root.',
  '- Use one outer <div> as the fragment root.',
  '- Prefer a shallow grid/flex structure with direct module children.',
  '- Avoid nested cards and wrapper chains. Aim for 3 levels of nesting and avoid exceeding 4.',
  '- If the page needs many ideas, reduce the number of modules before adding more containers.',
  '- Decorative blocks should stay flat: a single absolute-positioned div, a few sibling decorative divs, or one SVG are all acceptable; avoid nested wrapper chains inside decoration.',
  '- Before calling the write tool, check that every opened div/span/ul/li/p/table-related tag is closed and the fragment ends with a complete closing tag.'
].join('\n')

export const CANVAS_CONSTRAINTS = [
  '## 画布约束',
  '- 16:9（1600×900），系统自动缩放。可用内容区约 1584×884（外层有 p-2）。',
  '- 用 Tailwind flex/grid 布局；禁止 w-[1600px]/h-[900px]/100vw/100vh/w-screen/h-screen 等画布锁定。',
  '- 禁止 vw/vh 字体单位和 text-[clamp(...)]；h1 统一 text-5xl，禁 text-6xl/7xl/8xl。',
  '- 禁止 iframe。禁止引用系统骨架类。',
  '- 整套页面复用同一背景体系/主色/字体；背景铺满画布，定义在最外层容器上。',
  '- 内容过长时精简文字和卡片；不要预留页脚/meta 区。',
  '- 全局最小字号 16px，禁止 text-xs / text-sm / text-[12px] / text-[14px] 等小于 16px 的字号，正文最小 text-base。'
].join('\n')

export const LAYOUT_COLLISION_RULES = [
  '## 布局防重叠规则',
  '- 正文内容、信息卡片、标题、图表、列表必须由 grid/flex 的正常文档流分区承载；不要用 absolute/fixed + top/left/right/bottom/translate 手工摆放正文模块。',
  '- absolute/fixed 仅用于背景装饰、连接线、非文字 SVG、少量不承载正文的视觉点缀；带有 h1/h2/h3/p/li 或主要文本的元素不得使用 absolute/fixed。',
  '- 禁止用 -top-*、-left-*、-right-*、-bottom-*、translate-x-*、-translate-x-*、translate-y-*、-translate-y-* 把正文卡片推到容器外或叠在主视觉周围。',
  '- 需要环绕/五点/放射状/中心图+周边说明时，使用明确的 grid 模板（例如三列三行：左上/中上/右上/左下/右下/中心），中心图和说明卡片各占独立 grid cell；连接线可用 SVG 作为装饰层。',
  '- 每个主要内容区必须有稳定尺寸和间距：给 grid/flex 容器设置 gap，给长文本容器设置 min-w-0，避免文字或卡片把相邻区域挤压重叠。',
  '- 写入前做一次版面自检：标题、主视觉、每张卡片、底部元素都必须有独立空间，不能互相覆盖，不能依赖 hover/animation 后才可读。'
].join('\n')

export const FRONTEND_CAPABILITIES = [
  '## 前端能力（已内置）',
  '每个 /<pageId>.html 已预注入 ./assets/anime.v4.js、./assets/tailwindcss.v3.js、./assets/chart.v4.js、./assets/ppt-runtime.js 和 KaTeX。',
  '禁止重复插入上述 script/link 标签；禁止使用任何 CDN 外链。',
  '',
  '### 字体',
  '装饰字体已由系统根据 design contract 自动注入（@font-face + CSS 变量），直接使用：',
  '- 标题用 var(--ppt-title-font)',
  '- 正文用 var(--ppt-body-font)',
  '禁止手写 @font-face 或 <link> 引入外部字体，系统已自动处理。',
  '所有 CDN 字体/图标库仍然禁止。',
  '',
  '### 图表 — 必须严格按此模板写',
  '正确写法（高度写在 canvas 的直接父容器上；父容器用固定 h-[...]，不要混用 h-full/flex-1）：',
  '```html',
  '<div class="ppt-chart-frame relative h-[260px] w-full">',
  '  <canvas class="h-full w-full"></canvas>',
  '</div>',
  '```',
  '```js',
  'const chart = PPT.createChart(canvasEl, { type: "bar", data: { labels: ["A","B"], datasets: [{ data: [10,20] }] }, options: {} });',
  '```',
  '⛔ 错误写法（全部会被验证拦截，导致该页生成失败）：',
  '- new Chart(ctx, config) → 必须用 PPT.createChart(el, config)',
  '- canvas 上直接写 h-32 / h-full / flex-1 → 高度必须写在父容器',
  '- canvas 父容器写 h-full / flex-1 / 只有 min-h-* → 父容器必须有明确 h-[...]',
  '- 把 canvas 直接放进卡片/文本块 → 必须有专属 chart frame 父容器',
  '',
  '### 动画 — 优先使用 data-anim 声明式属性（推荐）',
  '简单入场动画（淡入、滑入、缩放）请优先使用 HTML data 属性声明，无需编写 JavaScript。默认使用 load 触发或不加动画：',
  '```html',
  '<!-- 单个元素：页面加载时淡入上滑 -->',
  '<div data-anim="fade-up" data-anim-duration="500">标题卡片</div>',
  '',
  '<!-- 列表交错出现：stagger(N) 自动错峰 -->',
  '<div data-anim="fade-up" data-anim-delay="stagger(100)">第1项</div>',
  '<div data-anim="fade-up" data-anim-delay="stagger(100)">第2项</div>',
  '<div data-anim="fade-up" data-anim-delay="stagger(100)">第3项</div>',
  '',
  '<!-- click 触发示例：低优先级方案。仅当用户提示词表达点击/按键/逐步讲述控制时使用；默认生成不要照抄 -->',
  '<div data-anim="fade-up" data-anim-trigger="click">第一条要点</div>',
  '<div data-anim="fade-up" data-anim-trigger="click">第二条要点</div>',
  '<div data-anim="fade-up" data-anim-trigger="click">第三条要点</div>',
  '```',
  '',
  'data-anim 支持的类型：fade | fade-up | fade-down | fade-left | fade-right | scale-in | slide-up | slide-left',
  'data-anim-delay：数字(ms) 或 stagger(N)（自动错峰，N 为间隔毫秒）',
  'data-anim-duration：数字(ms)，默认 500',
  'data-anim-easing：easeOutCubic（默认）| easeOutBack | easeInOut | linear',
  'data-anim-trigger：load（默认，页面加载即播）| click（低优先级，仅在用户提示词表达点击/按键逐条展示时使用）',
  '风格预设里的动画词（如 typewriter/glitch-in/path-draw 等）只作动效气质参考；data-anim 属性值必须使用上方支持列表，不要把风格词直接写成 data-anim，也不要为普通动效改写成脚本。',
  '动画决策规则见下方「动画交互决策规则」章节。',
  '使用 data-anim 的元素自身不要再写 inline opacity/transform 初始态；需要静态旋转、缩放或透明视觉时，放到内部子元素或外层非动画容器。',
  '',
  '### 动画 — PPT.animate() 命令式 API（复杂场景）',
  '只有当 data-anim 无法表达复杂时间线、自定义回调或复杂同步编排时，才使用 PPT.animate()：',
  'PPT.animate 的第一个参数是 targets（CSS 选择器字符串或 DOM 元素），第二个参数是动画参数对象：',
  '```js',
  '// ✅ 正确：PPT.animate(selector, params)',
  'PPT.animate(".card", { opacity: [0, 1], translateY: [20, 0], duration: 500, delay: PPT.stagger(100) })',
  '',
  '// ❌ 错误：把 targets 放在对象里',
  'PPT.animate({ targets: ".card", opacity: [0, 1] })  // 会被拦截',
  'anime({ targets: ".card" })                          // 会被拦截',
  '```',
  '创建时间线：PPT.createTimeline(targets, params)',
  '错峰延迟：PPT.stagger(ms)',
  '',
  '### 其他硬校验禁区（违反即失败）',
  '- 禁止 opacity-0 / invisible / visibility:hidden（初始态必须可见）',
  '- <style> 中禁止写 opacity:0 / visibility:hidden / display:none（系统会检测并拒绝）',
  '- 动画初始态写在 PPT.animate 参数里（如 opacity: [0, 1]），不要写在 CSS 或 class 中',
  '- 数学公式用 \\( \\) 或 $$ $$，不用单 $',
  '- 动画仅做轻量入场增强（opacity/translate/scale，300-700ms），禁止无限循环'
].join('\n')

export const ANIMATION_INTERACTION_RULES = [
  '## 动画交互决策规则',
  '生成页面时默认按以下策略判断；编辑模式仅在用户要求添加/修改动画，或必须重写动画相关内容时参考。',
  '- 先分析用户提示词、页面叙事和内容密度，再选择动画：无动画/静态 > load 入场 > stagger 自动错峰 > click 触发。click 是低优先级方案，不是流程页、列表页或时间线页的默认选择。',
  '- 如果用户没有表达点击、按键、逐步讲述、演讲节奏控制或 step-by-step reveal，不要主动写 data-anim-trigger="click"。',
  '- “流程图、时间线、步骤说明、阶段拆解、路径/链路/过程类页面”并不等于需要点击动画；只有用户提示词体现讲述控制需求时，才考虑 click。',
  '- 普通列表要点、对比卡片、分步讲解：默认一次显示、静态呈现、load 入场或 stagger 自动错峰，不要因为“适合演讲”就主动使用 click。',
  '- 封面、章节页、总结页、纯视觉页、密集数据页：通常使用 load 入场动画或不加动画。',
  '- 标题、背景装饰、连接线、箭头可以保持静态或使用 load；不要把箭头/连接线单独做成一次 click。',
  '- 当用户说"点击逐条出现/点一下出一个/演讲节奏/逐步讲解/逐项展开/按键展示"等明确交互需求时，才在对应内容单元上写 data-anim-trigger="click"。',
  '- 普通动画使用 data-anim 属性；不要为这些场景编写 <script> 或 JS 动画逻辑。'
].join('\n')

export const CONTENT_WRITING_RULES = [
  '## 内容写入规则',
  '- 只输出页面片段（不是完整 HTML）。工具自动包裹 page frame、补 data-block-id。',
  '- 禁止 <!doctype>/<html>/<head>/<body>/<meta>/<title>/<link>/<script src=...>。',
  '- 禁止系统骨架标识：.ppt-page-root / .ppt-page-fit-scope / .ppt-page-content / data-ppt-guard-root（class、CSS、script、注释里都不能出现）。',
  '- 所有标签必须成对闭合；items-center/justify-* 的父节点必须有 flex 或 grid。',
  '- ⚠️ 标签闭合是最常见的失败原因。写入前必须自检：每个 <div>/<section> 都有对应的 </div></section>，末尾无未闭合标签。',
  '- 控制嵌套层级：目标 3 层左右，避免超过 4 层。嵌套越深越容易漏闭合标签。',
  '- 片段最外层优先只用一个 <div> 根节点；不要主动输出 section[data-page-scaffold] 或 main[data-role="content"]，工具会自动包裹。',
  '- 精简 HTML 结构：用 Tailwind 类替代多层 wrapper div。能用 1 个 div 解决的不要用 3 个。',
  '- 装饰块保持扁平：单个绝对定位 div、少量并列装饰 div、或单个 SVG 都可以；避免装饰块内部继续套多层 wrapper。',
  '- 默认禁止 emoji/贴纸装饰；单区最多 3 列；留白优先，不要塞满。'
].join('\n')

export function resolveStylePrompt(styleId: string | null | undefined): {
  presetLabel: string
  presetId: string
  stylePrompt: string
} {
  const { preset, prompt } = loadStyleSkill(styleId)
  return {
    presetLabel: preset.label,
    presetId: preset.id,
    stylePrompt: prompt
  }
}

export function buildOutlinePageList(context: SessionDeckGenerationContext): string {
  return context.outlineItems
    .map((item, i) => {
      const layoutIntent = item.layoutIntent
        ? `\n   ${formatLayoutIntentPrompt(item.layoutIntent).replace(/\n/g, '\n   ')}`
        : ''
      return `${i + 1}. ${item.title}\n   Content points: ${item.contentOutline}${layoutIntent}`
    })
    .join('\n')
}

export function formatDesignContract(contract?: DesignContract): string {
  if (!contract) return 'Not provided. Keep pages visually consistent according to the style rules.'
  const lines = [
    '- Treat this as a flexible visual contract, not a fixed template. Preserve coherence while varying composition, density, and emphasis per slide.',
    `- Visual theme: ${contract.theme}`,
    `- Canvas background: ${contract.background}`,
    `- Palette: ${contract.palette.join(', ')}`,
    `- Title style: ${contract.titleStyle}`,
    `- Layout motif: ${contract.layoutMotif}`,
    '- Use the layout motif as the deck-level layout language. Keep pages varied within this motif instead of repeating one template.',
    `- Chart style: ${contract.chartStyle}`,
    `- Shape language: ${contract.shapeLanguage}`
  ]
  lines.push(
    `- Title font: ${contract.titleFont} (use var(--ppt-title-font) for titles)`,
    `- Body font: ${contract.bodyFont} (use var(--ppt-body-font) for body)`
  )
  return lines.join('\n')
}
