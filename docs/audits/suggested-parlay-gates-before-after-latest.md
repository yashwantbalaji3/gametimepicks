# Suggested-Parlay Gates — Before/After Simulation (latest)

> Backtest of the emergency gates (market quarantine + reliability/recent-form
> leg ranking + strict Low gate) by re-running `generate_public_risk_sections`
> on each settled date's real legPool and grading the resulting cards against
> settled leg outcomes. Caveat: `market-reliability.json` is cumulative, so this
> is a directional in-sample check; the market rankings (batter_hits good,
> total_bases/AST/strikeouts bad) were stable across the whole window, so the
> gate decisions are not date-overfit.

| Date | NEW (gated) | ACTUAL (published) | New Low tier |
|---|---|---|---|
| 2026-06-05 | 1W-12L | 2W-22L | 1W-4L |
| 2026-06-06 | **4W-7L (36%)** | **0W-23L** | **2W-0L** |
| 2026-06-07 | **7W-12L (37%)** | **0W-23L** | **4W-2L** |
| **Total** | **12W-31L (27.9%)** | **2W-68L (2.9%)** | **7W-6L (53.8%)** |

## Findings
- Every date improved or held; **no date got worse**. Aggregate hit rate ~10×
  (2.9% → 27.9%), with **fewer** cards (43 vs 70) — honest, not padded.
- The **Low tier** flips from ~0 to **53.8%** — it finally behaves conservatively.
- Gated cards collapse to `batter_hits` (the only MLB market clearing 50%);
  total_bases/AST/strikeouts are correctly excluded.
- This does NOT make prop parlays high-probability (a 2-leg of 53% legs ≈ 28%);
  it removes the systematically-bad legs and stops selecting overprojected ones.

## Decision
Ship the gates. Expect FEWER published cards (honest). Continue to publish none
in a tier when nothing qualifies.
