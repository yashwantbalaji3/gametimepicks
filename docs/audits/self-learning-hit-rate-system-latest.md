# Self-learning hit-rate system

A bounded, fail-closed daily loop that turns settled hits/misses into a
conservative **selection-policy artifact** the optimizer can later read. It is
NOT unconstrained self-modifying code — it only writes recommendations under hard
guards, and the optimizer always has a static fallback.

## What it learns (daily, after settlement)
- Per-market realized hit rate + Wilson lower bound + small-sample shrinkage →
  recommended status (`allowed` / `restricted` / `high_risk_only` / `disabled` /
  `insufficient_sample`), anchored to the universe baseline (window-size robust).
- Calibration facts: whether **edge is inverted** (it is — ≥20% → 40%), whether
  **confidence is predictive** (it isn't — 3pt spread), odds-band behavior.
- Published-leg hit rate by lane + **card-length parlay-math projection**.

## What it does NOT learn / cannot do (hard guards)
- Cannot lengthen cards beyond `maxLegsByLane` (Low 2, Med/High/Long 3) or Bank
  Builder beyond 2 legs.
- Cannot allow banned/unsupported markets, odds-only NBA, or override UFC
  fail-closed.
- Cannot put stale/missing form into Low/Bank.
- Cannot use confidence for ranking (`confidenceUsedForRanking: false`).
- Cannot promote a market on a tiny sample (`insufficient_sample` < 20 decided).
- Downgrades trigger faster than upgrades (Wilson floor < 0.43 → disabled even if
  the point estimate looks ok).

## Leakage avoidance
- Reads ONLY settled outcomes (`settled_leans.jsonl` + `optimizer-graded/*`);
  pending legs are excluded, never counted as losses.
- Training window ends at `latestSettledDate`; current-day pending results are
  never used for current-day selection.
- The morning generation **reads** the policy; only the post-settlement job
  **writes** it. One-way dependency, no same-day feedback.

## Why the headline policies
- **Shorter cards:** at the observed ~56% Low leg rate, a 2-leg card ≈ 32% vs a
  3-leg ≈ 18% — the biggest card-rate lever (parlay math, not opinion).
- **Edge cap:** edge is anti-predictive above ~10% (overprojection), so edge
  ≥15% is excluded from Low/Med, ≥20% from all, and edge never *promotes* a leg.
- **Confidence removed:** non-predictive (High 48 ≈ Low 48 ≈ Med 51).
- **Odds bands:** heavy favorites 60% vs plus-money 35% → Low/Bank avoid
  plus-money; Bank Builder heavy-favorite only.

## Artifact
`app/public/data/learning/selection-policy-latest.json` (+ dated snapshot).
Key fields: `policyVersion`, `latestSettledDate`, `trainingWindow*`,
`sampleSizes`, `universeBaselineHitRate`, `noLiveWire`, `hardGuards`,
`recommendedMarketStatus`, `calibration`, `segments`, `cardLengthProjection`,
`warnings`.

## How to inspect / roll back / force fallback
- Inspect: read the artifact + `docs/audits/daily-selection-learning-latest.md`.
- Force conservative fallback: delete/blank the artifact, or set `noLiveWire:true`
  — the optimizer then uses its static policy (the PR-4 reader requires this).
- Roll back: restore a prior `selection-policy-YYYY-MM-DD.json` snapshot.
- The optimizer (PR 4) must treat the artifact as a **tightening overlay only**:
  it may restrict/disable vs the static policy but never loosen below the static
  floor, and must fall back if the artifact is missing/corrupt/`noLiveWire`.
