# UFC Model Roadmap (latest)

> Sequenced, gated path from schedule-only to (eventually) gated public picks.
> No UFC wired into Suggested Parlays until data + grading + backtest exist.

## Phase 1 — Data foundation (no picks)
Fighter entity + career/per-fight stats provider; two-sided odds ingestion
(ML / method / round totals) with de-vig; historical results store; grading
contract. Schema mirrors MLB/NBA (provider → board → settle → reliability).

## Phase 2 — Leakage-safe feature builder
Rolling windows strictly BEFORE each card (no fight-night outcomes). Features per
the foundation doc (style/striking/grappling/cardio/durability/matchup/odds).
Sample-size floors + shrinkage, exactly like market-reliability.

## Phase 3 — MVP models (internal only)
fight winner (ML) first; then method-of-victory (multinomial: KO/TKO / sub /
decision); then over/under rounds + goes-the-distance. Calibrate vs de-vigged
market; treat large model-vs-market gaps as overprojection (the MLB lesson).

## Phase 4 — Backtest + reliability gates
Backtest across past cards with the same Wilson-lower-bound market quarantine +
volatility gates as MLB/NBA. A market/leg publishes only if it clears break-even
on adequate sample.

## Phase 5 — Gated public launch
Only after Phases 1-4: expose UFC picks behind the standard capability gates +
honest framing (educational/paper, not guaranteed). Method/round props enter
Suggested Parlays only if individually eligible. Until all gates pass: schedule-
only / "coming soon".

## Non-negotiables
No fabricated fight data/odds/results; no public "V2/new-model/edge/lock/safe/
guaranteed" copy; no leakage; fewer/none honestly when nothing qualifies.
