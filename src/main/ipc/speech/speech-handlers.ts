import { ipcMain } from 'electron'
import fs from 'fs'
import * as cheerio from 'cheerio'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import log from 'electron-log/main.js'
import type { IpcContext } from '../context'
import { resolveActiveModelConfig } from '../config/model-config-utils'
import { resolveModel } from '../../agent'
import { readAppLocale, uiText } from '../config/locale-utils'

export type SpeechLength = 'short' | 'medium' | 'long'
export type SpeechStyle = 'formal' | 'conversational' | 'storytelling'

function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html)
  $('script, style').remove()
  return $('body').text().replace(/\s+/g, ' ').trim()
}

function buildLengthInstruction(length: SpeechLength, isZh: boolean): string {
  if (isZh) {
    switch (length) {
      case 'short': return '每页演讲内容约100-150字，控制在1分钟以内。'
      case 'long': return '每页演讲内容约400-500字，详细展开，约3-4分钟。'
      default: return '每页演讲内容约200-300字，约2分钟。'
    }
  } else {
    switch (length) {
      case 'short': return 'Keep each slide section to ~100-150 words, around 1 minute.'
      case 'long': return 'Write ~400-500 words per slide with rich detail, around 3-4 minutes.'
      default: return 'Write ~200-300 words per slide, around 2 minutes.'
    }
  }
}

function buildStyleInstruction(style: SpeechStyle, isZh: boolean): string {
  if (isZh) {
    switch (style) {
      case 'formal': return '语气正式、专业，适合商务或学术场合，避免口语化表达。'
      case 'storytelling': return '采用叙事风格，以故事或案例引入，有情节感和情感共鸣，吸引听众注意力。'
      default: return '语气轻松自然，口语化，像和听众对话一样，亲切易懂。'
    }
  } else {
    switch (style) {
      case 'formal': return 'Use a formal, professional tone suitable for business or academic settings. Avoid colloquialisms.'
      case 'storytelling': return 'Use a storytelling approach — open with a story or case study, build narrative flow, and engage emotions.'
      default: return 'Use a relaxed, conversational tone as if speaking directly to the audience. Keep it approachable and natural.'
    }
  }
}

export function registerSpeechHandlers(ctx: IpcContext): void {
  ipcMain.handle('speech:generateScript', async (_event, payload) => {
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
    if (!sessionId) throw new Error('Session ID is required')

    const length: SpeechLength =
      payload?.length === 'short' || payload?.length === 'long' ? payload.length : 'medium'
    const style: SpeechStyle =
      payload?.style === 'formal' || payload?.style === 'storytelling' ? payload.style : 'conversational'

    const session = await ctx.db.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    const pages = await ctx.db.listSessionPages(sessionId)
    if (pages.length === 0) throw new Error('No pages found in this session')

    const slideContents = pages
      .filter((p) => p.html_path && fs.existsSync(p.html_path))
      .map((p) => {
        const html = fs.readFileSync(p.html_path, 'utf-8')
        const text = extractTextFromHtml(html)
        return { pageNumber: p.page_number, title: p.title, text }
      })

    if (slideContents.length === 0) throw new Error('No readable page files found')

    const modelConfig = await resolveActiveModelConfig(ctx)
    const model = resolveModel(
      modelConfig.provider,
      modelConfig.apiKey,
      modelConfig.model,
      modelConfig.baseUrl,
      0.7,
      modelConfig.maxTokens
    )

    const locale = await readAppLocale(ctx)
    const isZh = locale === 'zh'

    const lengthInstruction = buildLengthInstruction(length, isZh)
    const styleInstruction = buildStyleInstruction(style, isZh)

    const systemPrompt = uiText(
      locale,
      `你是一位专业的演讲稿撰写人。请根据提供的幻灯片内容，为演讲者生成逐页的演讲稿。

要求：
- 演讲稿语言与幻灯片内容语言保持一致
- 每页幻灯片对应一段演讲内容，以 "## 第N页：标题" 开头
- 包含过渡语句自然衔接各页之间的内容
- ${lengthInstruction}
- ${styleInstruction}`,
      `You are a professional speech writer. Based on the provided slide content, generate a speaker script organized by slide.

Requirements:
- Match the language of the slide content
- Each slide maps to one section, starting with "## Slide N: Title"
- Include natural transition phrases between slides
- ${lengthInstruction}
- ${styleInstruction}`
    )

    const slidesSummary = slideContents
      .map((s) =>
        isZh
          ? `## 第${s.pageNumber}页：${s.title}\n${s.text}`
          : `## Slide ${s.pageNumber}: ${s.title}\n${s.text}`
      )
      .join('\n\n')

    const userPrompt = uiText(
      locale,
      `演示文稿标题：${session.title || session.topic || '未命名'}
共 ${slideContents.length} 张幻灯片

以下是每张幻灯片的内容：

${slidesSummary}

请生成完整的演讲稿。`,
      `Presentation title: ${session.title || session.topic || 'Untitled'}
Total slides: ${slideContents.length}

Slide content:

${slidesSummary}

Please generate the full speech script.`
    )

    log.info('[speech] generating script', { sessionId, pageCount: slideContents.length, length, style })

    const response = await model.invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)])

    const script = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)

    return { success: true, script }
  })
}
