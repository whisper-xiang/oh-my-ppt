import {
  MODEL_TIMEOUT_PROFILES,
  resolveModelTimeoutMs,
  type ModelTimeoutProfile
} from '@shared/model-timeout'
import type { IpcContext } from '../context'
import { readAppLocale, uiText } from '../config/locale-utils'
import log from 'electron-log/main.js'

// ---------------------------------------------------------------------------
// Built-in model (injected via electron-vite define from .env.local)
// ---------------------------------------------------------------------------

function resolveBuiltInModelConfig(): ActiveModelConfig | null {
  const provider = process.env.BUILT_IN_PROVIDER?.trim() || ''
  const model = process.env.BUILT_IN_MODEL?.trim() || ''
  const apiKey = process.env.BUILT_IN_API_KEY?.trim() || ''
  if (!provider || !model || !apiKey) return null
  return {
    id: '__built_in__',
    name: 'Built-in Model',
    provider,
    model,
    apiKey,
    baseUrl: process.env.BUILT_IN_BASE_URL?.trim() || '',
    maxTokens: Number(process.env.BUILT_IN_MAX_TOKENS) || 4096
  }
}

/** Whether the built-in model forcibly overrides user configuration */
export function isBuiltInModelForced(): boolean {
  return process.env.BUILT_IN_FORCE === 'true'
}

export interface ActiveModelConfig {
  id: string
  name: string
  provider: string
  model: string
  apiKey: string
  baseUrl: string
  maxTokens: number
}

export async function resolveGlobalModelTimeouts(
  ctx: Pick<IpcContext, 'db'>
): Promise<Record<ModelTimeoutProfile, number>> {
  const settings = await ctx.db.getAllSettings()
  return Object.fromEntries(
    MODEL_TIMEOUT_PROFILES.map((profile) => [
      profile,
      resolveModelTimeoutMs(settings[`timeout_ms_${profile}`], profile)
    ])
  ) as Record<ModelTimeoutProfile, number>
}

export async function resolveActiveModelConfig(
  ctx: Pick<IpcContext, 'db' | 'decryptApiKey'>
): Promise<ActiveModelConfig> {
  const locale = await readAppLocale(ctx)

  // When BUILT_IN_FORCE=true, skip DB config entirely
  if (isBuiltInModelForced()) {
    const builtIn = resolveBuiltInModelConfig()
    if (builtIn) {
      log.info('[model] using forced built-in model', { provider: builtIn.provider, model: builtIn.model })
      return builtIn
    }
  }

  const config = await ctx.db.getActiveModelConfig()
  if (!config) {
    // Fall back to built-in model if available
    const builtIn = resolveBuiltInModelConfig()
    if (builtIn) {
      log.info('[model] no active model in DB, using built-in model')
      return builtIn
    }
    throw new Error(
      uiText(
        locale,
        '请先前往系统设置添加并启用一个模型。',
        'Add and activate a model in Settings first.'
      )
    )
  }
  const provider = String(config.provider || '').trim()
  const model = String(config.model || '').trim()
  const apiKey = ctx.decryptApiKey(config.apiKey).trim()
  if (!provider) {
    throw new Error(
      uiText(
        locale,
        '当前启用模型缺少 provider，请到设置页检查。',
        'The active model is missing provider. Check Settings.'
      )
    )
  }
  if (!model) {
    throw new Error(
      uiText(
        locale,
        '当前启用模型缺少 model，请到设置页检查。',
        'The active model is missing model. Check Settings.'
      )
    )
  }
  if (!apiKey) {
    // Fall back to built-in model if available
    const builtIn = resolveBuiltInModelConfig()
    if (builtIn) {
      log.info('[model] active model has no apiKey, falling back to built-in model')
      return builtIn
    }
    throw new Error(
      uiText(
        locale,
        '当前启用模型缺少 api_key，请到设置页检查。',
        'The active model is missing api_key. Check Settings.'
      )
    )
  }

  return {
    id: config.id,
    name: config.name,
    provider,
    model,
    apiKey,
    baseUrl: String(config.baseUrl || '').trim(),
    maxTokens: config.maxTokens || 4096
  }
}
