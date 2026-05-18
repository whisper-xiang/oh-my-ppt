/**
 * Maps declarative data-anim animation configs to PPTX SMIL XML
 * for native PowerPoint animation round-trip.
 *
 * Supported animation types and their SMIL equivalents:
 *   fade      → fade entrance
 *   fade-up   → fly-in from bottom + fade
 *   fade-down → fly-in from top + fade
 *   fade-left → fly-in from left + fade
 *   fade-right→ fly-in from right + fade
 *   scale-in  → zoom entrance
 *   slide-up  → fly-in from bottom
 *   slide-left→ fly-in from left
 *
 * Complex timelines, spring easing, and custom PPT.animate() scripts
 * are NOT mapped — they fall back to static screenshot export.
 */

export type SmilAnimType =
  | 'fade'
  | 'fade-up'
  | 'fade-down'
  | 'fade-left'
  | 'fade-right'
  | 'scale-in'
  | 'slide-up'
  | 'slide-left'

export interface SmilElementAnim {
  spid: number // shape ID in the slide XML
  type: SmilAnimType
  duration: number // ms
  delay: number // ms
  order: number // sequence index within slide
}

export interface SmilSlideTiming {
  elements: SmilElementAnim[]
}

const SMIL_EFFECT_MAP: Record<SmilAnimType, { preset: string; filter?: string }> = {
  fade: { preset: 'fade', filter: 'fade' },
  'fade-up': { preset: 'fly-in-bottom', filter: 'fade' },
  'fade-down': { preset: 'fly-in-top', filter: 'fade' },
  'fade-left': { preset: 'fly-in-left', filter: 'fade' },
  'fade-right': { preset: 'fly-in-right', filter: 'fade' },
  'scale-in': { preset: 'zoom-in' },
  'slide-up': { preset: 'fly-in-bottom' },
  'slide-left': { preset: 'fly-in-left' }
}

const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main'
}

let _nextNodeId = 1000

export function resetSmilNodeId(startAt = 1000): void {
  _nextNodeId = startAt
}

function nextNodeId(): number {
  _nextNodeId += 1
  return _nextNodeId
}

/**
 * Build a <p:timing> block for a slide from a list of element animations.
 * Each element gets its own <p:animEffect> inside a <p:seq> container.
 *
 * Returns the complete <p:timing>...</p:timing> XML string.
 */
export function buildSlideTiming(timing: SmilSlideTiming): string {
  if (!timing.elements || timing.elements.length === 0) return ''

  const nodeId = nextNodeId()
  const children = timing.elements
    .sort((a, b) => a.order - b.order)
    .map((anim, index) => {
      const effect = SMIL_EFFECT_MAP[anim.type]
      if (!effect) return ''

      const animNodeId = nextNodeId()
      const durMs = Math.max(100, Math.min(5000, anim.duration))
      const delayMs = Math.max(0, anim.delay)

      const filterAttr = effect.filter
        ? `\n                <p:animEffect transition="in" filter="${effect.filter}">`
        : `\n                <p:animEffect transition="in">`

      return `${filterAttr}
                  <p:cTn id="${animNodeId}" dur="${durMs}">
                    <p:stCondLst>
                      <p:cond delay="${delayMs}"/>
                    </p:stCondLst>
                  </p:cTn>
                  <p:target>
                    <p:spTgt spid="${anim.spid}"/>
                  </p:target>
                </p:animEffect>`
    })
    .filter(Boolean)
    .join('\n')

  if (!children) return ''

  return `<p:timing>
    <p:tnLst>
      <p:seq concurrent="0" nextAc="seek">
        <p:cTn id="${nodeId}" dur="indefinite">
          <p:childTnLst>
${children}
          </p:childTnLst>
        </p:cTn>
      </p:seq>
    </p:tnLst>
  </p:timing>`
}

/**
 * Build a <p:transition> element for slide-level transitions.
 */
export function buildSlideTransition(
  type: 'fade' | 'push' | 'wipe' | 'cover' | 'uncover' | 'dissolve' | 'none',
  durationMs?: number
): string {
  if (type === 'none') return ''

  const transitionMap: Record<string, string> = {
    fade: 'fade',
    push: 'push',
    wipe: 'wipe',
    cover: 'cover',
    uncover: 'uncover',
    dissolve: 'dissolve'
  }

  const spd = transitionMap[type] || 'fade'
  const dur = Math.round(Math.max(100, Math.min(5000, durationMs || 400)))

  return `<p:transition spd="${spd}" dur="${dur}" advClick="1"/>`
}

/**
 * Map our internal transition types to PPTX native transition names.
 */
export function mapTransitionToPptx(
  type: string
): 'fade' | 'push' | 'wipe' | 'cover' | 'uncover' | 'dissolve' | 'none' {
  const mapping: Record<string, 'fade' | 'push' | 'wipe' | 'cover' | 'uncover' | 'dissolve'> = {
    fade: 'fade',
    'slide-left': 'push',
    'slide-up': 'push',
    push: 'push',
    wipe: 'wipe',
    zoom: 'dissolve'
  }
  if (type === 'none') return 'none'
  return mapping[type] || 'fade'
}
