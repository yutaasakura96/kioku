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
  // ⚠️ The **direct** string, never the pooled one: Neon's docs name Drizzle Kit
  // among the tools that need a direct connection (`03` §4.2). ⚠️ This said
  // *the pooled string* until 2026-09-29; the pooled one is the app's. Against
  // production it comes from 1Password through `op run`, never from a file, and
  // `03` §4.2 is the whole release procedure. Used **verbatim as issued** —
  // ADR 0027 is explicit: no `options=endpoint%3D…` rewriting, no hand-edited
  // TLS parameters.
  //
  // ⚠️ drizzle-kit loads the root `.env` on its own (its CLI bundles
  // `dotenv/config`), and a variable already set wins over the file.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // The `auth` schema is Better Auth's, `public` is ours. Both are managed here;
  // naming them keeps drizzle-kit from proposing to drop anything it did not
  // introspect (`04` §8).
  schemaFilter: ['public', 'auth'],
})
