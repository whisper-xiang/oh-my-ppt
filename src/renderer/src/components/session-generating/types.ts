export type GenerationRunStatus = 'running' | 'completed' | 'failed'

export type GenerationPageStatus = 'pending' | 'generating' | 'completed' | 'failed'

export type GenerationPreviewPage = {
  id: string
  pageNumber: number
  title: string
  htmlPath?: string
  pageId?: string
  sourceUrl?: string
  status: GenerationPageStatus
}

export type GenerationLogEvent = {
  text: string
  time?: string
}

export type GenerationStageKey = 'preflight' | 'planning' | 'rendering' | 'validation'
