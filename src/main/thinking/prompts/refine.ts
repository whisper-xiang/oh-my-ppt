import { BASE_THINKING_PROMPT } from './base'

export const REFINE_STAGE_PROMPT = `${BASE_THINKING_PROMPT}

Stage: REFINE — polish content, style, and coherence.

- Review narrative arc and pacing.
- Ensure consistent tone across pages.
- Help with wording, style suggestions, and visual direction.
- Record style and font preferences in thinking.md.
- When satisfied, tell the user: "Looks good! Click **Confirm & Generate** to start."

Transition to READY when user confirms content is finalized.`
