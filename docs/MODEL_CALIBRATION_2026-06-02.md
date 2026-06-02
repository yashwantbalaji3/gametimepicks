# Model Calibration Investigation (2026-06-02)

> **Why the model's quality signals aren't predictive — an offline,
> evidence-based investigation.** No live optimizer/model/UI behavior was
> changed. `audit/policy.json` not consumed. No workflow changes. Only
> settled public-era data (May 27 – June 1); **May 25/26 excluded**;
> pending/unresolved legs excluded; no same-slate leakage; **no hit-rate
> promises.**

---

## 1. Executive summary

Across the 5 settled public-era slates, the model's own quality signals do
**not** predict outcomes, and its headline signal is **anti-predictive**:

- **`edgePct` is anti-predictive.** Legs in the **top half by claimed edge
  hit 49%**; bottom half **57%**. The biggest claimed edges (Q4, 18–46pp)
  hit **52%** — worse than the smallest edges (Q1, 3–10pp) at **57%**.
- **`confidence` is non-predictive.** "High" legs hit **53%** ≈ the **53%**
  overall. Slips with higher average confidence hit **lower** (12% vs 20%).
- **The market is the only signal that separates winners.** Legs in the
  **top half by market-implied probability hit 60%** vs **46%** bottom.
- **The model is mis-calibrated / overconfident.** Brier of the
  market-implied probability is **0.244** (≈ the 0.25 coin-flip baseline),
  and the model's *selected* legs **underperform their implied price**
  (e.g. the 55–60% implied band actually hit **43%**, a −14pp gap).

**Root cause (not a code bug):** `edgePct = model_prob − implied_prob` and
`confidence` is just binned edge. The model's probability
(`model_over_probability(projection, line, sigma)`) is **overconfident** —
its largest edges are exactly where its projection most diverges from an
efficient market, and that is where it is most wrong. The model adds
slightly **negative** value over the market.

**Recommendation: Outcome C** — the evidence does not support any
model-edge-based quality claim. Hold model-side changes; the only safe
near-term product move is **volume discipline + honest empty states** (no
hit-rate claim). If quality is pursued, the evidence says **lean on
market-implied probability, not the model's edge/confidence** — and the
real fix is to **recalibrate the projection→probability step and prove it
beats the market out-of-sample before wiring anything.**

---

## 2. Current state

- main `3e4a248` (after PR #239). Latest settled **2026-06-01**; June 2
  projections **clock-gated** (not yet generated at the time of this work,
  so excluded from the dataset).
- PR #238 (audit) + #239 (inert decorrelation helpers + shadow audit)
  merged. **No live optimizer/model/UI behavior changed.**

---

## 3. Dataset scope & exclusions

- **Source:** `app/public/data/parlays/optimizer-graded/<date>.json`.
- **Slates:** 2026-05-27, -28, -29, -30, 06-01 (public era).
- **Excluded:** May 25/26 (pre-public-era); pending/unresolved legs; June 2
  (not settled).
- **Dedup:** one row per `(date, leanId)` — a leg reused across many public
  slips counts **once**, so calibration isn't biased by exposure.
- **Size:** **217 unique legs** (53.0% hit); **357 slips**.
- **No same-slate leakage:** each already-graded leg is judged against its
  own final box score (post-hoc); nothing uses one slate's result to alter
  another's generation.
- Reproduce: `cd app && npx tsx scripts/model-calibration-analysis.mjs`.

---

## 4. Field lineage (PHASE 1)

| Field | Created in | Inputs | Pregame-safe | Public | Consumed by optimizer | Predictive? |
|-------|-----------|--------|:-----------:|:------:|:--------------------:|-------------|
| `projection` | `mlb_model.py` | player recent stats + matchup | yes | drives edge | yes (→edge) | — (drives a bad edge) |
| `model_prob` | `mlb_model.py::model_over_probability(projection,line,sigma)` | projection, line, **sigma** | yes | no | yes (→edge) | **overconfident** |
| `edgePct` | `mlb_model.py` = `(model_prob − implied)·100` | model_prob, odds | yes | **yes (cards)** | yes (ranking + gate) | **ANTI-predictive** |
| `confidence` | `mlb_model.py` = binned `edgePct` (`EDGE_HIGH/MEDIUM_PP`) | edgePct | yes | **yes** | yes (gate + ranking) | **non-predictive** |
| `oddsForSide` / implied | The Odds API line | market | yes | yes | yes (section classify) | **predictive (the only one)** |
| `legScore` | `parlay_optimizer.py` | edge, conf, recent10, pid, star, marketWeight, calibration | yes | no | yes (pool rank) | weak (≈ edge+conf) |
| `recent10` / `recentSeries` | `attach_recent10` / game logs | game logs | yes | partial | yes (DNP guard + score) | not isolated as strong |
| `marketStabilityWeight` | hardcoded dict in `parlay_optimizer.py` | static (audit-tuned 05-25) | yes | no | yes (legScore) | static |
| risk section | `parlay-risk-sections.ts` | combined odds + leg count | yes | yes | yes | **calibrated (ordering)** |
| parlay size / same-game / repeated market | optimizer construction | leg structure | yes | yes | yes (caps) | size/market mild signal |

No field uses same-day results. `audit/policy.json` confirmed signals are
**not** consumed (verified: `parlay_optimizer.py` has no `policy.json` read).

---

## 5. Calibration results (PHASE 3)

**Leg-level (217 legs):**
| Cut | Result |
|-----|--------|
| Confidence High / Med / Low | 53% / 33% (n=3) / 64% (n=11) — **High ≯ overall** |
| Edge quartile Q1/Q2/Q3/Q4 | 57% / 57% / 45% / 52% — **flat-to-inverted** |
| Edge top vs bottom half | **49% vs 57% — anti-predictive** |
| legScore top vs bottom | 55% vs 51% — weak |
| Implied top vs bottom | **60% vs 46% — market predicts** |
| Implied calibration | gaps mostly negative (55–60%→43%, −14pp; 60–65%→57%, −6pp) |
| Brier (implied) | **0.244** ≈ 0.25 coin-flip |

**Slip-level (357 slips):**
| Cut | Result |
|-----|--------|
| Section low/med/high/longshot | **23% / 12% / 7% / 0%** — monotonic (combined-odds math) |
| Size 2/3/4/5+ leg | **23% / 11% / 4% / 0%** — monotonic |
| Same-market stack vs distinct | 11% vs **16%** — stacking mildly hurts |
| Avg-conf ≥2.5 vs <2.5 | **12% vs 20%** — confidence anti-predictive |

Samples are small per day — read aggregates, not single cells.

---

## 6. Root-cause findings (PHASE 4)

| # | Suspected issue | Evidence | Confidence | Fix category |
|---|-----------------|----------|:----------:|--------------|
| 1 | **Overconfident `model_prob`** → anti-predictive edge | `edge = model_prob − implied`; top-edge legs hit 49% vs 57%; claimed edges up to 46pp; Brier ≈ coin-flip | **High** | model/scoring fix (recalibrate sigma + projection bias) |
| 2 | **`confidence` is just binned edge** | `mlb_model.py` lines 286–294 set High/Med/Low from `edge_pp` | High | scoring fix (decouple, or stop surfacing as quality) |
| 3 | **Model adds negative value vs market** | implied-band gaps negative; market top-half 60% vs model edge top-half 49% | High | model fix / UI honesty (don't imply edge over market) |
| 4 | **Same-market / Over stacking correlation** | distinct-market slips 16% vs stacked 11%; 71–88% Over legs (audit PART B) | Medium | optimizer fix (decorrelation caps — already proposed, inert) |
| 5 | Risk-section & size labels honest | section/size ordering monotonic | High | none — keep |
| 6 | Volatile-market over-use (`batter_total_bases`) | recurring sub-42% (audit + policy) | Medium | needs more data / suppression (deferred, approval-gated) |
| 7 | Bank Builder draws from the same uncalibrated pool | inherits leg pool; no separate calibration | Medium | optimizer/UI fix (strict pool — deferred) |
| — | **No code bug in the edge formula** | formula is correct `(p−implied)`; inputs are mis-calibrated | High | not a bug — model calibration |

---

## 7. Strategy comparison (PHASE 5, offline)

Leg hit rate by day under three lenses (filter-based, no re-run):

| Date | All | Implied ≥ 58% (lean market) | Drop edge ≥ 20pp |
|------|----:|----------------------------:|-----------------:|
| 05-27 | 48% | **60%** | 48% |
| 05-28 | 46% | 43% | 39% |
| 05-29 | 65% | **71%** | 65% |
| 05-30 | 54% | **68%** | 54% |
| 06-01 | 56% | **69%** | 58% |

- **Strategy 1 (current):** 357 slips, slip-hit 13%, leg-hit 53%.
- **Strategy 2 (volume discipline):** no scoring change; cap output, drop
  cold sections, honest empty states. UX/honesty only — **no hit-rate
  claim**. Supported (section/size ordering is honest).
- **Strategy 3 (calibration-informed):** the **only** directionally useful
  filter is **lean on market-implied probability** (implied ≥ ~58%) — it
  lifts leg hit on **4 of 5 days** (~53% → ~62%). But this leans on the
  **market**, not the model. "Drop high-edge" is roughly neutral. **No
  model-edge filter helps.**

---

## 8. Recommendation (PHASE 6) — **Outcome C**

1. **Do not** make any model-edge-based quality claim or wire `edgePct` /
   `confidence` as a quality gate — they are not predictive (edge is
   anti-predictive). Keep the inert `PROPOSED_SECTION_LEG_GATES` /
   `PROPOSED_SECTION_DECORRELATION_CAPS` as-is.
2. **Safe near-term product move (separate, your call):** volume discipline
   + honest "fewer cards today" empty states. No hit-rate promise.
3. **If quality is pursued:** the evidence path is **market-implied
   probability**, plus **recalibrating the projection→probability step**
   (sigma/variance estimate; per-market projection-bias correction), then
   proving calibrated probabilities **beat the market out-of-sample** —
   *before* any live wiring. This is a model project, not a quick fix.
4. **Collect more data / improve tracking** — 217 legs over 5 days is thin;
   per-day cells are noisy. A longer settled history will sharpen every
   conclusion above.

**Not Outcome D:** there is no code bug in the edge formula; the inputs are
mis-calibrated.

---

## 9. Risks & what must NOT be claimed publicly

- **Never** present `edgePct`/`confidence` as implying a higher win
  probability — the data says the opposite.
- **Never** claim a guaranteed or target hit rate (e.g. "70%"), "lock",
  "can't miss", etc.
- The market-implied finding is **directional and underpowered** (n small,
  one mildly-negative day) — do not over-claim it either.
- Keep "lower-variance", never "safe/safety", in any section copy.

---

## 10. Next PR plan (paused pending your direction)

- **This PR (#TBD):** offline calibration script + this doc only. No live
  wiring, no UI behavior, no workflow change.
- **If you approve volume discipline:** a small PR adding output caps +
  honest empty states (UX/honesty), with tests + a shadow check; no
  hit-rate claim.
- **If you approve calibration work:** a *shadow-only* calibration score
  (market-implied-anchored) computed alongside today's, compared
  out-of-sample for ≥2 weeks before any wiring decision.

*Investigation 2026-06-02 ~05:45 ET. Offline only. main `3e4a248`. No live
behavior changed; paused for operator direction.*
