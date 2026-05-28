import log from 'electron-log/main.js'
import { resolveModel } from '../../agent'
import { extractModelText } from '../utils'
import { normalizeLayoutIntent, type LayoutIntent } from '@shared/layout-intent'
import {
  buildOutlineRevisionSystemPrompt,
  buildOutlineRevisionUserPrompt,
  type CurrentOutlineItem
} from '../../prompt/outline-revision'

const MODEL_TIMEOUT_MS = 5 * 60_000

export interface RevisedOutlineItem {
  pageNumber: number
  title: string
  contentOutline: string
  layoutIntent?: LayoutIntent
}

const parseJsonLoose = (text: string): unknown => {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('LLM returned empty text')
  // strip optional ```json fences
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    return JSON.parse(stripped)
  } catch {
    // attempt: take the first `[` ... last `]`
    const firstBracket = stripped.indexOf('[')
    const lastBracket = stripped.lastIndexOf(']')
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      const slice = stripped.slice(firstBracket, lastBracket + 1)
      return JSON.parse(slice)
    }
    throw new Error('LLM revise_outline 返回的内容不是合法 JSON。')
  }
}

const normalizeKeyPointsToOutline = (value: unknown): string => {
  if (!Array.isArray(value)) {
    return typeof value === 'string' ? value.trim() : ''
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
    .join('；')
}

export async function reviseOutlineWithLLM(args: {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  temperature?: number
  maxTokens?: number
  topic: string
  currentOutline: CurrentOutlineItem[]
  userInstruction: string
  outlineRulePrompt?: string
  signal?: AbortSignal
}): Promise<RevisedOutlineItem[]> {
  const client = resolveModel(
    args.provider,
    args.apiKey,
    args.model,
    args.baseUrl,
    args.temperature ?? 0.4,
    args.maxTokens
  )
  const systemPrompt = buildOutlineRevisionSystemPrompt()
  const userPrompt = buildOutlineRevisionUserPrompt({
    topic: args.topic,
    currentOutline: args.currentOutline,
    userInstruction: args.userInstruction,
    outlineRulePrompt: args.outlineRulePrompt
  })

  log.info('[llm] invoke revise_outline', {
    provider: args.provider,
    model: args.model,
    pageCount: args.currentOutline.length,
    instructionPreview: args.userInstruction.slice(0, 100)
  })

  const timeoutSignal = AbortSignal.timeout(MODEL_TIMEOUT_MS)
  const combinedSignal = args.signal
    ? AbortSignal.any([args.signal, timeoutSignal])
    : timeoutSignal

  const response = await client.invoke(
    [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ],
    { signal: combinedSignal }
  )
  const text = extractModelText(response)
  const parsed = parseJsonLoose(text)
  if (!Array.isArray(parsed)) {
    throw new Error('LLM revise_outline 返回的不是数组。')
  }
  if (parsed.length === 0) {
    throw new Error('LLM revise_outline 返回了空大纲。')
  }
  const items: RevisedOutlineItem[] = parsed.map((raw, index) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const title = String(obj.title ?? '').trim()
    if (!title) {
      throw new Error(`LLM revise_outline 第 ${index + 1} 项缺少 title`)
    }
    return {
      pageNumber: index + 1,
      title,
      contentOutline: normalizeKeyPointsToOutline(obj.keyPoints),
      layoutIntent: normalizeLayoutIntent(obj.layoutIntent)
    }
  })
  return items
}
