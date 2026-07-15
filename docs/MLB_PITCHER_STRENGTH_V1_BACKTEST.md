# MLB Independent Model — Feature #1: Probable Pitcher Strength (2026-07-14)

Tested a bounded, leakage-clean **probable-starter strength** adjustment on top of the market-anchored engine,
validated against the 82-game closing-market baseline. **Result: it MIRRORS the market — does NOT beat it on
Brier + log loss. NOT adopted.** Internal-only, `public:false`. Money untouched (md5 `affe6b21`).

## The feature (bounded, explainable, leakage-safe)
- **Rating:** each probable starter's FIP-proxy **runs-saved-per-9** vs the IP-weighted sample-mean starter,
  computed from **strictly-earlier starts only** (StatsAPI game logs; `fetch-mlb-pitcher-stats.mjs` →
  `mlb-pitcher-strength.json`). Positive = suppresses the opponent's runs. Sanity: the top-rated starters are
  Dylan Cease (FIP 2.15), Cristopher Sánchez, Chris Sale — genuinely elite. 67/82 games both-rated.
- **Engine adjustment (bounded shadow, market anchor unchanged):** in `adjustments.ts`, a usable pitcher input
  nudges the market-anchored run means — two good starters lower the **total** (cap ±0.5 runs); the better home
  starter shifts the **margin** toward home (cap ±0.3 runs), `pitcherK = 0.15` (we apply only 15% of the FIP
  differential — the market already prices most of the starter). It flows into win prob / run line / over-under
  through the run means only. No hardcoded outcomes, no final scores.
- **Artifacts:** `full-game-sim-pitcher-v1/<date>.json`, `modelMode: internal_mlb_pitcher_strength_v1`,
  `public:false`, `internalOnly:true`, kept separate from the market-anchored baseline for comparison.

## Result — pitcher-v1 vs closing market (82 games, 6 dates)
| | Brier ↓ | log loss ↓ | winner acc | total MAE | margin MAE | O/U acc | run-line acc |
|---|---|---|---|---|---|---|---|
| **Pitcher-v1** | 0.2402 | 0.6738 | 64.6% | 4.24 | 3.80 | 58% | 50% |
| **Market** | 0.2403 | 0.6738 | 59.8% | 4.24 | — | — | — |
| Δ (pitcher−market) | **−0.0001** | **0.0000** | +4.8pp | 0.00 | — | — | — |

## Verdict: MIRRORS the market. Feature NOT adopted.
- **The pass bar is Brier AND log loss — not winner accuracy.** Pitcher-v1's ΔBrier is −0.0001 and Δlog-loss is
  exactly 0.0000 — both **within noise**. It does not beat the market on the metrics that measure probability
  quality.
- **Winner accuracy went up (+4.8pp), but that is not signal.** The bounded nudge occasionally flips the argmax
  favorite across the 0.5 line on close games, and in this 82-game sample those flips landed right slightly more
  often — but the calibration (Brier/log loss) did not improve, so it's noise around the coin-flip boundary, not
  an edge. The mission was explicit: winner accuracy alone is not the bar.
- **Why:** the starting pitcher is the single most-analyzed, most-bet input in an MLB game — the closing market
  prices it efficiently. Adding our own (correct) pitcher read on top of a market anchor just re-derives what's
  already in the price. A larger `pitcherK` would push the projection *away* from the well-calibrated market and
  most likely **worsen** Brier, not improve it.

## Decision: STOP feature #1, move to the next signal
Pitcher strength does not clear the bar. Per the plan, move to a signal the market may price **less** efficiently:
- **Feature #2 — bullpen fatigue** (heavy trailing-3-day reliever usage; harder to quantify, plausibly underpriced).
- **Feature #3 — park & weather** (same-day wind/temp on top of the static park factor).
Each gets the same treatment: bounded, leakage-safe, measured vs the closing-market baseline, adopted only if it
beats the market on Brier + log loss.

## Guardrails held
Internal-only (`public:false`), not web-served (leak scan clean), not product-eligible (Bank Builder / Moonshot /
Mr. Dub / public cards never consume it), money md5 `affe6b21` unchanged. No public MLB win prob / projected runs /
distributions / scoreline buckets. The public MLB report is unchanged.
