# Full-Game Sim — Product Impact Audit (2026-07-09)

**Decision: NO public or product-driving use of the full-game simulation.** The rolling backtest returned
`insufficient_sample` (one date, market-anchored, Brier ≈ market) — nothing changes for Bank Builder,
Moonshot, or eligibility. (Supersedes `MLB_FULL_GAME_SIM_PRODUCT_IMPACT_2026-07-09.md`.)

Money md5 `affe6b21071f2b3be96bb2774eb347c3`; no card change; no exposure; official 19-14 untouched.

---

## Answers

1. **Should full-game sim affect Bank Builder today?** No. It is market-anchored + unproven.
2. **Should it affect Moonshot today?** No.
3. **Should it affect `productEligible` today?** No — `settlementSourceFor` / candidate eligibility stay
   exactly as they are (market-implied). No sim field enters the candidate pool.
4. **Should it show in founder-review cards today?** No — not even as a signal yet (see conditions).
5. **What conditions before using it?** A real rolling backtest across many dates (needs daily line
   ingest) showing a Brier/calibration improvement over the market baseline + independent inputs
   (pitcher/park) + founder approval. None are met.

## Conditions for a future non-driving signal

Only after the above, a `fullGameSimSignal` could be added to founder-review previews as an
internal-only, clearly-labelled **shadow** value that:
- is **not** used for selection, stake sizing, or activation,
- is **absent from public UI**,
- carries `officialMoneyRecordAffected: false`, `exposure: 0`.

It is **not** added this pass (the backtest doesn't warrant it). A test would enforce non-driving +
internal-only if/when added.

## What did NOT change

`candidate-leg.ts`, the candidate pool, and the founder-review previews are unchanged — still
`founder_review` / `active:false` / `exposure:0` / `requiresFounderApproval:true`. No exposure, no
activation, no official-record write, no public wiring.
