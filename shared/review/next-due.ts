/**
 * `10` §5.7's *nothing due* datum — `Tomorrow, 08:40`.
 *
 * ⚠️ **It is a pure module because it decides a number**, which is what
 * `CLAUDE.md` § Related takes from `lfca-lab` and `11` §8 lists as a seam:
 * everything that decides a number lives somewhere testable. The number here is
 * *which day* — and the boundary is a **calendar** one rather than a
 * twenty-four-hour one. A *card* due at 08:40 tomorrow is `Tomorrow` whether it
 * is asked at 23:00 tonight (nine hours away) or at 07:00 tomorrow (one hour
 * away), because the reader reads a date and not a duration.
 *
 * ⚠️ **A rounded difference in milliseconds is the wrong arithmetic and it is
 * wrong twice a year.** `(due − now) / 86_400_000` crosses a daylight-saving
 * boundary as 23 or 25 hours, so an hour of the year would read `Today` for
 * tomorrow. The comparison is between the two local midnights.
 *
 * ⚠️ **`Today` is reachable and is not a bug.** `04` §11's due query and this
 * screen ask at different instants, and a *card* due in four minutes is genuinely
 * due today — the reader is being told to come back after lunch, which is
 * exactly what `10` §5.7's "when the next *card* is due" is for.
 */

/** The formatted datum, or `null` when there is no next *card*. */
export function nextDueLabel(due: Date | null, now: Date = new Date()): string | null {
  if (!due || Number.isNaN(due.getTime()))
    return null

  const time = due.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const days = Math.round((midnight(due) - midnight(now)) / 86_400_000)

  if (days <= 0)
    return `Today, ${time}`

  if (days === 1)
    return `Tomorrow, ${time}`

  const date = due.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return `${date}, ${time}`
}

/** Local midnight, so the difference is in calendar days rather than in hours. */
function midnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}
