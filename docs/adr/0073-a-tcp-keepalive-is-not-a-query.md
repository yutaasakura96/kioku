# A TCP keepalive is not a query

**The worker's listening connection sets `keepalives_idle=30`, `keepalives_interval=10` and
`keepalives_count=3`, giving the kernel about sixty seconds to declare a silent peer dead. `03`
§3.1's *no query on a timer* rule is untouched, because a keepalive probe is not a query — and that
distinction was measured rather than argued.**

## The hole this closes, and what is actually wrong with it

[#38](https://github.com/yutaasakura96/kioku/issues/38) was filed as *a listening connection stopped
delivering with nothing raised*. Triaged on 2026-09-23, the incident it was filed on turned out to be
**macOS sleep** — `pmset -g log` puts the machine asleep 21:25:39–21:56:26 JST with two seconds of
full wake in the middle, which is not enough awake time to conclude anything about the listener. The
~315-second `worker.connection_lost` cadence in the log is not a metronome either: one loss fired in
the same second as a DarkWake, and the next worker ran 65 minutes awake with no loss while draining
a job.

**So the evidence was explained and the ticket could have been closed there.** It was not, because
reading `loop.py` afterwards found the mechanism the issue had guessed at sitting in the code in
plain sight:

> While idle with nothing deferred, `serve` issues **no statements at all**. It blocks in
> `connection.notifies(timeout=5)`, which selects on the file descriptor. A socket whose peer has
> vanished without saying so never becomes readable — so the loop waits on it for as long as the
> process runs.

An application learns a socket is dead **on a read or a write**, and this loop's only read is one
that a dead socket never satisfies. That is not a symptom; it is the design, and it was arrived at
honestly — step 6 issues no query precisely so that it cannot become a keepalive.

⚠️ **The failure it produces is the worst shape available**: the worker is running, the job table
fills, and nothing is logged, because nothing went wrong from the loop's point of view.

## Why the clean case was never the problem

The teardown the worker meets a dozen times a day — Neon suspending the compute after five idle
minutes — is **clean**. The server sends something, the descriptor becomes readable,
`PQconsumeInput` fails, and `notifies()` raises. `test_reconnect.py` has proven exactly this since
ADR 0038: a loop blocked in `notifies()` when another session calls `pg_terminate_backend` on it
reconnects and drains. **The psycopg half of this was never in doubt and is already asserted.**

What has no coverage is the *unclean* teardown — the path itself disappearing, with nothing sent
either way. A laptop sleeping, a wifi network changing, a NAT rebinding a mapping it has forgotten.
ADR 0022 chose to run this worker on a laptop, so all three are ordinary here rather than exotic.

## Why this was expensive until it was measured, and then cheap

`03` §3.1 refuses a periodic poll in as many words:

> A periodic query is a keepalive: every connection resets Neon's scale-to-zero timer, so a
> metronome poll would hold the compute awake and spend the month's budget.

That sentence is correct and it is the reason this ticket sat open. It reads as an argument against
*keepalives*, and it is not — it is an argument against *queries*. Two measurements, taken on
2026-09-23, separate them:

| Measured | Result |
| --- | --- |
| Does a keepalive probe reset Neon's scale-to-zero? | **No.** One idle connection probing every 30 s for fifteen minutes, no laptop sleep in the window, and the compute suspended underneath it **twice** — 21:40:30 and 21:45:46, 315.2 s apart, the usual cadence. |
| Is libpq's default-on `keepalives` already doing this? | **No.** It defaults to `1` and leaves the intervals to the OS (PG 18 §32.1: *"A value of zero uses the system default"*); macOS' `net.inet.tcp.keepidle` is **7200000 ms — two hours**. |

The first killed the only objection. The second is why setting the parameters is a real change rather
than a no-op: the keepalive was on the whole time and useless, which is exactly how it escaped notice.

**The budget argument does not reach here, and the rule survives intact.** A probe is a bare TCP
segment the peer's kernel answers without waking Postgres; a query is a statement the compute has to
be awake to run. `03` §3.1 keeps saying *no query on a timer* and this changes nothing about it.

## The parameters, and why they are passed beside the string

```
keepalives=1  keepalives_idle=30  keepalives_interval=10  keepalives_count=3
```

30 + 10 × 3 ≈ **60 seconds** from the last packet to a dead socket, then at most one more 5-second
block before the loop reads the error. The window was chosen against the two intervals that already
exist rather than picked: it must be comfortably longer than the 5 s block, and comfortably shorter
than Neon's ~315 s idle teardown — a detector slower than that detects nothing, because the ordinary
reconnect always gets there first. `test_db.py` asserts both bounds so a routine bump cannot quietly
move the window.

⚠️ **They are keyword arguments to `psycopg.connect`, not text appended to the URL.**
[ADR 0027](0027-psycopg-3-is-the-driver-and-neons-table-is-not-a-support-list.md) forbids editing the
string Neon issued, and the obvious implementation breaks it. psycopg merges keyword arguments into
the conninfo it hands libpq, so `require_direct_url` still returns the string byte for byte.
Measured 2026-09-24, because the merge direction mattered and could plausibly have gone the other
way: a keyword argument **overrides** the same key in the string. That matters more than it looks —
`keepalives=0` in an issued string would disable the other three outright (PG 18 §32.1: each is
*"ignored … if keepalives are disabled"*) and nothing would have failed.

⚠️ **`tcp_user_timeout` says all of this in one parameter and is Linux-only.** It becomes available
on the day ADR 0022's move off the laptop happens, and not before.

## §4 — What is proven, and the one link that is not

This is the part [#38](https://github.com/yutaasakura96/kioku/issues/38)'s triage insisted on, and it
is kept here rather than softened.

| Link | Status |
| --- | --- |
| The three parameters reach the kernel as socket options on macOS | **Measured.** `TCP_KEEPALIVE=30`, `TCP_KEEPINTVL=10`, `TCP_KEEPCNT=3` — first against Neon over the real internet (2026-09-24, macOS 27.0, psycopg 3.3.5 / libpq 18.6), now asserted every run by `test_half_open.py`. This was a real risk: libpq documents each as *"only supported on systems where `TCP_KEEPIDLE` or an equivalent socket option is available … on other systems, it has no effect"*, and macOS spells its equivalent differently. |
| An error on the descriptor surfaces *through* `notifies()` rather than waiting for the next statement | **Measured**, by `test_reconnect.py`, since ADR 0038. |
| A keepalive timeout puts that error on the descriptor | ⚠️ **Not measured.** |

The third link is standard TCP and POSIX — a socket with a pending error becomes readable, and the
read returns `ETIMEDOUT` — but this project's rule is that standard is not the same as checked, and
saying so is cheaper than pretending.

**What would close it, and why it is not in the suite.** A blackholed peer: a local proxy in front of
the endpoint, dropped mid-`LISTEN` while *discarding* packets rather than closing. Dropping a packet
on macOS means `pfctl`, which needs a password and rewrites the machine's firewall — not something to
run unattended, and not something to leave in the repository as a script. ⚠️ **Every cheaper
imitation was considered and each one turns out to be a clean teardown after all**, which is the case
already covered: a proxy that closes sends `RST`; a proxy that merely stops reading is still ACKed by
its own kernel; a killed proxy is closed by the kernel on its way out; and a container whose network
is cut is still ACKed by Docker Desktop's host-side forwarder. The `connection.closed` flag is no
help either — it stayed `False` for fifteen minutes while the compute suspended twice beneath it,
because psycopg's `closed` reflects an explicit close and says nothing about the peer.

⚠️ **The asymmetry is what makes shipping this correct anyway.** If the third link holds, an
indefinite hang becomes a sixty-second one. If it does not, the parameters do nothing and the worker
behaves exactly as it does today. There is no outcome in which this is worse, and that is the whole
argument for not waiting on `pfctl`.

## What was considered instead

**Close #38 as not reproduced.** Defensible — the incident is explained, and
[ADR 0072](0072-a-deferred-job-is-collected-by-a-deadline-the-drain-recorded.md) already covers the
deferred case, since a deferred job now reaches a query on its own deadline and a query on a dead
connection raises. What it leaves standing is a job **notified** while the listener is half-open,
which waits for a teardown that never gets noticed. Closing would have meant closing a ticket whose
mechanism had just been confirmed in the source.

**A periodic poll.** The thing `03` §3.1 refuses, for a reason that is still good.

**Shorten the block timeout.** Nothing to shorten, and it would not help: the block already expires
twelve times a minute and a half-open socket is not readable at any of them. ⚠️ This is the second
time that sketch has been written down and been wrong — see ADR 0072, where the same phrase described
a missing deadline.

**Set them on the app's pooled connection too.** Out of scope and unnecessary: the app's connections
serve HTTP requests, which issue statements, and a statement on a dead connection raises on its own.
This is a property of a connection that sits silent for hours, and the worker owns the only one.

## Revisit if

- The move off the laptop happens (ADR 0022). `tcp_user_timeout` then replaces all three, and a
  server that does not sleep or roam makes the window less interesting.
- A `worker.connection_lost` shows up ~60 s after a sleep or a network change. **That is the third
  link being measured in production** — record it, and this ADR's §4 gets its amendment.
- The detection window is ever wanted below ~15 s. That is short enough to start interacting with
  ordinary packet loss, and the numbers would need an argument rather than a bump.
