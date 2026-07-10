# MLB Full-Game Sim — Multi-Sport Product Impact (2026-07-09)

**Decision: the internal full-game simulation changes NOTHING for Bank Builder / Moonshot right now.**
Its probabilities stay internal/shadow and do not drive candidate selection. Market-implied probabilities
remain the candidate source until the sim clears a real forward backtest and founder approval.

Money md5 `affe6b21071f2b3be96bb2774eb347c3`; no product-card change; no exposure; official record
untouched.

---

## Findings

- **Can the simulated moneyline / total / run-line probabilities become candidate fields later?** Yes —
  eventually, as `calibratedProbability` inputs to the multi-sport `CandidateLeg`. Not now.
- **Should they be used now?** No. The sim is **market-anchored** (verdict `internal_only`, tiny
  backtest) — it tracks the market and adds no independent edge, so using it would just re-label
  market-implied probabilities as "simulated". That would overclaim.
- **What validation is required first?** A real forward backtest across many dates (needs team-market
  lines committed daily), independent scoring inputs, and a Brier/calibration improvement over the market
  baseline — then founder approval.
- **Interaction with existing market-implied legs?** The candidate pool + founder-review previews keep
  using **market-implied** probabilities (`settlementSourceFor` unchanged). The sim is a separate
  internal shadow, exactly like the shadow-calibration layer.
- **Prefer market-implied or simulation-calibrated?** Market-implied for now — the sim is not proven.

## What did NOT change

`candidate-leg.ts` eligibility, `build-multi-sport-candidate-pool.mjs`, and the founder-review previews
are unchanged (still `founder_review` / `active:false` / `exposure:0` / `requiresFounderApproval:true`).
No full-game-sim signal drives card selection. No exposure, no activation, no official-record write.

## Future (founder-gated)

Only after the sim beats the market on a real forward backtest + founder approval would we consider
adding a non-driving `fullGameSimSignal` note to founder-review previews, and later a blended
`calibratedProbability`. Both stay internal until then.
