# MLB modeled-markets calibration audit — 2026-07-21

**Headline: none of the 4 currently public-modeled MLB player-prop markets beat the market. All 4 are DEMOTED from "model prediction / product edge" to market-anchored research signal.** This is a major, founder-relevant finding. Money untouched; md5 `affe6b21071f2b3be96bb2774eb347c3`.

## Method (leakage-safe, fully offline)

`app/scripts/audit-mlb-modeled-markets.mjs` joins **settled leans** (official box-score `actual`/`outcome`) to the **pregame board archives** (model probability + de-vigged market probability) by `id`, over the whole settled history. Leakage-safe by construction: the board is the pregame snapshot, the outcome is the official result, and a guard asserts `settled.projection == board.projection` (**0 failures** — proves the archive is the true pregame board). Comparison is on the **lean side** (the side the model actually picked — the product-relevant set). De-vig verified: raw implied sums ≈ 1.06 (a real ~6% two-way hold).

## Results — 18,659 settled leans joined (0 unmatched, leakage guard PASS)

| Market | n | Brier model | Brier market | LogLoss model | LogLoss market | Verdict |
|---|---|---|---|---|---|---|
| `pitcher_strikeouts` | 958 | 0.2725 | **0.2429** | 0.7475 | **0.6788** | **DEMOTE** |
| `batter_hits` | 7,853 | 0.2438 | **0.2352** | 0.6836 | **0.663** | **DEMOTE** |
| `batter_total_bases` | 3,580 | 0.2616 | **0.2426** | 0.7204 | **0.6783** | **DEMOTE** |
| `batter_hits_runs_rbis` | 6,268 | 0.264 | **0.2479** | 0.7252 | **0.689** | **DEMOTE** |

**Every market loses to the market on both Brier and log loss with a large sample.** Classification rule: fails both metrics + n ≥ 100 → `DEMOTE_TO_MARKET_CONTEXT`.

## Why — the model is overconfident (anti-calibrated)

Calibration curves (model predicted probability → actual empirical rate) show systematic overconfidence at every level:
- `pitcher_strikeouts`: predicted 65%→actual 48%, predicted 84%→actual 57%, predicted 92%→actual 55%.
- `batter_total_bases`: predicted 64%→actual 47%, predicted 97%→actual 43%.
- `batter_hits_runs_rbis`: predicted 65%→actual 51%, predicted 74%→actual 52%.

And the model-vs-market **gap buckets are anti-calibrated** — a larger model "gap" predicts a *lower* hit rate (e.g. total bases: gap 0-5%→44%, gap 20%+→39%). The model's confident disagreements with the market lose more often. This confirms the earlier `mlb-calibration-findings` note, now rigorously across 18,659 leans.

## What changed (honest demotion — public surfacing)

- **Single source of truth:** `src/lib/mlb/model-calibration-status.ts` (`MLB_MARKET_CALIBRATION`, `modelBeatsMarket()` → false for all, `anyModeledMarketBeatsMarket()` → false, `MLB_CALIBRATION_DISCLOSURE`).
- **Prominent calibration notice** in the MLB report (high, warn-toned): states the model did not beat the market on any market, is overconfident, and the market price is the better probability — "research signal, not a proven advantage, paper/review/educational only."
- **Product framing reworded:** "Product-eligible" → **"Paper candidates · not market-proven."** §9 carries a **Calibration flag** stating a "model above market" read is not a proven advantage.
- **Bank Builder / Moonshot: still active (paper/review), FLAGGED.** Every active leg uses a failed market (Lane A/B: pitcher_strikeouts + batter_total_bases; Moonshot: pitcher_strikeouts) — all DEMOTE-verdict markets. The report + product-card review flag this. Money/record/exposure untouched.

## What did NOT change (and the founder decision)

- The board is still shown (transparency) — but only as a research signal, no longer as an edge.
- The products were **not deleted** (mission: keep active in paper/review) — they are flagged as running on un-validated markets.
- **Founder call:** whether to (a) keep the products as flagged paper/review, (b) pause them until a market passes the gate, or (c) invest in **recalibration** (widen sigma / shrink toward the market / isotonic calibration on the settled leans — the overconfidence suggests calibration, not signal, is the problem). Recalibration is the most promising path and is out of scope for this audit.

## Re-running

`node app/scripts/audit-mlb-modeled-markets.mjs` → refreshes `data/internal/mlb/reference/mlb-modeled-markets-audit.json` (public:false). If a market later beats the market on both metrics with sufficient sample, flip its verdict in `model-calibration-status.ts` to `PUBLIC_MODEL_OK` and the disclosure/flags auto-hide.
