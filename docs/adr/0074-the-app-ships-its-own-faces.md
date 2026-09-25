# The app ships its own faces

**Shippori Mincho, Newsreader and IBM Plex Mono are self-hosted from the `@fontsource` packages,
imported as CSS through `nuxt.config.ts`'s global `css` list, one stylesheet per weight `05` §4
draws and no other. Mincho is global too, although its `@font-face` rules are ~80 KB brotli of CSS,
because `tokens.css`' `:lang(ja)` rule gives it to Japanese on any page. No request leaves for a third-party host, no Nuxt module is added, and no
`<link rel="preload" as="font">` is emitted.** This closes the 2026-09-11 "Still open: whether the
app ships its own font files" entry in `06-decision-log.md`.

## The gap this closes

`05` §4 named the three families and called shipping them "a Phase 4 question, not a design-system
one". Phase 4 never answered it. #6 landed the tokens with `05` §4's fallback stacks, so from
2026-09-11 until this ADR **every screen rendered in Georgia and the system serif**, and the
Japanese in whatever Mincho or Gothic the operating system had. The drawn screens were never the
screens anyone saw.

## The decision, and the three options

| Option | What it is | Why not / why |
| --- | --- | --- |
| (a) Google Fonts stylesheet | `<link href="https://fonts.googleapis.com/css2?…">` at runtime | A third-party origin in the critical path of every page, including the three `noScripts` *places*. ADR 0022's move to EC2 or Lightsail has to stay a Nitro preset change plus a `pg_dump`, and a runtime dependency on someone else's host is one more thing that move has to work through. It is also one more origin the reader's requests reach, for an app that holds one reader's data |
| **(b) `@fontsource` packages, imported as CSS** | **The `@font-face` rules and the font files ship inside the build** | **Chosen.** Everything the page needs comes from the app's own origin, with Vite's hashed file names and the same cache headers as the rest of `/_nuxt/`. Nothing is added to the Nuxt module graph |
| (c) `@nuxt/fonts` | A Nuxt module that resolves providers and rewrites CSS | A module beside the pinned Nuxt 4.5.2, whose `noScripts` behaviour was verified without it (verification §8). It is also built to emit `<link rel="preload" as="font">`, which is exactly what `/auth/refused` must not carry (below) |

The decisive reason is the decision log's own leaning (2026-09-11): **self-hosting is the option
that leaves ADR 0022's move untouched.** (b) and (c) both self-host; (b) does it with no module.

## §1 — What is imported

`05` §4's weights table, and nothing else:

| Family | Package | Stylesheets |
| --- | --- | --- |
| Shippori Mincho | `@fontsource/shippori-mincho` | `400.css`, `500.css`, `600.css` |
| Newsreader | `@fontsource/newsreader` | `300.css`, `400.css`, `400-italic.css`, `500.css` |
| IBM Plex Mono | `@fontsource/ibm-plex-mono` | `400.css`, `500.css` |

All three resolved **5.3.0** on 2026-09-25 (`npm view`), all OFL-1.1. `tokens.css` keeps `05` §4's
family names and fallbacks unchanged; the stacks now resolve to their first entry instead of their
last.

⚠️ **Import the weight files, never `japanese-400.css` and its siblings.** The package ships both.
The weight file is the sliced one (§2); the `japanese-*` file is **one 1.39 MB `woff2` per weight**,
the whole face in a single download.

## §2 — Mincho is sliced, which is why this is affordable

Measured 2026-09-25, before committing to it. `@fontsource/shippori-mincho/400.css` is **122
`@font-face` rules**: 120 numbered slices of the Japanese repertoire plus `latin` and `latin-ext`,
each with its own `unicode-range`. It is Google's slicing, not a coarser one — Google's own
stylesheet for the same three weights has **366 faces** (122 × 3), fetched the same day. A browser
downloads only the slices whose ranges the page's text touches.

| Per weight | Size |
| --- | --- |
| All 120 Japanese slices (`woff2`) | 3.67 MB, never downloaded together |
| Median slice | 14 KB |
| The single unsliced `japanese` file | 1.39 MB (not imported) |

## §3 — What a page costs

Measured in Chrome against the built app (`nuxt build`, `node .output/server/index.mjs`) on
2026-09-25, each screen in a fresh browser with an empty cache. `/vet` held one flagged *note*
(経済, its example 日本の経済は回復している。), `/review` one due *card* (図書館, reading prompt) and
`/sources/:id` one word-list *source*. A screen that shows no Japanese loads no Mincho file, even
though Mincho's rules are in its CSS:

| Screen | Faces loaded | Font files | Font bytes |
| --- | --- | --- | --- |
| `/auth/refused` | Newsreader 300, 400 | 2 | 45 KB |
| `/auth` (the door, 記憶) | Mincho 500 ×2 slices; Newsreader 400, 500 | 4 | 67 KB |
| `/` (Ingest), `/sources` | Newsreader 400, 400 italic; Plex Mono 400 | 3 | 62 KB |
| `/stats` | Newsreader 300, 400, 400 italic; Plex Mono 400 | 4 | 85 KB |
| `/sources/:id` | Mincho 400 ×7 slices; Newsreader 400, 400 italic; Plex Mono 400 | 10 | 179 KB |
| `/vet` | Mincho 400 ×9 slices, 500 ×2; Newsreader 300, 400, 400 italic; Plex Mono 400 | 15 | 240 KB |
| `/review` (prompt side) | Mincho 400 ×4 slices; Newsreader 400; Plex Mono 400 | 6 | 100 KB |

No `.woff` fallback was fetched on any screen; the browser takes the `woff2`. Every file is
content-hashed under `/_nuxt/`, so a second *session* pays for new slices only.

⚠️ **The stylesheet is the cost every page pays, and it is chosen.** The `@font-face` rules go into
the entry CSS, which is render-blocking on every route: **407 KB raw, 171 KB gzip, 79 KB brotli**,
against about 1.3 KB before. 366 of the 388 rules are Mincho's (122 × 3 weights), and most of the
bytes are their `unicode-range` lists. The entry CSS is content-hashed, so it is paid once per
build, not once per page.

⚠️ **Splitting Mincho out was built, measured and reverted the same day.** Imported only by
`VetNote.vue` and `ReviewAnswer.vue`, Mincho became its own chunk and the entry CSS fell to 1.5 KB
brotli. **It was wrong**: `tokens.css` sets Mincho through a global `:lang(ja)` rule, precisely so
that a template marks Japanese with `lang="ja"` rather than naming a face. The door's 記憶
(`app/pages/auth/index.vue`) and a *source*'s text (`app/pages/sources/[id].vue`) use it, and on
those pages the split loaded no Mincho, so they fell back to the system Mincho with no test failing.
Keeping Mincho per component would make every `lang="ja"` a place to remember an import. That trap
costs more than 78 KB of cached CSS.

For comparison, Google's stylesheet for the same three Mincho weights is 347 KB raw and 19 KB
brotli, fetched 2026-09-25: its URLs compress better than Vite's hashed ones. So (a) would ship a
smaller stylesheet from a third-party origin, and (b) ships a larger one from the app's own. Both
are hashed or cached, so each is paid once.

⚠️ **The build's static output grows by ~33 MB** (every slice of every imported weight in both
`woff2` and `woff`). That is deploy size, not page weight: nothing downloads a file the page's text
does not need.

⚠️ **For ADR 0022's move: compression is the host's job.** Vercel compresses static assets itself.
`node .output/server/index.mjs` served the entry CSS uncompressed (407 KB) in the measurement above.
The move to EC2 or Lightsail should either put a compressing proxy in front or turn on Nitro's
`compressPublicAssets`; this ADR does neither, because Vercel is where the app runs today.

## §4 — A font preload is a link, and none is emitted

`08` §2.1 and `10` §9.2 require `/auth/refused` to carry no path onward, and
`test/e2e/auth.test.ts` guards it by allowing exactly one kind of `href` in the document:
`rel="stylesheet"`. **A `<link rel="preload" as="font">` is not a navigation, and the test cannot
tell the difference.** This ADR does not widen the test to tell it. A preload would buy a few
hundred milliseconds of `font-display: swap` on a page with one sentence on it, and widening the
assertion means the next reader of that test has to reason about which `href` kinds are
navigations. The page stays link-free.

That is also why (b) and not (c): the `@fontsource` CSS is bundled into the stylesheet the page
already had, so `/auth/refused` still carries exactly one `<link>`, `rel="stylesheet"`, and it
loads Newsreader 300 and 400 (45 KB) and no Mincho. The browser
check confirmed it, and the e2e test still passes.

## §5 — Not a pin

`03` §13.5 lists what a routine bump must not touch. **These three are deliberately not on it**, in
the same sense as `anthropic`: a new release can redraw a glyph or re-cut a slice, and neither
changes a *note*, a security floor or a test database. They are `^5.3.0` in `package.json`.
Renovate's npm manager covers them with no new manager, and one `packageRule` groups them so the
three faces move in one PR rather than three. A **major** release is where the stylesheet paths
(`400.css`, `400-italic.css`) could change, and the build fails loudly if they do.

## What was considered instead

**Subset Mincho to the characters the app uses.** Not possible: the vocabulary is the reader's, and
a word minted tomorrow can contain any kanji. `unicode-range` slicing is the subset that works for
open text.

**Newsreader's variable build (`@fontsource-variable/newsreader`).** Four static weights are ~93 KB
and a page uses two to four of them. A variable file might save bytes on `/sources`. It was not
measured, and `05` §4 draws static weights. It remains a later optimisation, not a reason to hold
this one.

**Write the `@font-face` rules by hand and copy the files into `public/`.** This would drop the
`woff` fallbacks and let the URLs compress better. It also means hand-maintaining 388 rules and
copies of licensed files that nothing would keep current.

## Revisit if

- The entry CSS's 79 KB brotli shows up as a first-paint problem on a real connection. The levers
  are a smaller stylesheet (hand-written rules without the `woff` fallbacks, or unhashed font names
  that compress, which is most of the gap to Google's 19 KB), or a per-page split with a guard that
  fails when a page carrying `lang="ja"` loads no Mincho. Either needs that measurement first.
- The app moves off Vercel (ADR 0022). §3's compression note becomes a task.
- A new *subject* needs a script none of the three faces covers. Then this is a `05` §4 question
  first.
