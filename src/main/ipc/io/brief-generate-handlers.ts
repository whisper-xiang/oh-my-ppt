import { ipcMain } from 'electron'
import log from 'electron-log/main.js'
import { resolveModel } from '../../agent'
import { extractModelText } from '../utils'
import { resolveActiveModelConfig } from '../config/model-config-utils'
import { loadOutlineRulePrompt } from '../../utils/outline-rules'
import {
  buildBriefGenerationSystemPrompt,
  buildBriefGenerationUserPrompt
} from '../../prompt/brief-generation'
import type { IpcContext } from '../context'

const MODEL_TIMEOUT_MS = 3 * 60_000

export interface GenerateBriefPayload {
  topic: string
  pageCount: number
  styleId: string
  styleLabel?: string
  outlineRuleId?: string | null
  documentContext?: string | null
}

export interface GenerateBriefResult {
  briefText: string
}

export function registerBriefGenerateHandlers(context: IpcContext): void {
  ipcMain.handle('brief:generate', async (_event, payload: unknown): Promise<GenerateBriefResult> => {
    const p = (payload ?? {}) as Record<string, unknown>

    const topic = typeof p.topic === 'string' ? p.topic.trim() : ''
    const pageCount =
      typeof p.pageCount === 'number' && Number.isFinite(p.pageCount)
        ? Math.max(1, Math.min(40, Math.round(p.pageCount)))
        : 5
    const styleLabel =
      typeof p.styleLabel === 'string' && p.styleLabel.trim()
        ? p.styleLabel.trim()
        : typeof p.styleId === 'string' && p.styleId.trim()
          ? p.styleId.trim()
          : 'default'
    const outlineRuleId =
      typeof p.outlineRuleId === 'string' && p.outlineRuleId.trim() ? p.outlineRuleId.trim() : null
    const documentContext =
      typeof p.documentContext === 'string' && p.documentContext.trim()
        ? p.documentContext.trim()
        : undefined

    if (!topic) throw new Error('brief:generate 缺少 topic')

    const activeModel = await resolveActiveModelConfig(context)
    const { provider, apiKey, model, baseUrl, maxTokens } = activeModel

    const outlineRulePrompt = outlineRuleId
      ? await loadOutlineRulePrompt(context, outlineRuleId)
      : undefined

    log.info('[brief:generate] start', {
      topic: topic.slice(0, 60),
      pageCount,
      styleLabel,
      hasOutlineRule: Boolean(outlineRulePrompt),
      hasDocumentContext: Boolean(documentContext)
    })

    const client = resolveModel(provider, apiKey, model, baseUrl, 0.35, maxTokens)
    const systemPrompt = buildBriefGenerationSystemPrompt()
    const userPrompt = buildBriefGenerationUserPrompt({
      topic,
      pageCount,
      styleLabel,
      outlineRulePrompt: outlineRulePrompt || undefined,
      documentContext
    })

    const response = await client.invoke(
      [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
      ],
      { signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) }
    )

    const rawText = extractModelText(response).trim()
    if (!rawText) throw new Error('brief:generate LLM 返回了空文本')

    log.info('[brief:generate] done', { length: rawText.length })
    return { briefText: rawText }
  })
}
