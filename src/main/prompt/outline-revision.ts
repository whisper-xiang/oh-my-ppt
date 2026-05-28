import { CONTENT_LANGUAGE_RULES } from './shared'

export interface CurrentOutlineItem {
  pageNumber: number
  title: string
  contentOutline: string
  layoutIntent?: string | null
}

export function buildOutlineRevisionSystemPrompt(): string {
  return [
    "You are a PPT structure planner revising an existing outline based on the user's instructions.",
    '',
    CONTENT_LANGUAGE_RULES,
    '',
    '## Task',
    'You receive the current outline (one item per slide) and a user instruction describing how to modify it.',
    'Apply the instruction and return the FULL revised outline as JSON.',
    '',
    'Rules:',
    '- Apply ONLY the requested change; do not redesign untouched slides.',
    '- The page count MAY change if the user asks (split / merge / add / remove slides). Otherwise keep it the same.',
    '- Renumber pageNumber sequentially starting from 1 in the output.',
    '- Each item must use exactly these fields: title, keyPoints, layoutIntent.',
    '- keyPoints is an array of short phrases (1-6 per slide).',
    '- layoutIntent values: cover, toc, section-divider, data-focus, comparison, timeline, concept, process, summary, quote, image-focus.',
    '- If the user instruction is ambiguous, choose the most reasonable interpretation that preserves the original narrative.',
    '',
    'Return ONLY a JSON array. No explanations, no Markdown fences, no commentary.',
    'Format example: [{"title":"Cover","keyPoints":["Project subtitle","Presenter and date"],"layoutIntent":"cover"},{"title":"Market","keyPoints":["Size","Trend"],"layoutIntent":"data-focus"}]'
  ].join('\n')
}

export function buildOutlineRevisionUserPrompt(args: {
  topic: string
  currentOutline: CurrentOutlineItem[]
  userInstruction: string
  outlineRulePrompt?: string
}): string {
  const outlineLines = args.currentOutline
    .map((item) => {
      const layout = item.layoutIntent ? ` (layoutIntent: ${item.layoutIntent})` : ''
      const points = (item.contentOutline || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      const pointsBlock = points.length ? points.map((p) => `    - ${p}`).join('\n') : '    (no key points)'
      return `第 ${item.pageNumber} 页：${item.title}${layout}\n${pointsBlock}`
    })
    .join('\n')
  const rulesBlock = (args.outlineRulePrompt || '').trim()
    ? [
        '',
        '## Structural rules that must continue to be respected',
        args.outlineRulePrompt!.trim()
      ].join('\n')
    : ''
  return [
    `Topic: ${args.topic}`,
    '',
    '## Current outline',
    outlineLines,
    rulesBlock,
    '',
    '## User instruction',
    args.userInstruction,
    '',
    'Return the FULL revised outline as a JSON array (one item per slide).'
  ].join('\n')
}
