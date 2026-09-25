// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-09',
  devtools: { enabled: true },

  // `05-design-system.md` §§1-6 as custom properties, plus the ground every
  // screen inherits. ⚠️ It is a **stylesheet**, not a script — `noScripts`
  // strips `<script>` and leaves the `<link rel="stylesheet">` alone, which is
  // what lets three client-less *places* be styled at all (`03` §2.1).
  //
  // `05` §4's three faces, self-hosted from `@fontsource` (ADR 0074), one
  // stylesheet per weight the ramp draws and no other. They are stylesheets
  // for the same reason tokens.css is: the `@font-face` rules land in the
  // bundled CSS and the browser fetches only the files a page's text needs.
  // Mincho is 120 `unicode-range` slices a weight, so a page pays for the
  // kanji it shows rather than for the face.
  //
  // ⚠️ **Mincho is global on purpose.** tokens.css' `:lang(ja)` rule gives it
  // to any `lang="ja"` element on any page — the door's 記憶, a *source*'s
  // text — so importing it per component misses pages silently. Its rules
  // cost ~80 KB brotli of CSS, once (ADR 0074 §3).
  // ⚠️ No `<link rel="preload" as="font">`: `/auth/refused` carries no link but
  // its stylesheet (`08` §2.1, `test/e2e/auth.test.ts`).
  css: [
    '@fontsource/shippori-mincho/400.css',
    '@fontsource/shippori-mincho/500.css',
    '@fontsource/shippori-mincho/600.css',
    '@fontsource/newsreader/300.css',
    '@fontsource/newsreader/400.css',
    '@fontsource/newsreader/400-italic.css',
    '@fontsource/newsreader/500.css',
    '@fontsource/ibm-plex-mono/400.css',
    '@fontsource/ibm-plex-mono/500.css',
    '~/assets/css/tokens.css',
  ],

  // The rendering split is enforced by the build, not by discipline — ADR 0013,
  // ADR 0020, `03` §2.1. It is the reason Nuxt was chosen at all.
  //
  // ⚠️ Write `routeRules.noScripts`. `experimentalNoScripts` still exists at
  // v4.5.2 and is deprecated (verification §8).
  //
  // ⚠️ `prerender`, `swr` and `isr` are forbidden on every non-public route.
  // Each is the ordinary advice for a route that renders a form, a list and
  // five numbers, and each turns a session-gated document into a shared
  // artifact (ADR 0030, verification §11.4). `test/unit/route-rules.test.ts`
  // is the guard.
  routeRules: {
    // The three *places* — a form, a list and five numbers. No JavaScript.
    '/': { noScripts: true },
    '/sources': { noScripts: true },
    // ⚠️ One *source*, readable — `09` §1's table. #6 builds the readable half
    // only; the *occurrence* positions, the *notes* and `/sources/:id/delete`
    // are `S11` and arrive with the ticket that owns them. The rule is here
    // because the route is, and a route without one is a default (`10` §3).
    '/sources/**': { noScripts: true },
    '/stats': { noScripts: true },

    // The refusal page: a message and nothing else (`08` §2.1).
    '/auth/refused': { noScripts: true },

    // The two *modes* — client-owned state: a session snapshot, an outbox, a
    // keystroke budget. `ssr: false` is a build-time optimisation only; the
    // server still returns a real document (verification §5.5).
    '/vet': { ssr: false },
    '/review': { ssr: false },

    // The door. Universal, and deliberately so: `authClient` is a client
    // library, and it is the one route that ships JavaScript while being
    // neither a *place* nor a *mode* (`08` §2). Declared rather than defaulted
    // into, so that the exception is visible.
    '/auth': { ssr: true },
  },

  // ⚠️ `features.noScripts` is deliberately absent. It is app-wide, typed
  // 'production' | 'all' | boolean, and applies to everything — *Vet* and
  // *Review* need JavaScript and stripping it globally breaks both (`03` §2.1).
  // The per-route rule above is the whole mechanism.
})
