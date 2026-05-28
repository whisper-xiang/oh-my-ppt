import type { OutlineRuleRow } from '../db/database'
import type { IpcContext } from '../ipc/context'

export interface OutlineRuleSummary {
  id: string
  ruleKey: string
  name: string
  description: string
  rulePrompt: string
  source: 'builtin' | 'custom'
  createdAt: number
  updatedAt: number
}

const MAX_RULE_PROMPT_CHARS = 4000

const toSummary = (row: OutlineRuleRow): OutlineRuleSummary => ({
  id: row.id,
  ruleKey: row.ruleKey,
  name: row.name,
  description: row.description,
  rulePrompt: row.rulePrompt,
  source: row.source,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

export async function listOutlineRules(ctx: Pick<IpcContext, 'db'>): Promise<OutlineRuleSummary[]> {
  const rows = await ctx.db.listOutlineRuleRows()
  rows.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
  return rows.map(toSummary)
}

export async function getOutlineRule(
  ctx: Pick<IpcContext, 'db'>,
  ruleId: string
): Promise<OutlineRuleSummary | null> {
  const id = (ruleId || '').trim()
  if (!id) return null
  const row = await ctx.db.getOutlineRuleRow(id)
  return row ? toSummary(row) : null
}

export async function loadOutlineRulePrompt(
  ctx: Pick<IpcContext, 'db'>,
  ruleId: string | null | undefined
): Promise<string> {
  const id = (ruleId || '').trim()
  if (!id) return ''
  const row = await ctx.db.getOutlineRuleRow(id)
  if (!row) return ''
  return (row.rulePrompt || '').trim()
}

export interface OutlineRuleSavePayload {
  name: string
  description?: string
  rulePrompt: string
}

const validatePayload = (payload: OutlineRuleSavePayload): OutlineRuleSavePayload => {
  const name = (payload.name || '').trim()
  if (!name) throw new Error('保存大纲规则失败：name 不能为空。')
  const rulePrompt = (payload.rulePrompt || '').trim()
  if (!rulePrompt) throw new Error('保存大纲规则失败：rulePrompt 不能为空。')
  if (rulePrompt.length > MAX_RULE_PROMPT_CHARS) {
    throw new Error(
      `保存大纲规则失败：rulePrompt 超过最大长度 ${MAX_RULE_PROMPT_CHARS} 字符。`
    )
  }
  const description = (payload.description || '').trim()
  return { name, description, rulePrompt }
}

export async function createOutlineRule(
  ctx: Pick<IpcContext, 'db'>,
  payload: OutlineRuleSavePayload & { id?: string; ruleKey?: string }
): Promise<OutlineRuleSummary> {
  const validated = validatePayload(payload)
  const id = await ctx.db.createOutlineRuleRow({
    id: payload.id,
    ruleKey: payload.ruleKey,
    name: validated.name,
    description: validated.description,
    rulePrompt: validated.rulePrompt,
    source: 'custom'
  })
  const row = await ctx.db.getOutlineRuleRow(id)
  if (!row) throw new Error('保存大纲规则失败：创建后无法读取。')
  return toSummary(row)
}

export async function updateOutlineRule(
  ctx: Pick<IpcContext, 'db'>,
  ruleId: string,
  payload: OutlineRuleSavePayload
): Promise<OutlineRuleSummary> {
  const validated = validatePayload(payload)
  const existing = await ctx.db.getOutlineRuleRow(ruleId)
  if (!existing) throw new Error('保存大纲规则失败：规则不存在。')
  if (existing.source === 'builtin') {
    throw new Error('保存大纲规则失败：内置规则不可修改。')
  }
  await ctx.db.updateOutlineRuleRow(ruleId, {
    name: validated.name,
    description: validated.description,
    rulePrompt: validated.rulePrompt
  })
  const row = await ctx.db.getOutlineRuleRow(ruleId)
  if (!row) throw new Error('保存大纲规则失败：更新后无法读取。')
  return toSummary(row)
}

export async function deleteOutlineRule(
  ctx: Pick<IpcContext, 'db'>,
  ruleId: string
): Promise<{ deleted: boolean; message?: string }> {
  const existing = await ctx.db.getOutlineRuleRow(ruleId)
  if (!existing) return { deleted: false, message: '规则不存在' }
  if (existing.source === 'builtin') {
    return { deleted: false, message: '内置规则不可删除' }
  }
  const ok = await ctx.db.deleteOutlineRuleRow(ruleId)
  return { deleted: ok }
}
