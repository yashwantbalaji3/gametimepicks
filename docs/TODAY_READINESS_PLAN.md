# Today Readiness Plan — 2026-07-13 (Mon)

Verified ET date **2026-07-13**. Answer to "is the site ready for today?": **Yes — honest and safe to serve**,
with the automation still manual. Details below.

## What is actually available today
| sport | today (Jul 13) | site behavior |
|---|---|---|
| MLB | **0 games — All-Star break** (Jul 13–16, resumes Jul 17) | honest "No games today" + "All-Star break; second half resumes Jul 17". Latest board (Jul 11) shown as archive. |
| World Cup | **0 games** — between QF (Jul 11) and SF (Jul 14 & 15) | banner names "Next up · World Cup semifinals (Jul 14 & 15)". QF board reachable as most-recent. |
| UFC | no live card | excluded from products; past-event guard suppresses any finished card. |

So the correct state for today is a **no-games / latest-available** site — which is exactly what it now shows.

## Is a refresh needed today? NO (and it would be near-empty)
- MLB: 0 games → the refresh writes an empty board and skips team markets/sims (Pass-1 guard). Nothing to gain.
- WC: semifinal odds have not posted / are not committed (schedule.json is empty; newest projection is Jul 11).
  Running a WC refresh today would fetch little and burn Odds credits for no live slate.
- **Recommendation: do NOT run a paid refresh today.** Run it **Jul 14 AM** when semifinal fixtures/odds post.

## Public-copy status for today (verified in the built export)
- ✅ Home / Today / MLB / Picks / Moonshot / World Cup: liveness banner "No games today · Mon, Jul 13 · Most
  recent slate: Sat, Jul 11 (2 days ago)"; zero "Live today".
- ✅ `/today` header sub-line now "Latest slate · Saturday, July 11" (was implicitly "today"); `/mlb` eyebrow
  "MLB · latest slate" (safe fixes shipped this pass).
- ✅ MLB All-Star-break note fires. WC semifinals named as next up.
- ⚠️ Residual (non-blocking): the `/today` h1 is still "Today's Picks" and its CTA "Simulate Today's Games"
  (a test-pinned simulate-first brand CTA) sit under the no-games banner. The banner caveats them; a P1 polish
  could soften the CTA on no-games days. Not a launch blocker.

## Settlement today
- **WC July-11 QF settlement: PENDING (blocked).** Committed official scores stop at `official-scores-2026-07-07.json`;
  no official QF box scores in the repo. Do NOT settle without them (would fabricate results). Official 19-14 untouched.
- Nightly settle bot already ran twice overnight (money-clean; regraded non-money results artifacts only).

## What to deploy today
- The current build (this pass) is honest + green → **safe to deploy**. Vercel auto-deploys on push to `main`.
  No manual deploy action needed beyond the push at the end of this mission.

## Priorities
- **P0 (before public traffic):** none outstanding — the stale-as-live risk is resolved; money is locked; no
  fake data. (The site is servable now.)
- **P1 (before broad launch):** add GH Actions secrets so the site self-refreshes/settles; soften the residual
  "today" CTA on no-games days; WC QF settlement once official scores exist.
- **P2 (polish):** homepage `SlateSummary` "today" wording; broader `StatusBadge` rollout.

See `PUBLIC_LAUNCH_READINESS_SCORECARD.md` + `THIS_WEEK_PUBLIC_LAUNCH_PLAN.md`.
