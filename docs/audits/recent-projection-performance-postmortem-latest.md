# Recent projection/parlay outcome postmortem — June 5–8 (settled June 9)

**Brutal-honest summary:** our *leg* selection turned the corner on June 8 (the
first fully-gated slate), but *card* (parlay) hit rate is still near-zero because
cards are too many legs for the achievable leg hit rate. The fix now is **card
structure + edge handling**, not more leg-quality gates.

All numbers below use the **user-facing published cards** (`byPublicSection` +
`optimizer-graded/<date>.json`), separated from the **generated pool** and the
**full settled universe** (`mlb/results/settled_leans.jsonl`). Pending legs are
excluded, not counted as losses. NBA did not publish projections/parlays on
June 7–8 (provider/paywall — see the BallDontLie doc), so the published product
June 7–8 is MLB-only.

## 1. Settlement status
- June 8 MLB: all 8 games **final**; settled (graded artifacts + `byPublicSection`
  + 304 settled leans present). Latest settled date = **2026-06-08**. No resettle
  needed. Results surfaces settled-only (no June-8 leakage; June-8 graded present
  only post-final).
- June 8 NBA: not published (no model projections — stats provider unavailable).

## 2. Published-CARD hit rate (the product) — June 5–8
| Date | Low | Medium | High | Longshot |
|---|---|---|---|---|
| Jun 5 | 2W-4L (33%) | 0W-6L | 0W-6L | 0W-6L |
| Jun 6 | 0W-5L (0%) | 0W-6L | 0W-6L | 0W-6L |
| Jun 7 | 0W-6L (0%) | 0W-5L | 0W-6L | 0W-6L |
| Jun 8 | 1W-4L (20%) | 0W-6L | 0W-6L | 0W-6L |

Cards are multi-leg parlays, so a ~0% full-card rate is expected at our leg hit
rates — this table is **not** the right quality signal. Leg-level is.

## 3. Published-LEG hit rate — the real signal
**June 5–8 combined: 144/328 = 43.9%** (below ~52% break-even). But this is
dominated by pre-gate slates. Isolating the dates:

- **June 8 (post #306/#307/restricted): 49/87 = 56%** — *above* the June-8
  universe baseline (48%). Lane gradient is now correct:
  **Low 64% · Medium 58% · High 54% · Longshot 53%.**
- June 5–7 (pre/partial gates): the selection was **anti-predictive** — ~44%,
  *below* the 49% universe average. The optimizer was literally picking
  worse-than-random legs (inverted edge + bad markets).

**→ #306/#307 + restricted-market consistency gates WORKED at the leg level:
selection went from below-random to +8pts above baseline, with a real
Low-is-safer ordering.**

## 4. Calibration (full settled universe, June 1–8, n=3,877 legs = 49%)
- **By market:** batter_hits **53%** (only market >50%) · HRR 48% · pitcher_K 46%
  · batter_total_bases **42%** (worst). Published-card cuts agree and are harsher
  for the bad markets: total_bases **29%**, NBA PTS **24%**, AST 0/3.
- **Confidence is NOT predictive:** universe High 48% / Low 48% / Medium 51%;
  published High 45% (93% of legs are labeled "High"). The confidence label is
  noise and should be dropped from ranking.
- **Edge is INVERTED above ~10% (overprojection):** universe edge 0–10% ≈ 50%,
  10–15% 46%, 15–20% 42%, **≥20% 40%**. Published edge≥15% = 39% vs 10–15% = 68%.
  Large model "edges" are overprojections and should be capped/penalized hard.
- **Odds predict:** published heavy-fav (≤-200) **60%** vs plus-money **35%**.
- **Recent form:** all published legs already have full recent10 (count≥8), so
  *having* form didn't discriminate — the form *value* (L10/L5 ≥80% restricted
  gate) is what helped on June 8.

## 5. Card-structure analysis (why good legs still lose)
At a 56% leg rate, parlay math caps card win rate fast:
- 2-leg ≈ 0.56² = 31% · 3-leg ≈ 18% · 4-leg ≈ 10% · 5-leg ≈ 6%.
- At the Low June-8 rate (64%): 2-leg ≈ 41% · 3-leg ≈ 26%.

Our published cards run longer than 2 legs across all lanes, so even the improved
leg quality converts to ~0–20% card rates. **The single highest-leverage change
is shortening cards** — especially Low/Bank to 2 legs — to convert leg quality
into card wins. Secondary structure risks to bound: same-game stacking,
repeated-player exposure across many cards, and stacked volatile legs.

## 6. What's working vs hurting
**Working:** batter_hits market; restricted-market elite-consistency gate (June-8
Low 64%); odds-tier signal (favor heavy favorites); the Low/Med/High gradient now
exists.
**Hurting:** card length (parlay conversion); residual high-edge legs
(edge≥15 ≈ 40%); confidence used as signal (noise); plus-money legs (35%); and —
structurally — NBA can't publish at all (no stats provider).

## 7. Did the changes help? (direct answers)
- **#306/#307:** YES at leg level — June-8 published 56% vs ~44% pre-gate and vs
  48% universe. Not yet visible at card level because cards are too long.
- **Restricted-market consistency gate:** YES — June-8 restricted legs (HRR/K) all
  passed L10/L5≥80% and the lane gradient is correct; the historically bad markets
  (total_bases 29%, AST 0%) were correctly excluded.
- **NBA provider failure:** did NOT corrupt the published product (NBA simply
  absent; MLB untouched, byte-identical across NBA recovery runs).
