# MLB Research Warehouse — ResearchObservation Schema (2026-07-22)

Design of the future, leakage-safe **training warehouse** for the internal MLB pregame research archive. This is the foundation that a LATER, founder-approved, gate-cleared modeling mission will consume. **This document and its scripts do NO modeling, generate NO predictions, and emit NO probability of their own** — the only probability stored is the captured **de-vigged market** probability. Money md5 `affe6b21071f2b3be96bb2774eb347c3` unchanged.

## Purpose

Turn the settled settlement-join artifacts into a flat table of **ResearchObservation** rows — one per settled, pregame-`researchEligible` market lean — so that when the research gate is met (30 dates / 500 settled-eligible observations) a modeling mission can test whether any pregame feature out-predicts the de-vigged market **out of sample**. The market is the benchmark; no feature is "incremental" until it beats the market on held-out data.

## ResearchObservation

Materialized by `app/scripts/build-mlb-research-observations.mjs` → `data/internal/mlb/pregame-archive/research-observations/<date>.jsonl` (internal, `public:false`).

```jsonc
{
  "schemaVersion": "mlb-research-observation-1",
  "public": false, "approvedForProduction": false, "productEligible": false,
  "observationId": "<sha16 of gamePk|player|market|selection|line>",

  "game":   { "gamePk", "date", "homeTeam", "awayTeam", "eventStartTime" },
  "player": { "playerId", "name" } | null,          // null for team markets
  "market": { "key", "kind": "team|player", "selection": "Over|Under|<team>", "line" },

  // LEAKAGE-SAFE pregame inputs — ONLY the freeze-eligible families (captured strictly before first pitch).
  "pregame_features": { "pitcher_status"?, "confirmed_lineup"?, "environment"?, "umpire"? },

  // the captured DE-VIGGED MARKET probability — the benchmark, NOT a model output.
  "market_probability": { "impliedProbability", "noVigProbability", "capturedAt", "researchEligible" },

  // which inputs exist vs. the gaps a future model must contend with.
  "model_inputs_available": {
    "eligibleFamilies": [...], "missingFamilies": [...],
    "hasDeVigMarketProbability": bool, "hasLineupContext": bool, "hasPitcherContext": bool, "hasEnvironmentContext": bool
  },

  // OFFICIAL outcome only (MLB Stats API box score).
  "actual_outcome": { "actual", "source": "MLB Stats API (official)", "finalStatus", "teamOutcome"? },

  "settlement_result": { "status": "win|loss|push", "line", "countsAsSettledEligible": bool },
  "provenance": { "freezeHash", "sourceSnapshotIds", "officialSource", "joinCreatedAt" }
}
```

### Construction rules (enforced + guard-tested)
- **Only settled leans become observations.** `pending` / `ambiguous` / `unsupported` / `unavailable` are excluded (no outcome ⇒ no training row).
- **Leakage-safe:** `pregame_features` are copied from the immutable freeze's eligible families only; `researchEligible` is copied verbatim — a settled outcome can **never** make an ineligible pregame value eligible.
- **Official-only:** `actual_outcome.source` is the MLB Stats API box score; no inferred/unofficial outcomes.
- **Deterministic + idempotent:** rows sorted by `observationId`; re-running with the same inputs is a no-op.
- **countsAsSettledEligible** = `researchEligible && status ∈ {win, loss}` — the unit that counts toward the 500-row gate (pushes are settled but non-decisive; tracked separately).

## Phase 4 — data-quality monitoring

`app/scripts/monitor-mlb-research-quality.mjs` → `status/research-quality.json`. Six checks, each PASS / WARN / FAIL:

| check | flags | severity |
|---|---|---|
| duplicateRows | the same `(gamePk, player, market, selection, line)` twice in a game | FAIL |
| missingOutcomes | a **final** game with a still-`pending` market row | FAIL |
| impossibleStats | an official value out of a generous per-market range (parse-error guard) | FAIL |
| timestampViolations | a `researchEligible` lean/family captured **at/after** first pitch (leakage) | FAIL |
| staleOdds | the freshest lean for a game captured > 26 h before first pitch (never refreshed near game) | WARN |
| joinFailures | a freeze with no join file, or a join with a missing/non-official source | WARN |

Current archive: **all checks PASS** (608 market rows, 0 settled, 100 contextual — clean pending data).

## Phase 5 — research gate (no promotion until met)

`status/latest.json.settlementJoins` + `collectionGate` track, exactly and without inflation:

```
datesCollected              : 2  / 30
settledEligibleRows         : 0  / 500
coverageByMarket            : {} (populates as settled rows accrue)
coverageByFeatureFamily     : { pitcher_status: 24, environment: 12, umpire: 4, confirmed_lineup: 1 }
gateMet                     : false   (blockers: dates 2/30, settled-eligible 0/500)
+ founder approval required before ANY modeling
```

## What exists today vs. what's needed for SimTheGame-style simulation

**Available now:** immutable pregame captures (pitcher status, environment/roof, umpire, thin lineup) with proven timestamps; captured de-vigged market probabilities for 12 deterministic markets; an official settlement join; this warehouse assembler + quality monitor; exact gate accounting.

**Gaps before SimTheGame-style simulation is possible:**
1. **Settled volume** — 0 settled-eligible rows so far; need 500 across ≥30 dates (2026-07-22 is the first market date and is not final yet).
2. **Lineup coverage** — low (single early snapshot per game); a multi-snapshot cadence near first pitch is required for confirmed-lineup features.
3. **Missing families** — bullpen usage and plate-appearance opportunity are defined but not captured (documented gaps).
4. **Full-game state** — SimTheGame-style full-game simulation needs team-level run-scoring inputs and a validated generative model; the current archive is player-prop + team-market pregame states + official outcomes, not a simulator.
5. **Out-of-sample validation** — no feature may be called predictive until it beats the de-vigged market on held-out settled data, after the gate is met and the founder approves.

Until the gate is met and approved, this warehouse only **accumulates and quality-checks** data. No modeling, no predictions, no product/eligibility change.
