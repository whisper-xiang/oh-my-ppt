import { LRUCache } from 'lru-cache'
import log from 'electron-log/main.js'
import { createMiddleware } from 'langchain'
import { resolveModel } from '../agent'
import { FilesystemBackend, createDeepAgent } from 'deepagents'
import { extractModelText } from '../ipc/utils'
import { resolveModelTimeoutMs } from '@shared/model-timeout'
import { logAgentToolEvents } from '../utils/agent-tool-logger'
import { buildThinkingContext, type ThinkingContextArgs } from './context-builder'
import {
  checkStageTransition,
  detectStageFallback,
  isRestartRequest,
  resolveRequestedStage
} from './stage-manager'
import { buildInitialContextMd, buildInitialThinkingMd, writeContextMd, writeThinkingMd } from './workspace'
import {
  createThinkingWorkflowTools,
  type ThinkingWorkflowState
} from './thinking-tools'
import type { ThinkingChatMessage, ThinkingStage, ThinkingChatResult } from '@shared/thinking'

interface ThinkingRuntime {
  agent: ReturnType<typeof createDeepAgent>
  workflowState: ThinkingWorkflowState
}

const THINKING_WORKFLOW_TOOL_NAMES = new Set([
  'update_context_document',
  'update_thinking_document'
])

const SOURCE_READ_TOOL_NAMES = new Set(['read_file', 'grep'])

function createThinkingToolFilterMiddleware(hasSources: boolean) {
  return createMiddleware({
    name: 'thinkingToolFilter',
    wrapModelCall: async (request, handler) => {
      const tools = request.tools?.filter((tool) => {
        const name = String(tool.name || '')
        if (THINKING_WORKFLOW_TOOL_NAMES.has(name)) return true
        return hasSources && SOURCE_READ_TOOL_NAMES.has(name)
      })
      return handler({ ...request, tools })
    }
  })
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
  return `# Thinking Brief\n\n${nextSection}${markdown.trim()}`
}

function shouldPromoteCollectToOutline(args: {
  currentStage: ThinkingStage
  userMessage: string
  thinkingMd: string
  sourceContent: string
}): boolean {
  if (args.currentStage !== 'collect') return false
  if (countThinkingPages(args.thinkingMd) >= 2) return false

  const explicitOutlineRequest =
    /生成|大纲|拆页|规划|outline|pages?|slides?/i.test(args.userMessage)
  const hasUsefulSource = args.sourceContent.trim().length > 0
  const explicitSourceRequest =
    hasUsefulSource &&
    /根据.*(?:文档|资料|文件|素材|图片).*生成|按.*(?:文档|资料|文件|素材|图片).*生成|based on.*(?:document|file|source|material)/i.test(
      args.userMessage
    )

  return explicitOutlineRequest || explicitSourceRequest
}

function countThinkingPages(thinkingMd: string): number {
  const matches = thinkingMd.match(/^##\s*Page\s+\d+\s*:/gm)
  return matches ? matches.length : 0
}

function requiresThinkingUpdate(args: {
  currentStage: ThinkingStage
  effectiveStage: ThinkingStage
  userMessage: string
}): boolean {
  if (args.effectiveStage !== args.currentStage && args.effectiveStage !== 'collect') {
    return true
  }
  return /生成|大纲|拆页|规划|展开|细化|详细|继续写|修改|调整|删掉|删除|增加|outline|expand|detail|refine/i.test(
    args.userMessage
  )
}

function mergeLatestDirectionIntoContextMd(args: {
  contextMd: string
  currentStage: ThinkingStage
  userMessage: string
}): string {
  let next = args.contextMd.trim() || `# Rolling Context\n\n## Stage: ${args.currentStage}\n`
  if (!/^##\s*Stage:/m.test(next)) {
    next = upsertSection(next, 'Stage', args.currentStage)
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
          if (!summary) continue
          onThinkingEvent({ type: 'tool_call', toolName: name, summary })
        }
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
    if (path) return `正在阅读资料：${path.replace(/^\/sources\//, '')}`
    return '正在阅读资料'
  }
  if (toolName === 'grep') {
    const args = typeof rawArgs === 'string' ? safeParseJson(rawArgs) : rawArgs
    const pattern = getNestedField(args, 'pattern') as string | undefined
    if (pattern) return `正在定位相关内容：${String(pattern).slice(0, 24)}`
    return '正在定位相关内容'
  }
  if (toolName === 'update_thinking_document') {
    const args = typeof rawArgs === 'string' ? safeParseJson(rawArgs) : rawArgs
    const pages = getNestedField(args, 'pages') as Array<Record<string, unknown>> | undefined
    const topic = getNestedField(args, 'topic') as string | undefined
    if (pages && Array.isArray(pages) && pages.length > 0) {
      const titles = pages.map((p) => getNestedField(p, 'title') as string || '').filter(Boolean)
      if (titles.length > 0) return `正在整理 ${pages.length} 页方案：${titles.slice(0, 2).join('、')}${titles.length > 2 ? '…' : ''}`
      return `正在整理 ${pages.length} 页方案`
    }
    if (topic) return `正在确认主题：${String(topic).slice(0, 24)}`
    return '正在更新方案'
  }
  if (toolName === 'update_context_document') {
    return '正在整理需求和关键信息'
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
    hasSources: boolean
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
    tools: workflowTools.tools as any,
    middleware: [createThinkingToolFilterMiddleware(args.hasSources)]
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

  const restartRequested = isRestartRequest(userMessage)
  const inputStage: ThinkingStage = restartRequested ? 'collect' : currentStage
  const inputThinkingMd = restartRequested ? buildInitialThinkingMd() : thinkingMd
  const inputContextMd = restartRequested ? buildInitialContextMd('collect') : contextMd

  if (restartRequested) {
    await writeThinkingMd(thinkingDir, inputThinkingMd)
    await writeContextMd(thinkingDir, inputContextMd)
    runtimeCache.delete(thinkingId)
  }

  const initialContext = await buildThinkingContext({
    stage: inputStage,
    thinkingMd: inputThinkingMd,
    contextMd: inputContextMd,
    sourcesDir,
    userMessage,
    recentMessages
  })
  const effectiveStage: ThinkingStage = shouldPromoteCollectToOutline({
    currentStage: inputStage,
    userMessage,
    thinkingMd: inputThinkingMd,
    sourceContent: initialContext.sourceContent
  })
    ? 'outline'
    : inputStage
  const { systemPrompt, userMessage: fullUserMessage } =
    effectiveStage === inputStage
      ? initialContext
      : await buildThinkingContext({
          stage: effectiveStage,
          thinkingMd: inputThinkingMd,
          contextMd: inputContextMd,
          sourcesDir,
          userMessage: [
            userMessage,
            '',
            'The user explicitly requested a page plan or outline. In this turn, create and persist a complete page-by-page thinking brief with update_thinking_document. Every page must include title, role, objective, summary, and substantive keyPoints. Do not write placeholders.'
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
    currentStage: effectiveStage,
    hasSources: initialContext.sourceContent.trim().length > 0
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
  let updatedThinkingMd = inputThinkingMd
  let updatedContextMd = inputContextMd
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

  if (!runtime.workflowState.contextUpdated && updatedContextMd === inputContextMd) {
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
      log.warn('[thinking:agent] forced context write retry failed; latest-direction fallback will run', {
        thinkingId,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  if (
    requiresThinkingUpdate({ currentStage: inputStage, effectiveStage, userMessage }) &&
    effectiveStage !== 'collect' &&
    !runtime.workflowState.thinkingUpdated &&
    updatedThinkingMd === inputThinkingMd
  ) {
    log.warn('[thinking:agent] thinking.md was not updated for a planning turn; retrying forced thinking update', {
      thinkingId,
      stage: effectiveStage
    })
    const forcedMessage = [
      'Internal repair task. This turn requires /thinking.md to be updated.',
      'You must now call update_thinking_document to persist a complete thinking brief into /thinking.md.',
      'If you pass pages, include the full page list. Every page must include title, role, objective, summary, and substantive keyPoints.',
      'Do not write placeholders.',
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
      log.warn('[thinking:agent] forced thinking write retry failed; leaving thinking.md unchanged', {
        thinkingId,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  if (!runtime.workflowState.contextUpdated) {
    const mergedContextMd = mergeLatestDirectionIntoContextMd({
      contextMd: updatedContextMd,
      currentStage: effectiveStage,
      userMessage
    })
    if (mergedContextMd !== updatedContextMd) {
      await writeContextMd(thinkingDir, mergedContextMd)
      updatedContextMd = mergedContextMd
    }
  }

  const autoStage = checkStageTransition(effectiveStage, updatedThinkingMd)
  const rawRequestedStage = detectStageFallback(userMessage)
  const resolvedRequestedStage = resolveRequestedStage({
    currentStage: effectiveStage,
    requestedStage: rawRequestedStage,
    thinkingMd: updatedThinkingMd
  })
  let newStage = resolvedRequestedStage || autoStage

  if (
    rawRequestedStage === 'collect' &&
    resolvedRequestedStage === 'collect' &&
    restartRequested &&
    effectiveStage === inputStage
  ) {
    updatedThinkingMd = buildInitialThinkingMd()
    updatedContextMd = buildInitialContextMd('collect')
    await writeThinkingMd(thinkingDir, updatedThinkingMd)
    await writeContextMd(thinkingDir, updatedContextMd)
    newStage = 'collect'
  }

  // Update context.md with new stage
  updatedContextMd = updateContextStage(updatedContextMd, newStage)
  await writeContextMd(thinkingDir, updatedContextMd)

  log.info('[thinking:agent] chat complete', {
    thinkingId,
    replyLength: replyText.length,
    thinkingMdChanged: updatedThinkingMd !== inputThinkingMd,
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
