# Bank Builder Survival Audit — June 26, 2026 (Cycle 3) · MAX-2-LEG policy

**Mandate:** maximize ladder-survival probability toward $10K. NOT payout/EV/excitement. **New policy:
MAX 2 LEGS** per parlay; a 3rd leg only if 2 legs cannot reach the rung. This audit re-evaluated both
lanes from scratch on June-26 markets and **complies with MAX-2-LEG on both lanes.**

## Lane A — Step 2 ($201.08 → $700 rung, required 3.481×)

**FINAL (KEPT after re-optimization): 2-leg card — Senegal/Iraq Over 3 (0.511) + Cape Verde/Saudi BTTS
Yes (0.506) → +251 (3.51×) → $705.77. Joint survival 25.9%.** Both legs odds-backed (betonlineag /
fanduel), settleable, weakest leg 0.51 (no underdog).

This **supersedes** the prior-pass 3-leg card (Egypt-DC + France + Senegal BTTS-No, 24.4%). Why the
2-leg is better AND rule-compliant:

| Card | Legs | Survival | Weakest leg | MAX-2-LEG? |
|---|---|---|---|---|
| **2-leg (FINAL)** | Senegal Over 3 + CV BTTS-Yes | **25.9%** | 0.51 | ✅ |
| Prior 3-leg | Egypt-DC + France + Senegal BTTS-No | 24.4% | 0.55 | ✗ (3 legs) |
| Best 2-leg from *curated feed only* | Spain ML + Egypt ML | 23.3% | **0.37 (underdog)** | ✅ but fragile |

**Key correction to the prior pass:** the prior "keep 3-leg" verdict assumed every 2-leg card reaching
the rung needed a ~0.37 underdog moneyline (true on the *curated* 27-projection feed, which lacks
totals). The selector's full pool includes **totals/BTTS at near-even prices**; two such ~0.51 legs span
the 3.481× rung at **0.51 × 0.51 ≈ 25.9% joint** — higher than the 3-leg (24.4%) AND with no fragile
underdog. So MAX-2-LEG is satisfiable *and* survival improves: **a clean +1.5pp.** No 3rd leg required.

Top 2-leg candidates (rank by joint survival, all reach ≥3.481×): #1 Spain ML + Egypt ML 23.3% (0.37
underdog); the selector's totals-based pair beats these at 25.9% with both legs ≥0.51. (Curated-feed
candidates carry a 0.36–0.37 underdog; the totals-based card is strictly more robust.)

## Lane B — Step 1 (restarted, $100 → $200 rung, required 2.0×)

Lane B lost June-25 (stopped); **operator-directed restart** for June-26 with a fresh $100 Step-1.
**FINAL: 2-leg — Egypt/Iran "Egypt or Draw" DC (0.737) + Norway/France "France" ML (0.602) → +106
(2.06×) → $206.25. Joint survival 44.3%.** Weakest leg 0.60 (no coin-flips). The June-25 −$100 loss is
preserved in `laneB.priorLane` (reconciliation + record unchanged: 14-4 / $20,065.40).

Best Lane-B 2-leg candidates (≥2.0×, disjoint from Lane A): #1 Cape Verde-or-Saudi DC + Spain ML 44.6%;
the cross-lane selector instead assigned Egypt-DC + France to Lane B (44.3%) so Lane A could take the
totals pair — a joint optimization keeping **4 distinct games**.

## Correlation analysis
Lane A games: Senegal/Iraq, Cape Verde/Saudi. Lane B games: Egypt/Iran, Norway/France. **4 distinct
games, zero overlap** → the lanes are independent (no shared game, no shared team, different kickoff
windows). No correlation penalty applies. Within each lane, both legs are different games (no SGP / no
hidden same-match covariance). Lane A is two totals/BTTS (game-flow markets); Lane B is a DC + a favorite
ML (team-strength markets) — **different correlation profiles**, as requested.

## Market Confidence Index (MCI, new this pass)
`lib/benchmark/market-confidence.ts` (0–100, only real inputs averaged; movement from the 2 real June-26
benchmark captures; calibration excluded — no settled-history yet). Live: **Lane A card MCI 37** (both
legs near-even, 37/37), **Lane B card MCI 58** (Egypt-or-Draw 66, France 49). This honestly flags that
Lane A maximizes *joint survival* via two even-money legs (lower individual confidence), while Lane B
carries a stronger anchor. MCI is a **display/feature** signal; it is NOT yet wired into card ranking
(that awaits historical calibration data — wiring it on noise would be fabrication).

## Decision & honest caveat
**Both lanes: 2-leg, MAX-2-LEG compliant, survival-optimal within the rule.** Lane A improved +1.5pp vs
the prior 3-leg. Survival at the $700 rung (~26%) and the full remaining ladder (low single-digit %)
remains brutal — the math of a 100× climb in an efficient market; the cards maximize survival, they
cannot make a 3.48× step safe. Money reconciles (crown $20,465.40 / bankroll $20,065.40 / 14-4); gate
green. Probabilities are de-vigged `modelProbability`; payouts are products of American-odds decimals.
