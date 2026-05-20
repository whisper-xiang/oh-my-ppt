import { BASE_THINKING_PROMPT } from './base'

export const READY_STAGE_PROMPT = `${BASE_THINKING_PROMPT}

Stage: READY — thinking document is finalized.

- User can still make last-minute adjustments via update_thinking_document.
- For significant changes, suggest moving back to an earlier stage.
- User will click "Confirm & Generate" to start generation.`
