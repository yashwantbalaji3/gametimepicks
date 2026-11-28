# EPL Results Corrections Runbook (Program 162 · Release E)

Scope: the deployed EPL current-results path (`scripts/epl/capture-epl-results.mjs` →
`public/data/soccer/epl/results/latest.json` → `src/lib/soccer/epl-current-results.mjs`), in the
era **before any EPL ledger writer exists**. Nothing in this runbook changes grading behavior; it
documents what the deployed path already does and what must be true before that ever changes.
Every flow below is pinned by `epl-results-hardening.test.mjs`.

## State machine (who flips what)

| State | Meaning | Flipped by |
|---|---|---|
| `NOT_CONFIGURED` | no capture artifact exists | first capture run |
| `PRESEASON` | capture fresh, season not started | the calendar (seasonStart 2026-08-21) |
| `NO_RESULTS_YET` | season started, source fresh, zero completed fixtures | reality supplying the first FT |
| `SOURCE_STALE` | stamps exceed the 36h window | the next successful scheduled capture |
| `RESULTS` | completed fixtures joined + graded | the scheduled capture, automatically |

The scheduled `sport-schedules` run owns every flip. **Never hand-edit the artifact** — a source
failure writes nothing and leaves last-known-good standing; that is the designed behavior, not an
incident.

## Score corrections (latest-wins, memoryless)

The capture is snapshot-latest-only and the adapter is **memoryless**: each read grades exactly
the artifact it is given. A provider score correction is therefore absorbed automatically on the
next capture — the corrected reading replaces the prior one everywhere the adapter is consumed,
and no cached verdict survives (pinned: a 2-0 first reading re-grades as a draw when the artifact
says 2-2).

**Hard acceptance condition for the future:** no EPL ledger writer may ever be added until it
(1) snapshots the exact results artifact it graded from, and (2) records correction lineage when
a later artifact disagrees with a graded reading. The NFL schedule side's dated
snapshot-per-capture pattern is the template. Until then, nothing durable is written, so
corrections are safe by construction.

## Kickoff moves / rescheduled matches

The canonical event identity is kickoff-based. The only fixture capture (openfootball) carries placeholder kickoffs
(for example 15:00Z Saturday slots) and does not refresh them. So a match ESPN plays at another minute has a different
canonical id on its result than on its fixture and on the forecast published for it. That broke grading for 8 of 10
MW10 fixtures (epl-settle REFUSED, 2026-11-11 02:31Z).

Since 2026-11-12 the join has two steps (`app/src/lib/soccer/epl-current-results.mjs`):
1. **Canonical id.** The result's id equals the fixture's id, or its ESPN-confirmed id (`confirmFixtureKickoffs`).
2. **Stable key.** Otherwise, the ONE fixture with the same club pair **and the same home club**, kicking off within
   `PAIR_JOIN_WINDOW_DAYS` (14) of the result, joins with `joinedBy: "CLUB_PAIR_WINDOW"`.
   - Several candidates, a reversed fixture (which would swap the goals), or a move beyond the window still
     **quarantine as unjoined**.
   - Nothing settles on a guess.

The bridged result carries `fixtureEventId`, the id the forecast was published under, and the real `kickoffUtc`. The
grader (`scripts/epl/grade-epl-forecasts.mjs`):
- finds the forecast by either id;
- re-checks "forecast before kickoff" against the **real** kickoff, so a placeholder later than the real time cannot
  admit a post-kickoff forecast;
- records the published id, with `resultEventId` / `joinedBy` / `forecastKickoffUtc` when they differ.

**Frozen forecasts are never rewritten.**

The /epl hub drops a schedule row that is the same match as a forecast row by the same key, and counts it in
`identityReconciliation.placeholderDuplicates`.

If a quarantine persists **more than one full cadence day**, inspect in order:
- the club names against `EPL_CLUB_ALIASES` (committed variants resolve; anything outside the table refuses);
- whether the match was postponed beyond the window;
- whether two same-pair fixtures fall in the window.

## Postponed / abandoned / delayed / in-play rows

Rows in these statuses are excluded **before the join** — even when they carry scores (an
abandoned 2-0 looks settle-able and must not settle). They are not quarantined as defects; they
simply do not count as results. An abandoned match grades only from the official replay or
restitution result when the provider publishes it as FULL_TIME under its own event.
Friendlies can never enter: membership is fixture-capture-gated.

## First-FT day (Aug 21) checklist

The `watch-epl-first-ft` card on /launch carries the observation time. When it fires:

1. `public/data/soccer/epl/results/latest.json` — state flipped `PRESEASON → RESULTS` via the
   scheduled run (check the run log; no manual dispatch).
2. Adapter reconciliation exact: completed = joined + quarantined, expected zero quarantines.
3. `contractCheck` present on each joined row (the FT-only contract exercised at ingest).
4. /sports EPL section's results-tracking line reflects the new state on the next deploy.
5. Record the receipt in the sport assessment (settlement stage evidence) — the stage stays
   PARTIAL until settlement cadence receipts accumulate.
