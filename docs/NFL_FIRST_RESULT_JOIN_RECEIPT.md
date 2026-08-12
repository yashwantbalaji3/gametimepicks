# NFL First-Result Join — Verification Receipt (Program 167 · Release D · 2026-08-12)

The question this release answers: **does the deployed NFL results path handle its first real
final correctly?** It does — by refusing it, for exactly the right reason.

## What reality supplied

The Aug-11 17:40 UTC cadence captured the first completed NFL preseason game of 2026 into
`app/public/data/nfl/results/latest.json`:

| Field | Value |
|---|---|
| Event | Carolina Panthers 33 @ Arizona Cardinals 30 |
| providerEventId | 401873271 |
| Status | STATUS_FINAL · seasonType 1 (preseason) · week 1 |
| Played | 2026-08-07T00:00Z |
| Captured | 2026-08-11T17:40:15Z (scheduled cadence, ESPN scoreboard snapshot) |

## What the join did (run 2026-08-12T18:5x UTC, committed code, real artifacts)

```
state: RESULTS
results: []            ← nothing settled
quarantined: [{ providerEventId: "401873271",
  reason: "no committed schedule capture carries this event id —
           a result without schedule lineage never settles" }]
reconciliation: { completedRows: 1, joined: 0, quarantined: 1, exact: true }
```

**This is the correct outcome, and it is a live proof, not a failure.** Schedule captures began
2026-08-09 with a forward-looking window; the Aug-7 game predates every committed schedule
snapshot, so no PRE-EVENT lineage exists or can ever exist. Backfilling a schedule capture now
would be a post-event reconstruction — exactly what the lineage rule (Sprint 045, proven live in
Sprint 049 for MLB) forbids. The gate fired on the first real final the NFL pipeline ever saw.
The case is pinned as a permanent test in `current-results.test.mjs` so the precedent cannot rot.

401873271 is therefore **permanently unjoinable** — the NFL analogue of MLB's quarantined
2026-07-28: visible, explained, and never settled.

## First JOINABLE final — reality watch (unchanged owner, sharpened clock)

**DET @ CIN, providerEventId 401873272, kicks 2026-08-13T23:00Z.** Its pre-event schedule
lineage already exists in four committed captures (Aug 9/10/11/12) — the union index joins by
provider id, so the final MUST join when it lands. The artifact can only change via the
13:00 UTC `sport-schedules` cadence (observed drift to ~14:11), so the watch now opens
2026-08-14T14:15Z — when evidence CAN exist, not when the game ends.

Verifier (after the Aug-14 cadence commit is pulled):

```
npx tsx -e "import { loadCurrentNflResults } from './src/lib/sports/nfl/current-results.mjs';
console.log(JSON.stringify(loadCurrentNflResults({ nowIso: new Date().toISOString() }), null, 1))"
```

Expected: `state: RESULTS`, `401873272` in `results` with integer scores, seasonType 1
preserved, `reconciliation.exact: true` (the CAR@ARI quarantine row remains, by design, while
it stays in the capture window).

## Edge-case coverage at this receipt's commit

Already pinned by Programs 161–163: id-based join · exactly-once consumption · integer-score
gate · no-lineage quarantine · SOURCE_STALE/NO_RESULTS_YET/NOT_CONFIGURED honesty ·
SCORE_CORRECTION (append-only, review) · STATUS_REGRESSION · DISAPPEARED_UNEXPECTED vs
LEFT_WINDOW · reschedule/metadata drift · tie = explicit moneyline PUSH (1,001-final corpus,
7 ties) · exact-line spread/total PUSH · decisive = W+L only. Added by this release:
STATUS_FINAL_OVERTIME joins as terminal; a tied preseason final joins and PUSHES; the CAR@ARI
lineage refusal pinned as real-data precedent.

No prediction existed for either game — nothing settles into money; this path feeds the private
research ledger only, and `publicActivation` stays OFF.
