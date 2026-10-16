# NCAAF-004 — Challenger register and evaluation protocol (v1)

Registered 2026-10-10, **before any 2026 result was fetched or examined.** PRIVATE_RESEARCH. Incumbents
(frozen in NCAAF-002/003): **C1** Elo (winner), **C2** ridge (scores), **W1** `ncaaf-worlds@1` (worlds).

## 1. Windows

- **Tuning:** 2016–2025, all already used in NCAAF-002/003, so no longer blind. Challengers replay from 2016
  and tune on the FBS–FBS games of the window named per challenger.
- **Evaluation E26:** every FBS–FBS played final of the **2026 season with slateDate ≤ 2026-10-05**, from a
  bounded ESPN capture made after this register is committed. No model decision has used 2026 results. One
  2026-10-09 probe of the week-6 scoreboard recorded only status and odds counts. E26 is a **backtest**
  window: there was no pregame capture, so it is **not** forward evidence.
- E26 is scored **once** per challenger, after `004-freeze.json` (tuned configs + code commit) is committed.

## 2. Challengers

| Id | Hypothesis (mechanism) | Change | Tuning (window, objective) | Compared with |
|---|---|---|---|---|
| **H1 C1w** | C1's optima sat on grid edges, so home field and the FCS gap were under-weighted | Elo, widened grid: K {20,30,40,50,60} · HFA {40,55,70,85,100,115,130} · c {0.7,0.8,0.9,0.95} · δ_FCS {200,300,400,500,600,700} | 2021–25, log loss | C1 |
| **H2 C1r** | C1's ranking is good but its probabilities are mis-scaled (holdout intercept +0.13) | frozen C1 + logistic recalibration a + b·logit p, refitted at each season start on C1's own out-of-sample FBS–FBS forecasts of all prior completed seasons ≥ 2017 | none (parameters are data-fitted, as of the season) | C1 |
| **H3 C2d** | ridge shrinks FCS/NON_D1 teams toward the all-team mean, so FBS–FCS forecasts are poor | C2 + division-level offense/defense effects (FBS/FCS/NON_D1), penalty λ_div ∈ {0.1, 1, 10} | (λ, H) from C2's grid × λ_div, 2021–25, margin CRPS + total CRPS | C2 (FBS–FBS primary; FBS–FCS reported) |
| **H4 W2** | margins cluster on 3/7 through game dynamics that a copula of marginals cannot produce | **joint analog worlds**: the outcome distribution is the exact empirical distribution of the (home margin, total) pairs of the K past FBS–FBS games nearest in (C2 expected margin, C2 expected total), standardized by their past SDs, as of the slate. Scores are (T±M)/2. Computed **exactly** over the K analogs (no Monte Carlo, zero sampling error) instead of 10,000 draws. | K ∈ {100, 200, 300, 500}, 2022–25, margin CRPS + total CRPS (exact discrete) | W1 |

## 3. Metrics and decision rule

- Same metrics as `MODEL_EVALUATION_PROTOCOL.md` §5. For H4, add the NCAAF-003 structure table.
- **Replacement rule:** a challenger replaces its incumbent only if the paired week-bootstrap (2,000 reps, seed
  20261009) 95% interval of the primary-loss difference lies entirely below 0 on E26. The primary loss is
  log loss for H1/H2, margin CRPS + total CRPS for H3/H4.
- E26 holds about six regular-season weeks, so **an inconclusive result is the expected outcome**. Then the
  incumbent stays, the challenger stays in shadow, and its point estimate is recorded as "promising" or "not
  promising". Forward evidence (NCAAF-005/006) decides later.
- Gate 004 → 005 (playbook): a complete report with a frozen candidate selection. No challenger needs to win.

## 4. Amendments

_None._
