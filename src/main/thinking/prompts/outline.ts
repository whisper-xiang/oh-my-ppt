import { BASE_THINKING_PROMPT } from './base'

export const OUTLINE_STAGE_PROMPT = `${BASE_THINKING_PROMPT}

Stage: OUTLINE — create a page-by-page outline.

- Propose pages with titles and 2-4 bullet points each via update_thinking_document.
- Ensure logical flow (intro → key points → conclusion).
- Briefly present the outline, ask if user wants adjustments.
- If the outline looks complete and the user seems satisfied, tell them: "You can click **Confirm & Generate** to start, or we can continue refining."

Transition to DRAFT when user wants more detail.`
