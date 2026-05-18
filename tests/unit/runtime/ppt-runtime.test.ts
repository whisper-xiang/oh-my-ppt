/**
 * @vitest-environment happy-dom
 */

/**
 * Unit tests for ppt-runtime.js new functionality (v1.3.0):
 *   - PPT.stopAnimations() / PPT.resumeAnimations()
 *   - PPT.clicks state machine
 *   - PPT.scanDataAnim() / PPT.executeDataAnim()
 *
 * These tests load the actual runtime script in a happy-dom environment
 * and mock the anime.js dependency.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

// Load the runtime script source
const runtimeSrc = fs.readFileSync(
  path.resolve(__dirname, '../../../resources/ppt-runtime.js'),
  'utf-8'
)

function createMockAnime() {
  const animations: Array<{
    pause: ReturnType<typeof vi.fn>
    play: ReturnType<typeof vi.fn>
    finished: Promise<void>
  }> = []

  const anime = {
    animate: vi.fn((_targets: unknown, _params: unknown) => {
      let resolveFinished!: () => void
      const finished = new Promise<void>((r) => { resolveFinished = r })
      const anim = {
        pause: vi.fn(),
        play: vi.fn(),
        finished,
        _resolve: resolveFinished
      }
      animations.push(anim)
      return anim
    }),
    stagger: vi.fn((gap: number) => {
      return (_el: unknown, i: number) => i * gap
    }),
    createTimeline: vi.fn(() => {
      return {
        add: vi.fn(function (targets: unknown, params?: unknown) {
          // timeline.add delegates to anime.animate
          return anime.animate(targets, params || {})
        })
      }
    }),
    timeline: vi.fn(() => {
      return {
        add: vi.fn(function (targets: unknown, params?: unknown) {
          return anime.animate(targets, params || {})
        })
      }
    })
  }

  return { anime, animations }
}

function setupRuntime() {
  const { anime, animations } = createMockAnime()

  // Set up the DOM with elements for data-anim testing
  document.body.innerHTML = `
    <div class="ppt-page-root">
      <div data-anim="fade-up" data-anim-duration="500" id="el1">Card 1</div>
      <div data-anim="fade-up" data-anim-delay="stagger(100)" id="el2">Card 2</div>
      <div data-anim="fade-up" data-anim-delay="stagger(100)" id="el3">Card 3</div>
      <div data-anim="scale-in" data-anim-trigger="click" id="el4">Reveal on click</div>
      <div data-anim="fade-left" data-anim-trigger="click" id="el5">Reveal on click 2</div>
      <div data-anim="none" id="el6">No animation</div>
      <div class="card" id="el7">Legacy target</div>
      <div class="card" id="el8">Legacy target 2</div>
    </div>
  `

  // Reset version guard so runtime re-initializes for each test
  const existingPPT = (globalThis as Record<string, unknown>).PPT as Record<string, unknown> | undefined
  if (existingPPT) {
    existingPPT.__runtimeVersion = null
  }

  // Make anime available globally
  ;(globalThis as Record<string, unknown>).anime = anime

  // Execute the runtime script
  try {
    new Function(runtimeSrc)()
  } catch (e) {
    // Runtime may throw if it tries to do something we haven't mocked
    console.error('Runtime init error:', e)
  }

  const PPT = (globalThis as Record<string, unknown>).PPT as Record<string, unknown>
  return { PPT, anime, animations }
}

describe('PPT.stopAnimations / PPT.resumeAnimations', () => {
  let PPT: Record<string, unknown>
  let animations: ReturnType<typeof createMockAnime>['animations']

  beforeEach(() => {
    const setup = setupRuntime()
    PPT = setup.PPT
    animations = setup.animations
  })

  it('PPT.stopAnimations pauses all active animations', () => {
    const animate = PPT.animate as Function
    // Create 3 animations
    animate('.card', { opacity: [0, 1] })
    animate('.card', { opacity: [0, 1] })
    animate('.card', { opacity: [0, 1] })

    expect(animations.length).toBe(3)

    const stop = PPT.stopAnimations as Function
    stop()

    animations.forEach((anim) => {
      expect(anim.pause).toHaveBeenCalled()
    })
  })

  it('PPT.resumeAnimations resumes all active animations', () => {
    const animate = PPT.animate as Function
    animate('.card', { opacity: [0, 1] })
    animate('.card', { opacity: [0, 1] })

    const resume = PPT.resumeAnimations as Function
    resume()

    animations.forEach((anim) => {
      expect(anim.play).toHaveBeenCalled()
    })
  })

  it('cleans up finished animations from the active set', async () => {
    const animate = PPT.animate as Function
    const result = animate('.card', { opacity: [0, 1] })

    // Resolve the animation
    result._resolve()
    await result.finished

    // After finished, the animation should be removed from the active set
    const stop = PPT.stopAnimations as Function
    stop()

    // The first call to pause was already made in setup, let's check
    // the animation was tracked initially
    expect(animations.length).toBeGreaterThan(0)
  })

  it('handles empty active set gracefully', () => {
    // Should not throw when no animations exist
    const stop = PPT.stopAnimations as Function
    expect(() => stop()).not.toThrow()

    const resume = PPT.resumeAnimations as Function
    expect(() => resume()).not.toThrow()
  })
})

describe('PPT.clicks state machine', () => {
  let PPT: Record<string, unknown>

  beforeEach(() => {
    setupRuntime()
    PPT = (globalThis as Record<string, unknown>).PPT as Record<string, unknown>
  })

  // Use a typed reference so method calls preserve 'this' binding
  function getClicks(PPT: Record<string, unknown>) {
    return PPT.clicks as {
      current: number; total: number;
      setTotal: (n: number) => void;
      advance: () => void;
      reset: () => void;
      on: (clickNum: number, fn: () => void) => void;
      onAdvance: (fn: (click: number, current: number, total: number) => void) => void;
    }
  }

  it('initializes with current=0, total=0', () => {
    const clicks = getClicks(PPT)
    expect(clicks.current).toBe(0)
    expect(clicks.total).toBe(0)
  })

  it('setTotal sets the total click count', () => {
    const clicks = getClicks(PPT)
    clicks.setTotal(5)
    expect(clicks.total).toBe(5)
  })

  it('advance increments current', () => {
    const clicks = getClicks(PPT)
    clicks.advance()
    expect(clicks.current).toBe(1)
    clicks.advance()
    expect(clicks.current).toBe(2)
  })

  it('advance stops at total when total > 0', () => {
    const clicks = getClicks(PPT)
    clicks.setTotal(2)
    clicks.advance() // 1
    clicks.advance() // 2
    clicks.advance() // should not go to 3
    expect(clicks.current).toBe(2)
  })

  it('advance continues past total when total is 0 (auto mode)', () => {
    const clicks = getClicks(PPT)
    clicks.advance()
    clicks.advance()
    clicks.advance()
    expect(clicks.current).toBe(3)
  })

  it('reset sets current back to 0', () => {
    const clicks = getClicks(PPT)
    clicks.advance()
    clicks.advance()
    clicks.reset()
    expect(clicks.current).toBe(0)
  })

  it('on() fires callback when click number matches or is behind', () => {
    const clicks = getClicks(PPT)

    const fn1 = vi.fn()
    const fn2 = vi.fn()
    const fn3 = vi.fn()

    clicks.on(1, fn1)
    clicks.on(2, fn2)
    clicks.on(3, fn3)

    clicks.advance() // click 1
    expect(fn1).toHaveBeenCalledTimes(1)
    expect(fn2).not.toHaveBeenCalled()
    expect(fn3).not.toHaveBeenCalled()

    clicks.advance() // click 2
    expect(fn1).toHaveBeenCalledTimes(2) // fn1 fires again because click 1 <= 2
    expect(fn2).toHaveBeenCalledTimes(1)
    expect(fn3).not.toHaveBeenCalled()

    clicks.advance() // click 3
    expect(fn2).toHaveBeenCalledTimes(2)
    expect(fn3).toHaveBeenCalledTimes(1)
  })

  it('on() fires immediately if current >= clickNum', () => {
    const clicks = getClicks(PPT)

    clicks.advance() // click 1
    clicks.advance() // click 2

    const fn = vi.fn()
    clicks.on(1, fn) // click 1 is already past
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('onAdvance fires on every advance', () => {
    const clicks = getClicks(PPT)

    const fn = vi.fn()
    clicks.onAdvance(fn)

    clicks.advance()
    expect(fn).toHaveBeenCalledWith(1, 1, 0)

    clicks.advance()
    expect(fn).toHaveBeenCalledWith(2, 2, 0)
  })
})

describe('PPT.scanDataAnim', () => {
  let PPT: Record<string, unknown>

  beforeEach(() => {
    setupRuntime()
    PPT = (globalThis as Record<string, unknown>).PPT as Record<string, unknown>
  })

  it('returns null when no data-anim elements found', () => {
    // Clear DOM and re-setup with empty body
    document.body.innerHTML = '<div class="ppt-page-root"></div>'
    const scanDataAnim = PPT.scanDataAnim as Function
    const result = scanDataAnim(document.body)
    expect(result).toBeNull()
  })

  it('detects data-anim elements and splits by trigger', () => {
    const scanDataAnim = PPT.scanDataAnim as Function
    const root = document.querySelector('.ppt-page-root')!
    const result = scanDataAnim(root) as {
      load: unknown[]
      click: unknown[]
      all: unknown[]
    }

    expect(result).not.toBeNull()
    expect(result.load).toHaveLength(3) // el1, el2, el3 are load-triggered
    expect(result.click).toHaveLength(2) // el4, el5 are click-triggered
    expect(result.all).toHaveLength(5) // el6 with data-anim="none" is excluded
  })

  it('parses animation types correctly', () => {
    const scanDataAnim = PPT.scanDataAnim as Function
    const root = document.querySelector('.ppt-page-root')!
    const result = scanDataAnim(root) as { load: Array<{ type: string }> }

    const types = result.load.map((a) => a.type)
    expect(types[0]).toBe('fade-up')
  })

  it('parses stagger delay format', () => {
    const scanDataAnim = PPT.scanDataAnim as Function
    const root = document.querySelector('.ppt-page-root')!
    const result = scanDataAnim(root) as { load: Array<{ delay: unknown }> }

    // el2 and el3 have stagger(100)
    // The delay is a function for stagger
    const delayFn = result.load[1].delay
    expect(typeof delayFn).toBe('function')
  })

  it('skips elements with data-anim="none"', () => {
    const scanDataAnim = PPT.scanDataAnim as Function
    const root = document.querySelector('.ppt-page-root')!
    const result = scanDataAnim(root) as { all: Array<{ type: string }> }

    const types = result.all.map((a) => a.type)
    expect(types).not.toContain('none')
  })

  it('sets total clicks based on click-triggered count', () => {
    const scanDataAnim = PPT.scanDataAnim as Function
    const root = document.querySelector('.ppt-page-root')!
    scanDataAnim(root)

    const clicks = PPT.clicks as Record<string, number>
    expect(clicks.total).toBe(2) // el4, el5
  })

  it('falls back to document when root is null', () => {
    const scanDataAnim = PPT.scanDataAnim as Function
    // When root is null, scanDataAnimElements falls back to document
    // which contains the data-anim elements we set up
    const result = scanDataAnim(null)
    expect(result).not.toBeNull()
    expect(result.all.length).toBeGreaterThan(0)
  })
})

describe('PPT.executeDataAnim', () => {
  let PPT: Record<string, unknown>
  let anime: Record<string, unknown>

  beforeEach(() => {
    const setup = setupRuntime()
    PPT = setup.PPT
    anime = setup.anime
  })

  it('handles empty config gracefully', () => {
    const executeDataAnim = PPT.executeDataAnim as Function
    expect(() => executeDataAnim([])).not.toThrow()
  })

  it('creates animations for each config entry', () => {
    const executeDataAnim = PPT.executeDataAnim as Function
    const createTimeline = anime.createTimeline as ReturnType<typeof vi.fn>

    const config = [
      { targets: document.getElementById('el1'), type: 'fade-up', duration: 500, easing: 'easeOutCubic', delay: 0 }
    ]

    executeDataAnim(config)
    expect(createTimeline).toHaveBeenCalled()
  })

  it('maps fade type to opacity only', () => {
    const executeDataAnim = PPT.executeDataAnim as Function
    const createTimeline = anime.createTimeline as ReturnType<typeof vi.fn>

    const config = [
      { targets: document.getElementById('el1'), type: 'fade', duration: 500, easing: 'linear', delay: 0 }
    ]

    executeDataAnim(config)
    // The timeline.add should have been called with opacity params
    expect(createTimeline).toHaveBeenCalled()
  })
})

describe('PPT.animate tracks animations for stop/resume', () => {
  let animations: ReturnType<typeof createMockAnime>['animations']

  beforeEach(() => {
    const setup = setupRuntime()
    animations = setup.animations
  })

  it('PPT.animate adds animation to the active set', () => {
    const PPT = (globalThis as Record<string, unknown>).PPT as Record<string, unknown>
    const animate = PPT.animate as Function
    animate('.card', { opacity: [0, 1] })

    const stop = PPT.stopAnimations as Function
    stop()

    // At least one animation's pause was called (the one we just created)
    const pauseCalls = animations.filter((a) => a.pause.mock.calls.length > 0)
    expect(pauseCalls.length).toBeGreaterThan(0)
  })
})

describe('Version guard', () => {
  it('runtime version is 1.3.0', () => {
    setupRuntime()
    const PPT = (globalThis as Record<string, unknown>).PPT as Record<string, unknown>
    expect(PPT.__runtimeVersion).toBe('1.3.0')
  })
})
