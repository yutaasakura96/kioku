# Nuxt is the framework, because a route can be made to ship no JavaScript

**The app tier is Nuxt 4.5.2 on Nitro's `node-server` output, in Vue.** ADR 0013 split the five
screens into three server-rendered *places* and two client-owned *modes*, and that split is the
whole requirement here. Nuxt is one of only three candidates that can enforce it rather than
merely permit it. Findings in [`../phase-4-verification.md`](../phase-4-verification.md) §5.

## ADR 0013 turned out to be a real discriminator

Of seven TypeScript frameworks checked, only four document a **per-route SSR switch**, and only
three document a **zero-JavaScript route**. Nuxt is in both sets.

| | Per-route `ssr: false` | Route ships no JS |
| --- | --- | --- |
| **Nuxt** | `routeRules` | **`noScripts`** |
| SvelteKit | `ssr` / `csr` | `csr = false` |
| Astro | `prerender` | zero-JS by default |
| TanStack Start | `ssr: false \| 'data-only'` | — |
| Next.js App Router | — | — |
| React Router 8 | app-wide only | — |
| SolidStart 2 | — | — |

`noScripts` is documented per-route via `routeRules` and omits entry scripts, the import map, the
inlined payload and JS resource hints, keeping CSS. The page never hydrates. **Ingest, Sources and
Stats are a form, a list and five numbers** — ADR 0013 already said their client budget should be
spent elsewhere, and this is the mechanism that spends it nowhere.

Next.js App Router has no route-level switch at all. Under it, ADR 0013's rendering half would be a
convention held by discipline rather than a property of the build.

## This decision is smaller than it looks

Drizzle, Better Auth, `ts-fsrs`, Postgres, the Python worker and every value in
`05-design-system.md` are framework-agnostic. **The Vue decision reaches the five screens and
stops.** A future session should not read "we chose Vue" as having decided more than it did.

## Alternatives considered

**TanStack Start** — the recommendation before the developer's own preference was heard, and it was
the strongest React option: the only one with a per-route SSR switch, and `@tanstack/react-router`
is already in `track-record`. Rejected on two counts. It has no zero-JS guarantee, and ⚠️ **its
stable status could not be confirmed** — npm publishes `1.168.49` as `latest` while the live docs
still carry the release-candidate banner, ~11.5 months after the v1 RC post, with no first-party
stable announcement.

**Next.js 16.3.4** — in four of the developer's repos, the deepest Better Auth integration page,
unambiguously stable. Rejected because it cannot enforce ADR 0013.

**SvelteKit and Astro** — both satisfy the rendering constraint. Not chosen: they are a third and
fourth ecosystem for a solo developer, and Astro self-describes as MPA while naming "logged-in
admin dashboards" as what application frameworks are for, which is exactly what *Vet* and *Review*
are.

## Costs and caveats accepted

- ⚠️ **Nuxt 5 is scheduled for Q4 2026** and each major is supported ≥6 months after the next
  lands. **A major upgrade falls inside the project's first year**, adopted knowingly.
- ⚠️ `routeRules` is labelled **experimental** in the config reference. ADR 0013's mechanism rests
  on it.
- **Navigation to a `noScripts` route is a full document load, in both directions.** Correct for
  three screens that ADR 0013 made *places* with no client state, but it is a page load rather than
  a transition.
- Better Auth has **no official Nuxt module** (four community ones are listed as resources), and its
  Nuxt page never mentions `ssr: false`, `routeRules` or `noScripts`. It documents a real gotcha:
  client actions other than `useSession` **do not forward cookies during SSR**.
- **There is no official Nuxt Docker guide.** The container is ours to write.
- `@vueuse/nuxt` **disables `useStorage` from auto-import** — which is ADR 0014's `localStorage`
  path, so import it explicitly.
- Node `^22.19.0 || ^24.11.0 || >=26.0.0`. Node 20 is out.

## Revisit if

`noScripts` proves not to survive the deployment target (see ADR 0022 — it is untested there), at
which point Nuxt's advantage over the React options narrows to the per-route switch alone and the
decision is worth re-weighing against the two-ecosystem cost.
