import fs from 'fs'
import path from 'path'
import { progressText } from '@shared/progress'
import { normalizeLayoutIntent, type LayoutIntent } from '@shared/layout-intent'
import type { IpcContext } from '../context'
import { buildProjectIndexHtml, type DeckPageFile } from '../engine/template'
import { planDeckWithLLM, runDeepAgentDeckGeneration } from '../engine/generate'
import { isPlaceholderPageHtml, validatePersistedPageHtml } from '../../tools/html-utils'
import { finalizeGenerationSuccess } from './finalization'
import { uiText } from './generation-utils'
import type { DeckContext, EmitAssistantFn } from './types'
import { resolveDeckContext } from './deck-flow'
import { parseJsonObject } from '../utils'
import { resolveTemplateDesignContract } from '../templates/template-design-contract'
import { getTemplate } from '../templates/template-service'

type TemplateSeedPage = {
  id: string
  pageNumber: number
  pageId: string
  title: string
  htmlPath: string
  status: string
}

type TemplateDeckContext = DeckContext & {
  templateSeedPages: TemplateSeedPage[]
  templateRetry: boolean
}

function isTemplateSession(sessionRecord: Record<string, unknown>): boolean {
  const metadata = parseJsonObject(sessionRecord.metadata ?? sessionRecord.metadata_json)
  return metadata.source === 'template' && typeof metadata.templateId === 'string'
}

export function shouldUseTemplateDeckFlow(sessionRecord: Record<string, unknown>): boolean {
  return isTemplateSession(sessionRecord)
}

export async function resolveTemplateDeckContext(
  ctx: IpcContext,
  event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<TemplateDeckContext> {
  const context = await resolveDeckContext(ctx, event, payload)
  if (!isTemplateSession(context.sessionRecord)) {
    throw new Error('当前会话不是模板会话，不能使用模板生成链路')
  }
  const payloadRecord = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const templateRetry = payloadRecord.retry === true

  const sessionPages = await ctx.db.listSessionPages(context.sessionId)
  const allSeedPages = sessionPages
    .filter((page) => page.html_path && page.file_slug)
    .sort((a, b) => a.page_number - b.page_number)
    .map((page) => ({
      id: page.id,
      pageNumber: page.page_number,
      pageId: page.file_slug,
      title: page.title || `第 ${page.page_number} 页`,
      htmlPath: page.html_path,
      status: page.status
    }))
  if (allSeedPages.length === 0) {
    throw new Error('模板会话缺少已清洗的页面基底')
  }
  const seedPages = templateRetry
    ? allSeedPages.filter((page) => page.status !== 'completed')
    : allSeedPages
  if (templateRetry && seedPages.length === 0) {
    throw new Error('当前模板会话没有未完成页面。')
  }

  return {
    ...context,
    totalPages: seedPages.length,
    templateSeedPages: seedPages,
    templateRetry
  }
}

export async function executeTemplateDeckGeneration(
  ctx: IpcContext,
  emitAssistant: EmitAssistantFn,
  context: TemplateDeckContext
): Promise<void> {
  const {
    db,
    agentManager,
    getPageSourceUrl,
    validateProjectIndexHtml,
    createDeckProgressEmitter,
    PLANNER_TEMPERATURE,
    PAGE_GENERATION_TEMPERATURE
  } = ctx

  if (!context.apiKey) {
    throw new Error(`当前 provider "${context.provider}" 缺少 API Key，请先到设置页配置。`)
  }
  if (context.templateSeedPages.length === 0) {
    throw new Error('模板生成链路缺少模板页面基底')
  }

  const emitDeckChunk = createDeckProgressEmitter(context.sessionId, context.appLocale)
  const templateMetadata = parseJsonObject(context.sessionRecord.metadata ?? context.sessionRecord.metadata_json)
  const templateDesignContract = resolveTemplateDesignContract(
    context.sessionRecord.designContract,
    templateMetadata
  )
  await db.updateSessionDesignContract(context.sessionId, templateDesignContract)

  // Load manifest to get page roles (cover / toc / content / back-cover)
  const templateId = typeof templateMetadata.templateId === 'string' ? templateMetadata.templateId : ''
  let hasTocPage = false
  let hasBackCoverPage = false
  try {
    if (templateId) {
      const { manifest } = await getTemplate(templateId)
      hasTocPage = manifest.pages.some((p) => p.role === 'toc')
      hasBackCoverPage = manifest.pages.some((p) => p.role === 'back-cover')
    }
  } catch {
    // non-fatal — fall back to no TOC awareness
  }

  const allSessionPages = await db.listSessionPages(context.sessionId)
  const allPageRefs = allSessionPages
    .filter((page) => page.html_path && page.file_slug)
    .sort((a, b) => a.page_number - b.page_number)
    .map((page) => ({
      id: page.id,
      pageNumber: page.page_number,
      title: page.title || `第 ${page.page_number} 页`,
      pageId: page.file_slug,
      htmlPath: page.html_path
    }))
  const pageRefs = context.templateSeedPages.map((page) => ({
    id: page.id,
    pageNumber: page.pageNumber,
    title: page.title,
    pageId: page.pageId,
    htmlPath: page.htmlPath
  }))
  const fullDeckPageCount = Math.max(allPageRefs.length, pageRefs.length)
  const pageFileMap = Object.fromEntries(pageRefs.map((page) => [page.pageId, page.htmlPath]))
  const indexPath = path.join(context.entry.projectDir, 'index.html')

  // Build role-aware addendums
  const tocInstruction = hasTocPage
    ? [
        '## 页面角色说明',
        '- 第 1 页（封面）：填入演示标题、副标题、演讲者信息和日期，保持封面视觉结构不变。',
        '- 第 2 页（目录）：列出本次演讲的所有章节标题，逐条列出，不添加章节内容。目录项数量应与正文章节数一致。',
        hasBackCoverPage
          ? '- 最后一页（结束页）：保持结束页视觉结构，更新结束语或致谢词。'
          : '',
        '- 其余各页（正文内容页）：每页聚焦一个知识点，复用模板背景（logo、装饰、色带等）填充新内容。正文页背景结构必须与模板内容页完全一致，不得重新设计。'
      ]
      .filter(Boolean)
      .join('\n')
    : [
        '## 页面角色说明',
        '- 第 1 页（封面）：填入演示标题、副标题、演讲者信息和日期，保持封面视觉结构不变。',
        hasBackCoverPage
          ? '- 最后一页（结束页）：保持结束页视觉结构，更新结束语或致谢词。'
          : '',
        '- 其余各页（正文内容页）：每页聚焦一个知识点，复用模板背景（logo、装饰、色带等）填充新内容。正文页背景结构必须与模板内容页完全一致，不得重新设计。'
      ]
      .filter(Boolean)
      .join('\n')

  const templateSystemPromptAddendum = [
    '## 模板设计系统模式（正文内容生成）',
    '- 当前任务是为每张幻灯片生成正文内容，模板背景、装饰图层和标题框由系统代码自动注入，无需在输出中包含。',
    '- 只输出正文内容区域的 HTML：标题段落、列表、数据卡片、表格等。',
    '- 不要输出 section[data-page-scaffold] 外层容器、背景图层、装饰图片、角标 logo、色带 div 或 SVG 装饰。',
    '- 不要在内容顶部添加独立的 h1/h2/h3 标题——幻灯片标题已由代码自动放置。',
    '- 不重算 designContract；如上下文存在 designContract，仅作为字体参考。',
    '- 旧模板里的业务文字、数字、公司名、日期和结论是占位内容，必须用用户 brief/source document 替换。',
    '',
    tocInstruction
  ].join('\n')

  const templateSinglePagePromptAddendum = [
    'Template design system for this slide:',
    '- Generate BODY CONTENT only — headings, text paragraphs, lists, data cards, table content.',
    '- Do NOT include background-image elements, decorative image layers, logos, color-band divs, SVG shapes, or any absolutely-positioned chrome. The template background and decorative elements are restored automatically.',
    '- Do NOT output a section[data-page-scaffold] wrapper or any outer page shell.',
    '- Do NOT add a standalone h1/h2/h3 title at the top of the content. The slide title is placed automatically.',
    '- Treat old template business text, numbers, company names, dates, and conclusions as placeholder content — replace them with the new slide content.',
    hasTocPage
      ? '- This deck has a dedicated table-of-contents page. If the current slide IS the TOC page, your content should be a numbered list of all section titles. If it is a content page, do NOT duplicate the TOC — focus on its specific topic.'
      : ''
  ]
    .filter(Boolean)
    .join('\n')

  emitDeckChunk({
    type: 'stage_started',
    payload: {
      runId: context.runId,
      stage: 'preflight',
      label: progressText(context.appLocale, 'understanding'),
      progress: 2,
      totalPages: fullDeckPageCount
    }
  })

  await db.addMessage(context.sessionId, {
    role: 'system',
    content: uiText(
      context.appLocale,
      '正在按模板设计系统准备生成内容。',
      'Preparing content generation with the template design system.'
    ),
    type: 'stream_chunk',
    chat_scope: context.messageScope,
    page_id: context.messagePageId
  })

  await db.createGenerationRun({
    id: context.runId,
    sessionId: context.sessionId,
    mode: 'generate',
    totalPages: pageRefs.length,
    metadata: {
      templateGeneration: true,
      templateRetry: context.templateRetry,
      topic: context.topic,
      styleId: context.styleId,
      projectDir: context.entry.projectDir,
      indexPath
    }
  })

  emitDeckChunk({
    type: 'stage_started',
    payload: {
      runId: context.runId,
      stage: 'planning',
      label: progressText(context.appLocale, 'planning'),
      progress: 6,
      totalPages: fullDeckPageCount
    }
  })

  const latestPageSnapshot = context.templateRetry
    ? await db.listLatestGenerationPageSnapshot(context.sessionId)
    : []
  const plannedOutlineItems = context.templateRetry
    ? pageRefs.map((page) => {
        const snapshot = latestPageSnapshot.find((item) => item.page_id === page.pageId)
        return {
          title: snapshot?.title?.trim() || page.title,
          contentOutline: snapshot?.content_outline?.trim() || '',
          layoutIntent: snapshot?.layout_intent
            ? normalizeLayoutIntent(snapshot.layout_intent)
            : undefined
        }
      })
    : await planDeckWithLLM({
        provider: context.provider,
        apiKey: context.apiKey,
        model: context.model,
        baseUrl: context.providerBaseUrl,
        maxTokens: context.maxTokens,
        modelTimeoutMs: context.modelTimeouts.planning,
        temperature: PLANNER_TEMPERATURE,
        styleId: context.styleId,
        totalPages: pageRefs.length,
        appLocale: context.appLocale,
        topic: context.topic,
        userMessage: context.userMessage,
        planningHint: hasTocPage
          ? [
              '## Template structure constraints',
              '- Slide 1 must be the cover (layoutIntent: "cover").',
              '- Slide 2 must be a table-of-contents (layoutIntent: "toc") listing all section titles. Its keyPoints should be the section titles only, with no sub-details.',
              `- Slides 3 to ${pageRefs.length - 1} are content slides. Group them into 3-5 thematic sections; each section may start with a section-divider slide if it helps clarity.`,
              hasBackCoverPage
                ? `- Slide ${pageRefs.length} is the closing/thank-you slide (layoutIntent: "summary").`
                : ''
            ]
            .filter(Boolean)
            .join('\n')
          : undefined,
        emit: (chunk) => emitDeckChunk(chunk),
        runId: context.runId,
        signal: context.entry.abortController.signal
      })

  const outlineItems = pageRefs.map((page, index) => {
    const planned = plannedOutlineItems[index]
    return {
      title: planned?.title?.trim() || page.title,
      contentOutline: planned?.contentOutline?.trim() || '',
      layoutIntent: planned?.layoutIntent
    }
  })
  const outlineTitles = outlineItems.map((item) => item.title)
  const existingSessionPages = await db.listSessionPages(context.sessionId, { includeDeleted: true })
  const existingSessionPageBySlug = new Map(existingSessionPages.map((page) => [page.file_slug, page]))
  for (let index = 0; index < pageRefs.length; index += 1) {
    const page = pageRefs[index]
    page.title = outlineTitles[index] || page.title
    await db.upsertGenerationPage({
      runId: context.runId,
      sessionId: context.sessionId,
      pageId: page.pageId,
      pageNumber: page.pageNumber,
      title: page.title,
      contentOutline: outlineItems[index]?.contentOutline || '',
      layoutIntent: outlineItems[index]?.layoutIntent,
      htmlPath: page.htmlPath,
      status: 'pending'
    })
    const existing = existingSessionPageBySlug.get(page.pageId)
    await db.upsertSessionPage({
      id: existing?.id || page.id,
      sessionId: context.sessionId,
      legacyPageId: existing?.legacy_page_id || null,
      fileSlug: page.pageId,
      pageNumber: page.pageNumber,
      title: page.title,
      htmlPath: page.htmlPath,
      status: 'pending',
      error: null
    })
    emitDeckChunk({
      type: 'page_planned',
      payload: {
        runId: context.runId,
        stage: 'planning',
        label: progressText(context.appLocale, 'planning'),
        progress: 9,
        currentPage: page.pageNumber,
        totalPages: fullDeckPageCount,
        id: page.id,
        pageNumber: page.pageNumber,
        pageId: page.pageId,
        title: page.title,
        htmlPath: page.htmlPath
      }
    })
  }

  const titleByPageId = new Map(pageRefs.map((page) => [page.pageId, page.title]))
  await fs.promises.writeFile(
    indexPath,
    buildProjectIndexHtml(
      context.deckTitle,
      allPageRefs.map(
        (page): DeckPageFile => ({
          id: page.id,
          pageNumber: page.pageNumber,
          pageId: page.pageId,
          title: titleByPageId.get(page.pageId) || page.title,
          htmlPath: path.basename(page.htmlPath)
        })
      )
    ),
    'utf-8'
  )

  emitDeckChunk({
    type: 'llm_status',
    payload: {
      runId: context.runId,
      stage: 'preflight',
        label: progressText(context.appLocale, 'generating'),
        progress: 10,
        totalPages: fullDeckPageCount,
        detail: uiText(
        context.appLocale,
        context.templateRetry
          ? `已准备继续生成 ${pageRefs.length} 个未完成模板页面`
          : '已按模板设计系统完成规划并更新目录标题',
        context.templateRetry
          ? `Prepared to continue ${pageRefs.length} unfinished template pages`
          : 'Planning completed with the template design system and index titles updated'
      )
    }
  })

  await emitAssistant(
    context,
    uiText(
      context.appLocale,
      context.templateRetry
        ? `将继续生成「${context.topic}」中 ${outlineItems.length} 个未完成模板页面，并保留已完成页面。`
        : `已为「${context.topic}」按模板规划 ${outlineItems.length} 页内容，接下来会逐页替换模板内容并保持设计系统延展。`,
      context.templateRetry
        ? `Continuing ${outlineItems.length} unfinished template pages for "${context.topic}" while preserving completed pages.`
        : `Planned ${outlineItems.length} slides for "${context.topic}" using the template design system. I will replace template content page by page while preserving the system.`
    )
  )

  const persistedGeneratedPagesById = new Map<
    string,
    {
      pageNumber: number
      title: string
      pageId: string
      htmlPath: string
    }
  >()
  let completedTargetPageCount = 0
  const persistGenerationSnapshotMetadata = async (): Promise<void> => {
    await db.updateSessionMetadata(context.sessionId, {
      ...templateMetadata,
      lastRunId: context.runId,
      entryMode: 'template_multi_page',
      indexPath,
      projectId: context.projectId
    })
  }
  const persistCompletedGeneratedPage = async (page: {
    pageNumber: number
    pageId: string
    title: string
    contentOutline: string
    layoutIntent?: LayoutIntent
    htmlPath: string
  }): Promise<void> => {
    if (!fs.existsSync(page.htmlPath)) {
      throw new Error(`${page.pageId}.html 缺失`)
    }
    const html = await fs.promises.readFile(page.htmlPath, 'utf-8')
    const validation = validatePersistedPageHtml(html, page.pageId)
    if (!validation.valid) {
      throw new Error(`HTML 验证失败 (${page.pageId}): ${validation.errors.join('; ')}`)
    }
    await db.upsertGenerationPage({
      runId: context.runId,
      sessionId: context.sessionId,
      pageId: page.pageId,
      pageNumber: page.pageNumber,
      title: page.title,
      contentOutline: page.contentOutline,
      layoutIntent: page.layoutIntent,
      htmlPath: page.htmlPath,
      status: 'completed'
    })
    persistedGeneratedPagesById.set(page.pageId, {
      pageNumber: page.pageNumber,
      title: page.title,
      pageId: page.pageId,
      htmlPath: page.htmlPath
    })
    completedTargetPageCount += 1
    const pageRef = pageRefs.find((item) => item.pageId === page.pageId)
    emitDeckChunk({
      type: 'page_generated',
      payload: {
        runId: context.runId,
        stage: 'rendering',
        label: progressText(context.appLocale, 'completed'),
        progress: 10 + Math.round((completedTargetPageCount / Math.max(pageRefs.length, 1)) * 80),
        currentPage: page.pageNumber,
        totalPages: fullDeckPageCount,
        id: pageRef?.id,
        pageNumber: page.pageNumber,
        title: page.title,
        html,
        pageId: page.pageId,
        htmlPath: page.htmlPath,
        sourceUrl: getPageSourceUrl(page.htmlPath)
      }
    })
    await persistGenerationSnapshotMetadata()
  }
  const persistFailedGeneratedPage = async (page: {
    pageNumber: number
    pageId: string
    title: string
    contentOutline: string
    layoutIntent?: LayoutIntent
    htmlPath: string
    reason: string
  }): Promise<void> => {
    await db.upsertGenerationPage({
      runId: context.runId,
      sessionId: context.sessionId,
      pageId: page.pageId,
      pageNumber: page.pageNumber,
      title: page.title,
      contentOutline: page.contentOutline,
      layoutIntent: page.layoutIntent,
      htmlPath: page.htmlPath,
      status: 'failed',
      error: page.reason
    })
    await persistGenerationSnapshotMetadata()
  }

  const { failedPages } = await runDeepAgentDeckGeneration({
    sessionId: context.sessionId,
    provider: context.provider,
    apiKey: context.apiKey,
    model: context.model,
    baseUrl: context.providerBaseUrl,
    maxTokens: context.maxTokens,
    modelTimeoutMs: context.modelTimeouts.agent,
    temperature: PAGE_GENERATION_TEMPERATURE,
    styleId: context.styleId,
    styleSkillPrompt: context.styleSkill.prompt,
    appLocale: context.appLocale,
    topic: context.topic,
    deckTitle: context.deckTitle,
    userMessage: context.userMessage,
    outlineTitles,
    outlineItems,
    pageTasks: pageRefs.map((page, index) => ({
      pageNumber: page.pageNumber,
      pageId: page.pageId,
      title: page.title,
      contentOutline: outlineItems[index]?.contentOutline || '',
      layoutIntent: outlineItems[index]?.layoutIntent
    })),
    sourceDocumentPaths: context.sourceDocumentPaths,
    designContract: templateDesignContract,
    systemPromptAddendum: templateSystemPromptAddendum,
    singlePagePromptAddendum: templateSinglePagePromptAddendum,
    requireTemplatePageRead: true,
    generationMode: 'generate',
    projectDir: context.entry.projectDir,
    indexPath,
    pageFileMap,
    agentManager,
    emit: (chunk) => emitDeckChunk(chunk),
    onPageCompleted: persistCompletedGeneratedPage,
    onPageFailed: persistFailedGeneratedPage,
    runId: context.runId,
    signal: context.entry.abortController.signal
  })

  const failedPageIdSet = new Set(failedPages.map((item) => item.pageId))
  const postValidationFailures: Array<{ pageId: string; title: string; reason: string }> = []
  if (!fs.existsSync(indexPath)) {
    postValidationFailures.push({
      pageId: 'index',
      title: 'index.html',
      reason: 'index.html 缺失'
    })
  } else {
    const indexHtml = await fs.promises.readFile(indexPath, 'utf-8')
    const indexErrors = validateProjectIndexHtml(indexHtml)
    if (indexErrors.length > 0) {
      postValidationFailures.push({
        pageId: 'index',
        title: 'index.html',
        reason: indexErrors.join('; ')
      })
    }
  }

  const pageDescriptors: Array<{
    id?: string
    pageNumber: number
    title: string
    pageId: string
    htmlPath: string
    html: string
  }> = []
  const placeholderPages: string[] = []
  for (const pageRef of pageRefs) {
    if (failedPageIdSet.has(pageRef.pageId)) continue
    if (!fs.existsSync(pageRef.htmlPath)) {
      postValidationFailures.push({
        pageId: pageRef.pageId,
        title: pageRef.title,
        reason: `${pageRef.pageId}.html 缺失`
      })
      continue
    }
    const html = await fs.promises.readFile(pageRef.htmlPath, 'utf-8')
    const validation = validatePersistedPageHtml(html, pageRef.pageId)
    if (!validation.valid) {
      postValidationFailures.push({
        pageId: pageRef.pageId,
        title: pageRef.title,
        reason: validation.errors.join('; ')
      })
      continue
    }
    if (isPlaceholderPageHtml(html)) {
      placeholderPages.push(pageRef.pageId)
    }
    pageDescriptors.push({
      id: pageRef.id,
      pageNumber: pageRef.pageNumber,
      title: pageRef.title,
      pageId: pageRef.pageId,
      htmlPath: pageRef.htmlPath,
      html
    })
    if (!persistedGeneratedPagesById.has(pageRef.pageId)) {
      const outlineIndex = pageRefs.findIndex((item) => item.pageId === pageRef.pageId)
      await db.upsertGenerationPage({
        runId: context.runId,
        sessionId: context.sessionId,
        pageId: pageRef.pageId,
        pageNumber: pageRef.pageNumber,
        title: pageRef.title,
        contentOutline: outlineItems[outlineIndex]?.contentOutline || '',
        layoutIntent: outlineItems[outlineIndex]?.layoutIntent,
        htmlPath: pageRef.htmlPath,
        status: 'completed'
      })
    }
  }

  const allFailedPages = [
    ...failedPages,
    ...postValidationFailures.filter((item) => item.pageId !== 'index')
  ]
  if (allFailedPages.length > 0 || postValidationFailures.some((item) => item.pageId === 'index')) {
    const failedDetails = [...allFailedPages, ...postValidationFailures.filter((item) => item.pageId === 'index')]
      .map((item) => `${item.pageId}（${item.title}）：${item.reason}`)
      .join('；')
    const existingSessionPages = await db.listSessionPages(context.sessionId, { includeDeleted: true })
    const existingBySlug = new Map(existingSessionPages.map((page) => [page.file_slug, page]))
    for (const pageRef of pageRefs) {
      const failed = allFailedPages.find((item) => item.pageId === pageRef.pageId)
      const existing = existingBySlug.get(pageRef.pageId)
      await db.upsertSessionPage({
        id: existing?.id || pageRef.id,
        sessionId: context.sessionId,
        legacyPageId: existing?.legacy_page_id || null,
        fileSlug: pageRef.pageId,
        pageNumber: pageRef.pageNumber,
        title: pageRef.title,
        htmlPath: pageRef.htmlPath,
        status: failed ? 'failed' : 'completed',
        error: failed?.reason || null
      })
    }
    await db.updateGenerationRunStatus(
      context.runId,
      pageDescriptors.length > 0 ? 'partial' : 'failed',
      failedDetails
    )
    await persistGenerationSnapshotMetadata()
    await db.updateProjectStatus(context.projectId, 'draft')
    throw new Error(
      `模板生成部分页面失败（${allFailedPages.length}/${pageRefs.length}）：${allFailedPages
        .map((item) => `${item.pageId}(${item.title})`)
        .join(', ')}`
    )
  }

  if (placeholderPages.length > 0) {
    emitDeckChunk({
      type: 'llm_status',
      payload: {
        runId: context.runId,
        stage: 'validation',
        label: progressText(context.appLocale, 'completed'),
        progress: 94,
        totalPages: fullDeckPageCount,
        detail: uiText(
          context.appLocale,
          `以下页面可能仍是占位内容：${placeholderPages.join(', ')}`,
          `These pages may still contain placeholders: ${placeholderPages.join(', ')}`
        )
      }
    })
  }

  await emitAssistant(
    context,
    uiText(
      context.appLocale,
      context.templateRetry
        ? `未完成模板页已继续生成完成。当前共 ${fullDeckPageCount} 页，主题「${context.topic}」。`
        : `模板生成已完成。共 ${fullDeckPageCount} 页，主题「${context.topic}」。`,
      context.templateRetry
        ? `Unfinished template pages are complete. The deck now has ${fullDeckPageCount} pages for "${context.topic}".`
        : `Template generation completed. It has ${fullDeckPageCount} pages for "${context.topic}".`
    )
  )
  await db.updateGenerationRunStatus(context.runId, 'completed', null)
  await finalizeGenerationSuccess(ctx, {
    context,
    indexPath,
    totalPages: fullDeckPageCount,
    generatedPages: pageDescriptors
  })
  await persistGenerationSnapshotMetadata()
}
