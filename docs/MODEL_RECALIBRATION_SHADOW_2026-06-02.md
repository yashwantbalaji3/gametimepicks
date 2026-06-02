# Projection→Probability Recalibration — SHADOW STUDY (2026-06-02)

> **Shadow-only execution of the recalibration plan proposed in
> [`MODEL_CALIBRATION_2026-06-02.md`](./MODEL_CALIBRATION_2026-06-02.md) §8/§10
> and the handoff §9.** Offline, read-only. **No live wiring; no
> optimizer/UI/model behavior changed; no workflow changed;
> `audit/policy.json` not consumed; no hit-rate claim.** Only settled
> public-era data (May 27 – June 1); **May 25/26 excluded**;
> pending/unresolved legs excluded; no same-slate leakage. Approval-gated:
> nothing is wired and nothing will be wired without explicit operator
> instruction.

---

## 1. Executive summary

The #240 audit found the model's probability is **overconfident** (Brier ≈
coin-flip) and that **market-implied probability is the only separating
signal**. This study tests the proposed fix: **recalibrate the
projection→probability step and check whether the recalibrated probability
beats the market out-of-sample (OOS)** under leave-one-day-out (LOO).

**Result — two clean findings:**

1. **Recalibration fixes the model's *calibration*.** The production
   projection→probability step is **~2.3–3.8× too confident**. Widening
   `sigma` (and gently shrinking the projection toward the line) cuts the
   model's **OOS Brier from 0.2753 → 0.2444** — i.e. from *worse than the
   0.25 coin-flip baseline* to roughly market-level.
2. **It does NOT beat the market out-of-sample.** Pooled OOS Brier:
   recalibrated **0.2444** vs market **0.2436** — a tie that the market
   *wins*, and the market baseline still carries vig (a de-vigged market
   would be clearly lower/better). Recalibration beats the market in only
   **1 of 5 day-folds**.

**Decision (per the handoff rule "wire only if recalibrated beats the
market OOS across folds"): KEEP SHADOW / observational. Do NOT wire.**
Fixing calibration is real and useful, but it is **not** a reason to wire
and it is **not** a hit-rate claim. The apparent ranking edge (recalibrated
separation +17pp vs market +13pp) is **parasitic on the market line**, not
independent model skill (see §6) — it must not be read as a green light.

---

## 2. Method

- **Source:** `app/public/data/parlays/optimizer-graded/<date>.json`.
- **Slates:** 2026-05-27, -28, -29, -30, 06-01. May 31 has no graded slate.
- **Excluded:** May 25/26 (pre-public-era); pending/unresolved legs; June 2
  (not settled at study time).
- **Dedup:** one row per `(date, leanId)` — exposure-unbiased.
- **Size:** **217 unique settled legs** (166 MLB / 51 NBA), 53.0% hit. Per
  day: 31 / 56 / 31 / 67 / 32. NBA present only on 05-28 (24) & 05-30 (27).

**Production mapping being recalibrated (identical NBA + MLB):**
`P(over) = 1 − Φ((line − projection) / σ)`, then `edgePct =
(model_prob − implied) × 100`. (`pipeline/score_model.py` NBA;
`pipeline/mlb/mlb_model.py` MLB.)

**Reconstruction:** each graded leg stores `projection`, `line`, `side`,
`recentSeries`, `oddsForSide`. We rebuild `σ_base = max(pstdev(recentSeries),
floor)` (MLB floors from `mlb_model.py`: hits 0.85 / TB 1.10 / HRR 1.20 / K
1.6; NBA → `pstdev(recentSeries)`). Fidelity vs the stored `edgePct`:
**MLB median 0.02pp** (mean 1.03), **NBA median −1.00pp** (mean 1.63) — i.e.
the reconstruction reproduces production. Because *current*, *recalibrated*,
and *market* probabilities are all computed from the **same** reconstruction,
residual fidelity error largely cancels in the relative comparison.

**Recalibration knobs (projection→prob step only):**
- σ-scale `k`: `σ' = k · σ_base` (k>1 ⇒ less overconfident).
- projection shrink `λ`: `proj' = line + λ·(proj − line)` (λ<1 ⇒ damp the
  projection toward the line = scale-free projection-bias correction).
- Fit `(k, λ)` by **minimizing Brier on the training folds**; evaluate OOS.

**Market baseline:** raw implied of the chosen side (`oddsForSide`),
matching the #240 convention. It **includes vig**, so as a probability
estimate it is biased high (~2–3pp); the true (de-vigged) market is a
*harder* bar than the numbers below — which only strengthens the verdict.

**Evaluation:** **leave-one-day-out** — fit on the other 4 days, evaluate
the held-out day; repeat for all 5. No fold fits on the day it scores; each
leg is graded against its own final box score (post-hoc, no forward leak).

Reproduce: `cd app && npx tsx scripts/shadow-projection-recalibration.mjs`.

---

## 3. Baseline calibration (confirms #240)

| Metric | CURRENT model | MARKET (raw implied) |
|--------|:-------------:|:--------------------:|
| Brier (lower better) | **0.2753** | 0.2436 |
| LogLoss | 0.7632 | 0.6799 |
| Separation (top vs bottom-half leg hit) | +19pp (44%→62%) | +13pp (46%→60%) |

Current model_prob is **overconfident** — the calibration table runs
negative across every band, worst at the top:

| model_prob band | n | predicted | ACTUAL | gap |
|-----------------|--:|:---------:|:------:|:---:|
| 50–55% | 7 | 51% | 29% | −23pp |
| 60–65% | 28 | 63% | 50% | −13pp |
| 65–70% | 36 | 68% | 33% | −34pp |
| 70%+ | 126 | 79% | 62% | −18pp |

The model concentrates **126/217 legs above 70% claimed probability**, which
actually hit 62%. That over-concentration is the overconfidence #240 named.

---

## 4. Recalibration fit

**In-sample (optimistic):** σ-only `k=3.8` → Brier **0.2439** (from 0.2753);
σ+shrink `k=2.3, λ=0.6` → **0.2439**. Both essentially reach the market's
0.2436 — recalibration removes nearly all the *miscalibration* gap.

**Leave-one-day-out (honest, OOS):**

| Held-out day | n | Brier current | Brier **recal** | Brier market | recal<market? | fit (k, λ) |
|--------------|--:|:---:|:---:|:---:|:---:|:---:|
| 05-27 | 31 | 0.2743 | 0.2460 | 0.2457 | no | 2.3, 0.6 |
| 05-28 | 56 | 0.2975 | 0.2482 | 0.2679 | **YES** | 2.3, 0.7 |
| 05-29 | 31 | 0.2396 | 0.2351 | 0.2203 | no | 1.8, 0.4 |
| 05-30 | 67 | 0.2752 | 0.2447 | 0.2372 | no | 1.1, 0.3 |
| 06-01 | 32 | 0.2723 | 0.2448 | 0.2349 | no | 2.7, 0.7 |

**Pooled OOS (n=217):** Brier — current **0.2753**, recalibrated **0.2444**,
market **0.2436**. Separation — recalibrated **+17pp** (44%→61%), market
**+13pp** (46%→60%).

The fitted `k` is **unstable across folds (1.1–2.7)** — a generalization red
flag on this thin sample.

---

## 5. Verdict (decision rule)

| Criterion | Pass? | Detail |
|-----------|:-----:|--------|
| Recal Brier < market Brier (pooled OOS) | **NO** | 0.2444 vs 0.2436 (market still ahead; vig-inflated, so true gap worse) |
| Recal separation > market (pooled OOS) | yes | +17pp vs +13pp — but see §6, not decisive |
| Recal beats market in majority of folds | **NO** | 1 / 5 |

**➤ Recalibration does NOT beat the market out-of-sample → KEEP SHADOW /
observational. Do NOT wire.** Approval-gated; no live change made.

---

## 6. Why the +17pp separation is NOT a wiring signal

It is tempting to read "recalibrated separation +17pp > market +13pp" as the
model beating the market. It is not:

- `model_prob = implied + edge`. The **implied** component carries the
  positive separation (+13–14pp, #240); the **edge** residual is
  **anti-predictive** (top-edge legs 49% vs bottom 57%, #240). So
  `model_prob` separates winners **mostly because it is anchored to the
  market line** — the separation is *parasitic on the market*, not
  independent model discrimination.
- σ/λ recalibration is ~**monotone** in the model's own ranking, so it
  **cannot manufacture discrimination the model never had** — it only
  rescales confidence. That is exactly why recalibration moves Brier
  (calibration) but barely moves separation.
- n=217 over 5 noisy days; a +4pp separation delta is within noise.

**Bottom line:** recalibration is a *calibration* fix, not a *discrimination*
fix. The model still adds no reliable edge over the market.

---

## 7. What this changes / does not change

- **Changes:** adds one offline, read-only analysis script
  (`app/scripts/shadow-projection-recalibration.mjs`) + this doc. Nothing
  else.
- **Does NOT change:** optimizer, scoring, UI, workflows, public output,
  `audit/policy.json` consumption, risk-section logic, Bank Builder
  (paper-only), sport coverage. No data fabricated. No May 25/26 use. No
  performance/hit-rate claim.

---

## 8. Honest limitations & suggested next steps (all approval-gated)

- **Thin sample** — 217 legs / 5 day-folds; unstable fitted `k`. The single
  most valuable next step is **more settled history**, then re-run.
- **De-vigged market baseline** — recompute the market bar with both-side
  odds (the graded leg currently stores only the chosen side) for a fair,
  *harder* comparison. Expectation: it widens the gap against the model.
- **Residual-signal test (only if pursued):** instead of model-vs-market,
  test whether a **market-anchored blend** (implied + a *shrunken* model
  term) lowers OOS Brier vs implied alone. If — and only if — that beats
  de-vigged market OOS across folds would wiring be on the table, and then
  **only behind a shadow column on `/results` for ≥2 weeks before any live
  decision.**
- **Distributional form** — MLB count markets (hits 0.5/1.5) are not truly
  normal; a Poisson/empirical variant is a future lens (kept out of scope to
  stay apples-to-apples with the production normal-CDF mapping).

*Study 2026-06-02. main `9abddd3`. Latest settled `2026-06-01`. Offline,
read-only, shadow-only. No live behavior changed; paused for operator
direction before any wiring.*
