// `04-database-schema.md`, as Drizzle. Eighteen tables plus the four the auth
// library owns — the whole schema in one migration set, because the foreign
// keys are interdependent and every table in `04` is touched by milestone 1's
// vertical slice (ADR 0001).
//
// ⚠️ **Drizzle owns every migration and the worker never issues DDL**
// (`03` §4.2). Two toolchains able to alter one schema makes "what shape is this
// table" a question with two answers. The worker reads and writes rows; this
// directory owns what those rows are.
//
// Everything here is generated into SQL by drizzle-kit except the append-only
// trigger on `review_log`, which is a raw SQL migration and **the only trigger
// in the schema** (`04` §14).

export * from './auth'
export * from './personal'
export * from './shared'
