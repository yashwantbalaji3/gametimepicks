# SimTheGame Parity — Execution Plan (master source of truth, 2026-07-14)

Not another vague roadmap. This is the concrete, measured state and the ordered next steps. Money locked at md5
`affe6b21`. Companion: `SIMTHEGAME_LEVEL_OUTPUT_CONTRACT.md` (per-market status table).

## Where we actually are (measured, not guessed)

### Soccer
- **Internal FIFA-Poisson engine (v1)** — backtested on all 64 2022 WC matches, and now **against the real
  closing market**: model Brier 0.5925 vs market 0.5826, log loss 1.0024 vs 0.9961. **The model loses to the
  market by ~1%** — competent, close, but not better. Stays internal.
- **Two improvement dead-ends, both measured:** global-coefficient tuning *overfits* (fails CV + bootstrap);
  in-tournament form (v2) is *monotonically worse* than pure ratings. The simple model is at the data ceiling.
- **Public:** market-implied 1X2/total/BTTS/DC/DNB + bracket impact. Honest. Unchanged by this mission.

### MLB
- **Public:** 10k player-prop simulation + market-anchored full-game lines. Honest.
- **Internal full-game Monte Carlo** exists (`market_anchored_simulation`, not web-served). Needs a rolling
  backtest that beats the market before any public full-game surfacing. Audit is the next MLB milestone.

## Concrete milestones shipped THIS mission (not circling)
1. **Soccer market baseline is real** — fetched 64/64 2022 closing 1X2 lines (The Odds API historical, de-vigged,
   no lookahead), wired model-vs-market into the backtest. The "does it beat the market?" question is *answered:
   no*. This is the milestone that ends the guessing.
2. **Soccer v2 feature model** — built + backtested tournament form. Honest negative result (form hurts).
3. **Output contract** table + **provider roadmap** with costs.

## Ordered next steps (each concrete, each honest)
1. **MLB full-game validation audit** — run/extend the rolling backtest vs the market baseline; write
   `MLB_FULL_GAME_PUBLIC_READINESS_AUDIT.md`. Data we already have. *(Highest-value unblocked model milestone.)*
2. **Soccer multi-tournament ratings** — the only path to beat the market: replace 1–3-game form with an
   Elo/SPI-style rating fit over many historical matches (needs a historical results feed + a fitting pipeline).
   This is real modeling work, not tuning.
3. **Simulation Report Shell V2** — a source-aware shared report shell (soccer/MLB/UFC), internal numbers never
   surfaced. UX milestone; safe because it only re-lays-out already-public outputs.
4. **Provider unlocks** (paid): API-Football 2026 stats (WC prop settlement), xG/event data (true soccer model),
   MLB team-totals/F5 odds. See the roadmap.

## The rule that keeps this honest
Nothing internal surfaces publicly until it **beats a market baseline** and the founder approves. Soccer v1 is
measured and does not clear that bar, so it stays internal. That is the difference between a real simulator and a
demo that shows unvalidated numbers.
