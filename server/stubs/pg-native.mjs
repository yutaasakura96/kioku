// Stands in for `pg-native`, which is optional and not installed
// (`nuxt.config.ts`, `nitro.alias`). ⚠️ It must not throw: the bundler hoists
// `pg`'s lazy `require('pg-native')` to the top of the server, so a throw here
// is a server that does not start. Nothing reads `pg.native`.
export default {}
