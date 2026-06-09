# Optimizer tightening — simulation-backed changes (PR 2)

Implements only the rules the card-level simulator
(`selection-policy-simulation-latest.md`) supports, in
`pipeline/parlay_optimizer.py`. No NBA/UFC/V2 change; no fake data.

## Changes
1. **Low capped to exactly 2 legs** (`PUBLIC_RISK_SECTION_SPECS["low"].max_legs
   3→2`). Backtest: Low card 26%→37%, overall card 10%→22% at the ~56% Low leg
   rate (parlay math + reformation). Low is the conservative / Bank-Builder lane.
2. **Edge cap** (`_PUBLIC_EDGE_CAP_ALL=20`, `_PUBLIC_EDGE_CAP_LOW_MEDIUM=15`):
   high-edge legs are EXCLUDED from public sections (edge≥20 everywhere, ≥15 also
   barred from Low/Medium). Realized edge is inverted above ~10% (edge≥20 → 40%);
   edge is never used to promote. Backtest: Low leg quality 56%→65–68%.

## What was deliberately NOT shipped in this PR
- Exposure caps / no-plus-money-Low / reliability-reranking: simulator-positive
  but higher-blast-radius; staged for a follow-up with their own tests (the
  reliability-reranking confounds with length in the sim and deserves isolation).
- High/Longshot stay odds-band lottery lanes by design (honest copy).

## Validation
- `python3 -m unittest pipeline.parlay_optimizer_test` → **148 pass** (2 new:
  Low≤2 legs; edge cap excludes ≥15 Low/Med + ≥20 all; 1 updated spec test).
- Real June-8 legPool: Low maxLegs=2, 0 edge≥15 in Low/Med, 0 edge≥20 anywhere.
- Data shape unchanged (fewer legs per Low card only) → no app change needed.

## Expected impact
Low card hit rate ~26%→~36%, Low leg quality ~56%→~65–68%, anti-predictive
high-edge tail removed. Fewer but stronger cards; honest empty tiers where supply
is thin. Effect lands on the NEXT generation (committed data unchanged by this PR).
