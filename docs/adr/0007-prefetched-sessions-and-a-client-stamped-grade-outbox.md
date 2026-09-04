# Prefetched sessions and a client-stamped grade outbox

`docs/01-project-brief.md` §2.2 (online-only) is not reopened. Its named failure — forty cards
started on a train, thirty grades lost — is prevented by taking **both** of §4.7's options, because
each is worthless alone: prefetch without an outbox keeps you answering while every grade
evaporates; an outbox without prefetch leaves nothing to answer.

Neither is really a mitigation, which is why it is cheap. A review loop fetching one card per
keystroke would feel bad on a *good* connection, so the queue is prefetched for latency regardless.
A grade that is not durable before the UI acknowledges it is a bug on a perfect connection too — just
a rare one. Offline tolerance is a side effect of building the review loop correctly.

## A grade carries its own timestamp

**A grade is stamped at the moment it is given; the server never stamps a grade on receipt.**

FSRS schedules on elapsed time. A card answered at 09:00 underground and flushed at 18:00, stamped on
receipt, tells the scheduler that recalling the word took nine hours. Every interval derived from it
is silently wrong and the damage surfaces in six months — exactly the failure §2.3 chose FSRS to
avoid. Deciding it now costs one sentence.

## The boundary that keeps §2.2 closed

**The outbox is append-only, single-device, and replays in order. It never merges, and there is no
conflict resolution** — one user, one device, one session at a time. Reviewing the same card offline
on two devices is undefined behaviour, and the answer is "don't". Stating this is what prevents
drift into the local-first sync architecture §2.2 rejected as rewrite-sized.

## Prefetch is bounded by session shape

A prefetch bounded by "everything due" is both a slow load and the thing Duolingo is on the §3 list
for avoiding — a queue with no visible end is what people quit. So the offline mitigation and the
finishable-session feature are the same decision. The size itself is not due yet; that it is bounded,
and bounded by session shape rather than by the network, is.
