import { LRUCache } from 'lru-cache'
import log from 'electron-log/main.js'
import { resolveModel } from '../agent'
import { FilesystemBackend, createDeepAgent } from 'deepagents'
import { extractModelText } from '../ipc/utils'
import { resolveModelTimeoutMs } from '@shared/model-timeout'
import { logAgentToolEvents } from '../utils/agent-tool-logger'
import { buildThinkingContext, type ThinkingContextArgs } from './context-builder'
import { checkStageTransition, detectStageFallback } from './stage-manager'
import { writeContextMd, writeThinkingMd } from './workspace'
import {
  createThinkingWorkflowTools,
  type ThinkingWorkflowState
} from './thinking-tools'
import type { ThinkingChatMessage, ThinkingStage, ThinkingChatResult } from '@shared/thinking'

interface ThinkingRuntime {
  agent: ReturnType<typeof createDeepAgent>
  workflowState: ThinkingWorkflowState
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isAssistantMessage(record: Record<string, unknown>): boolean {
  const role = String(record.role || '').toLowerCase()
  const type = String(record.type || '').toLowerCase()
  const constructorName = String(
    getObject(record.lc_kwargs)?.type ?? getObject(record.kwargs)?.type ?? ''
  ).toLowerCase()
  const isAssistant =
    role === 'assistant' || type === 'ai' || type === 'assistant' || constructorName === 'ai'
  const isToolOrHuman =
    role === 'tool' ||
    role === 'user' ||
    role === 'system' ||
    type === 'tool' ||
    type === 'human' ||
    type === 'system'
  return isAssistant && !isToolOrHuman
}

function extractAssistantTextsFromState(data: unknown): string[] {
  const texts: string[] = []
  const seen = new Set<object>()

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (seen.has(value as object)) return
    seen.add(value as object)

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    const record = value as Record<string, unknown>
    if (isAssistantMessage(record)) {
      const text = extractModelText(record).trim()
      if (text) texts.push(text)
    }

    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') visit(nested)
    }
  }

  visit(data)
  return texts
}

const runtimeCache = new LRUCache<string, ThinkingRuntime>({
  max: 20,
  ttl: 60 * 60 * 1000
})

const SECTION_ORDER = [
  'Stage',
  'Topic',
  'Audience',
  'Setting',
  'Tone',
  'Key Decisions',
  'User Intent',
  'Confirmed Decisions',
  'Open Questions',
  'Source Notes',
  'Latest Direction',
  'Style',
  'Font',
  'Page Count'
]

function readSection(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = markdown.match(new RegExp(`^##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'm'))
  return match?.[1]?.trim() || ''
}

function hasMeaningfulThinkingContent(markdown: string): boolean {
  return Boolean(
    readSection(markdown, 'Topic') ||
      readSection(markdown, 'Audience') ||
      readSection(markdown, 'Setting') ||
      /^##\s*Page\s+\d+\s*:/m.test(markdown)
  )
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

  for (let index = SECTION_ORDER.indexOf(heading) - 1; index >= 0; index -= 1) {
    const previous = SECTION_ORDER[index]
    const previousRegex = new RegExp(`^##\\s*${previous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n[\\s\\S]*?(?=^##\\s+|(?![\\s\\S]))`, 'm')
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
  return `# Thinking Document\n\n${nextSection}${markdown.trim()}`
}

function firstMeaningfulUserMessage(messages: ThinkingChatMessage[], currentMessage: string): string {
  const candidates = [...messages.filter((message) => message.role === 'user').map((message) => message.content), currentMessage]
  return (
    candidates
      .map((item) => item.trim())
      .find((item) => item.length >= 4 && !/^\d+[.、]/.test(item) && !/^技术\s*(?:\d+[.、]|$)/.test(item)) || ''
  )
}

function extractNumberedAnswer(text: string, number: number): string {
  const nextNumber = number + 1
  const match = text.match(new RegExp(`(?:^|\\s)${number}[.、]\\s*([\\s\\S]*?)(?=(?:\\s${nextNumber}[.、])|$)`))
  return match?.[1]?.trim().replace(/\s+/g, ' ') || ''
}

function extractImplicitFirstAnswer(text: string): string {
  const match = text.match(/^\s*([^\n]+?)\s+2[.、]\s*/)
  const value = match?.[1]?.trim().replace(/\s+/g, ' ') || ''
  if (!value || /^\d+[.、]/.test(value)) return ''
  return value
}

function inferThinkingFacts(messages: ThinkingChatMessage[], currentMessage: string): Record<string, string> {
  const userMessages = [...messages.filter((message) => message.role === 'user').map((message) => message.content), currentMessage]
  const joined = userMessages.join('\n')
  const facts: Record<string, string> = {}
  const topic = firstMeaningfulUserMessage(messages, currentMessage)
  if (topic) facts.Topic = topic

  for (const message of userMessages) {
    const first = extractNumberedAnswer(message, 1) || extractImplicitFirstAnswer(message)
    const second = extractNumberedAnswer(message, 2)
    const third = extractNumberedAnswer(message, 3)
    const fourth = extractNumberedAnswer(message, 4)
    if (first && /(爱好者|从业者|投资者|学生|观众|用户|客户|团队|委员会)/.test(first)) {
      facts.Audience = first
    }
    if (second && /(分享会|会议|课堂|课程|峰会|发布会|内部|路演|汇报)/.test(second)) {
      facts.Setting = second
    }
    if (third && /(轻松|活泼|正式|专业|严谨|科技|现代|商务|数据)/.test(third)) {
      facts.Tone = third
    }
    if (!facts.Tone && fourth && /(轻松|活泼|正式|专业|严谨|科技|现代|商务|数据|故事|行业分析)/.test(fourth)) {
      facts.Tone = fourth
    }
    if (fourth && /(没有|无|帮我|参考|资料|数据)/.test(fourth)) {
      facts['Key Decisions'] = '- 用户没有自带参考数据，希望 AI 协助整理公开资料和趋势判断。'
    }
  }

  if (/进阶爱好者/.test(joined)) facts.Audience = '进阶爱好者'
  else if (!facts.Audience && /爱好者/.test(joined)) facts.Audience = '爱好者'
  else if (!facts.Audience && /动漫行业从业者|行业从业者|从业者/.test(joined)) facts.Audience = '动漫行业从业者'
  if (!facts.Setting && /分享会/.test(joined)) facts.Setting = '分享会'
  else if (!facts.Setting && /行业会议/.test(joined)) facts.Setting = '行业会议'
  if (!facts.Tone && /轻松活泼/.test(joined)) facts.Tone = '轻松活泼'
  else if (!facts.Tone && /侧重数据|数据驱动|数据/.test(joined)) facts.Tone = '侧重数据'

  const decisions: string[] = []
  if (/技术/.test(joined)) decisions.push('用户希望从技术角度展开。')
  if (/你帮我决策多少页|多少页|帮我决策/.test(joined)) {
    decisions.push('页数由 AI 根据分享会节奏决策，优先规划为清晰、适合进阶爱好者的中等篇幅。')
  }
  if (/没有参考数据|没有参考资料|帮我找/.test(joined)) {
    decisions.push('用户没有参考资料，需要 AI 协助整理可用的行业背景、趋势和案例。')
  }
  if (decisions.length > 0) {
    const existing = facts['Key Decisions'] ? `${facts['Key Decisions']}\n` : ''
    facts['Key Decisions'] = `${existing}${decisions.map((item) => `- ${item}`).join('\n')}`.trim()
  }

  const openQuestions: string[] = []
  if (!facts.Topic) openQuestions.push('确认演示主题。')
  if (!facts.Audience) openQuestions.push('确认目标受众。')
  if (!facts.Setting) openQuestions.push('确认演示场合。')
  if (!facts.Tone) openQuestions.push('确认风格调性。')
  if (!/核心内容|重点|技术/.test(joined)) openQuestions.push('确认希望重点讲技术演进、产业趋势、案例还是创作流程。')
  if (openQuestions.length > 0) {
    facts['Open Questions'] = openQuestions.map((item) => `- ${item}`).join('\n')
  }

  return facts
}

function shouldPromoteCollectToOutline(args: {
  currentStage: ThinkingStage
  recentMessages?: ThinkingChatMessage[]
  userMessage: string
  thinkingMd: string
  sourceContent: string
}): boolean {
  if (args.currentStage !== 'collect') return false
  if (countThinkingPages(args.thinkingMd) >= 2) return false

  const facts = inferThinkingFacts(args.recentMessages || [], args.userMessage)
  const hasTopic = Boolean(facts.Topic || readSection(args.thinkingMd, 'Topic'))
  const hasAudience = Boolean(facts.Audience || readSection(args.thinkingMd, 'Audience'))
  const hasSetting = Boolean(facts.Setting || readSection(args.thinkingMd, 'Setting'))
  const hasToneOrDirection = Boolean(
    facts.Tone ||
      readSection(args.thinkingMd, 'Tone') ||
      /数据|故事|行业分析|技术|轻松|活泼|正式|专业|20\s*分钟|分钟|页/.test(args.userMessage)
  )
  const hasUsefulSource = args.sourceContent.trim().length > 0
  const asksToGenerateFromSource =
    hasUsefulSource &&
    /根据.*(?:文档|资料|文件|素材|图片).*生成|按.*(?:文档|资料|文件|素材|图片).*生成|generate.*(?:document|file|source|material)|based on.*(?:document|file|source|material)/i.test(
      args.userMessage
    )

  if (asksToGenerateFromSource && hasTopic) return true

  return hasTopic && hasAudience && hasSetting && (hasToneOrDirection || hasUsefulSource)
}

function countThinkingPages(thinkingMd: string): number {
  const matches = thinkingMd.match(/^##\s*Page\s+\d+\s*:/gm)
  return matches ? matches.length : 0
}

function inferPageCountForOutline(messages: ThinkingChatMessage[] | undefined, userMessage: string): number {
  const joined = [...(messages || []).map((message) => message.content), userMessage].join('\n')
  const explicitPages = joined.match(/(\d+)\s*(?:页|p|pages?)/i)
  if (explicitPages) {
    const count = Number(explicitPages[1])
    if (Number.isFinite(count)) return Math.max(4, Math.min(16, count))
  }
  const minutes = joined.match(/(\d+)\s*分钟/)
  if (minutes) {
    const duration = Number(minutes[1])
    if (duration <= 10) return 5
    if (duration <= 20) return 8
    if (duration <= 40) return 12
    return 14
  }
  return 8
}

function buildFallbackOutlineThinkingMd(args: {
  thinkingMd: string
  recentMessages?: ThinkingChatMessage[]
  userMessage: string
  sourceContent: string
}): string {
  const facts = inferThinkingFacts(args.recentMessages || [], args.userMessage)
  const topic = facts.Topic || readSection(args.thinkingMd, 'Topic') || '待定主题'
  const audience = facts.Audience || readSection(args.thinkingMd, 'Audience') || '待定受众'
  const setting = facts.Setting || readSection(args.thinkingMd, 'Setting') || '待定场合'
  const tone = facts.Tone || readSection(args.thinkingMd, 'Tone') || '专业清晰'
  const pageCount = inferPageCountForOutline(args.recentMessages, args.userMessage)

  // Minimal skeleton — the AI will refine titles and content in subsequent turns
  const pages: string[] = []
  for (let i = 0; i < pageCount; i += 1) {
    pages.push(`## Page ${i + 1}: 待定`)
    pages.push('- 待完善')
    pages.push('')
  }

  return [
    '# Thinking Document',
    '',
    '## Topic',
    topic,
    '',
    '## Audience',
    audience,
    '',
    '## Setting',
    setting,
    '',
    '## Tone',
    tone,
    '',
    '## Page Count',
    String(pageCount),
    '',
    '## Font',
    'auto',
    '',
    ...pages
  ].join('\n').trimEnd() + '\n'
}

function mergeConversationFactsIntoThinkingMd(args: {
  thinkingMd: string
  recentMessages?: ThinkingChatMessage[]
  userMessage: string
}): string {
  const facts = inferThinkingFacts(args.recentMessages || [], args.userMessage)
  let next = args.thinkingMd.trim() || '# Thinking Document'
  const shouldFillExisting = !hasMeaningfulThinkingContent(next)

  for (const [heading, content] of Object.entries(facts)) {
    if (!shouldFillExisting && readSection(next, heading)) continue
    next = upsertSection(next, heading, content)
  }

  return next.trimEnd() + '\n'
}

function mergeConversationFactsIntoContextMd(args: {
  contextMd: string
  currentStage: ThinkingStage
  recentMessages?: ThinkingChatMessage[]
  userMessage: string
}): string {
  const facts = inferThinkingFacts(args.recentMessages || [], args.userMessage)
  let next = args.contextMd.trim() || `# Rolling Context\n\n## Stage: ${args.currentStage}\n`
  if (!/^##\s*Stage:/m.test(next)) {
    next = upsertSection(next, 'Stage', args.currentStage)
  }

  const userIntent = [
    facts.Topic ? `- Topic: ${facts.Topic}` : '',
    facts.Audience ? `- Audience: ${facts.Audience}` : '',
    facts.Setting ? `- Setting: ${facts.Setting}` : '',
    facts.Tone ? `- Tone: ${facts.Tone}` : ''
  ].filter(Boolean)

  if (userIntent.length > 0) {
    next = upsertSection(next, 'User Intent', userIntent.join('\n'))
  }

  if (facts['Key Decisions']) {
    next = upsertSection(next, 'Confirmed Decisions', facts['Key Decisions'])
  }

  if (facts['Open Questions']) {
    next = upsertSection(next, 'Open Questions', facts['Open Questions'])
  }

  const latestDirection = args.userMessage.trim()
    ? `Latest user input:\n${args.userMessage.trim()}`
    : ''
  if (latestDirection) {
    next = upsertSection(next, 'Latest Direction', latestDirection)
  }

  return next.trimEnd() + '\n'
}

async function collectAgentReply(
  stream: AsyncIterable<unknown>,
  onThinkingEvent?: (event: { type: 'tool_call' | 'tool_result'; toolName: string; summary: string }) => void
): Promise<{
  replyText: string
  latestAssistantStateText: string
}> {
  let replyText = ''
  let latestAssistantStateText = ''
  const seenToolEvents = new Set<string>()

  for await (const chunk of stream as AsyncIterable<unknown>) {
    if (!Array.isArray(chunk) || chunk.length < 3) continue
    const mode = chunk[1] as string
    const data = chunk[2]
    if (mode === 'updates') {
      extractAndEmitToolEvents(data, seenToolEvents, onThinkingEvent)
      logAgentToolEvents(data, seenToolEvents, { tag: 'thinking:agent', source: 'updates' })
      const assistantTexts = extractAssistantTextsFromState(data)
      const longestText = assistantTexts.sort((a, b) => b.length - a.length)[0] || ''
      if (longestText.length >= latestAssistantStateText.length) {
        latestAssistantStateText = longestText
      }
      continue
    }
    if (mode !== 'messages' || !Array.isArray(data)) continue
    extractAndEmitToolEvents(data, seenToolEvents, onThinkingEvent)
    logAgentToolEvents(data, seenToolEvents, { tag: 'thinking:agent', source: 'messages' })
    for (const message of data as Array<Record<string, unknown>>) {
      const content = extractModelText(message).trim()
      if (content) {
        replyText += content
      }
    }
  }

  return { replyText, latestAssistantStateText }
}

/** Extract tool call/result events and emit them for the thinking process UI. */
function extractAndEmitToolEvents(
  data: unknown,
  seen: Set<string>,
  onThinkingEvent?: (event: { type: 'tool_call' | 'tool_result'; toolName: string; summary: string }) => void
): void {
  if (!onThinkingEvent) return
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const record = value as Record<string, unknown>
    // Check for tool calls
    const additional = record.additional_kwargs as Record<string, unknown> | undefined
    const toolCalls = record.tool_calls ?? additional?.tool_calls
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        const callRecord = call && typeof call === 'object' ? call as Record<string, unknown> : null
        if (!callRecord) continue
        const fnRecord = callRecord.function && typeof callRecord.function === 'object'
          ? callRecord.function as Record<string, unknown> : null
        const name = String(callRecord.name ?? fnRecord?.name ?? '').trim()
        const id = String(callRecord.id ?? '').trim()
        const rawArgs = callRecord.args ?? fnRecord?.arguments ?? ''
        const key = `tc:${id}:${name}`
        if (name && id && !seen.has(key)) {
          seen.add(key)
          const summary = summarizeToolCall(name, rawArgs)
          onThinkingEvent({ type: 'tool_call', toolName: name, summary })
        }
      }
    }
    // Check for tool results
    const toolCallId = String(record.tool_call_id ?? '').trim()
    const toolName = String(record.name ?? '').trim()
    if (toolCallId && (record.role === 'tool' || record.type === 'tool')) {
      const key = `tr:${toolCallId}:${toolName}`
      if (!seen.has(key)) {
        seen.add(key)
        onThinkingEvent({ type: 'tool_result', toolName, summary: '' })
      }
    }
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') visit(nested)
    }
  }
  visit(data)
}

function summarizeToolCall(toolName: string, rawArgs: unknown): string {
  if (toolName === 'read_file') {
    const args = typeof rawArgs === 'string' ? safeParseJson(rawArgs) : rawArgs
    const path = getNestedField(args, 'path') as string | undefined
    if (path) return `Reading ${path.replace(/^\/sources\//, '')}`
    return 'Reading file...'
  }
  if (toolName === 'grep') {
    const args = typeof rawArgs === 'string' ? safeParseJson(rawArgs) : rawArgs
    const pattern = getNestedField(args, 'pattern') as string | undefined
    if (pattern) return `Searching "${String(pattern).slice(0, 40)}"`
    return 'Searching content...'
  }
  if (toolName === 'update_thinking_document') {
    const args = typeof rawArgs === 'string' ? safeParseJson(rawArgs) : rawArgs
    const pages = getNestedField(args, 'pages') as Array<Record<string, unknown>> | undefined
    const topic = getNestedField(args, 'topic') as string | undefined
    if (pages && Array.isArray(pages) && pages.length > 0) {
      const titles = pages.map((p) => getNestedField(p, 'title') as string || '').filter(Boolean)
      if (titles.length > 0) return `Updating ${pages.length} pages: ${titles.slice(0, 3).join(', ')}${titles.length > 3 ? '...' : ''}`
    }
    if (topic) return `Setting topic: ${String(topic).slice(0, 40)}`
    return 'Updating outline...'
  }
  if (toolName === 'update_context_document') {
    return 'Recording decisions...'
  }
  return ''
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

function getNestedField(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  return (obj as Record<string, unknown>)[key]
}

async function runAgentMessage(args: {
  runtime: ThinkingRuntime
  message: string
  modelTimeoutMs: number
  onThinkingEvent?: (event: { type: 'tool_call' | 'tool_result'; toolName: string; summary: string }) => void
}): Promise<{ replyText: string; latestAssistantStateText: string }> {
  const stream = await args.runtime.agent.stream(
    {
      messages: [
        { role: 'user', content: args.message }
      ]
    },
    {
      streamMode: ['updates', 'messages'],
      subgraphs: true,
      signal: AbortSignal.timeout(resolveModelTimeoutMs(args.modelTimeoutMs, 'agent'))
    }
  )
  return collectAgentReply(stream as AsyncIterable<unknown>, args.onThinkingEvent)
}

function getOrCreateRuntime(
  thinkingId: string,
  thinkingDir: string,
  args: {
    provider: string
    apiKey: string
    model: string
    baseUrl: string
    maxTokens?: number
    systemPrompt: string
    currentStage: ThinkingStage
  }
): ThinkingRuntime {
  const cached = runtimeCache.get(thinkingId)
  if (cached) return cached

  const model = resolveModel(
    args.provider,
    args.apiKey,
    args.model,
    args.baseUrl,
    0.3,
    args.maxTokens
  )
  const workflowTools = createThinkingWorkflowTools({
    thinkingDir,
    currentStage: args.currentStage
  })

  const agent = createDeepAgent({
    model,
    backend: new FilesystemBackend({
      rootDir: thinkingDir,
      virtualMode: true
    }),
    permissions: [
      { operations: ['read'], paths: ['/**'] },
      { operations: ['write'], paths: ['/**'], mode: 'deny' }
    ],
    systemPrompt: args.systemPrompt,
    tools: workflowTools.tools as any
  })

  const runtime: ThinkingRuntime = { agent, workflowState: workflowTools.state }
  runtimeCache.set(thinkingId, runtime)
  return runtime
}

export interface RunThinkingChatArgs extends ThinkingContextArgs {
  thinkingId: string
  thinkingDir: string
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  maxTokens?: number
  modelTimeoutMs: number
  onThinkingEvent?: (event: { type: 'tool_call' | 'tool_result'; toolName: string; summary: string }) => void
}

export async function runThinkingChat(args: RunThinkingChatArgs): Promise<ThinkingChatResult> {
  const {
    thinkingId,
    thinkingDir,
    stage: currentStage,
    thinkingMd,
    contextMd,
    sourcesDir,
    userMessage,
    recentMessages,
    provider,
    apiKey,
    model,
    baseUrl,
    maxTokens,
    modelTimeoutMs,
    onThinkingEvent
  } = args

  const initialContext = await buildThinkingContext({
    stage: currentStage,
    thinkingMd,
    contextMd,
    sourcesDir,
    userMessage,
    recentMessages
  })
  const effectiveStage: ThinkingStage = shouldPromoteCollectToOutline({
    currentStage,
    recentMessages,
    userMessage,
    thinkingMd,
    sourceContent: initialContext.sourceContent
  })
    ? 'outline'
    : currentStage
  const { systemPrompt, userMessage: fullUserMessage } =
    effectiveStage === currentStage
      ? initialContext
      : await buildThinkingContext({
          stage: effectiveStage,
          thinkingMd,
          contextMd,
          sourcesDir,
          userMessage: [
            userMessage,
            '',
            'The collected information is sufficient. In this turn, create and persist an initial page-by-page outline with update_thinking_document instead of only saying you will build it.'
          ].join('\n'),
          recentMessages
        })

  // Invalidate cached runtime so system prompt is fresh
  runtimeCache.delete(thinkingId)

  const runtime = getOrCreateRuntime(thinkingId, thinkingDir, {
    provider,
    apiKey,
    model,
    baseUrl,
    maxTokens,
    systemPrompt,
    currentStage: effectiveStage
  })

  log.info('[thinking:agent] running chat', {
    thinkingId,
    stage: currentStage,
    effectiveStage,
    messageLength: fullUserMessage.length
  })

  let replyText = ''
  let latestAssistantStateText = ''

  try {
    const result = await runAgentMessage({
      runtime,
      message: fullUserMessage,
      modelTimeoutMs,
      onThinkingEvent
    })
    replyText = result.replyText
    latestAssistantStateText = result.latestAssistantStateText
  } catch (err) {
    log.error('[thinking:agent] stream error', {
      thinkingId,
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  }

  // Prefer latestAssistantStateText (complete final response from updates stream,
  // excludes pre-tool-call narration). Fall back to concatenated messages stream.
  if (latestAssistantStateText) {
    log.info('[thinking:agent] using assistant state text as reply', {
      thinkingId,
      stateLength: latestAssistantStateText.length,
      streamLength: replyText.length
    })
    replyText = latestAssistantStateText
  }

  if (!replyText) {
    throw new Error('AI did not return a response')
  }

  // Workflow tools may have persisted files — read them back before validation.
  const fs = await import('fs')
  const path = await import('path')
  const thinkingMdPath = path.join(thinkingDir, 'thinking.md')
  const contextMdPath = path.join(thinkingDir, 'context.md')
  let updatedThinkingMd = thinkingMd
  let updatedContextMd = contextMd
  try {
    if (fs.existsSync(thinkingMdPath)) {
      updatedThinkingMd = await fs.promises.readFile(thinkingMdPath, 'utf-8')
    }
    if (fs.existsSync(contextMdPath)) {
      updatedContextMd = await fs.promises.readFile(contextMdPath, 'utf-8')
    }
  } catch {
    // If read fails, keep the original
  }

  if (!runtime.workflowState.contextUpdated && updatedContextMd === contextMd) {
    log.warn('[thinking:agent] context.md was not updated by workflow tool; retrying forced context update', {
      thinkingId,
      stage: effectiveStage
    })
    const forcedMessage = [
      'Internal repair task. Your previous response did not call update_context_document.',
      'You must now call update_context_document to persist the confirmed user intent, decisions, and open questions into /context.md.',
      'Do not use write_file or edit_file.',
      'Do not ask the user a new question in this repair task.',
      '',
      fullUserMessage
    ].join('\n')
    try {
      await runAgentMessage({
        runtime,
        message: forcedMessage,
        modelTimeoutMs
      })
      if (fs.existsSync(contextMdPath)) {
        updatedContextMd = await fs.promises.readFile(contextMdPath, 'utf-8')
      }
    } catch (err) {
      log.warn('[thinking:agent] forced context write retry failed; fallback merge will run', {
        thinkingId,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  if (
    effectiveStage !== 'collect' &&
    !runtime.workflowState.thinkingUpdated &&
    updatedThinkingMd === thinkingMd
  ) {
    log.warn('[thinking:agent] thinking.md was not updated by workflow tool outside collect; retrying forced thinking update', {
      thinkingId,
      stage: effectiveStage
    })
    const forcedMessage = [
      'Internal repair task. The current stage requires /thinking.md to be updated.',
      'You must now call update_thinking_document to persist the outline or page content into /thinking.md.',
      'Do not use write_file or edit_file.',
      'Do not ask the user a new question in this repair task.',
      '',
      fullUserMessage
    ].join('\n')
    try {
      await runAgentMessage({
        runtime,
        message: forcedMessage,
        modelTimeoutMs
      })
      if (fs.existsSync(thinkingMdPath)) {
        updatedThinkingMd = await fs.promises.readFile(thinkingMdPath, 'utf-8')
      }
    } catch (err) {
      log.warn('[thinking:agent] forced thinking write retry failed; fallback merge will run', {
        thinkingId,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  if (!runtime.workflowState.contextUpdated) {
    const mergedContextMd = mergeConversationFactsIntoContextMd({
      contextMd: updatedContextMd,
      currentStage: effectiveStage,
      recentMessages,
      userMessage
    })
    if (mergedContextMd !== updatedContextMd) {
      await writeContextMd(thinkingDir, mergedContextMd)
      updatedContextMd = mergedContextMd
    }
  }

  if (
    !runtime.workflowState.thinkingUpdated &&
    (effectiveStage !== 'collect' || hasMeaningfulThinkingContent(updatedThinkingMd))
  ) {
    const mergedThinkingMd = mergeConversationFactsIntoThinkingMd({
      thinkingMd: updatedThinkingMd,
      recentMessages,
      userMessage
    })
    if (mergedThinkingMd !== updatedThinkingMd) {
      await writeThinkingMd(thinkingDir, mergedThinkingMd)
      updatedThinkingMd = mergedThinkingMd
    }
  }

  if (effectiveStage === 'outline' && countThinkingPages(updatedThinkingMd) < 2) {
    log.warn('[thinking:agent] outline still missing after workflow run; writing fallback outline', {
      thinkingId,
      stage: effectiveStage
    })
    updatedThinkingMd = buildFallbackOutlineThinkingMd({
      thinkingMd: updatedThinkingMd,
      recentMessages,
      userMessage,
      sourceContent: initialContext.sourceContent
    })
    await writeThinkingMd(thinkingDir, updatedThinkingMd)
  }

  // Check for stage transitions based on the updated thinking document.
  // When collect has enough information, effectiveStage is the minimum stage for this turn.
  let newStage = checkStageTransition(effectiveStage, updatedThinkingMd)
  const fallbackStage = detectStageFallback(userMessage)
  if (fallbackStage) {
    newStage = fallbackStage
  }

  // Update context.md with new stage
  updatedContextMd = updateContextStage(updatedContextMd, newStage)
  await writeContextMd(thinkingDir, updatedContextMd)

  log.info('[thinking:agent] chat complete', {
    thinkingId,
    replyLength: replyText.length,
    thinkingMdChanged: updatedThinkingMd !== thinkingMd,
    contextToolCalls: runtime.workflowState.contextUpdateCount,
    thinkingToolCalls: runtime.workflowState.thinkingUpdateCount,
    stageTransition: currentStage !== newStage ? `${currentStage} → ${newStage}` : 'none'
  })

  return {
    reply: replyText,
    thinkingMd: updatedThinkingMd,
    contextMd: updatedContextMd,
    stage: newStage
  }
}

function updateContextStage(contextMd: string, newStage: ThinkingStage): string {
  if (/^## Stage:\s*\S+/m.test(contextMd)) {
    return contextMd.replace(
      /^## Stage:\s*\S+/m,
      `## Stage: ${newStage}`
    )
  }
  return upsertSection(contextMd, 'Stage', newStage)
}

export function invalidateRuntime(thinkingId: string): void {
  runtimeCache.delete(thinkingId)
}
