// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Review from '../../app/pages/review.vue'
import Vet from '../../app/pages/vet.vue'

// ⚠️ **A *mode*'s Done control must be `external`** (ADR 0032, `09` §5.2,
// verification §12.1). A bare `<NuxtLink>` client-renders the *place* into the
// application that is already running and hands the reader a `noScripts` screen
// with a live Vue app on it — with no error anywhere, and no upgrade will ever
// flag it.
//
// ⚠️ **This used to be an e2e browser test and it does not need to be.** It was
// written that way because `00-status.md` § Carrying records that the two forms
// render the same `href`, so the assertion "has to *click* Done rather than read
// its `href`" — which is true, and was read as needing a real document load.
// **Measured 2026-09-09:** a click is enough, and a mounted component can be
// clicked. The two forms are identical in HTML and opposite in one bit:
//
//     external : <a href="/stats">Done</a>   click → defaultPrevented === false
//     bare     : <a href="/stats">Done</a>   click → defaultPrevented === true
//
// `false` is the whole point — the click falls through to the browser and a real
// document arrives, which is what strips the mode's JavaScript. `true` is Vue
// Router intercepting it.
//
// It moved here for a reason that is not tidiness: **#5 gated both *modes***, so
// an e2e request for `/vet` is now a `302` to `/auth` and the browser test could
// no longer reach the control at all. `11` §6.1 is amended.

const MODES = [['/vet', Vet], ['/review', Review]] as const

describe("a mode's Done control leaves the application", () => {
  it.each(MODES)('%s does not intercept the click', async (path, component) => {
    const mode = await mountSuspended(component, { route: `${path}?from=/stats` })
    const done = mode.find('a')

    expect(done.attributes('href')).toBe('/stats')

    // ⚠️ Read from a listener rather than from `trigger`'s return: the flag is
    // only meaningful after Vue Router's own handler has had the event, and
    // asserting on the rendered markup instead would pass against both forms.
    let prevented: boolean | undefined
    done.element.addEventListener('click', event => void (prevented = event.defaultPrevented))
    await done.trigger('click')

    expect(prevented, 'the Done control is a client-side navigation — `external` is missing').toBe(false)
  })
})

describe('a mode resolves its origin', () => {
  // ADR 0032: the origin arrives in a `from` query parameter, so it is a
  // redirect target arriving in a URL. `test/unit/origin.test.ts` carries the
  // attacks on the allowlist itself; these two assert the wiring.
  it.each(MODES)('%s renders Done pointing at the place the reader came from', async (path, component) => {
    const mode = await mountSuspended(component, { route: `${path}?from=/sources` })

    expect(mode.find('a').attributes('href')).toBe('/sources')
  })

  it.each(MODES)('%s falls back to Ingest when from is not a place', async (path, component) => {
    const mode = await mountSuspended(component, { route: `${path}?from=https://evil.com` })

    expect(mode.find('a').attributes('href')).toBe('/')
  })
})
