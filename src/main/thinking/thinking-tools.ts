import fs from 'fs'
import path from 'path'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { writeContextMd, writeThinkingMd } from './workspace'
import type { ThinkingStage } from '@shared/thinking'

export interface ThinkingWorkflowState {
  contextUpdated: boolean
  thinkingUpdated: boolean
  contextUpdateCount: number
  thinkingUpdateCount: number
}

const pageRoleSchema = z.enum(['cover', 'section', 'content', 'case', 'comparison', 'data', 'summary'])

const contextDocumentSchema = z.object({
  topic: z.string().optional().describe('Presentation topic when known.'),
  userIntent: z
    .string()
    .optional()
    .describe('Short markdown summary of what the user wants and what has been learned.'),
  confirmedDecisions: z
    .array(z.string())
    .optional()
    .describe('Confirmed durable decisions. Do not include guesses.'),
  openQuestions: z
    .array(z.string())
    .optional()
    .describe('Only unresolved questions that still matter.'),
  sourceNotes: z
    .array(z.string())
    .optional()
    .describe('Facts or observations from uploaded/source materials.'),
  latestDirection: z
    .string()
    .optional()
    .describe('Latest user message or direction, summarized without tool chatter.')
})

const thinkingDocumentSchema = z.object({
  topic: z.string().optional(),
  audience: z.string().optional(),
  setting: z.string().optional(),
  tone: z.string().optional(),
  keyDecisions: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  style: z.string().optional(),
  font: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional()
    .describe('Font preference. Use "auto" or a FontSelection JSON object with mode/title/body.'),
  pageCount: z.coerce.number().int().positive().optional(),
  pages: z
    .array(
      z.object({
        title: z.string().min(1),
        role: pageRoleSchema.describe('Page role in the narrative structure.'),
        objective: z.string().min(1).describe('What this page must accomplish for the audience.'),
        summary: z.string().min(1),
        keyPoints: z.array(z.string().min(1)).min(1)
      })
    )
    .optional()
    .describe('Ordered full slide/page plan. Passing pages replaces all existing pages. To modify specific pages, include the complete page list with your changes.')
})

type ContextDocumentInput = z.infer<typeof contextDocumentSchema>
type ThinkingDocumentInput = z.infer<typeof thinkingDocumentSchema>

const THINKING_SECTION_ORDER = [
  'Topic',
  'Audience',
  'Setting',
  'Tone',
  'Key Decisions',
  'Open Questions',
  'Style',
  'Font',
  'Page Count'
]

function bulletList(items: string[] | undefined): string {
  return (items || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith('- ') ? item : `- ${item}`))
    .join('\n')
}

function optionalSection(title: string, content: string | undefined): string {
  const value = content?.trim()
  return value ? `## ${title}\n${value}\n\n` : ''
}

function upsertSection(markdown: string, heading: string, content: string): string {
  const normalizedContent = content.trim()
  if (!normalizedContent) return markdown
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sectionRegex = new RegExp(`^##\\s*${escaped}\\s*\\n[\\s\\S]*?(?=^##\\s+|(?![\\s\\S]))`, 'm')
  const nextSection = `## ${heading}\n${normalizedContent}\n\n`
  if (sectionRegex.test(markdown)) {
    return markdown.replace(sectionRegex, nextSection.trimEnd() + '\n\n')
  }

  for (let index = THINKING_SECTION_ORDER.indexOf(heading) - 1; index >= 0; index -= 1) {
    const previous = THINKING_SECTION_ORDER[index]
    const previousRegex = new RegExp(
      `^##\\s*${previous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n[\\s\\S]*?(?=^##\\s+|(?![\\s\\S]))`,
      'm'
    )
    const match = markdown.match(previousRegex)
    if (match?.[0]) {
      const insertAt = (match.index || 0) + match[0].length
      return `${markdown.slice(0, insertAt).trimEnd()}\n\n${nextSection}${markdown.slice(insertAt).trimStart()}`
    }
  }

  const titleMatch = markdown.match(/^# .+$/m)
  if (titleMatch) {
    const insertAt = (titleMatch.index || 0) + titleMatch[0].length
    return `${markdown.slice(0, insertAt).trimEnd()}\n\n${nextSection}${markdown.slice(insertAt).trimStart()}`
  }
  return `# Thinking Brief\n\n${nextSection}${markdown.trim()}`
}

function stripPageSections(markdown: string): string {
  return markdown.replace(/\n*##\s*Page\s+\d+\s*:[\s\S]*$/m, '').trimEnd() + '\n'
}

function buildPageSections(
  pages: Array<{
    title: string
    role: z.infer<typeof pageRoleSchema>
    objective: string
    summary: string
    keyPoints: string[]
  }>
): string {
  const parts: string[] = []
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const pageNumber = index + 1
    const title = page.title.trim()
    const role = page.role.trim()
    const objective = page.objective.trim()
    const summary = page.summary.trim()
    const keyPoints = bulletList(page.keyPoints)

    if (!title) {
      throw new Error(`Page ${pageNumber} must have a real title.`)
    }
    if (!role) {
      throw new Error(`Page ${pageNumber} must have a role.`)
    }
    if (!objective) {
      throw new Error(`Page ${pageNumber} must have an objective.`)
    }
    if (!summary) {
      throw new Error(`Page ${pageNumber} must have a non-empty summary. Do not write placeholder pages.`)
    }
    if (!keyPoints) {
      throw new Error(`Page ${pageNumber} must include substantive keyPoints. Do not write placeholder pages.`)
    }

    parts.push(
      `## Page ${pageNumber}: ${title}`,
      `- Role: ${role}`,
      `- Objective: ${objective}`,
      '',
      summary,
      '',
      keyPoints,
      ''
    )
  }
  return parts.join('\n').trimEnd()
}

async function readExistingThinkingMd(thinkingDir: string): Promise<string> {
  const filePath = path.join(thinkingDir, 'thinking.md')
  try {
    if (fs.existsSync(filePath)) {
      return fs.promises.readFile(filePath, 'utf-8')
    }
  } catch {
    // Fall through to a fresh document.
  }
  return '# Thinking Brief\n'
}

function formatFontSection(font: ThinkingDocumentInput['font']): string | undefined {
  if (typeof font === 'string') return font
  if (font && typeof font === 'object') return JSON.stringify(font)
  return undefined
}

function buildContextMd(args: {
  stage: ThinkingStage
  topic?: string
  userIntent?: string
  confirmedDecisions?: string[]
  openQuestions?: string[]
  latestDirection?: string
  sourceNotes?: string[]
}): string {
  const topic = args.topic?.trim()
  const confirmedDecisions = bulletList(args.confirmedDecisions)
  const openQuestions = bulletList(args.openQuestions)
  const sourceNotes = bulletList(args.sourceNotes)
  const userIntent = args.userIntent?.trim() || (topic ? `- Topic: ${topic}` : '')

  return [
    `## Stage: ${args.stage}`,
    '',
    topic ? `## Topic\n${topic}\n` : '',
    optionalSection('User Intent', userIntent),
    optionalSection('Confirmed Decisions', confirmedDecisions),
    optionalSection('Open Questions', openQuestions),
    optionalSection('Source Notes', sourceNotes),
    optionalSection('Latest Direction', args.latestDirection)
  ]
    .join('\n')
    .trimEnd() + '\n'
}

async function mergeThinkingMd(thinkingDir: string, input: ThinkingDocumentInput): Promise<string> {
  let next = (await readExistingThinkingMd(thinkingDir)).trim() || '# Thinking Brief'
  const pages = input.pages

  const simpleSections: Array<[string, string | undefined]> = [
    ['Topic', input.topic],
    ['Audience', input.audience],
    ['Setting', input.setting],
    ['Tone', input.tone],
    ['Key Decisions', bulletList(input.keyDecisions)],
    ['Open Questions', bulletList(input.openQuestions)],
    ['Style', input.style],
    ['Font', formatFontSection(input.font)],
    ['Page Count', input.pageCount ? String(input.pageCount) : pages?.length ? String(pages.length) : undefined]
  ]

  for (const [title, content] of simpleSections) {
    if (content?.trim()) {
      next = upsertSection(next, title, content)
    }
  }

  if (Array.isArray(pages)) {
    const pageSections = buildPageSections(pages)
    if (pageSections) {
      next = `${stripPageSections(next).trimEnd()}\n\n${pageSections}`
    }
  }

  return next.trimEnd() + '\n'
}

export function createThinkingWorkflowTools(args: {
  thinkingDir: string
  currentStage: ThinkingStage
}): { tools: StructuredToolInterface[]; state: ThinkingWorkflowState } {
  const state: ThinkingWorkflowState = {
    contextUpdated: false,
    thinkingUpdated: false,
    contextUpdateCount: 0,
    thinkingUpdateCount: 0
  }

  const updateContextDocument = tool(
    async (input: ContextDocumentInput) => {
      const content = buildContextMd({
        stage: args.currentStage,
        topic: input.topic,
        userIntent: input.userIntent,
        confirmedDecisions: input.confirmedDecisions,
        openQuestions: input.openQuestions,
        latestDirection: input.latestDirection,
        sourceNotes: input.sourceNotes
      })
      await writeContextMd(args.thinkingDir, content)
      state.contextUpdated = true
      state.contextUpdateCount += 1
      return `context.md updated for stage ${args.currentStage}`
    },
    {
      name: 'update_context_document',
      description:
        'Required thinking workflow tool. Persist rolling conversation memory to /context.md every turn: user intent, confirmed decisions, open questions, source notes, and latest direction. Stage is managed by the system; do not set it. Use this instead of write_file/edit_file for context.md.',
      schema: contextDocumentSchema
    }
  )

  const updateThinkingDocument = tool(
    async (input: ThinkingDocumentInput) => {
      const content = await mergeThinkingMd(args.thinkingDir, input)
      await writeThinkingMd(args.thinkingDir, content)
      state.thinkingUpdated = true
      state.thinkingUpdateCount += 1
      return 'thinking.md updated'
    },
    {
      name: 'update_thinking_document',
      description:
        'Thinking document workflow tool. Merge updates into /thinking.md when the user asks for an outline, page plan, draft, style/font preference, or refined plan. Omit unchanged fields. Existing sections are preserved unless replaced. Passing pages replaces all existing pages; to modify specific pages, include the complete page list with changes. Every page must have a real title, role, objective, summary, and substantive keyPoints. Never write placeholder pages. Use this instead of write_file/edit_file for thinking.md.',
      schema: thinkingDocumentSchema
    }
  )

  return {
    tools: [updateContextDocument, updateThinkingDocument],
    state
  }
}
