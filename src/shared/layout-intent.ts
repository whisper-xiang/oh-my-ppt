export type LayoutIntent =
  | 'cover'
  | 'toc'
  | 'section-divider'
  | 'data-focus'
  | 'comparison'
  | 'timeline'
  | 'concept'
  | 'process'
  | 'summary'
  | 'quote'
  | 'image-focus'

export const LAYOUT_INTENTS = [
  'cover',
  'toc',
  'section-divider',
  'data-focus',
  'comparison',
  'timeline',
  'concept',
  'process',
  'summary',
  'quote',
  'image-focus'
] as const satisfies readonly LayoutIntent[]

const LAYOUT_INTENT_SET = new Set<string>(LAYOUT_INTENTS)

const LAYOUT_GUIDANCE: Record<LayoutIntent, string> = {
  cover: 'Make the title or core message the visual focus.',
  toc: 'List all section titles clearly. Keep it clean and scannable — no sub-details, no decorative clutter.',
  'section-divider': 'Display the section title prominently. Minimise body text to signal a chapter transition.',
  'data-focus': 'Let metrics, charts, or quantitative evidence dominate the page.',
  comparison: 'Use a structure that makes differences easy to compare.',
  timeline: 'Use a phase, stage, roadmap, or progression structure.',
  concept: 'Explain the idea with a clear visual hierarchy or central structure.',
  process: 'Show steps, flow, mechanism, or cause-and-effect clearly.',
  summary: 'Lead with the conclusion, then support it with compact evidence.',
  quote: 'Make the statement the main visual anchor.',
  'image-focus': 'Let the visual material dominate, with text supporting it.'
}

export const normalizeLayoutIntent = (value: unknown): LayoutIntent => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
  return LAYOUT_INTENT_SET.has(normalized) ? (normalized as LayoutIntent) : 'concept'
}

export const layoutIntentGuidance = (intent: LayoutIntent | undefined): string =>
  LAYOUT_GUIDANCE[normalizeLayoutIntent(intent)]

export const formatLayoutIntentPrompt = (intent: LayoutIntent | undefined): string =>
  `Layout intent: ${normalizeLayoutIntent(intent)}.\nLayout guidance: ${layoutIntentGuidance(intent)}`
