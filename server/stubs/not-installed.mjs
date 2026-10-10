// Stands in for `@opentelemetry/api`, which is optional and not installed
// (`nuxt.config.ts`, `nitro.alias`). `better-auth` imports it inside a
// `.catch()` and falls back to a no-op, so this fails the way a missing
// package does.
const error = new Error('Cannot find module \'@opentelemetry/api\': optional, and not installed')
error.code = 'MODULE_NOT_FOUND'
throw error
