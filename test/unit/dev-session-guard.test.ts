// `npm run dev:session` forges a session, and is safe only because everything
// it touches is local. `scripts/dev-session/guard.ts` is where that is checked,
// and these are its refusals — each one a way the helper could otherwise open
// something that is not a laptop (decision log, 2026-09-25).
import { describe, expect, it } from 'vitest'

import { refusal } from '../../scripts/dev-session/guard'
import type { DevSessionTarget } from '../../scripts/dev-session/guard'

const LOCAL: DevSessionTarget = {
  nodeEnv: undefined,
  vercel: undefined,
  databaseUrl: 'postgres://postgres@127.0.0.1:54329/postgres',
  appUrl: 'http://localhost:3000',
  secret: 'fixture-secret',
  realSecrets: ['a-real-secret-from-dot-env'],
}

describe('the dev-session guard', () => {
  it('lets a local target through', () => {
    expect(refusal(LOCAL)).toBeUndefined()
    expect(refusal({ ...LOCAL, databaseUrl: 'postgres://kioku@localhost/kioku', nodeEnv: 'development' })).toBeUndefined()
    expect(refusal({ ...LOCAL, databaseUrl: 'postgres://kioku@[::1]:5432/kioku' })).toBeUndefined()
  })

  it.each([
    ['a Neon pooled string', 'postgres://kioku:pw@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/kioku?sslmode=require'],
    ['a remote host', 'postgres://kioku@db.example.com:5432/kioku'],
    ['a hostname that merely starts with localhost', 'postgres://kioku@localhost.example.com/kioku'],
    ['a string that does not parse', 'not a url'],
  ])('refuses %s as the database', (_label, databaseUrl) => {
    expect(refusal({ ...LOCAL, databaseUrl })).toMatch(/database URL/)
  })

  it('refuses when NODE_ENV is production', () => {
    expect(refusal({ ...LOCAL, nodeEnv: 'production' })).toMatch(/NODE_ENV is production/)
  })

  it('refuses inside a Vercel runtime or build', () => {
    expect(refusal({ ...LOCAL, vercel: 'production' })).toMatch(/VERCEL/)
  })

  it('refuses the real secret from .env, and an empty one', () => {
    expect(refusal({ ...LOCAL, secret: 'a-real-secret-from-dot-env' })).toMatch(/real one/)
    expect(refusal({ ...LOCAL, secret: '  ' })).toMatch(/empty/)
  })

  it('refuses an app that is not http on localhost', () => {
    expect(refusal({ ...LOCAL, appUrl: 'https://kioku.vercel.app' })).toMatch(/app URL/)
    expect(refusal({ ...LOCAL, appUrl: 'https://localhost:3000' })).toMatch(/app URL/)
  })
})
