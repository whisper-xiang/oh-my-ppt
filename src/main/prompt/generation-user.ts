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
            'Source document requirements:',
            '- This slide already has program-side retrieved snippets. Prioritize these snippets when generating slide content.',
            '- If the snippets cover this slide title and content points, you do not need to reread the entire source document.',
            `- If snippets are insufficient, conflicting, or missing key facts, use read_file to confirm the source document: ${args.sourceDocumentPaths.join(', ')}`,
            '- Use only source-document facts directly relevant to this slide outline. Do not move material for other slides into this slide.',
            args.isRetryMode
              ? '- This is a failed-slide retry. Match source material only around this slide title and content points; do not reconstruct the whole deck outline.'
              : '',
            '- Do not expand only from the outline. Do not invent exact numbers, dates, system names, or status claims not present in the snippets or source document.'
          ].filter(Boolean)
        : [
            '',
            'Source document requirements:',
            `- No retrieved snippets matched this slide. Before generating the slide, use read_file to read the source document: ${args.sourceDocumentPaths.join(', ')}`,
            '- First extract keywords, business objects, time points, system names, and metrics from this slide title and content points; then match relevant source passages.',
            '- Do not copy the whole document indiscriminately. Use only source-document facts directly relevant to this slide outline.',
            args.isRetryMode
              ? '- This is a failed-slide retry. Match source material only around this slide title and content points; do not reconstruct the whole deck outline.'
              : '',
            '- Do not expand only from the outline. Do not invent exact numbers, dates, system names, or status claims not present in the source document.'
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
 * Task: edit template content in-place, NOT design a new slide.
 * Intentionally omits expansion/design rules from buildSinglePageGenerationPrompt.
 */
export function buildTemplateSinglePagePrompt(args: {
  topic: string
  deckTitle: string
  pageId: string
  pageNumber: number
  pageTitle: string
  pageOutline: string
  layoutIntent?: SessionDeckGenerationContext['outlineItems'][number]['layoutIntent']
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
            "Source document: use the retrieved snippets above for this slide's text content. Do not invent facts not present in the snippets or source document.",
            `- If snippets are insufficient, use read_file to confirm: ${args.sourceDocumentPaths.join(', ')}`
          ]
        : [
            '',
            `Source document: before writing, read the source for relevant facts: ${args.sourceDocumentPaths.join(', ')}`,
            '- Extract only content relevant to this slide title and outline. Do not copy unrelated sections.'
          ]
      : []

  return [
    '## Template page update — edit in-place, do NOT redesign',
    '',
    `Topic: ${args.topic}`,
    `Deck title: ${args.deckTitle}`,
    `Target page: ${args.pageId} (slide ${args.pageNumber})`,
    `Slide title to use: ${args.pageTitle}`,
    `Content outline: ${args.pageOutline || 'Derive content from the topic and slide title.'}`,
    args.layoutIntent ? formatLayoutIntentPrompt(args.layoutIntent) : '',
    ...sourceDocumentInstructions,
    '',
    '### Steps',
    `1. Read the full template page: call read_file(path="/${args.pageId}.html")`,
    '2. Identify in the template:',
    '   a. Chrome elements — ALL absolutely-positioned layers: background images, texture images, decorative images, masks, colored bands, corner logos, footer decorations, SVG shapes, any element with class "absolute"/"fixed" or style "position:absolute/fixed". Also any <img> used purely for decoration.',
    '   b. Title element — where the slide title text lives in the template.',
    '   c. Content zone — the area where body text, bullet points, and content modules sit.',
    `3. Call update_single_page_file(pageId="${args.pageId}", content=...) where content is:`,
    `   • The COMPLETE section[data-page-scaffold] block from the template (all children — chrome AND content zone), with ONLY these text changes:`,
    `   • Replace the title element's text with the slide title above.`,
    '   • Replace body text, list items, and data values in the content zone to match the content outline.',
    '   • Everything else — HTML structure, CSS classes, inline styles, src/href/url() values, all attributes — must be copied verbatim from the template.',
    '',
    '### Strict rules — must not be violated',
    '- Output the ENTIRE template section block. Do NOT output only the new content portion — chrome elements must be in your output or all template styling is lost.',
    '- Do NOT add HTML elements that are not in the template.',
    '- Do NOT remove any element from the template (no removing background layers, logo images, bands, or decorations).',
    '- Do NOT change CSS classes, inline styles, or any HTML attributes except text content nodes.',
    '- Do NOT add a new standalone h1/h2 title if the template does not place the title at the top-left.',
    '- Your output section block must look identical to the template visually, with only text updated.',
    '',
    CONTENT_LANGUAGE_RULES,
    '',
    'Tool constraint:',
    `- Required: call update_single_page_file(pageId="${args.pageId}", content=...).`,
    '- content must be the inner section block only — NOT <!doctype>, <html>, <head>, <body>, .ppt-page-root, .ppt-page-content, .ppt-page-fit-scope, or data-ppt-guard-root.',
    '- After the tool call, respond with a one-line summary only.',
    '',
    'Tool context:',
    `- Target file: ${args.pageId}.html (virtual path: /${args.pageId}.html)`,
    '- Agent workspace root: /',
    ...retryInstructions
  ].filter(Boolean).join('\n')
}
