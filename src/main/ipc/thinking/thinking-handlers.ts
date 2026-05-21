import { ipcMain, BrowserWindow, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log/main.js'
import type { IpcContext } from '../context'
import { resolveActiveModelConfig, resolveGlobalModelTimeouts } from '../config/model-config-utils'
import { createWorkspace, readWorkspace, scanLatestWorkspace, resolveThinkingDir } from '../../thinking/workspace'
import { prepareMultipleSources } from '../../thinking/source-prepare'
import { runThinkingChat } from '../../thinking/thinking-agent'
import { hasStyleSkill, listStyleCatalog } from '../../utils/style-skills'
import { normalizeFontSelection } from '@shared/generation'
import type { ThinkingChatMessage, ThinkingPrepareGenerationResult } from '@shared/thinking'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

async function updateSourcesManifest(
  thinkingDir: string,
  sources: Array<{ id: string; name: string; kind: string; fileName: string }>
): Promise<void> {
  const manifestPath = path.join(thinkingDir, 'sources.json')
  let existing: Array<{ id: string; name: string; kind: string; fileName: string }> = []
  try {
    const raw = await fs.promises.readFile(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      existing = parsed.filter((item) => item && typeof item === 'object')
    }
  } catch {
    existing = []
  }

  const byId = new Map(existing.map((item) => [item.id, item]))
  for (const source of sources) {
    byId.set(source.id, source)
  }
  await fs.promises.writeFile(
    manifestPath,
    JSON.stringify(Array.from(byId.values()), null, 2),
    'utf-8'
  )
}

function parseTopicFromThinkingMd(thinkingMd: string): string {
  // Try "## Topic: xxx" (inline) first, then "## Topic\nxxx" (next line)
  const inline = thinkingMd.match(/^##\s*Topic\s*:\s*(.+)/m)
  if (inline) return inline[1].trim()
  const newline = thinkingMd.match(/^##\s*Topic\s*\n\s*(.+)/m)
  return newline ? newline[1].trim() : ''
}

function parsePageCountFromThinkingMd(thinkingMd: string): number {
  const matches = thinkingMd.match(/^##\s*Page\s+\d+\s*:/gm)
  return matches ? matches.length : 0
}

function readMarkdownSectionValue(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const inline = markdown.match(new RegExp(`^##\\s*${escaped}\\s*:\\s*(.+)`, 'm'))
  if (inline) return inline[1].trim()
  const block = markdown.match(new RegExp(`^##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'm'))
  return block?.[1]?.trim().split('\n')[0]?.trim() || ''
}

function isValidStyleIdCandidate(value: string): boolean {
  return /^[a-z0-9-]{3,40}$/.test(value.trim().toLowerCase())
}

function parseStyleFromThinkingMd(thinkingMd: string): string {
  const styleText = readMarkdownSectionValue(thinkingMd, 'Style')
  if (!styleText) return ''

  const normalizedText = styleText.trim().toLowerCase()
  const catalog = listStyleCatalog()

  if (isValidStyleIdCandidate(normalizedText)) {
    try {
      if (hasStyleSkill(normalizedText)) return normalizedText
    } catch {
      // Natural-language style text should fall through to catalog matching.
    }
  }

  const exact = catalog.find((item) => {
    const candidates = [item.id, item.styleKey, item.label].map((value) => value.toLowerCase())
    return candidates.includes(normalizedText)
  })
  if (exact) return exact.id

  const styleKeywords = normalizedText
    .split(/[\s,，、/|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const semanticKeywords: string[] = []
  if (/数据|分析|商业|行业|会议|报告/.test(styleText)) {
    semanticKeywords.push('数据', '分析', '商业', '会议')
  }
  if (/科技|ai|人工智能|技术/.test(styleText)) {
    semanticKeywords.push('科技', '技术', '深色', '冷静')
  }
  if (/极简|简洁|干净|白/.test(styleText)) {
    semanticKeywords.push('极简', '简约', '留白')
  }

  const keywords = Array.from(new Set([...styleKeywords, ...semanticKeywords]))
  let best: { id: string; score: number } | null = null
  for (const item of catalog) {
    const haystack = [
      item.id,
      item.styleKey,
      item.label,
      item.description,
      item.category,
      item.styleCase
    ]
      .join(' ')
      .toLowerCase()
    let score = 0
    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase()
      if (normalizedKeyword && haystack.includes(normalizedKeyword)) score += 1
    }
    if (/数据|分析|商业/.test(styleText) && item.styleKey === 'arctic-cool') score += 3
    if (/行业|会议|报告/.test(styleText) && item.styleKey === 'minimal-white') score += 1
    if (!best || score > best.score) {
      best = { id: item.id, score }
    }
  }

  if (best && best.score > 0) {
    log.info('[thinking] matched natural-language style', {
      styleText,
      styleId: best.id,
      score: best.score
    })
    return best.id
  }

  return ''
}

function parseFontFromThinkingMd(thinkingMd: string): unknown {
  const match = thinkingMd.match(/^##\s*Font\s*\n\s*(.+)/m)
  if (!match) return { mode: 'auto' }
  const fontText = match[1].trim().toLowerCase()
  if (fontText === 'auto') return { mode: 'auto' }
  // For now, if the user specified fonts, try to parse as JSON
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return { mode: 'auto' }
  }
}

export function registerThinkingHandlers(ctx: IpcContext): void {
  const { resolveStoragePath } = ctx

  ipcMain.handle('thinking:createWorkspace', async () => {
    const storagePath = await resolveStoragePath()
    return createWorkspace(storagePath)
  })

  ipcMain.handle('thinking:getWorkspace', async (_event, thinkingId: string) => {
    const storagePath = await resolveStoragePath()
    return readWorkspace(storagePath, thinkingId)
  })

  ipcMain.handle('thinking:getLatestWorkspace', async () => {
    const storagePath = await resolveStoragePath()
    const latest = await scanLatestWorkspace(storagePath)
    if (!latest) return null
    return readWorkspace(storagePath, latest.thinkingId)
  })

  ipcMain.handle('thinking:revealWorkspace', async (_event, thinkingId: string) => {
    const storagePath = await resolveStoragePath()
    await readWorkspace(storagePath, thinkingId)
    const dir = resolveThinkingDir(storagePath, thinkingId)
    const result = await shell.openPath(dir)
    if (result) throw new Error(result)
    return { success: true }
  })

  ipcMain.handle(
    'thinking:uploadSources',
    async (
      _event,
      payload: { thinkingId: string; files: Array<{ path: string; name?: string }> }
    ) => {
      const { thinkingId, files } = payload
      const storagePath = await resolveStoragePath()
      await readWorkspace(storagePath, thinkingId)
      const dir = resolveThinkingDir(storagePath, thinkingId)

      const filePaths = files
        .map((f) => f.path)
        .filter((p) => typeof p === 'string' && p.trim().length > 0)

      if (filePaths.length === 0) {
        throw new Error('No valid file paths provided')
      }
      if (filePaths.length > 10) {
        throw new Error('Upload at most 10 files at a time')
      }

      const hasImage = filePaths.some((filePath) =>
        IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
      )
      const activeModel = hasImage ? await resolveActiveModelConfig(ctx) : null
      const modelTimeouts = hasImage ? await resolveGlobalModelTimeouts(ctx) : null
      const prepared = await prepareMultipleSources(
        filePaths,
        dir,
        activeModel && modelTimeouts
          ? {
              imageSummary: {
                provider: activeModel.provider,
                apiKey: activeModel.apiKey,
                model: activeModel.model,
                baseUrl: activeModel.baseUrl,
                maxTokens: activeModel.maxTokens,
                modelTimeoutMs: modelTimeouts.document
              }
            }
          : undefined
      )

      const sources = prepared.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind
      }))
      await updateSourcesManifest(
        dir,
        prepared.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          fileName: path.basename(p.sourcePath)
        }))
      )

      log.info('[thinking] sources uploaded', {
        thinkingId,
        count: sources.length,
        kinds: sources.map((s) => s.kind)
      })

      return { sources }
    }
  )

  ipcMain.handle(
    'thinking:chat',
    async (
      _event,
      payload: { thinkingId: string; userMessage: string; recentMessages?: ThinkingChatMessage[] }
    ) => {
      const { thinkingId, userMessage, recentMessages } = payload
      const storagePath = await resolveStoragePath()
      const dir = resolveThinkingDir(storagePath, thinkingId)

      const workspace = await readWorkspace(storagePath, thinkingId)
      const activeModel = await resolveActiveModelConfig(ctx)
      const modelTimeouts = await resolveGlobalModelTimeouts(ctx)

      const emitThinkingEvent = (event: { type: string; toolName: string; summary: string }): void => {
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          if (win.isDestroyed() || win.webContents.isDestroyed()) continue
          try {
            win.webContents.send('thinking:stream:thinking', { thinkingId, ...event })
          } catch { /* window may have closed */ }
        }
      }

      const result = await runThinkingChat({
        thinkingId,
        thinkingDir: dir,
        stage: workspace.stage,
        thinkingMd: workspace.thinkingMd,
        contextMd: workspace.contextMd,
        sourcesDir: `${dir}/sources`,
        userMessage,
        recentMessages: Array.isArray(recentMessages) ? recentMessages.slice(-8) : [],
        provider: activeModel.provider,
        apiKey: activeModel.apiKey,
        model: activeModel.model,
        baseUrl: activeModel.baseUrl,
        maxTokens: activeModel.maxTokens,
        modelTimeoutMs: modelTimeouts.agent,
        onThinkingEvent: emitThinkingEvent
      })

      // Send final result with the full reply for typing animation
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (win.isDestroyed() || win.webContents.isDestroyed()) continue
        try {
          win.webContents.send('thinking:stream:end', {
            thinkingId,
            reply: result.reply,
            thinkingMd: result.thinkingMd,
            contextMd: result.contextMd,
            stage: result.stage
          })
        } catch { /* window may have closed */ }
      }

      log.info('[thinking] chat result', {
        thinkingId,
        stage: result.stage,
        replyLength: result.reply.length
      })

      return result
    }
  )

  ipcMain.handle(
    'thinking:prepareGeneration',
    async (_event, payload: { thinkingId: string }) => {
      const { thinkingId } = payload
      const storagePath = await resolveStoragePath()
      const dir = resolveThinkingDir(storagePath, thinkingId)

      const workspace = await readWorkspace(storagePath, thinkingId)

      const topic = parseTopicFromThinkingMd(workspace.thinkingMd)
      const pageCount = parsePageCountFromThinkingMd(workspace.thinkingMd)
      let styleId = parseStyleFromThinkingMd(workspace.thinkingMd)
      const rawFont = parseFontFromThinkingMd(workspace.thinkingMd)
      const fontSelection = normalizeFontSelection(rawFont)

      // Default to first available style if not found
      if (!styleId) {
        const catalog = listStyleCatalog()
        styleId = catalog.length > 0 ? catalog[0].id : ''
      }

      if (!topic) {
        throw new Error('thinking.md is missing ## Topic. Please complete the thinking brief first.')
      }
      if (pageCount < 1) {
        throw new Error('thinking.md has no pages. Please create a page-by-page thinking brief first.')
      }

      const thinkingDocumentPath = path.join(dir, 'thinking.md')

      const result: ThinkingPrepareGenerationResult = {
        thinkingDocumentPath,
        topic,
        pageCount: Math.max(1, Math.min(40, pageCount)),
        styleId,
        fontSelection
      }

      log.info('[thinking] prepareGeneration', {
        thinkingId,
        topic: result.topic,
        pageCount: result.pageCount,
        styleId: result.styleId,
        fontMode: result.fontSelection.mode
      })

      return result
    }
  )

  log.info('[thinking] handlers registered')
}
