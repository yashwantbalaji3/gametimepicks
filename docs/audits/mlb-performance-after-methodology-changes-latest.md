# MLB performance after methodology changes (settled through 2026-06-08)

Settled MLB only. Pending excluded (never a loss). Published cards = product truth;
universe = all settled legs (calibration); pool = generated candidates.

## Leg hit rate by date
| Date | Universe (all settled) | Published legs |
|---|---|---|
| Jun 1 | 50% | — |
| Jun 5 | 50% | ~44% (pre-gate) |
| Jun 6 | 46% | ~44% |
| Jun 7 | 47% | ~44% |
| **Jun 8 (post-gate)** | 48% | **56%** |

June 8 published selection beat the universe by +8pts → the gates work at leg level.
June 5–7 published selection was *below* universe (anti-selection by inverted edge).

## Published card (parlay) hit rate by lane (Jun 1–8)
| Lane | Card hit | Avg legs | Leg hit |
|---|---|---|---|
| Low | 26% (10/38) | 2.2 | 56% |
| Medium | 13% (5/39) | 3.0 | 53% |
| High | 0% (0/40) | 4.0 | 52% |
| Longshot | 0% (0/40) | 5.0 | 47% |
Near-zero card rates are parlay math at these leg rates, not a leg-quality failure.

## By market (universe Jun 1–8)
batter_hits **53%** (only >50%) · HRR 48% · pitcher_strikeouts 46% · total_bases
**42%**. Published cuts: total_bases 29%, NBA PTS 24%, AST 0% (all correctly
excluded post-gate).

## By signal
- **Odds band (published):** heavy-fav 60% · favorite 45% · slight 47% · plus-money 35%.
- **Edge bucket (universe):** 0–5 49% · 5–10 51% · 10–15 46% · 15–20 42% · **≥20 40%** (inverted).
- **Confidence (universe):** High 48% ≈ Low 48% ≈ Medium 51% (non-predictive).
- **Recent form:** all published legs already had full recent10; the *value* (L10≥80 gate) is what helped.

## Before/after gates
- #306/#307 (market quarantine + reliability-first + restricted consistency):
  published leg 44% → **56%** on June 8; lane gradient appeared.
- #324 (Low=2 + edge cap) and #322/#325/#326 (daily learning + reader): land on
  **June-10+** generation (June 9 was generated before they merged — it still
  shows edge≥15 HRR in Low). Simulator projects Low card 26%→~36%.

## Pool vs published / excluded legs
The optimizer's published selection (56% June 8) now exceeds the candidate-pool
universe (48%) — selection is additive. Excluded high-edge legs (edge≥20, ~40%)
and total_bases (29%) were net-negative; excluding them is correct. No evidence of
excluded high-quality legs being lost (batter_hits at all edge buckets <15 remain
eligible).

_Caveat: ~40 cards/lane → wide Wilson bounds; direction robust, magnitudes noisy._
