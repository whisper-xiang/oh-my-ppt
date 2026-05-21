import { BASE_THINKING_PROMPT } from './base'

export const OUTLINE_STAGE_PROMPT = `${BASE_THINKING_PROMPT}

Stage: OUTLINE — create a page-by-page outline.

- Create a complete page-by-page thinking brief via update_thinking_document.
- Every page must have a real title, role, objective, summary, and 2-4 substantive keyPoints.
- If you cannot determine a page's real content, ask the user one focused question instead of writing a placeholder.
- Ensure logical flow (intro → key points → conclusion).
- Passing pages replaces all existing pages. When modifying pages, include the full page list.
- Briefly present the outline, ask if user wants adjustments.
- If the outline looks complete and the user seems satisfied, tell them: "You can click **Confirm & Generate** to start, or we can continue refining."`
