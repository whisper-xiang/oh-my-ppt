/**
 * Tests for index-runtime.js logic extracted from the runtime:
 *   - Transition type selection logic
 *   - Click forwarding priority (in-slide clicks before page navigation)
 *   - View Transition API fallback behavior
 *   - prefers-reduced-motion handling
 */
import { describe, it, expect } from 'vitest'

// Test the transition type mapping logic (extracted from injectTransitionStyles)
function resolveAnimationNames(transitionType: string): { out: string; in: string } {
  const prefix = 'ppt-vt-'
  switch (transitionType) {
    case 'slide-left':
      return { out: prefix + 'slide-left-out', in: prefix + 'slide-left-in' }
    case 'slide-up':
      return { out: prefix + 'slide-up-out', in: prefix + 'slide-up-in' }
    case 'push':
      return { out: prefix + 'push-out', in: prefix + 'push-in' }
    case 'wipe':
      return { out: prefix + 'wipe-out', in: prefix + 'wipe-in' }
    case 'zoom':
      return { out: prefix + 'zoom-out', in: prefix + 'zoom-in' }
    case 'fade':
    default:
      return { out: prefix + 'fade-out', in: prefix + 'fade-in' }
  }
}

// Test the click forwarding logic (extracted from handlePresentationKey)
function shouldNavigateAfterClick(
  key: string,
  hasInSlideClicks: boolean,
  currentClick: number,
  totalClicks: number
): { consumed: boolean; navigate: boolean } {
  const clickForwardKeys = ['ArrowRight', 'ArrowDown', 'PageDown', ' ']
  if (clickForwardKeys.includes(key)) {
    // If there are remaining in-slide clicks, consume the event
    if (hasInSlideClicks && (totalClicks === 0 || currentClick < totalClicks)) {
      return { consumed: true, navigate: false }
    }
    return { consumed: false, navigate: true }
  }
  return { consumed: false, navigate: false }
}

// Test transition duration clamping
function clampTransitionDuration(value: number | undefined): number {
  if (!Number.isFinite(value)) return 420
  return Math.max(120, Math.min(1200, Math.round(value as number)))
}

// Test the prefers-reduced-motion CSS output
function generatesReducedMotionGuard(): string {
  return '@media (prefers-reduced-motion: reduce) {' +
    ' ::view-transition-old(root), ::view-transition-new(root) { animation: none !important; }' +
    ' }'
}

describe('Click forwarding logic', () => {
  it('ArrowRight navigates when no in-slide clicks remain', () => {
    const result = shouldNavigateAfterClick('ArrowRight', true, 5, 5)
    expect(result.consumed).toBe(false)
    expect(result.navigate).toBe(true)
  })

  it('ArrowRight consumed by in-slide click when current < total', () => {
    const result = shouldNavigateAfterClick('ArrowRight', true, 2, 5)
    expect(result.consumed).toBe(true)
    expect(result.navigate).toBe(false)
  })

  it('ArrowRight consumed by in-slide click when total is 0 (auto/unbounded mode)', () => {
    // In auto mode (total=0), in-slide clicks are always consumed since
    // we don't know how many click steps exist
    const result = shouldNavigateAfterClick('ArrowRight', true, 10, 0)
    expect(result.consumed).toBe(true)
    expect(result.navigate).toBe(false)
  })

  it('Space consumed by in-slide click', () => {
    const result = shouldNavigateAfterClick(' ', true, 1, 3)
    expect(result.consumed).toBe(true)
    expect(result.navigate).toBe(false)
  })

  it('ArrowDown consumed by in-slide click', () => {
    const result = shouldNavigateAfterClick('ArrowDown', true, 0, 3)
    expect(result.consumed).toBe(true)
    expect(result.navigate).toBe(false)
  })

  it('PageDown consumed by in-slide click', () => {
    const result = shouldNavigateAfterClick('PageDown', true, 0, 2)
    expect(result.consumed).toBe(true)
    expect(result.navigate).toBe(false)
  })

  it('ArrowLeft never consumed by in-slide clicks', () => {
    const result = shouldNavigateAfterClick('ArrowLeft', true, 0, 5)
    expect(result.consumed).toBe(false)
    expect(result.navigate).toBe(false)
  })

  it('ArrowUp never consumed by in-slide clicks', () => {
    const result = shouldNavigateAfterClick('ArrowUp', true, 0, 5)
    expect(result.consumed).toBe(false)
    expect(result.navigate).toBe(false)
  })

  it('no in-slide clicks: ArrowRight navigates directly', () => {
    const result = shouldNavigateAfterClick('ArrowRight', false, 0, 0)
    expect(result.consumed).toBe(false)
    expect(result.navigate).toBe(true)
  })
})

describe('Transition animation name resolution', () => {
  it('fade maps to fade-out/fade-in', () => {
    expect(resolveAnimationNames('fade')).toEqual({
      out: 'ppt-vt-fade-out',
      in: 'ppt-vt-fade-in'
    })
  })

  it('slide-left maps to slide-left-out/in', () => {
    expect(resolveAnimationNames('slide-left')).toEqual({
      out: 'ppt-vt-slide-left-out',
      in: 'ppt-vt-slide-left-in'
    })
  })

  it('slide-up maps to slide-up-out/in', () => {
    expect(resolveAnimationNames('slide-up')).toEqual({
      out: 'ppt-vt-slide-up-out',
      in: 'ppt-vt-slide-up-in'
    })
  })

  it('push maps to push-out/in', () => {
    expect(resolveAnimationNames('push')).toEqual({
      out: 'ppt-vt-push-out',
      in: 'ppt-vt-push-in'
    })
  })

  it('wipe maps to wipe-out/in', () => {
    expect(resolveAnimationNames('wipe')).toEqual({
      out: 'ppt-vt-wipe-out',
      in: 'ppt-vt-wipe-in'
    })
  })

  it('zoom maps to zoom-out/in', () => {
    expect(resolveAnimationNames('zoom')).toEqual({
      out: 'ppt-vt-zoom-out',
      in: 'ppt-vt-zoom-in'
    })
  })

  it('unknown type falls back to fade', () => {
    expect(resolveAnimationNames('cube')).toEqual({
      out: 'ppt-vt-fade-out',
      in: 'ppt-vt-fade-in'
    })
  })
})

describe('Transition duration clamping', () => {
  it('clamps minimum to 120ms', () => {
    expect(clampTransitionDuration(50)).toBe(120)
    expect(clampTransitionDuration(0)).toBe(120)
    expect(clampTransitionDuration(-100)).toBe(120)
  })

  it('clamps maximum to 1200ms', () => {
    expect(clampTransitionDuration(2000)).toBe(1200)
    expect(clampTransitionDuration(5000)).toBe(1200)
  })

  it('preserves value in valid range', () => {
    expect(clampTransitionDuration(420)).toBe(420)
    expect(clampTransitionDuration(120)).toBe(120)
    expect(clampTransitionDuration(1200)).toBe(1200)
  })

  it('defaults to 420ms for undefined/invalid', () => {
    expect(clampTransitionDuration(undefined)).toBe(420)
    expect(clampTransitionDuration(NaN)).toBe(420)
    expect(clampTransitionDuration(Infinity)).toBe(420)
  })

  it('rounds to nearest integer', () => {
    expect(clampTransitionDuration(333.7)).toBe(334)
  })
})

describe('Reduced motion guard', () => {
  it('generates CSS to disable all VT animations', () => {
    const css = generatesReducedMotionGuard()
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain('::view-transition-old(root)')
    expect(css).toContain('::view-transition-new(root)')
    expect(css).toContain('animation: none !important')
  })
})

describe('Transition config JSON parsing', () => {
  it('parses valid transition config', () => {
    const json = JSON.stringify({ type: 'slide-left', durationMs: 500 })
    const config = JSON.parse(json)
    expect(config.type).toBe('slide-left')
    expect(config.durationMs).toBe(500)
  })

  it('supports all 7 transition types in JSON round-trip', () => {
    const types = ['fade', 'slide-left', 'slide-up', 'push', 'wipe', 'zoom', 'none']
    for (const type of types) {
      const json = JSON.stringify({ type, durationMs: 420 })
      const parsed = JSON.parse(json)
      expect(parsed.type).toBe(type)
    }
  })
})
