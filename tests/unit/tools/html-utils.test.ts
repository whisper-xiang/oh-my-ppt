import { describe, expect, it } from 'vitest'

import { validateHtmlContent } from '../../../src/main/tools/html-utils'

describe('validateHtmlContent animation validation', () => {
  it('allows declarative data-anim stagger delay', () => {
    const result = validateHtmlContent(`
      <div>
        <div data-anim="fade-up" data-anim-delay="stagger(100)">A</div>
        <div data-anim="fade-up" data-anim-delay='stagger(120)'>B</div>
      </div>
    `)

    expect(result.errors).not.toContain(
      '检测到未命名空间的动画调用（animate/stagger/createTimeline），请统一改为 PPT.*'
    )
  })

  it('still rejects unqualified stagger calls in scripts', () => {
    const result = validateHtmlContent(`
      <div>Card</div>
      <script>
        stagger(100)
      </script>
    `)

    expect(result.errors).toContain(
      '检测到未命名空间的动画调用（animate/stagger/createTimeline），请统一改为 PPT.*'
    )
  })
})
