# Full-Game Sim — Product Impact Audit (2026-07-09)

**Decision: NO public or product-driving use of the full-game simulation** — even with the new park /
pitcher inputs and the shadow-adjusted mode. The rolling backtest is still `insufficient_sample` (one
date; the shadow adjustments are noise). Nothing changes for Bank Builder, Moonshot, eligibility, or the
public UI.

Money md5 `affe6b21071f2b3be96bb2774eb347c3`; no card change; no exposure; official 19-14 untouched.

---

## Answers

1. **Should full-game sim affect Bank Builder today?** No. Market-anchored + unproven; shadow adjustments
   are noise on 10 games.
2. **Should it affect Moonshot today?** No.
3. **Should it affect `productEligible` today?** No — candidate eligibility stays market-implied. No sim
   field enters the candidate pool.
4. **Should it show in founder-review cards today?** No — not even as a non-driving signal (conditions
   below are not met).
5. **Conditions before ANY use?** A real rolling backtest across ≥5 dates / ≥50 games (needs the daily
   line ingest to accumulate) in which the **shadow-adjusted** Brier/calibration *beats* the market
   baseline → verdict `candidate_for_shadow_review` → then, and only then, a founder-gated non-driving
   signal. None are met.

## What this pass added (and why it still changes nothing)

- **Static park factors** (approximate, bounded ±3%) + **neutral pitcher strength** + **strictly-earlier
  run rates** → a new `market_anchored_with_independent_adjustments` engine mode.
- Backtested in shadow: the adjustments are a wash (ML Brier 0.2316 vs market 0.2325; total MAE *worse*,
  4.80 vs 4.70). On 10 games that is noise, not signal. Verdict stays `insufficient_sample`.
- ⇒ The bar for a product signal (`candidate_for_shadow_review` on a real sample) is **not** cleared.

## Non-driving signal — the future gate (NOT added this pass)

Only after `candidate_for_shadow_review` on a real multi-date sample would a `fullGameSimSignal` be added
to founder-review previews as an internal-only, clearly-labelled **shadow** value that:
- is **not** used for selection, stake sizing, or activation,
- is **absent from public UI**,
- carries `officialMoneyRecordAffected:false`, `exposure:0`.

A test enforces it is **not** present today.

## What did NOT change

`candidate-leg.ts`, the candidate pool, and the founder-review previews
(`data/internal/product-previews/{bank-builder,moonshot}/…`) are unchanged — still `founder_review` /
`active:false` / `exposure:0` / `requiresFounderApproval:true`, and carry **no** `fullGameSim*` field
(verified). No exposure, no activation, no official-record write, no public wiring. Public MLB report
still reads *market-implied, not a simulation* / *full-game score simulation coming soon*; soccer still
makes **no** 10,000-run claim.
