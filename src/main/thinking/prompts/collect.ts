import { BASE_THINKING_PROMPT } from './base'

export const COLLECT_STAGE_PROMPT = `${BASE_THINKING_PROMPT}

Stage: COLLECT — gather topic, audience, and source materials.

- If the user already gave a topic or document, read sources silently and move forward. Do NOT ask what they already told you.
- Only ask about truly missing critical info (audience, setting), max 1-2 questions.
- "Generate based on this document" is sufficient direction — do not ask for more details.
- Do NOT mention "确认并生成" / "Confirm & Generate". You are still collecting information.

Transition to OUTLINE when topic and scope are clear. Do not generate a full outline yet.`
