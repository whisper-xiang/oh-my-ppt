import type { ThinkingStage } from '@shared/thinking'

export function checkStageTransition(
  currentStage: ThinkingStage,
  thinkingMd: string
): ThinkingStage {
  const pageCount = countPageHeadings(thinkingMd)
  // Match both "## Topic\nxxx" and "## Topic: xxx" formats
  const hasTopic = /^##\s*Topic\b/m.test(thinkingMd) && !/^##\s*Topic\s*:\s*$/m.test(thinkingMd)
  const hasStyleInfo = /^##\s*Style\b/m.test(thinkingMd) && !/^##\s*Style\s*:\s*$/m.test(thinkingMd)

  const outlineReadiness = measureOutlineReadiness(thinkingMd)
  const draftReadiness = measureDraftReadiness(thinkingMd)

  // collect → outline: when topic is set and at least 2 pages outlined
  if (currentStage === 'collect' && hasTopic && pageCount >= 2) {
    return 'outline'
  }

  // outline → draft: when pages have at least basic bullet points (>50 chars per page)
  if (currentStage === 'outline' && pageCount >= 2 && outlineReadiness) {
    return 'draft'
  }

  // draft → refine: when pages are fleshed out with detailed content (>150 chars, half+ pages)
  if (currentStage === 'draft' && pageCount >= 2 && draftReadiness) {
    return 'refine'
  }

  // refine → ready: when style is set and content is complete
  if (currentStage === 'refine' && hasStyleInfo && draftReadiness && pageCount >= 2) {
    return 'ready'
  }

  return currentStage
}

export function detectStageFallback(userMessage: string): ThinkingStage | null {
  const lower = userMessage.toLowerCase()

  if (/let's start over|从头开始|重新开始/i.test(lower)) {
    return 'collect'
  }

  if (/adjust.*outline|change.*structure|调整.*大纲|修改.*结构/i.test(lower)) {
    return 'outline'
  }

  if (/refine|polish|tweak|优化|调整.*细节|润色/i.test(lower)) {
    return 'refine'
  }

  if (/looks good|ready|看起来不错|可以了|没问题/i.test(lower)) {
    return null
  }

  return null
}

function countPageHeadings(thinkingMd: string): number {
  const matches = thinkingMd.match(/^##\s*Page\s+\d+\s*:/gm)
  return matches ? matches.length : 0
}

function splitPageContents(thinkingMd: string): string[] {
  return thinkingMd
    .split(/^##\s*Page\s+\d+\s*:/m)
    .filter((_page, idx) => idx > 0)
    .map((page) => page.trim())
}

/** outline → draft: at least half the pages have basic content (>50 chars) */
function measureOutlineReadiness(thinkingMd: string): boolean {
  const pages = splitPageContents(thinkingMd)
  if (pages.length < 2) return false
  const ready = pages.filter((p) => p.length > 50).length
  return ready >= Math.ceil(pages.length / 2)
}

/** draft → refine: at least half the pages have detailed content (>150 chars) */
function measureDraftReadiness(thinkingMd: string): boolean {
  const pages = splitPageContents(thinkingMd)
  if (pages.length < 2) return false
  const ready = pages.filter((p) => p.length > 150).length
  return ready >= Math.ceil(pages.length / 2)
}
