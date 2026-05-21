import path from 'path'
import fs from 'fs'
import { nanoid } from 'nanoid'
import log from 'electron-log/main.js'
import type { ThinkingStage, ThinkingSource, ThinkingWorkspace } from '@shared/thinking'

const THINKING_ID_RE = /^[a-zA-Z0-9_-]{6,32}$/

export function assertValidThinkingId(id: string): void {
  if (!THINKING_ID_RE.test(id)) {
    throw new Error(`Invalid thinkingId: ${id}`)
  }
}

export function resolveThinkingDir(storagePath: string, thinkingId: string): string {
  return path.join(storagePath, 'thinking', thinkingId)
}

export function buildInitialThinkingMd(): string {
  return `# Thinking Brief

## Topic

## Audience

## Setting

## Tone

## Style

## Font
auto

## Page Count
0
`
}

export function buildInitialContextMd(stage: ThinkingStage = 'collect'): string {
  return `## Stage: collect

## User Intent

## Confirmed Decisions

## Open Questions

## Created: ${new Date().toISOString()}
`.replace(/^## Stage:\s*collect/m, `## Stage: ${stage}`)
}

export async function createWorkspace(storagePath: string): Promise<ThinkingWorkspace> {
  const thinkingId = nanoid()
  const dir = resolveThinkingDir(storagePath, thinkingId)
  const sourcesDir = path.join(dir, 'sources')
  const assetsDir = path.join(dir, 'assets')

  await fs.promises.mkdir(sourcesDir, { recursive: true })
  await fs.promises.mkdir(assetsDir, { recursive: true })

  const thinkingMd = buildInitialThinkingMd()
  const contextMd = buildInitialContextMd('collect')

  const thinkingMdPath = path.join(dir, 'thinking.md')
  const contextMdPath = path.join(dir, 'context.md')

  await fs.promises.writeFile(thinkingMdPath, thinkingMd, 'utf-8')
  await fs.promises.writeFile(contextMdPath, contextMd, 'utf-8')

  log.info(`[thinking] workspace created: ${thinkingId}`)

  return {
    thinkingId,
    thinkingMd,
    contextMd,
    stage: 'collect',
    sources: []
  }
}

export async function readWorkspace(
  storagePath: string,
  thinkingId: string
): Promise<ThinkingWorkspace> {
  assertValidThinkingId(thinkingId)
  const dir = resolveThinkingDir(storagePath, thinkingId)

  const thinkingMdPath = path.join(dir, 'thinking.md')
  const contextMdPath = path.join(dir, 'context.md')

  if (!fs.existsSync(thinkingMdPath)) {
    throw new Error(`Thinking workspace not found: ${thinkingId}`)
  }

  const [thinkingMd, contextMd] = await Promise.all([
    fs.promises.readFile(thinkingMdPath, 'utf-8'),
    fs.promises.readFile(contextMdPath, 'utf-8')
  ])

  const stage = parseStageFromContextMd(contextMd)
  const sources = await parseSourcesList(dir)

  return { thinkingId, thinkingMd, contextMd, stage, sources }
}

export async function writeThinkingMd(dir: string, content: string): Promise<void> {
  const filePath = path.join(dir, 'thinking.md')
  await fs.promises.writeFile(filePath, content, 'utf-8')
}

export async function writeContextMd(dir: string, content: string): Promise<void> {
  const filePath = path.join(dir, 'context.md')
  await fs.promises.writeFile(filePath, content, 'utf-8')
}

export async function scanLatestWorkspace(
  storagePath: string
): Promise<{ thinkingId: string; updatedAt: number } | null> {
  const thinkingRoot = path.join(storagePath, 'thinking')
  if (!fs.existsSync(thinkingRoot)) return null

  const entries = await fs.promises.readdir(thinkingRoot, { withFileTypes: true })
  const dirs = entries
    .filter((e) => e.isDirectory() && THINKING_ID_RE.test(e.name))
    .map((e) => path.join(thinkingRoot, e.name))

  if (dirs.length === 0) return null

  let latestDir = ''
  let latestMtime = 0

  for (const dir of dirs) {
    const thinkingMdPath = path.join(dir, 'thinking.md')
    if (!fs.existsSync(thinkingMdPath)) continue
    const stat = await fs.promises.stat(thinkingMdPath)
    if (stat.mtimeMs > latestMtime) {
      latestMtime = stat.mtimeMs
      latestDir = dir
    }
  }

  if (!latestDir) return null

  return {
    thinkingId: path.basename(latestDir),
    updatedAt: latestMtime
  }
}

export function parseStageFromContextMd(content: string): ThinkingStage {
  const match = content.match(/^## Stage:\s*(\S+)/m)
  if (!match) return 'collect'
  const stage = match[1] as ThinkingStage
  const validStages: ThinkingStage[] = ['collect', 'outline', 'draft', 'refine', 'ready']
  return validStages.includes(stage) ? stage : 'collect'
}

export async function parseSourcesList(dir: string): Promise<ThinkingSource[]> {
  const sourcesDir = path.join(dir, 'sources')
  if (!fs.existsSync(sourcesDir)) return []

  const entries = await fs.promises.readdir(sourcesDir, { withFileTypes: true })
  const manifestByFileName = new Map<string, ThinkingSource>()
  try {
    const rawManifest = await fs.promises.readFile(path.join(dir, 'sources.json'), 'utf-8')
    const parsed = JSON.parse(rawManifest)
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue
        const record = item as Record<string, unknown>
        const id = typeof record.id === 'string' ? record.id : ''
        const name = typeof record.name === 'string' ? record.name : ''
        const kind = typeof record.kind === 'string' ? record.kind : ''
        const fileName = typeof record.fileName === 'string' ? record.fileName : ''
        if (!id || !name || !fileName) continue
        if (!['markdown', 'text', 'csv', 'docx', 'image'].includes(kind)) continue
        manifestByFileName.set(fileName, {
          id,
          name,
          kind: kind as ThinkingSource['kind']
        })
      }
    }
  } catch {
    // Older workspaces do not have a manifest; fall back to file names.
  }
  const sources: ThinkingSource[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) continue
    const manifestSource = manifestByFileName.get(entry.name)
    if (manifestSource) {
      sources.push(manifestSource)
      continue
    }
    const ext = path.extname(entry.name).toLowerCase()
    let kind: ThinkingSource['kind'] = 'text'
    if (entry.name.endsWith('.image.md')) kind = 'image'
    else if (ext === '.md') kind = 'markdown'
    else if (ext === '.csv') kind = 'csv'
    else if (ext === '.docx') kind = 'docx'
    else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) kind = 'image'

    sources.push({
      id: entry.name,
      name: entry.name,
      kind
    })
  }

  return sources
}
