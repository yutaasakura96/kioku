// Better Auth's catch-all. `08` §2 and the library's own Nuxt integration page.
//
// ⚠️ **This route is public, and that is not a hole** (`08` §3.3). `/api/auth/**`
// must be reachable unauthenticated or nobody can ever sign in. What protects it
// is not a session check — it is that every path through it that mints an
// identity passes both refusals in `server/utils/auth.ts`, and that neither of
// them can be reached around.
//
// `toWebRequest` is h3's, auto-imported by Nitro. The mount path stays
// `/api/auth/**`, unremapped, for the same reason the four tables are: a rename
// costs the ability to regenerate a configuration and diff it against what is
// deployed.

import { auth } from '../../utils/auth'

export default defineEventHandler(event => auth.handler(toWebRequest(event)))
