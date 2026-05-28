import type { DesignContract, SessionDeckGenerationContext } from '../tools/types'
import { formatLayoutIntentPrompt } from '@shared/layout-intent'
import {
  ANIMATION_INTERACTION_RULES,
  CANVAS_CONSTRAINTS,
  CONTENT_LANGUAGE_RULES,
  FRONTEND_CAPABILITIES,
  LAYOUT_COLLISION_RULES,
  PAGE_SEMANTIC_STRUCTURE,
  STABLE_HTML_FRAGMENT_PROTOCOL,
  buildOutlinePageList,
  formatDesignContract
} from './shared'

export function buildDeckGenerationPrompt(context: SessionDeckGenerationContext): string {
  const pageList = buildOutlinePageList(context)
  return [
    'Use the tools to write the deck content into each /<pageId>.html according to the user requirements and page outline below:',
    '',
    `Topic: ${context.topic}`,
    `Deck title: ${context.deckTitle}`,
    'Page outline:',
    pageList,
    '',
    'Additional user requirements:',
    context.userMessage,
    '',
    CONTENT_LANGUAGE_RULES,
    '',
    CANVAS_CONSTRAINTS,
    '',
    LAYOUT_COLLISION_RULES,
    '',
    FRONTEND_CAPABILITIES,
    '',
    ANIMATION_INTERACTION_RULES,
    '',
    PAGE_SEMANTIC_STRUCTURE,
    '',
    'Fill each slide strictly according to the content points in the page outline above.'
  ].join('\n')
}

export function buildSinglePageGenerationPrompt(args: {
  topic: string
  deckTitle: string
  pageId: string
  pageNumber: number
  pageTitle: string
  pageOutline: string
  layoutIntent?: SessionDeckGenerationContext['outlineItems'][number]['layoutIntent']
  sourceDocumentPaths?: string[]
  referenceDocumentSnippets?: string
  isRetryMode?: boolean
  designContract?: DesignContract
  retryContext?: {
    attempt: number
    maxRetries: number
    previousError: string
  }
}): string {
  const previousError = args.retryContext?.previousError || ''
  const shouldMentionChartOrAnimationFix =
    /chart|canvas|animation|animate|anime|PPT\.animate|PPT\.createChart/i.test(previousError)
  const shouldMentionWriteToolFix =
    /页面未写入|没有成功调用|not written|update_single_page_file|占位|placeholder/i.test(
      previousError
    )
  const retryInstructions = args.retryContext
    ? [
        '',
        'Retry fixes to prioritize:',
        `- This is retry ${args.retryContext.attempt}/${args.retryContext.maxRetries}.`,
        `- Previous failure: ${previousError}`,
        '- Output only a complete creative page fragment. The write tool will add section/main/content semantics when they are missing. Do not output a full document, page shell, or runtime scripts.',
        shouldMentionWriteToolFix
          ? `- The previous attempt did not write the target page. You must call update_single_page_file(pageId="${args.pageId}", content=...) before any final response; do not only describe the HTML in the final response.`
          : '',
        '- Before calling the write tool, mentally validate that the main containers are closed and that no tag is left unfinished at the end.',
        '- If the previous issue was unclosed tags, do not patch the broken fragment. Rewrite a simpler, shallower fragment from scratch: one root div, no page shell (section[data-page-scaffold], main[data-role="content"], or runtime frame), grid/flex direct children, aim for 3 nesting levels and avoid exceeding 4, fewer wrappers, fewer modules.',
        '- If the previous issue was page shell structure, do not include .ppt-page-root, .ppt-page-content, .ppt-page-fit-scope, or data-ppt-guard-root anywhere, including CSS selectors, class names, scripts, and comments.',
        shouldMentionChartOrAnimationFix
          ? '- The previous issue involved animation/chart API usage. Match animation to the original user request and slide narrative. Prefer static/load/stagger for simple entry or reveal; treat data-anim-trigger="click" as a low-priority option only when the original request asks for click/keyboard/step-by-step presentation control. Use PPT.animate, PPT.createTimeline, and PPT.stagger only for complex scripted animation; use PPT.createChart for charts.'
          : ''
      ].filter(Boolean)
    : []
  const sourceDocumentInstructions =
    args.sourceDocumentPaths && args.sourceDocumentPaths.length > 0
      ? args.referenceDocumentSnippets && args.referenceDocumentSnippets.trim().length > 0
        ? [
            '',
            args.referenceDocumentSnippets.trim(),
            '',
            'Source document requirements (STRICT — source document was provided):',
            '- This slide already has program-side retrieved snippets. Prioritize these snippets when generating slide content.',
            '- If the snippets cover this slide title and content points, you do not need to reread the entire source document.',
            `- If snippets are insufficient, conflicting, or missing key facts, use read_file to confirm the source document: ${args.sourceDocumentPaths.join(', ')}`,
            '- Use only source-document facts directly relevant to this slide outline. Do not move material for other slides into this slide.',
            args.isRetryMode
              ? '- This is a failed-slide retry. Match source material only around this slide title and content points; do not reconstruct the whole deck outline.'
              : '',
            '- Do not expand only from the outline. Do not invent exact numbers, dates, system names, or status claims not present in the snippets or source document.',
            '## Visual asset fidelity (highest priority when source document is present):',
            '- Tables: if the source contains a table relevant to this slide, reproduce it as an HTML <table> with the exact same rows, columns, and cell values. Do NOT substitute with a simplified or invented table.',
            '- Charts and graphs: if the source references data trends, comparisons, or quantitative series (even as text), render them using the ACTUAL values from the source. Do NOT substitute invented placeholder numbers.',
            '- Figures and diagrams: if the source describes a specific structure, architecture, or flow diagram, replicate its elements faithfully rather than drawing a generic alternative.',
            '- All numeric values, metric names, dates, and proper nouns that appear in the source must match exactly. Text may be reorganized or summarized, but source data must not be altered.',
            '- Prefer to visualize data that exists in the source (tables → HTML tables, series data → charts with real values) over free-form narrative paragraphs.'
          ].filter(Boolean)
        : [
            '',
            'Source document requirements (STRICT — source document was provided):',
            `- No retrieved snippets matched this slide. Before generating the slide, use read_file to read the source document: ${args.sourceDocumentPaths.join(', ')}`,
            '- First extract keywords, business objects, time points, system names, and metrics from this slide title and content points; then match relevant source passages.',
            '- Do not copy the whole document indiscriminately. Use only source-document facts directly relevant to this slide outline.',
            args.isRetryMode
              ? '- This is a failed-slide retry. Match source material only around this slide title and content points; do not reconstruct the whole deck outline.'
              : '',
            '- Do not expand only from the outline. Do not invent exact numbers, dates, system names, or status claims not present in the source document.',
            '## Visual asset fidelity (highest priority when source document is present):',
            '- Tables: if the source contains a table relevant to this slide, reproduce it as an HTML <table> with the exact same rows, columns, and cell values. Do NOT substitute with a simplified or invented table.',
            '- Charts and graphs: if the source references data trends, comparisons, or quantitative series (even as text), render them using the ACTUAL values from the source. Do NOT substitute invented placeholder numbers.',
            '- Figures and diagrams: if the source describes a specific structure, architecture, or flow diagram, replicate its elements faithfully rather than drawing a generic alternative.',
            '- All numeric values, metric names, dates, and proper nouns that appear in the source must match exactly. Text may be reorganized or summarized, but source data must not be altered.',
            '- Prefer to visualize data that exists in the source (tables → HTML tables, series data → charts with real values) over free-form narrative paragraphs.'
          ].filter(Boolean)
      : []
  return [
    'Generate and write only this slide. Do not modify other slides.',
    '',
    `Topic: ${args.topic}`,
    `Deck title: ${args.deckTitle}`,
    `Target page: ${args.pageId} (slide ${args.pageNumber})`,
    `Slide title: ${args.pageTitle}`,
    `Content points: ${args.pageOutline || 'Expand from the topic with moderate information density.'}`,
    args.layoutIntent ? formatLayoutIntentPrompt(args.layoutIntent) : '',
    ...sourceDocumentInstructions,
    '',
    CONTENT_LANGUAGE_RULES,
    '',
    CANVAS_CONSTRAINTS,
    '',
    LAYOUT_COLLISION_RULES,
    '',
    FRONTEND_CAPABILITIES,
    '',
    ANIMATION_INTERACTION_RULES,
    '',
    STABLE_HTML_FRAGMENT_PROTOCOL,
    '',
    'Deck-wide design contract. Follow it to keep pages visually consistent:',
    formatDesignContract(args.designContract),
    ...retryInstructions,
    '',
    'Expansion rules:',
    '- Treat content points as short seed phrases. Expand each seed into presentable modules such as headings, explanations, lists, charts, comparisons, or conclusions.',
    '- If there are 2-4 points, the final slide should cover all of them. You may add 1-2 supporting information blocks by priority.',
    '- You may complete reasonable data framing, examples, and structure, but do not drift away from the slide title and points.',
    '- Prefer visualization-friendly expression. When points involve trends, comparisons, or proportions, use charts or data cards when appropriate.',
    args.sourceDocumentPaths && args.sourceDocumentPaths.length > 0
      ? '- SOURCE DOCUMENT OVERRIDE: data-driven visuals (tables, charts, diagrams) MUST use values extracted from the source document. Do NOT invent new data series, substitute placeholder numbers, or fabricate metrics that are not present in the source.'
      : '',
    '',
    'Single-slide tool constraints:',
    `- Required action: call update_single_page_file(pageId="${args.pageId}", content=complete creative page fragment).`,
    '- This is not optional. A final text response without a successful update_single_page_file tool call means the slide is not generated.',
    '- Do not call update_page_file. In this single-slide run it is intentionally not available.',
    '- content must be a complete creative page fragment. The tool will wrap it with section[data-page-scaffold], main[data-role="content"], editable data-block-id attributes, and the runtime page frame when needed.',
    '- The content must not contain <!doctype>, <html>, <head>, <body>, .ppt-page-root, .ppt-page-content, .ppt-page-fit-scope, or data-ppt-guard-root.',
    '- The content must be complete and balanced: close your main layout containers and leave no unfinished trailing tags.',
    '- After the tool call succeeds, final response should be a short summary only. Do not paste the HTML in the final response.',
    '- Do not modify other slides.',
    '',
    'Tool context (pre-injected):',
    `- Target file: ${args.pageId}.html (virtual path: /${args.pageId}.html)`,
    '- Agent workspace root: /'
  ].join('\n')
}

/**
 * Prompt for template-mode single-page generation.
 *
 * The template background, decorative chrome, and title box are automatically
 * restored by the write tool — the AI only needs to produce the BODY CONTENT
 * (text blocks, lists, data, etc.) for the slide's content zone.
 * This prompt intentionally omits expansion/design/animation rules so it does
 * not override the template's visual identity.
 */
export function buildTemplateSinglePagePrompt(args: {
  topic: string
  deckTitle: string
  pageId: string
  pageNumber: number
  pageTitle: string
  pageOutline: string
  layoutIntent?: SessionDeckGenerationContext['outlineItems'][number]['layoutIntent']
  /** All page titles in the deck — used to build the TOC on table-of-contents slides */
  allPageTitles?: string[]
  sourceDocumentPaths?: string[]
  referenceDocumentSnippets?: string
  retryContext?: {
    attempt: number
    maxRetries: number
    previousError: string
  }
}): string {
  const previousError = args.retryContext?.previousError || ''
  const shouldMentionWriteToolFix =
    /页面未写入|没有成功调用|not written|update_single_page_file|占位|placeholder/i.test(previousError)
  const retryInstructions = args.retryContext
    ? [
        '',
        'Retry notes:',
        `- This is retry ${args.retryContext.attempt}/${args.retryContext.maxRetries}.`,
        `- Previous failure: ${previousError}`,
        shouldMentionWriteToolFix
          ? `- The previous attempt did not write the target page. You must call update_single_page_file(pageId="${args.pageId}", content=...) before any final response.`
          : ''
      ].filter(Boolean)
    : []

  const sourceDocumentInstructions =
    args.sourceDocumentPaths && args.sourceDocumentPaths.length > 0
      ? args.referenceDocumentSnippets && args.referenceDocumentSnippets.trim().length > 0
        ? [
            '',
            args.referenceDocumentSnippets.trim(),
            '',
            "Source document requirements (STRICT): use the retrieved snippets above for this slide's content. Do not invent facts not present in the snippets or source document.",
            `- If snippets are insufficient, use read_file to confirm: ${args.sourceDocumentPaths.join(', ')}`,
            '- Tables in source → reproduce as HTML <table> with exact rows/columns/values.',
            '- Charts/data series in source → render with ACTUAL values from source, not invented placeholders.',
            '- All numbers, metric names, dates, and proper nouns must come from the source exactly.'
          ]
        : [
            '',
            `Source document requirements (STRICT): before writing, use read_file to read relevant sections: ${args.sourceDocumentPaths.join(', ')}`,
            '- Extract only content relevant to this slide title and outline. Do not copy unrelated sections.',
            '- Tables in source → reproduce as HTML <table> with exact rows/columns/values.',
            '- Charts/data series in source → render with ACTUAL values from source, not invented placeholders.',
            '- All numbers, metric names, dates, and proper nouns must come from the source exactly.'
          ]
      : []

  // TOC hint: when this is a table-of-contents slide, supply all section titles
  const isToc = args.layoutIntent === 'toc'
  const tocInstructions =
    isToc && args.allPageTitles && args.allPageTitles.length > 1
      ? [
          '',
          'Table of contents: this slide lists the deck sections. Use the following titles as the TOC entries (one per line/item):',
          ...args.allPageTitles.map((t, i) => `  ${i + 1}. ${t}`)
        ]
      : []

  return [
    '## Template slide — generate body content only',
    '',
    `Topic: ${args.topic}`,
    `Deck title: ${args.deckTitle}`,
    `Target page: ${args.pageId} (slide ${args.pageNumber})`,
    `Slide title: ${args.pageTitle}`,
    `Content outline: ${args.pageOutline || 'Derive content from the topic and slide title.'}`,
    args.layoutIntent ? formatLayoutIntentPrompt(args.layoutIntent) : '',
    ...tocInstructions,
    ...sourceDocumentInstructions,
    '',
    '### What you must produce',
    'Generate the BODY CONTENT for the slide content zone — text, headings, lists, data cards, etc.',
    'The slide title heading, background, decorative layers, and logo are handled automatically — do NOT include them.',
    '',
    '### Strict rules',
    '- Do NOT include background-image elements, colored-band divs, logo images, or any purely decorative layers.',
    '- Do NOT output a section[data-page-scaffold] block or any outer wrapper — output the inner body content only.',
    '- Do NOT add a standalone h1/h2/h3 title at the top of the content — the title is placed automatically.',
    '- Do NOT include <!doctype>, <html>, <head>, <body>, .ppt-page-root, .ppt-page-content, .ppt-page-fit-scope, or data-ppt-guard-root.',
    '- Respect the content outline — use the outline points as headings or list items, expand each into readable text.',
    '',
    CONTENT_LANGUAGE_RULES,
    '',
    'Tool constraint:',
    `- Required: call update_single_page_file(pageId="${args.pageId}", content=<body content fragment>).`,
    '- content is the inner body content only (divs, p, ul, etc.) — no outer wrappers or page shell.',
    '- After the tool call, respond with a one-line summary only.',
    '',
    'Tool context:',
    `- Target file: ${args.pageId}.html (virtual path: /${args.pageId}.html)`,
    '- Agent workspace root: /',
    ...retryInstructions
  ].filter(Boolean).join('\n')
}
