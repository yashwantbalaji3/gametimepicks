# 2026-08-27 — the day the slate did not happen

**Classification: AUTOMATION_MISSED.** Nothing failed. Five scheduled workflows simply never
received their events, and everything downstream of them was fail-closed and correct about it.

## What the visitor saw

At 13:48 ET the homepage read *"Today's slate isn't published yet · Thu, Aug 27"*, *"Most recent
published slate: Wed, Aug 26"*, *"0 events today"*. Seven MLB games were scheduled; the first had
first-pitched at 13:05 ET.

That sentence is not a bug. It is what the site correctly says at 6 AM every morning. There was no
deadline for it to be measured against, so the healthy state and the outage rendered identically —
which is the defect this incident is really about.

## What actually happened

| Workflow | Scheduled (UTC) | 2026-08-27 |
|---|---|---|
| sport-schedules | 13:00 | never fired |
| morning-projections | 13:30 | never fired |
| mlb-daily-production | 14:15 (backstop) | never fired |
| cron-watchdog | 14:30 | never fired |
| daily-products | 15:30 | never fired |

Runs on either side of that band were normal: `mlb-pregame-capture` at 10:53 UTC (success),
`mlb-lineup-refresh` at 10:03 (success), `nightly-settle` at 16:36 (success). This is GitHub's
documented best-effort delivery of `schedule` events, and it is a class this repository has hit
before (Programs 080–083, 172). What was new is that it took out five jobs at once because they
were scheduled within one three-hour window.

`mlb-daily-production` is fail-closed on board presence and did the right thing by not running;
`morning-projections` is the root of the chain and its non-firing is the whole incident.

### The watchdog shared the failure mode

`cron-watchdog` exists to notice that scheduled jobs did not run. It runs at 14:30 UTC — inside the
band. It did not run. Its last artifact was seven days stale and still read `state: OK` for every
sport. A watchdog on a single cron is a single point of failure regardless of how good its logic is.

## Coverage

Recovery ran at 14:11 ET (18:11 UTC), 4h36m after the first missed slot.

| gamePk | Matchup | First pitch (ET) | Outcome |
|---|---|---|---|
| 822694 | COL @ WSH | 13:05 | **MISSED_COVERAGE** — in the 2nd inning at generation |
| 823014 | BAL @ STL | 14:15 | recovered (generated 14:11, 4 minutes pregame) |
| 823503 | HOU @ NYY | 19:05 | recovered |
| 822771 | KC @ TOR | 19:07 | recovered |
| 823581 | MIL @ NYM | 19:10 | recovered |
| 824879 | LAD @ ATL | 19:15 | recovered |
| 823179 | AZ @ SF | 21:45 | recovered |

**6 of 7 recovered. 1 permanently uncovered.** COL @ WSH stays in the day's denominator as
MISSED_COVERAGE on the board, in the full-game artifact (status `unavailable`, every probability
null), in the prediction layer and on /simulate. It was not dropped and it was not backfilled.

A reconstruction is *technically* available — `mlb-pregame-capture` archived a snapshot for 822694
at 10:54 UTC, genuinely before its 17:06 UTC start. It was not built: the pre-event contract
requires a reconstruction to use a distinct path, carry `reconstructed=true`, prove its pre-start
evidence and be excluded by default from research, performance and public-current consumers. That
is a separate piece of work, and doing it inline would have produced exactly the normal-looking
backfill the contract forbids. Filed as ENGINEERING.

### Money and credits

No money artifact was touched. The recovery spent **24 Odds API credits** (6 pregame events × 4
markets); 9,681 remaining, far above the 300 floor. The pre-event boundary saved 4 credits by
refusing to buy a market for a game already in progress — a purchase the old code would have made
and then published.

## What the incident found in our own code

The recovery could not run safely until this was fixed, so it was fixed first (`8bb32bd24`):

**The generator had no pre-event boundary at all.** Running it at 14:00 ET would have priced and
published COL @ WSH exactly like the six games that had not started. `_captured_before_start()` had
existed for weeks — it decorated each row with a `researchEligible` flag and gated nothing. The
refusal is now at two layers (event, before the cost estimate; and row), both failing closed: an
unreadable or missing start counts as started, and equality is not pregame.

Three more surfaced while shipping the fix, each caught by a guard rather than by reading:

- **`/simulate` called the refused game ARTIFACT_READY** and advertised four market families for
  it, because readiness was a slate-level fact (`leans > 0`) that every game on the day inherited.
- **The full-game adapter read `Date.now()`** to word a note, so regenerating a past slate at a
  pinned instant returned different bytes for a game nothing had changed about. A simulation that
  cannot replay cannot be graded.
- **The refusal's first sentence said "not enough pregame lineup data"** — true, since a game under
  way has no posted pregame lineup, and a true statement standing in for the real reason sends a
  reader looking for a gap that does not exist.

## Recurrence guards

- `app/scripts/ops/publication-slo.mjs` + `app/src/lib/ops/publication-slo.mjs` — a deadline derived
  from the earliest eligible start (never a fixed hour) and six states, with UNKNOWN never green.
- `.github/actions/publication-slo/` — the check as a step, riding `mlb-lineup-refresh`,
  `mlb-pregame-capture`, `auto-refresh`, `nightly-settle` and `mlb-daily-production` on their own
  schedules, plus `publication-watchdog.yml` asking seventeen times across the window. On the
  evidence of this very day, `nightly-settle`'s 16:36 UTC run would have caught it.
- Guarded self-recovery: on INCIDENT the action dispatches the generator, at most once per ET day,
  so a dozen detectors on one incident cannot buy the same odds a dozen times.
- `pipeline/mlb/pre_event_boundary_test.py`, `app/src/lib/mlb/full-game/pre-event-boundary.test.mjs`,
  `app/src/lib/ops/publication-slo.test.mjs` — the boundary, the denominator, the determinism and
  every deadline state.

## What is still true after this

GitHub can still drop any individual scheduled event, and nothing in this repository can prevent
that. What changed is that a dropped event no longer produces silence: the day is now late by a
stated deadline, seventeen-plus independent firings can notice, and one of them will re-run the
generator without being asked.
