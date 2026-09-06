# Five interaction states is not a set, and a screen with no client has three

**Hover, active, disabled, loading and error are not one list applied everywhere. Ingest, Sources and
Stats ship no JavaScript, so they have hover, active and focus and nothing else: their loading state
is the browser's, and their error state is a re-rendered document. *Vet* and *Review* have loading
and error as real states because they have clients. And no screen in v1 has a disabled control.**

`05-design-system.md` §8 left all five undrawn and said they "want deciding against a screen rather
than in the abstract". This is that, and the answer turns out to be that the question was shaped
wrongly: there is no fifth state to draw for three of the five screens.

## Loading and error are client concepts, and three screens have no client

`03` §2.1 puts `routeRules: { noScripts: true }` on Ingest, Sources and Stats. There is no code
running on those pages, which means:

- **There is no moment at which the page knows it is waiting.** Between the press and the next
  document, the *browser* is the thing that knows — its own progress indication, its own spinner in
  the tab. Drawing a loading state for a page that cannot enter one produces chrome that is either
  never shown or, worse, shown by a fragment of JavaScript added later to make the spec true.
- **An error is already specified as a document.** `09` §4.2 answers an over-cap paste with `200`
  and the form re-rendered, text intact, because a `303` would throw away a paste the reader cannot
  get back. That is not a component in an error *state*; it is a different render of the page, and
  it is styled with the type and rule tokens the system already has.

So the honest specification for the three *places* is three states — hover, active, focus — plus the
statement that the other two belong to the browser and to the server. **A blanket five-state rule
would invent chrome three screens are structurally incapable of showing**, and inventing it is how a
future session concludes the screens are unfinished and adds a client to finish them.

*Vet* and *Review* are the opposite case and get both states for real: *Vet* fetching the head of the
queue, *Review* composing a *session* (`09` §4.7 step 2), and both failing. The door, `/auth`, is a
third case again — it ships JavaScript for one button (`08` §2), so it has a loading state and its
error state is a whole route, `/auth/refused`.

## Disabled does not exist in v1, and that is a decision rather than an omission

Every control in the application is pressable at all times:

- The two start controls are **never disabled** — ADR 0032 spent its own argument on this, because a
  disabled entrance makes PRD §4's written empty states unreachable.
- The Ingest form's submit is always live; validation is server-side and answers with a re-render.
- The delete confirmation's `POST`, the export link, the four grade controls, Done, and "Start
  another session" have no condition under which they cannot be pressed.

The *session*-size knob is the one near miss, and it is a bounded input rather than a disabled
control (`04` §7.6, 1–200): out-of-range shows the clamped value and says so.

So **`--k-disabled` is not a token, and the system says why rather than leaving a gap.** ADR 0024
established that this palette is short of greys; spending one on a state nothing is in would be the
worst available use of the last band.

## Hover and active spend no new tokens, because the system already has the two faces they need

The canvas drew exactly one hover — link text moving from `--k-accent` to `--k-accent-hover` — and
`05` §2 records it as "the only hover state anywhere on the canvas". The rule generalises without
inventing a value:

- **A resting control on `--k-raised` takes `--k-key-face` on hover.** That token already means "the
  unpressed key cap", which is precisely the thing a control under the pointer is about to become.
  It is a 16/255 darkening — visible, and quieter than a border change.
- **On press it takes the inverted treatment** — `--k-ink-ground` face, `--k-on-ink` ink — which
  already means "this one is chosen", in the primary control and the selected grade control.
- **An inverted control has nothing darker to go to, so its hover moves its ink**, not its face: the
  key hint brightens from `--k-on-ink-quiet` to `--k-on-ink`. It gets **no** active state, because
  every inverted control in the application navigates or submits immediately and the press is
  confirmed by what happens next.

No new token, and each borrowed token keeps a meaning it already had.

## Alternatives considered

**Specify all five for all five screens** — rejected above. Three of the screens cannot show two of
the states, and writing them down anyway makes the specification a to-do list for adding a client.

**Add a small progress indication to the three *places* with a `<meta http-equiv="refresh">` or a
sliver of inline script** — rejected twice over. `09` §2 already refuses a meta refresh on Ingest
because it would destroy a paste in progress, and a sliver of script on a `noScripts` route is the
route rule failing silently, which is the exact failure `03` §2.1 exists to prevent.

**Define a disabled token now, unused, so it exists when needed** — rejected. An unused token is a
value nobody measured against a screen, which is the thing `05` §8 was written to prevent, and the
palette's remaining headroom is a scarce resource per ADR 0024.

**A neutral grey hover rather than `--k-key-face`** — rejected for the same reason ADR 0025 rejected
a neutral focus ring: it needs a new value to express a meaning an existing token already carries.

## What it costs

**The specification is asymmetric, and it will read like an oversight to anyone who has not read
`03` §2.1.** Three screens with three states and two screens with five looks like an unfinished
table. It is written as a table *with the reason in it* for that reason.

And **hover borrows two tokens whose names now under-describe them.** `--k-key-face` means "the
unpressed key cap" and also "a control under the pointer"; `--k-ink-ground` means "chosen" and also
"being pressed". Both readings are consistent, but the token names no longer say everything the
tokens do.

## Revisit if

A *place* ever gains a client — at which point loading and error stop being the browser's and the
server's, and this ADR's central premise is gone rather than weakened. The place that would go first
is Ingest, if watching an *ingestion* without reloading turns out to matter more than the paste
`09` §2 protects.
