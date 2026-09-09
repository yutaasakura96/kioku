import { defineConfig } from 'drizzle-kit'

// ⚠️ **Drizzle owns every migration; the worker never issues DDL** (`03` §4.2),
// and Better Auth never runs one either — its `getMigrations` does not work with
// the Drizzle adapter (verification §2.3), so its four tables are generated into
// `server/db/schema/auth.ts` and land in this flow like everything else.
// That is what makes the one-migration-owner rule true in practice rather than
// by agreement.
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations',
  // ⚠️ The pooled string, used **verbatim as issued** — ADR 0027 is explicit: no
  // `options=endpoint%3D…` rewriting, no hand-edited TLS parameters. The worker
  // uses the direct one and is not a migration consumer (`03` §4.1).
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // The `auth` schema is Better Auth's, `public` is ours. Both are managed here;
  // naming them keeps drizzle-kit from proposing to drop anything it did not
  // introspect (`04` §8).
  schemaFilter: ['public', 'auth'],
})
