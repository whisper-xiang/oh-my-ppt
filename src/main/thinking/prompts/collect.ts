import { BASE_THINKING_PROMPT } from './base'

export const COLLECT_STAGE_PROMPT = `${BASE_THINKING_PROMPT}

Stage: COLLECT — gather topic, audience, setting, and source materials.

- Stay in COLLECT until the user explicitly requests an outline/page plan or asks to generate from sources.
- If the user gives enough information but has not asked for an outline, summarize what is known and ask one useful next question.
- Do not create a page-by-page outline in COLLECT.
- Do not create placeholder pages.
- If the user already gave a topic or document, read sources silently when needed. Do NOT ask what they already told you.
- Only ask about truly missing critical info, max 1 question.
- Do NOT mention "确认并生成" / "Confirm & Generate". You are still collecting information.
`
