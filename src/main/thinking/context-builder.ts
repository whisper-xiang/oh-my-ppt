import fs from 'fs'
import path from 'path'
import log from 'electron-log/main.js'
import type { ThinkingChatMessage, ThinkingStage } from '@shared/thinking'
import { getStagePrompt } from './prompts'

export interface ThinkingContextArgs {
  stage: ThinkingStage
  thinkingMd: string
  contextMd: string
  sourcesDir: string
  userMessage: string
  recentMessages?: ThinkingChatMessage[]
}

export async function buildThinkingContext(args: ThinkingContextArgs): Promise<{
  systemPrompt: string
  userMessage: string
  sourceContent: string
}> {
  const { stage, thinkingMd, contextMd, sourcesDir, userMessage, recentMessages } = args

  const stagePrompt = getStagePrompt(stage)

  // Build source file index instead of inlining content — AI will use read_file/grep tools to read on demand
  let sourceContent = ''
  if (fs.existsSync(sourcesDir)) {
    const entries = await fs.promises.readdir(sourcesDir)
    const fileEntries: string[] = []
    for (const entry of entries) {
      const filePath = path.join(sourcesDir, entry)
      try {
        const stat = await fs.promises.stat(filePath)
        if (!stat.isFile()) continue
        fileEntries.push(`- /sources/${entry}`)
      } catch {
        // skip unreadable files
      }
    }
    if (fileEntries.length > 0) {
      sourceContent = fileEntries.join('\n')
    }
  }

  const systemPrompt = stagePrompt

  const contextParts: string[] = []

  if (thinkingMd.trim()) {
    contextParts.push(`## Current Thinking Brief\n${thinkingMd}`)
  }

  if (contextMd.trim()) {
    contextParts.push(`## Context\n${contextMd}`)
  }

  if (sourceContent) {
    contextParts.push(`## Available Source Files\nThe following source files are available. Use read_file and grep to read them as needed.\n${sourceContent}`)
  } else {
    contextParts.push(
      [
        '## Source Files',
        'No source files are available for this turn.',
        'Do not call read_file, grep/search, glob, or ls. Work only from the current thinking brief, context, recent conversation, and user message.'
      ].join('\n')
    )
  }

  const recentConversation = Array.isArray(recentMessages)
    ? recentMessages
        .slice(-8)
        .map((message) => {
          const role = message.role === 'assistant' ? 'Assistant' : 'User'
          return `${role}: ${message.content.trim()}`
        })
        .filter((line) => line.trim().length > 0)
        .join('\n\n')
    : ''

  if (recentConversation) {
    contextParts.push(`## Recent Conversation\n${recentConversation}`)
  }

  contextParts.push(`## User Message\n${userMessage}`)

  const fullUserMessage = contextParts.join('\n\n')

  log.info('[thinking:context] built', {
    stage,
    hasThinkingMd: thinkingMd.trim().length > 0,
    hasSources: sourceContent.length > 0,
    recentMessages: recentMessages?.length || 0,
    messageLength: fullUserMessage.length
  })

  return {
    systemPrompt,
    userMessage: fullUserMessage,
    sourceContent
  }
}
