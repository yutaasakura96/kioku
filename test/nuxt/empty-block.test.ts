// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import EmptyBlock from '../../app/components/EmptyBlock.vue'

// `05` §7's empty-state block, and the one place it draws no rule (#40).
//
// ⚠️ **The default is the contract.** Every caller in `vet.vue` and
// `review.vue` omits `rule` and relies on it being drawn (`10` §4.5: "the rule
// is the last thing on the screen" is a state's shape). `/auth/refused` alone
// passes `false`, because there the absent rule is the specification (`10`
// §9.2). Flipping the default turns the first case here red, and
// `test/nuxt/review-brake.test.ts`'s *Nothing due* case with it.

function mount(props: Record<string, unknown> = {}) {
  return mountSuspended(EmptyBlock, {
    props,
    slots: {
      statement: () => 'Nothing due.',
      body: () => 'Everything is scheduled.',
    },
  })
}

describe('the rule', () => {
  it('is drawn when the prop is omitted, as every existing caller omits it', async () => {
    const view = await mount()

    expect(view.find('hr.rule').exists()).toBe(true)
  })

  it('is absent with `rule` false', async () => {
    const view = await mount({ rule: false })

    expect(view.find('hr').exists()).toBe(false)
  })
})

describe('the statement', () => {
  it('is a paragraph at the screen-level size by default, with no name line', async () => {
    const view = await mount()

    expect(view.find('p.statement').attributes('class')).toBe('statement')
    expect(view.find('.name').exists()).toBe(false)
  })

  it('can be the page\'s heading, which `/auth/refused` needs', async () => {
    const view = await mount({ tag: 'h1' })

    expect(view.find('h1.statement').text()).toBe('Nothing due.')
  })

  it('takes the ramp row it is given', async () => {
    expect((await mount({ size: 'mark' })).find('.statement').classes()).toContain('mark')
    expect((await mount({ size: 'datum' })).find('.statement').classes()).toContain('datum')
  })
})
