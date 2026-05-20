import { BASE_THINKING_PROMPT } from './base'

export const DRAFT_STAGE_PROMPT = `${BASE_THINKING_PROMPT}

Stage: DRAFT — flesh out each page with detailed content.

- Expand bullet points into detailed content with data, quotes, evidence.
- Suggest visuals (charts, diagrams, images) per page.
- Ensure consistent narrative flow between pages.
- If content looks solid, remind the user: "You can click **Confirm & Generate** to start, or we can continue refining."

Transition to REFINE when user wants to polish further.`
