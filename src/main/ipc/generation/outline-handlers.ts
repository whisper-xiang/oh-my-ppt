import { ipcMain } from 'electron'
import log from 'electron-log/main.js'
import type { IpcContext } from '../context'
import { reviseOutlineWithLLM } from '../engine/outline-revise'
import { resolveActiveModelConfig } from '../config/model-config-utils'
import { parseJsonObject } from '../utils'
import { loadOutlineRulePrompt } from '../../utils/outline-rules'
import type { CurrentOutlineItem } from '../../prompt/outline-revision'

type OutlineRow = {
  pageNumber: number
  pageId: string
  title: string
  contentOutline: string
  layoutIntent?: string | null
  htmlPath?: string | null
}

const loadCurrentOutline = async (
  ctx: IpcContext,
  sessionId: string
): Promise<OutlineRow[]> => {
  const rows = await ctx.db.listLatestGenerationPageSnapshot(sessionId)
  return rows.map((row) => ({
    pageNumber: row.page_number,
    pageId: row.page_id,
    title: row.title || '',
    contentOutline: row.content_outline || '',
    layoutIntent: row.layout_intent,
    htmlPath: row.html_path
  }))
}

/** Tracks in-flight revise AbortControllers by sessionId (at most one at a time per session). */
const activeReviseControllers = new Map<string, AbortController>()

export function registerOutlineHandlers(ctx: IpcContext): void {
  ipcMain.handle('outline:get', async (_event, payload) => {
    const sessionId =
      payload && typeof payload === 'object' && typeof (payload as { sessionId?: unknown }).sessionId === 'string'
        ? String((payload as { sessionId?: string }).sessionId).trim()
        : ''
    if (!sessionId) throw new Error('sessionId 不能为空')
    const items = await loadCurrentOutline(ctx, sessionId)
    return { items }
  })

  ipcMain.handle('outline:revise:cancel', (_event, payload) => {
    const sessionId =
      typeof payload === 'string'
        ? payload.trim()
        : typeof (payload as Record<string, unknown>)?.sessionId === 'string'
          ? String((payload as Record<string, unknown>).sessionId).trim()
          : ''
    if (sessionId) {
      const controller = activeReviseControllers.get(sessionId)
      if (controller && !controller.signal.aborted) {
        controller.abort()
        log.info('[outline:revise:cancel]', { sessionId })
      }
    }
    return { success: true }
  })

  ipcMain.handle('outline:revise', async (_event, payload) => {
    const record = (payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {}) as Record<string, unknown>
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
    const userInstruction = typeof record.message === 'string' ? record.message.trim() : ''
    if (!sessionId) throw new Error('sessionId 不能为空')
    if (!userInstruction) throw new Error('修改指令不能为空')

    // Cancel any previous in-flight revision for the same session
    activeReviseControllers.get(sessionId)?.abort()
    const controller = new AbortController()
    activeReviseControllers.set(sessionId, controller)

    const currentOutline = await loadCurrentOutline(ctx, sessionId)
    if (currentOutline.length === 0) {
      throw new Error('当前会话还没有大纲，请先生成大纲。')
    }
    const session = await ctx.db.getSession(sessionId)
    if (!session) throw new Error(`未找到会话 ${sessionId}`)
    const sessionRecord = session as unknown as Record<string, unknown>
    const sessionMeta = parseJsonObject(sessionRecord.metadata ?? sessionRecord.metadata_json)
    const topic =
      (typeof sessionRecord.topic === 'string' && sessionRecord.topic.trim()) ||
      (typeof sessionRecord.title === 'string' && sessionRecord.title.trim()) ||
      '未命名主题'

    // Outline rule remains binding when revising too.
    const outlineRuleId =
      typeof sessionMeta.outlineRuleId === 'string' ? sessionMeta.outlineRuleId : ''
    const outlineRulePrompt = outlineRuleId ? await loadOutlineRulePrompt(ctx, outlineRuleId) : ''

    const activeModel = await resolveActiveModelConfig(ctx)

    log.info('[outline:revise] start', {
      sessionId,
      pageCount: currentOutline.length,
      instructionPreview: userInstruction.slice(0, 80)
    })

    let revised
    try {
      revised = await reviseOutlineWithLLM({
        provider: activeModel.provider,
        apiKey: activeModel.apiKey,
        model: activeModel.model,
        baseUrl: activeModel.baseUrl,
        maxTokens: activeModel.maxTokens,
        topic,
        currentOutline: currentOutline.map<CurrentOutlineItem>((item) => ({
          pageNumber: item.pageNumber,
          title: item.title,
          contentOutline: item.contentOutline,
          layoutIntent: item.layoutIntent ?? null
        })),
        userInstruction,
        outlineRulePrompt: outlineRulePrompt || undefined,
        signal: controller.signal
      })
    } finally {
      if (activeReviseControllers.get(sessionId) === controller) {
        activeReviseControllers.delete(sessionId)
      }
    }

    // Persist the revised outline by overwriting generation_pages of the latest run.
    const latestRun = await ctx.db.getLatestGenerationRun(sessionId)
    if (!latestRun) {
      throw new Error('未找到最新的 generation_run，无法保存修订结果。')
    }

    // Map each revised slide to a stable pageId / htmlPath. Reuse existing entries
    // by index when possible; allocate new pageIds for newly-added slides.
    const projectDir =
      typeof sessionMeta.projectDir === 'string' ? sessionMeta.projectDir : ''
    const reusableExisting = [...currentOutline]
    const used = new Set<string>()
    const mapped: Array<{
      pageId: string
      pageNumber: number
      title: string
      contentOutline: string
      layoutIntent?: string
      htmlPath: string
    }> = []
    for (let index = 0; index < revised.length; index += 1) {
      const slide = revised[index]
      const existing = reusableExisting[index]
      let pageId = ''
      let htmlPath = ''
      if (existing && !used.has(existing.pageId)) {
        pageId = existing.pageId
        htmlPath = existing.htmlPath || ''
        used.add(existing.pageId)
      } else {
        // brand-new slide — synthesize page id + html path
        pageId = `page-${Math.random().toString(36).slice(2, 12)}`
        htmlPath = projectDir ? `${projectDir}/${pageId}.html` : pageId + '.html'
      }
      mapped.push({
        pageId,
        pageNumber: index + 1,
        title: slide.title,
        contentOutline: slide.contentOutline,
        layoutIntent: slide.layoutIntent,
        htmlPath
      })
    }

    // Mark pages from old outline that are no longer used as deleted.
    const allPagesForRun = await ctx.db.listGenerationPages(latestRun.id)
    const mappedPageIds = new Set(mapped.map((m) => m.pageId))
    for (const oldRow of allPagesForRun) {
      if (!mappedPageIds.has(oldRow.page_id)) {
        // Drop by setting status to 'failed' with a soft reason — we don't have
        // a dedicated 'removed' status. The next generation run will rebuild.
        await ctx.db.upsertGenerationPage({
          runId: latestRun.id,
          sessionId,
          pageId: oldRow.page_id,
          pageNumber: oldRow.page_number,
          title: oldRow.title,
          contentOutline: oldRow.content_outline || '',
          layoutIntent: oldRow.layout_intent as never,
          htmlPath: oldRow.html_path || '',
          status: 'failed',
          error: '已在大纲修订中删除'
        })
      }
    }

    // Upsert the new outline rows.
    for (const slide of mapped) {
      await ctx.db.upsertGenerationPage({
        runId: latestRun.id,
        sessionId,
        pageId: slide.pageId,
        pageNumber: slide.pageNumber,
        title: slide.title,
        contentOutline: slide.contentOutline,
        layoutIntent: slide.layoutIntent as never,
        htmlPath: slide.htmlPath,
        status: 'pending'
      })
    }

    log.info('[outline:revise] done', {
      sessionId,
      newPageCount: mapped.length
    })

    return {
      success: true,
      items: mapped.map((m) => ({
        pageNumber: m.pageNumber,
        pageId: m.pageId,
        title: m.title,
        contentOutline: m.contentOutline,
        layoutIntent: m.layoutIntent ?? null,
        htmlPath: m.htmlPath
      }))
    }
  })
}
