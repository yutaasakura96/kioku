import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

// The five tiers of `11-testing-plan.md` §1, as five directories.
//
// ⚠️ `test/nuxt/` and `test/e2e/` are separate directories on purpose, not one
// directory with a naming convention: `@nuxt/test-utils/runtime` and
// `@nuxt/test-utils/e2e` need different environments and cannot be used in the
// same file (verification §14.3).
//
// `worker/tests/` is the fifth tier and it is pytest, not Vitest — it is not a
// project here. A laptop without Docker runs the whole TypeScript suite and
// gets three red worker tests, visibly and for a stated reason (ADR 0038).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'schema',
          environment: 'node',
          include: ['test/schema/**/*.test.ts'],
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
        },
      }),
      {
        test: {
          name: 'e2e',
          environment: 'node',
          include: ['test/e2e/**/*.test.ts'],
          // `setup()` builds and boots the app; its own default is 120000.
          testTimeout: 120000,
          hookTimeout: 240000,
        },
      },
    ],
  },
})
