import type { ThinkingStage } from '@shared/thinking'

const VALID_TRANSITIONS: Record<ThinkingStage, ThinkingStage[]> = {
  collect: ['collect', 'outline'],
  outline: ['collect', 'draft', 'ready'],
  draft: ['collect', 'outline', 'refine', 'ready'],
  refine: ['collect', 'outline', 'draft', 'ready'],
  ready: ['collect', 'outline']
}

export function checkStageTransition(
  currentStage: ThinkingStage,
  thinkingMd: string
): ThinkingStage {
  const pageCount = countPageHeadings(thinkingMd)
  const hasTopic = hasNonEmptySection(thinkingMd, 'Topic')

  if (currentStage === 'collect' && hasTopic && pageCount >= 2) {
    return 'outline'
  }

  return currentStage
}

export function detectStageFallback(userMessage: string): ThinkingStage | null {
  const lower = userMessage.toLowerCase()

  if (/let's start over|start over|从头开始|重新开始/.test(lower)) {
    return 'collect'
  }

  if (/adjust.*outline|change.*structure|大纲|拆页|规划|调整.*大纲|修改.*结构/.test(lower)) {
    return 'outline'
  }

  if (/展开|细化|详细|继续写|expand|detail/.test(lower)) {
    return 'draft'
  }

  if (/refine|polish|tweak|优化|调整.*细节|润色/.test(lower)) {
    return 'refine'
  }

  if (/可以了|生成吧|确认生成|就按这个|ready|confirm|looks good/.test(lower)) {
    return 'ready'
  }

  return null
}

export function resolveRequestedStage(args: {
  currentStage: ThinkingStage
  requestedStage: ThinkingStage | null
  thinkingMd: string
}): ThinkingStage | null {
  if (!args.requestedStage) return null
  if (args.requestedStage === args.currentStage) return args.requestedStage
  if (!VALID_TRANSITIONS[args.currentStage].includes(args.requestedStage)) return null

  const pageCount = countPageHeadings(args.thinkingMd)
  if (args.requestedStage !== 'collect' && pageCount === 0) return null
  if (
    (args.requestedStage === 'draft' ||
      args.requestedStage === 'refine' ||
      args.requestedStage === 'ready') &&
    pageCount < 2
  ) {
    return null
  }

  return args.requestedStage
}

export function isRestartRequest(userMessage: string): boolean {
  return /let's start over|start over|从头开始|重新开始/i.test(userMessage)
}

function countPageHeadings(thinkingMd: string): number {
  const matches = thinkingMd.match(/^##\s*Page\s+\d+\s*:/gm)
  return matches ? matches.length : 0
}

function hasNonEmptySection(markdown: string, heading: string): boolean {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const inline = markdown.match(new RegExp(`^##\\s*${escaped}\\s*:\\s*(.+)`, 'm'))
  if (inline?.[1]?.trim()) return true
  const block = markdown.match(new RegExp(`^##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'm'))
  return Boolean(block?.[1]?.trim())
}
