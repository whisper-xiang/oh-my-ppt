/**
 * Prompt builders for AI-assisted presentation brief generation.
 *
 * Called after the user fills in the creation form (topic, pageCount, style, outlineRule).
 * The LLM produces a structured briefText that the user can review/edit before session creation.
 */

export function buildBriefGenerationSystemPrompt(): string {
  return [
    'You are a professional presentation-planning assistant.',
    'Your task is to produce a structured "briefText" that will later guide a PPT generation engine.',
    '',
    'Output rules:',
    '- Return a plain-text briefText only. Do NOT wrap it in JSON or Markdown code fences.',
    '- Determine the output language from the topic and document context.',
    '  • If the topic or document context is primarily Chinese, write briefText in Chinese.',
    '  • If the topic or document context is primarily English, write briefText in English.',
    '- Use the appropriate section labels for the chosen language:',
    '  Chinese: 演示目标、受众/场景、核心观点、建议大纲、每页要点、必须保留的事实/指标/术语、风格/表达要求',
    '  English: Presentation goal, Audience/context, Core argument, Recommended outline, Per-page points, Facts/metrics/terms to preserve, Style or expression notes',
    '- The recommended outline must have exactly the specified number of pages.',
    '  "每页要点" / "Per-page points" must list one entry per page, matching that count.',
    '- If an outline rule is provided under "## 大纲结构规则", you MUST follow it strictly:',
    '  honour every fixed-page constraint when producing the recommended outline and per-page points.',
    '- Keep proper nouns, statistics, technical terms, and quoted text in their original form.',
    '- Do not invent data that is absent from both the topic and the document context.'
  ].join('\n')
}

export function buildBriefGenerationUserPrompt(args: {
  topic: string
  pageCount: number
  styleLabel: string
  outlineRulePrompt?: string
  documentContext?: string
}): string {
  const lines: string[] = []

  lines.push(`## 演示主题`, args.topic, '')
  lines.push(`## 页数`, String(args.pageCount), '')
  lines.push(`## 风格方案`, args.styleLabel, '')

  if (args.outlineRulePrompt) {
    lines.push('## 大纲结构规则（必须严格遵循）', args.outlineRulePrompt, '')
  }

  if (args.documentContext) {
    lines.push(
      '## 文档内容摘要（来自用户上传文档，作为内容来源）',
      args.documentContext.slice(0, 8000),
      ''
    )
  }

  lines.push(
    '## 任务',
    `请基于以上信息，生成一份结构化的演示 brief，页数固定为 ${args.pageCount} 页。`,
    '必须包含：演示目标、受众/场景、核心观点、建议大纲（${args.pageCount}条）、每页要点（${args.pageCount}条）、风格/表达要求。',
    '若有大纲结构规则，建议大纲和每页要点必须与之保持一致。',
    '直接输出 briefText 正文，不要包裹 JSON 或代码围栏。'
  )

  return lines.join('\n')
}
