# NCAAF-002 — Team ratings and baselines: result

**Status: research champion selected; Gate 002 research bars FAIL on calibration (bar b).** Nothing here is a
published or qualified model. Protocol: `MODEL_EVALUATION_PROTOCOL.md` v1 + Amendment 1 (both committed before
any fit: `57ab65e`, `c48b860`). Freeze: `a51670819b` (code, dev and validation receipts, frozen configs) →
holdout scored once at `b162a0644`.

## Chronology (what was seen when)

1. Protocol registered, then Amendment 1 (out-of-sample residual scale), with no fit in between.
2. **Dev 2021–22** (FBS–FBS, n = 1,546): registered grids tuned (`002-dev-tuning.json`). C1: 192 configs;
   C2: 16; C3: 4.
3. **Validation 2023** (n = 792): selection rule §6 (`002-validation.json`).
4. Freeze committed → **holdout 2024–25** (n = 1,606) scored once (`002-holdout-receipt.json`). A second run
   reproduced it byte-for-byte (write-once check).

## Selected

| Role | Candidate | Frozen config |
|---|---|---|
| Winner champion | **C1 Elo + MOV** | K 30 · HFA 40 · carry-over c 0.8 · FCS offset 200 |
| Score champion | **C2 ridge offense/defense** | λ 2 · half-life 240 days |

Validation selection steps (paired week-bootstrap, 2,000 reps; Δ = challenger − incumbent):
- Winner: C1 replaced B0 (Δ log loss −0.142, 95% CI [−0.175, −0.104]). C2 and C3 did not replace C1 (CIs span 0).
- Score: B1 → C1 → C2 each replaced the incumbent. C3 did not replace C2 (Δ −0.110, CI [−0.274, +0.035]).

## Holdout 2024–25 (FBS–FBS, n = 1,606, 2 seasons, week clusters)

| Model | Log loss | Brier | ECE | Cal. slope / intercept | Margin CRPS / MAE / 80% cov | Total CRPS / MAE / 80% cov |
|---|---|---|---|---|---|---|
| B0 | 0.6931 | 0.2500 | 0.088 | — | 11.64 / 16.25 / 0.811 | 9.51 / 13.50 / 0.823 |
| B1 | 0.6768 | 0.2418 | 0.007 | 0.88 / +0.07 | 11.34 / 15.80 / 0.809 | 9.51 / 13.50 / 0.823 |
| **C1** | **0.5642** | 0.1925 | **0.040** | 1.04 / **+0.13** | 9.41 / 13.27 / 0.816 | (B0 total) |
| C2 | 0.5610 | 0.1922 | 0.056 | 1.23 / −0.34 | **9.20 / 12.91 / 0.811** | **9.14 / 12.92 / 0.799** |

**Research bars (§8):**
- (a) C1 beats B1: Δ log loss −0.113, 95% CI [−0.136, −0.092]. **PASS.**
- (b) C1 calibration: ECE 0.040 > 0.03 (slope 1.04 is within bounds). **FAIL.**
- (c) C2 80% coverage: margin 0.811, total 0.799. **PASS.**

**Gate 002: FAIL (bar b).** Per §8 C1 proceeds as the *research champion, failed calibration bar b*.

### Diagnostics (C1, holdout)
- The positive intercept and the reliability table (observed home-win rate above forecast in 8 of 10 bins)
  point to **home field being under-weighted**. The tuned HFA of 40 Elo points sat on the **lower edge** of
  its registered grid, as did FCS offset 200 (lower edge) and carry-over 0.8 (upper edge). C2's λ = 2 and
  C3's λ_c = 1 were also on grid edges. The registered grids did not bracket the optima.
- Cohorts: weeks 1–4 LL 0.552 (n 389), weeks 5+ 0.562 (n 1,125), neutral 0.657 (n 115, ECE 0.069),
  postseason 0.642 (n 92, ECE 0.069). Per season: 2024 LL 0.579, 2025 0.550.
- **FBS–FCS secondary cohort: LL 0.264, ECE 0.163 (n 247)**, poorly calibrated. This is consistent with an FCS
  prior offset that is too small. FBS–FCS forecasts are not supportable from this baseline.
- C2's slope 1.23 (underconfident) is the opposite failure; its totals beat B0's (CRPS 9.14 vs 9.51, bias
  +0.6 vs +2.45 points).

## What this does and does not establish

- A scores-only Elo is a real improvement over home-field-only (about 0.11 nats per game) on two unseen seasons.
- It is **not calibrated to the registered bar**, and the holdout is now spent: any recalibration or re-tuned
  grid is an NCAAF-004 challenger. It must be evaluated on 2026 forward evidence, or with 2024–25 explicitly
  marked contaminated.
- No market comparison exists: there is no timestamped price history (PAID_DECISION).

## Hand-offs to NCAAF-003/004

- NCAAF-003 builds worlds from the **C2** joint score distribution (the score champion). Its world win
  probability will differ from C1's P(home). Per §6 the inconsistency is reported, not patched.
- NCAAF-004 registered challengers (hypotheses, not results): (1) widened grids for HFA, FCS offset,
  carry-over, λ, λ_c; (2) recalibration fitted on earlier seasons only; (3) a division-level effect in C2/C3
  for FBS–FCS.

Receipts: `data/internal/research/ncaaf/experiments/002-{dev-tuning,validation,freeze,holdout-receipt}.json`.
Reproduce (from `app/`, Node 20.4.0): `node scripts/ncaaf/evaluate-baselines.mjs --phase holdout --now 2026-10-09T23:00:00Z`
→ "holdout receipt reproduced byte-for-byte".
