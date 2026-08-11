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

The canonical event identity is kickoff-based by design. When a match moves:

1. The result row (new kickoff) no longer matches the committed fixture identity → it
   **quarantines as unjoined**. Nothing settles against a stale kickoff. This is correct, not a
   defect.
2. The next scheduled fixture capture re-captures 380 fixtures; the changed kickoff produces a
   changed snapshot (snapshot-per-capture commits it).
3. The following results capture then joins cleanly and the quarantine clears — **no manual step**.

If the same quarantine persists **more than one full cadence day**, inspect in order: the fixture
capture actually committed (workflow log), the club names against `EPL_CLUB_ALIASES`
(committed variants resolve; anything outside the table refuses — that refusal is membership
protection, never to be "fixed" by loosening the table without a receipt), and whether the match
was postponed rather than moved.

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
