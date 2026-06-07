# Confidence-Weight Recalibration (gentle compression)

> Evidence-backed, gentle, FUTURE-generation-only scoring change. No paid
> credits, no settled-slate regeneration, no live-slate churn (June 7 already
> generated; this applies June 8+).

## Finding (settled data, large samples)
The model's own confidence label is **non-predictive** — High graded ≤ Low in
BOTH sports:
- MLB: High **48.6%** (n=2846) · Low 50.4% · Medium 51.3%
- NBA: High **51.1%** (n=1682) · Low 55.9% · Medium 56.0%

Yet `_sgp_leg_quality` multiplied a leg's edge by a steep confidence weight
(High 1.0 / Medium 0.7 / Low 0.4), discounting Low-confidence high-edge legs by
60% — unjustified, since Low-confidence legs grade as well or better.

## Change
Compress the confidence weight to **1.0 / 0.85 / 0.7** (High / Medium / Low);
insufficient_data stays **0.0** (it graded worst — NBA 47%). This *reduces* the
influence of a non-predictive label (it does NOT invert it) so the predictive
terms — edge, recent-form (L10→L5), and market reliability — drive selection.
Only `_sgp_leg_quality` (the public-card selector) changes; the separate
`leg_score` path is untouched.

## Effect (illustrative, isolating confidence)
A Low-confidence edge-10 leg now scores 7.0 on the confidence×edge term vs a
High-confidence edge-5 leg's 5.0 — so the **higher-edge** leg wins, where the old
weights (4.0 < 5.0) let the weaker-edge High-confidence leg win. Order is
preserved (High > Medium > Low at equal edge); the gap is just gentler.

## Validation
- pipeline `parlay_optimizer_test` **119** (3 new ConfidenceWeightCompression
  tests) + py_compile ✓. No hard-gate / risk-band / exposure / settled-data
  change. LegScoreTests (separate function) unaffected.

## Honesty
This reduces reliance on a feature that doesn't predict outcomes; it is not a
win guarantee. It will first take effect on the June-8 generation and should be
re-checked against that real slate.

*Free settled-data recalibration. No paid API, no projection/grading-math change
to past results.*
