// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import Vet from '../../app/pages/vet.vue'

// ⚠️ `@nuxt/test-utils/runtime` and `@nuxt/test-utils/e2e` cannot be used in the
// same file — they need different environments (verification §14.3). That is
// why this lives in `test/nuxt/` and the smoke test lives in `test/e2e/`, and
// why the two are directories rather than one naming convention.

describe('the Vet mode resolves its origin', () => {
  it('renders Done pointing at the place the reader came from', async () => {
    const vet = await mountSuspended(Vet, { route: '/vet?from=/sources' })
    expect(vet.find('a').attributes('href')).toBe('/sources')
  })

  it('falls back to Ingest when from is not a place', async () => {
    const vet = await mountSuspended(Vet, { route: '/vet?from=https://evil.com' })
    expect(vet.find('a').attributes('href')).toBe('/')
  })
})
