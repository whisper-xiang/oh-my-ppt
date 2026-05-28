import { ipcMain } from 'electron'
import log from 'electron-log/main.js'
import type { IpcContext } from '../context'
import {
  listOutlineRules,
  getOutlineRule,
  createOutlineRule,
  updateOutlineRule,
  deleteOutlineRule
} from '../../utils/outline-rules'

type OutlineRuleSavePayload = {
  id?: string
  name?: string
  description?: string
  rulePrompt?: string
}

const parseSavePayload = (payload: unknown): {
  id?: string
  name: string
  description: string
  rulePrompt: string
} => {
  const record = (payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {}) as OutlineRuleSavePayload
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : undefined,
    name: String(record.name || '').trim(),
    description: String(record.description || '').trim(),
    rulePrompt: String(record.rulePrompt || '').trim()
  }
}

export function registerOutlineRulesHandlers(ctx: IpcContext): void {
  ipcMain.handle('outlineRules:list', async () => {
    const items = await listOutlineRules(ctx)
    return { items }
  })

  ipcMain.handle('outlineRules:getDetail', async (_event, ruleId: string) => {
    const id = String(ruleId || '').trim()
    if (!id) return null
    return await getOutlineRule(ctx, id)
  })

  ipcMain.handle('outlineRules:create', async (_event, payload) => {
    log.info('[outlineRules:create] requested')
    const parsed = parseSavePayload(payload)
    const created = await createOutlineRule(ctx, {
      name: parsed.name,
      description: parsed.description,
      rulePrompt: parsed.rulePrompt
    })
    return { success: true, item: created }
  })

  ipcMain.handle('outlineRules:update', async (_event, payload) => {
    const parsed = parseSavePayload(payload)
    if (!parsed.id) throw new Error('更新大纲规则失败：id 必填。')
    log.info('[outlineRules:update] requested', { ruleId: parsed.id })
    const updated = await updateOutlineRule(ctx, parsed.id, {
      name: parsed.name,
      description: parsed.description,
      rulePrompt: parsed.rulePrompt
    })
    return { success: true, item: updated }
  })

  ipcMain.handle('outlineRules:delete', async (_event, ruleId: string) => {
    const id = String(ruleId || '').trim()
    if (!id) return { success: false, deleted: false, message: 'id 为空' }
    log.info('[outlineRules:delete] requested', { ruleId: id })
    const result = await deleteOutlineRule(ctx, id)
    return { success: result.deleted, deleted: result.deleted, message: result.message }
  })
}
