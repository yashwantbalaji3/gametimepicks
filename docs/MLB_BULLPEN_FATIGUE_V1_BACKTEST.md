# MLB Independent Model — Feature #2: Bullpen Fatigue (2026-07-15)

Tested a bounded, leakage-clean **bullpen-fatigue** adjustment on top of the market-anchored engine, validated
against the 82-game closing-market baseline. **Result: it does NOT beat the market — marginally WORSE on Brier +
log loss. NOT adopted.** With pitcher-strength v1 also failing, **pause MLB full-game feature chasing.**
Internal-only, `public:false`. Money untouched (md5 `affe6b21`).

## The feature (bounded, explainable, leakage-safe)
- **Rating:** each team's bullpen **fatigue index** = day-weighted relief innings (day-1 ×3, day-2 ×2, day-3 ×1)
  over the prior **3 calendar days**, from **strictly-earlier box scores** (StatsAPI; relievers = gamesStarted=0),
  centered on the sample mean (positive = more tired than average). `fetch-mlb-bullpen-usage.mjs` →
  `mlb-bullpen-usage-2026-07-04-2026-07-09.json`. **82/82 games both-rated.**
- **Engine adjustment (bounded shadow, market anchor unchanged):** in `adjustments.ts`, both pens tired → the
  **total** nudges up (cap ±0.35 runs); the more-tired pen shifts the **margin** toward *its* opponent (cap ±0.20
  runs), `bullpenK = 0.01`. Flows into win prob / run line / over-under through the run means only. No hardcoded
  outcomes, no target-game box/line/final score.
- **Artifacts:** `full-game-sim-bullpen-v1/<date>.json`, `modelMode: internal_mlb_bullpen_fatigue_v1`,
  `public:false`, `internalOnly:true`, `notForProducts:true`, separate from the baseline + pitcher-v1.

## Result — bullpen-v1 vs closing market (82 games, 6 dates)
| | Brier ↓ | log loss ↓ | winner acc | total MAE | margin MAE | O/U acc | run-line acc |
|---|---|---|---|---|---|---|---|
| **Bullpen-v1** | 0.2410 | 0.6753 | 59.8% | 4.22 | 3.82 | 58% | 50% |
| **Market** | 0.2403 | 0.6738 | 59.8% | 4.24 | — | — | — |
| Δ (bullpen−market) | **+0.0007** | **+0.0015** | 0.0pp | −0.02 | — | — | — |

## Verdict: does NOT beat the market. Feature NOT adopted.
- **The pass bar is Brier AND log loss.** Bullpen-v1's ΔBrier is **+0.0007** and Δlog-loss **+0.0015** — both
  **positive**, i.e. marginally **worse** than the market (within noise, so effectively mirrors). It fails the bar.
- Winner accuracy is unchanged (59.8%); total MAE is a hair better (4.22 vs 4.24) but that is not the bar and is
  well within noise.
- **Why:** the bounded fatigue nudge pushed the projection slightly *away* from the well-calibrated closing
  market, and on the moneyline that made calibration marginally worse, not better. The market already prices
  bullpen state (or 3-day relief workload is too noisy a moneyline signal at this sample). Either way — no edge.

## Decision: PAUSE MLB full-game feature chasing
Two features tested, both fail the strict bar:
- **Feature #1 (pitcher strength):** ΔBrier −0.0001, Δlog-loss 0.0000 → mirrors, not adopted.
- **Feature #2 (bullpen fatigue):** ΔBrier +0.0007, Δlog-loss +0.0015 → worse, not adopted.

The honest read: **the MLB moneyline closing market is efficient enough that simple, bounded, market-anchored
feature adjustments do not beat it.** Per the plan, **stop the overnight MLB modeling line** rather than grind
through park/weather/lineups on principle. A genuine edge, if one exists, would need a *fitted, market-independent*
model on a much larger sample — a real project, not an overnight nudge — and may still not beat an efficient market.

## Guardrails held
Internal-only (`public:false`, `notForProducts:true`), not web-served, not product-eligible (Bank Builder /
Moonshot / Mr. Dub / public cards never consume it), money md5 `affe6b21` unchanged. No public MLB win prob /
projected runs / distributions / scoreline buckets. The public MLB report is unchanged.
