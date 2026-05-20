import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import log from 'electron-log/main.js'
import { nanoid } from 'nanoid'
import { invokeVisionModelText } from '../utils/vision-model'
import type { ThinkingSource } from '@shared/thinking'

const require = createRequire(import.meta.url)
const mammoth = require('mammoth') as typeof import('mammoth')
const TurndownService = require('turndown') as new (options?: Record<string, unknown>) => {
  use: (plugin: unknown) => void
  turndown: (html: string) => string
}
const { gfm } = require('@joplin/turndown-plugin-gfm') as { gfm: unknown }

const NULL_CHAR_PATTERN = new RegExp(String.fromCharCode(0), 'g')

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.text', '.csv', '.docx'])
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const stripControlChars = (value: string): string =>
  value.replace(NULL_CHAR_PATTERN, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

const compactText = (value: string): string =>
  stripControlChars(value)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()

const stripInlineImagesFromHtml = (html: string): string =>
  html.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = tag.match(/\balt=(["'])(.*?)\1/i)?.[2]?.trim()
    return alt ? `<p>[图片：${alt}]</p>` : ''
  })

const stripMarkdownDataImages = (markdown: string): string =>
  markdown.replace(/!\[[^\]]*]\(data:[^)]+\)/gi, '').replace(/!\[[^\]]*]\(\s*\)/g, '')

const convertDocxToMarkdown = async (filePath: string): Promise<string> => {
  const result = await mammoth.convertToHtml({ path: filePath })
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced'
  })
  turndown.use(gfm)
  return compactText(
    stripMarkdownDataImages(turndown.turndown(stripInlineImagesFromHtml(result.value)))
  )
}

const toSafeFileName = (value: string): string =>
  value
    .replace(/[\\/:"*?<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'source'

const mimeTypeFromExtension = (ext: string): string => {
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return ''
}

const buildImageSummaryPrompt = (name: string): string =>
  [
    `请理解这张图片，并为后续演示文稿规划生成一份结构化摘要。图片文件名：${name}`,
    '',
    '输出要求：',
    '- 使用用户可能使用的主要语言；无法判断时用中文。',
    '- 不要编造图片中不存在的具体数据。',
    '- 如果图片包含文字、数字、表格、图表或界面信息，请尽量提取。',
    '- 如果图片更适合作为风格参考、封面图、页面插图或证据素材，请明确建议。',
    '',
    '请按以下 Markdown 小节输出：',
    '## Visual Summary',
    '## Key Text Or Data',
    '## Suggested Slide Usage',
    '## Style Notes'
  ].join('\n')

const buildFallbackImageSummary = (name: string): string =>
  [
    '## Visual Summary',
    `图片 ${name} 已上传，但当前模型没有返回可用的视觉摘要。`,
    '',
    '## Key Text Or Data',
    '- 待用户补充或后续重新分析。',
    '',
    '## Suggested Slide Usage',
    '- 可作为后续页面生成的本地图片素材。',
    '',
    '## Style Notes',
    '- 待补充。'
  ].join('\n')

export type SourceKind = ThinkingSource['kind']

export interface PreparedSource {
  id: string
  name: string
  kind: SourceKind
  sourcePath: string
  assetsPath?: string
}

export interface ImageSummaryOptions {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  maxTokens?: number
  modelTimeoutMs: number
}

function detectKind(ext: string): SourceKind {
  if (SUPPORTED_IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ext === '.docx') return 'docx'
  if (ext === '.md') return 'markdown'
  if (ext === '.csv') return 'csv'
  return 'text'
}

async function summarizeImage(args: {
  filePath: string
  name: string
  ext: string
  options: ImageSummaryOptions
}): Promise<string> {
  const imageBase64 = await fs.promises.readFile(args.filePath, 'base64')
  const response = await invokeVisionModelText({
    imageBase64,
    mimeType: mimeTypeFromExtension(args.ext),
    prompt: buildImageSummaryPrompt(args.name),
    provider: args.options.provider,
    apiKey: args.options.apiKey,
    model: args.options.model,
    baseUrl: args.options.baseUrl,
    maxTokens: args.options.maxTokens,
    modelTimeoutMs: args.options.modelTimeoutMs,
    logTag: 'thinking:image-summary'
  })
  return response.trim() || buildFallbackImageSummary(args.name)
}

export async function prepareSourceFile(
  filePath: string,
  thinkingDir: string,
  options?: {
    imageSummary?: ImageSummaryOptions
  }
): Promise<PreparedSource> {
  const resolved = path.resolve(filePath)
  const stat = await fs.promises.stat(resolved)
  if (!stat.isFile()) throw new Error(`Not a file: ${resolved}`)

  const ext = path.extname(resolved).toLowerCase()
  const isImage = SUPPORTED_IMAGE_EXTENSIONS.has(ext)

  if (!SUPPORTED_EXTENSIONS.has(ext) && !isImage) {
    throw new Error(`Unsupported file type: ${ext}`)
  }

  if (isImage && stat.size > MAX_IMAGE_SIZE) {
    throw new Error(`Image file too large (max 5MB): ${path.basename(resolved)}`)
  }
  if (!isImage && stat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (max 10MB): ${path.basename(resolved)}`)
  }

  const sourcesDir = path.join(thinkingDir, 'sources')
  const assetsDir = path.join(thinkingDir, 'assets')
  await fs.promises.mkdir(sourcesDir, { recursive: true })
  await fs.promises.mkdir(assetsDir, { recursive: true })

  const kind = detectKind(ext)
  const baseName = path.basename(resolved, ext)
  const safeName = toSafeFileName(baseName)
  const stamp = Date.now()
  const uid = nanoid(8)

  const id = `${stamp}-${uid}-${safeName}`
  let sourcePath: string
  let assetsPath: string | undefined

  if (kind === 'docx') {
    const mdName = `${id}.md`
    sourcePath = path.join(sourcesDir, mdName)
    const markdown = await convertDocxToMarkdown(resolved)
    await fs.promises.writeFile(
      sourcePath,
      [`# ${baseName}`, '', `> Converted from Word .docx`, '', markdown].join('\n'),
      'utf-8'
    )
  } else if (kind === 'image') {
    const imgName = `${id}${ext}`
    const mdName = `${id}.image.md`
    sourcePath = path.join(sourcesDir, mdName)
    assetsPath = path.join(assetsDir, imgName)
    if (!options?.imageSummary) {
      throw new Error(`Image understanding requires an active vision-capable model: ${path.basename(resolved)}`)
    }
    const summary = await summarizeImage({
      filePath: resolved,
      name: path.basename(resolved),
      ext,
      options: options.imageSummary
    })
    await fs.promises.copyFile(resolved, assetsPath)
    await fs.promises.writeFile(
      sourcePath,
      [
        `# 图片：${path.basename(resolved)}`,
        '',
        '## Asset',
        `- assetId: ${id}`,
        `- fileName: ${imgName}`,
        `- originalPath: ${resolved}`,
        `- thinkingAssetPath: ${assetsPath}`,
        `- thinkingPublicPath: assets/${imgName}`,
        '- sessionAssetPath: (set during generation copy)',
        '- publicPath: (set during generation copy)',
        '',
        summary
      ].join('\n'),
      'utf-8'
    )
  } else {
    const fileName = `${id}${ext}`
    sourcePath = path.join(sourcesDir, fileName)
    await fs.promises.copyFile(resolved, sourcePath)
  }

  log.info('[thinking:source-prepare] prepared', {
    kind,
    name: path.basename(resolved),
    id
  })

  return {
    id,
    name: path.basename(resolved),
    kind,
    sourcePath,
    assetsPath
  }
}

export async function prepareMultipleSources(
  filePaths: string[],
  thinkingDir: string,
  options?: {
    imageSummary?: ImageSummaryOptions
  }
): Promise<PreparedSource[]> {
  const results: PreparedSource[] = []
  for (const filePath of filePaths) {
    results.push(await prepareSourceFile(filePath, thinkingDir, options))
  }
  return results
}
