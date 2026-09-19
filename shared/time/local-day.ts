/**
 * **The project's one notion of *today*** — [ADR 0066](../../docs/adr/0066-the-review-load-has-a-brake.md) §4.
 *
 * ⚠️ **There was no day boundary anywhere in this application before this file**
 * (`00-status.md` § Carrying). Every other rule is an interval between two
 * `timestamptz` values, and that is why the boundary is introduced in one module
 * with its own tests rather than assumed at the two call sites that need it —
 * *consistency* on `/stats` (ADR 0062) and the daily new-*card* allowance
 * ([#21](https://github.com/yutaasakura96/kioku/issues/21)), which is the second
 * importer this file is shaped for.
 *
 * ⚠️ **`date_trunc('day', …)` in UTC is the wrong rule written in the obvious
 * place.** It is a different boundary — midnight, and in the wrong zone — and it
 * is what a session reaching for the shortest SQL will write.
 *
 * ⚠️ **The bucketing is here rather than in SQL because `/stats` has no zone to
 * give the database, not because SQL could not do it.** Postgres `AT TIME ZONE`
 * knows a zone's offset at an instant exactly as `Intl` does, half-hour zones
 * and daylight saving included — so the argument is the missing input and the
 * `11` §8 rule that anything deciding a number belongs in a tested pure module.
 * ⚠️ **An earlier draft of this comment claimed `Intl` was the only thing in
 * either language that could do it. That was asserted from memory and it is
 * false**; `/code-review` caught it, which is the second time this project has
 * shipped a confident sentence next to two measured ones.
 */

/**
 * ⚠️ **04:00, not midnight** (ADR 0066 §4). A run that starts at 23:40 and ends
 * at 00:10 is one sitting to the person doing it, and *consistency* counting it
 * as two days would reward the clock rather than the reader. Anki's default
 * cutoff is the same hour for the same reason.
 */
export const DAY_STARTS_AT_HOUR = 4

/**
 * ⚠️ **The fallback, and it is a real cost rather than a formality.** ADR 0066
 * puts the reader's zone on the *session* request and validates it server-side;
 * `/stats` ships no JavaScript (ADR 0020), so it reads the zone the newest
 * *session* stored (`review_session.zone`, since #21). A reader who has never
 * composed a run from a client that sent one is in UTC, and a reader in Tokyo
 * then has a day boundary at 13:00 local.
 */
export const FALLBACK_ZONE = 'UTC'

/**
 * The zone a client sent, as `Intl` spells it — or `null` for anything that is
 * not one (ADR 0066 §4: *the server validates it*).
 *
 * ⚠️ **Constructed rather than pattern-matched.** There is no useful regular
 * expression for an IANA name, and `Intl`'s own answer is the one that matters,
 * because `Intl` is what every call below uses. Measured 2026-09-18 on Node
 * 24.11.0: `asia/tokyo` resolves to `Asia/Tokyo` and `Etc/UTC` to `UTC`, and
 * `bogus` and `''` throw a `RangeError` — so what is stored is the canonical
 * spelling, and two runs from one laptop do not disagree about the reader's
 * zone by a letter's case.
 *
 * ⚠️ **`null` rather than the fallback**, because the caller stores it: a
 * reader whose client sent nothing has *not reported* a zone, which is
 * different from having reported UTC, and `/stats` reads the newest one that
 * was reported.
 */
export function canonicalZone(zone: unknown): string | null {
  if (typeof zone !== 'string' || zone === '' || zone.length > 64)
    return null

  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).resolvedOptions().timeZone
  }
  catch {
    return null
  }
}

/**
 * `Intl` throws a `RangeError` on a zone it does not know, and the value on the
 * wire is the client's (ADR 0066 §4). A bad one falls back rather than failing
 * the page: the worst a wrong zone can do is shift one reader's own boundary by
 * a few hours, which is not worth a 500.
 */
export function resolveZone(zone: string | null | undefined): string {
  return canonicalZone(zone) ?? FALLBACK_ZONE
}

/**
 * The calendar parts of `instant` as they read on a wall clock in `zone`.
 *
 * `en-CA` is chosen for its ISO-shaped output, but every field is read by name
 * off `formatToParts` rather than parsed out of a formatted string — a locale
 * that decided to render `2026` differently would otherwise be a silent
 * off-by-a-year.
 */
function wallClock(instant: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(instant)

  const field = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)!.value)

  // ⚠️ **`% 24` is belt-and-braces and the measurement says so.** Measured
  // 2026-09-18 on Node 24.11.0 (the pinned interpreter, `.tool-versions`):
  // `hour12: false` with `en-CA` returns `"00"` at 00:30, not `"24"`, and
  // `hourCycle: 'h23'` returns the same. The normalisation is kept because
  // `hour12: false` does not *pin* a cycle the way `hourCycle` does and `24` and
  // `0` are the same instant — but it is defence, not a known engine quirk, and
  // the earlier comment here claimed otherwise from memory.
  return { year: field('year'), month: field('month'), day: field('day'), hour: field('hour') % 24 }
}

/**
 * The key of the local day `instant` falls in — `YYYY-MM-DD`, where the day runs
 * from 04:00 to 04:00.
 *
 * ⚠️ **The shift is applied to the wall clock, never to the instant.** Taking
 * `instant - 4h` and formatting *that* in the zone is the tempting one-liner and
 * it is wrong across a daylight-saving transition, because the offset it picks
 * up is the offset four hours earlier rather than the offset now. Reading the
 * local hour first and then stepping the calendar date back has no such case.
 *
 * ⚠️ **It is a string, and comparing keys is the only comparison to make.** A
 * `Date` for "the start of the local day" would need the zone's offset a second
 * time and would invite arithmetic in the caller.
 */
export function localDayKey(instant: Date, zone: string): string {
  const { year, month, day, hour } = wallClock(instant, zone)

  // Before the cutoff, the reader is still in yesterday's day. `Date.UTC`
  // normalises month and year ends — the 1st of March steps back to the 28th or
  // the 29th without a leap-year branch here.
  const shifted = new Date(Date.UTC(year, month - 1, day - (hour < DAY_STARTS_AT_HOUR ? 1 : 0)))

  return shifted.toISOString().slice(0, 10)
}

/**
 * How many local days the window `[earliest, now]` covers, inclusive of both
 * ends and never more than `cap`.
 *
 * ⚠️ **Inclusive, and that is what makes a single day read `1 / 1` rather than
 * `1 / 0`.** *Consistency* is days studied over days there were to study, and on
 * the first day the reader has been perfectly consistent — the number is
 * suppressed anyway until there have been fourteen of them (ADR 0062), which is
 * what stops that reading a headline of 100%.
 */
export function localDaysBetween(earliest: Date, now: Date, zone: string, cap: number): number {
  const spanned = Math.floor((keyMs(now, zone) - keyMs(earliest, zone)) / DAY_MS) + 1

  return Math.max(1, Math.min(cap, spanned))
}

const DAY_MS = 86_400_000

/**
 * A day key as milliseconds, for the two places that need to count days between
 * keys. ⚠️ **It is a key rendered back as a number, not an instant** — the day
 * it names starts at 04:00 in `zone`, not at this value.
 */
function keyMs(instant: Date, zone: string): number {
  return Date.parse(`${localDayKey(instant, zone)}T00:00:00Z`)
}

/** The distinct local days `instants` fall in. Order is not significant. */
export function distinctLocalDays(instants: Date[], zone: string): Set<string> {
  return new Set(instants.map(instant => localDayKey(instant, zone)))
}

/**
 * The key of the first local day in a window of `days` ending on the local day
 * `now` falls in.
 *
 * ⚠️ **Keys compare lexicographically**, which is why the windowing is a string
 * comparison in the caller rather than a second pass through `Intl`.
 */
export function windowStartKey(now: Date, zone: string, days: number): string {
  return new Date(keyMs(now, zone) - (days - 1) * DAY_MS).toISOString().slice(0, 10)
}
