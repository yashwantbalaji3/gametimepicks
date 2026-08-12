# NFL Results Corrections Runbook (Program 163 · Release E)

Scope: the deployed NFL results path (capture → `public/data/nfl/results/latest.json` → adapter →
contract) in the era **before any NFL ledger writer exists**. Companion to the EPL runbook; the
sport-specific instrument is `src/lib/sports/nfl/results-monitor.mjs`.

## Detection

Run the monitor over consecutive captures (prior from `git show <ref>:…`, current from the tree).
Classes that REQUIRE REVIEW before anything downstream may consume the newer reading:

| Class | Meaning | Response |
|---|---|---|
| `SCORE_CORRECTION` | a FINAL's score changed between captures | freeze consumption of this event; record an append-only correction receipt (before/after, both capture stamps); only then accept the newer official reading |
| `STATUS_REGRESSION` | final → non-final | treat the earlier "final" as the StatsAPI-class lie; the event returns to ungraded; receipt required |
| `DISAPPEARED_UNEXPECTED` | an event vanished while still inside the trailing window | preserve BOTH source records; investigate provider id churn before trusting either |
| `METADATA_CHANGE` | seasonType/week moved | re-verify season separation (preseason must never blend into regular season) |

`LEFT_WINDOW`, `NEW_EVENT`, `RESCHEDULED`, `BECAME_FINAL`, `UNCHANGED` are expected mechanics.

## Authority and boundaries

- **Protected-money boundary:** NFL results have NO linkage to the paper ledger (19–14 belongs to
  MLB's one settlement writer). No NFL correction can ever touch money — and no NFL ledger writer
  may be created until it snapshots its graded input and records correction lineage (the shared
  acceptance condition from the EPL runbook).
- **Regrade authority:** with no ledger, a correction re-reads through the memoryless adapter and
  the newer official reading wins — after its receipt exists. The receipt is append-only; history
  is never rewritten.
- **Rollback:** the prior artifact state is always recoverable from git (`git show <sha>:app/public/data/nfl/results/latest.json`).

## First-join verification (Aug 13+)

Candidates are DISCOVERED from artifacts, never remembered:
`firstJoinCandidates({ scheduleRows, resultsArtifact, nowIso })` — for the Aug 13 window this
surfaces DET @ CIN (proven in the monitor tests). Acceptance: on the first cadence run after the
game, the final **joins** (does not quarantine), reconciliation is population-exact, and the join
cites the committed schedule row as lineage. The /launch watch card carries the observation time;
the cadence receipt verifier (`scripts/ops/verify-cadence-receipts.mjs`) carries the artifact
check.

## Closure

A correction closes when its append-only receipt exists, the adapter's current reading reflects
the newer official result, the monitor run that detected it is referenced, and — if the event was
ever cited in any assessment evidence — that evidence names the correction.
