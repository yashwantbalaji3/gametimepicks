# Runbook — Parlay Engine & Conditional Launch Workflow

_The methodology → eligible-leg → parlay → dual Bank Builder pipeline. Honest + gated: never forces a
slate, parlay, or Bank Builder launch; never publishes to the live site by default._

## Pipeline (one process for every sport)
```
board/source JSON → sport extractor → PredictionOutput → validateLeakage → confidence + risk
  → eligible-leg pool → leg quality → correlation → parlay generation → tracking → Bank Builder gate
```
No sport bypasses this. A sport only contributes legs if its extractor is `wired` and its candidates
become valid `PredictionOutput`s that clear the gates.

## Modules (`app/src/lib/parlays/`)
- `eligible-leg.ts` — `EligibleLeg`; a leg is eligible ONLY if it passed leakage, is not No Bet, the
  event has not started (vs `nowIso`), odds/line are valid (market-aware), market scope is valid
  (WC: 90-minute vs advancement distinguished; `unknown` is rejected), the extractor is wired, and no
  critical data is missing/stale.
- `leg-scoring.ts` — `legQualityScore` (0–100) + tier `elite|strong|playable|thin|ineligible`, with
  honesty caps (high-edge+bad-data, high-confidence+no-edge, stale, or unknown-scope can't be elite).
- `correlation.ts` — pairwise correlation; blocks conflicting / strong-negative / unknown pairs;
  allows justified same-game positives; flags WC 90-minute vs advancement as a scope conflict (never
  the same market).
- `risk-levels.ts`, `combination-optimizer.ts`, `daily-parlays.ts` — suggested parlays per risk level
  (low/medium/high/longshot), cross-game, non-correlated; never forced (fewer/zero + reason when the
  pool is thin).
- `same-game.ts` — game-specific parlays (same-game positive correlation allowed, conflicts rejected).
- `tracking.ts` — every suggested parlay is trackable; results stay `pending` until official
  settlement (never pre-settled, never fabricated).
- `dual-bank-builder.ts` — selects the best four non-correlated legs → Lane A (survival) + Lane B
  (diversified); returns `launched | no_qualified_launch | dry_run_only`. Pure: never mutates prior
  runs; a new run uses a NEW run id; gates failing → `no_qualified_launch` with reasons.

## Commands
```
# 1) Methodology dry-run (per-prediction view, all sports)
cd app && npx tsx scripts/methodology-dryrun.mjs --date <YYYY-MM-DD> --sport all

# 2) Project today + conditionally launch (dry-run by default)
cd app && npx tsx scripts/project-and-launch-today.mjs --date <YYYY-MM-DD> --sport all
#   add --launch              → let the dual Bank Builder reach "launched" IF all gates pass
#   add --write-suggestions   → persist suggested parlays to public/data/methodology/launch/ (non-published)
#   add --write-bank-builder  → persist the launched run there too (only when status=launched)
```
Both commands hard-refuse writing into `boards/`, `parlays/`, `bank-builder/`, `world-cup/`,
`results/`, `settled/`. The default invocation writes nothing.

## Launch gates (all must pass)
1. sport extractor wired · 2. ≥ 4 qualified non-correlated legs (survival ≥ 70) · 3. ≥ 2 distinct
games · 4. two game-disjoint 2-leg lanes buildable · 5. no stale/unknown-scope legs · 6. events not
started. If any fail → `no_qualified_launch`; never a forced pick.

## Live publishing (NOT done by these commands)
Surfacing parlays / a Bank Builder run on the live site is a separate, operator-approved step that
writes the protected `public/data/bank-builder/*` / `parlays/*` schemas and requires the UI-wiring
phase. These commands stop at the non-published `methodology/launch/` namespace.
