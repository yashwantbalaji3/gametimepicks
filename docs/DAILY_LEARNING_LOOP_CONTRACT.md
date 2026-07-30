# Daily Learning Loop — Contract

**Program:** 066–068 · **Status:** ratified policy
**Governing documents:** `PRODUCT_STRATEGY_RESEARCH_TERMINAL.md` (research terminal, not a proven oracle) · `MLB_FINAL_MODEL_DECISION.md` (independent sportsbook-beating R&D suspended by a preregistered stopping rule)

---

## What "everyday learning" means here

The platform learns every day. It does **not** retrain every day. Those are different things, and conflating them is how a research product quietly turns into an overfitting machine.

Each day the loop settles completed events from official sources, appends new evidence to a corpus that is never rewritten, recomputes diagnostics against that corpus, and publishes what changed. What it produces is **evidence and governance artifacts**. What it never produces is a silently different model.

## The ordered loop

```
official finals
  → lineage-gated settlement (fail-closed; refuses rather than guesses)
  → closed-population reconciliation (generated = settled + refused + unavailable + quarantined)
  → prediction-history append  (append-only; historical rows are immutable)
  → model / market / calibration diagnostics on identical rows, market de-vigged
  → structured autopsy (wins, losses, voids, unavailable, high-disagreement)
  → market registry / capability status
  → public research contract
  → next slate generation and publication
```

Each stage consumes the stage above it. A stage that cannot run **stops the chain and says so** — it does not skip ahead with partial inputs. The 2026-07-29 gap is the worked example: no board was generated, so settlement had nothing to grade, so no learning artifact exists for that date. The correct output was a blocked status, not a reconstructed one.

## Permitted daily learning

- Settle completed events through the lineage gate.
- **Append** newly settled rows to the corpus. Never rewrite an existing row.
- Refresh calibration diagnostics, probability buckets, Brier/log-loss vs the de-vigged market, uncertainty intervals, market-family status.
- Produce a structured autopsy covering wins **and** losses, voids, unavailable rows, and the largest disagreements in both directions.
- Measure drift, coverage, missingness, identity conflicts and variance behaviour on forward data.
- Update public artifacts, the daily brief, system status and the honesty ledger.
- Add to a **hypothesis queue** — each entry naming a mechanism, the data required, a sample target, and the preregistration it would need.

## Prohibited, without exception

- **No same-day weight update.** Nothing fitted on today's outcomes reaches today's or tomorrow's production probabilities.
- **No refit of the production calibrator** on a day's results. The persisted `platt-1` layer is applied exactly as versioned.
- **No deployment of the final variance candidate.** It improved the model and still lost to the market; the stopping rule triggered. It stays research.
- **No threshold change that makes output look stronger.** Thresholds move only via preregistration.
- **No market-family reactivation** — `batter_total_bases` above all — without a new forward preregistration and founder approval.
- **No claim that daily learning implies predictive superiority.** Learning is about honesty and coverage, not edge.

## Why a single day can never change the model

A day is roughly 400–600 decisive rows. That is enough to notice an operational defect and nowhere near enough to distinguish a real capability change from variance — the corpus that produced the current verdict is 21,633 rows, and even that only supported a *negative* conclusion. Selecting a model because yesterday flattered it is precisely the circular optimization the stopping rule exists to end. So a daily result may:

- change an **operational** status (a source failed, a slate is quarantined, coverage dropped),
- add to the hypothesis queue,
- surface a data-quality defect for immediate repair,

and may **not** change weights, calibration, market policy or capability level.

Each day's conclusion is classified as one of: `NORMAL_VARIANCE` · `DATA_QUALITY_ISSUE` · `CALIBRATION_DRIFT` · `CAPABILITY_CONCERN` · `INSUFFICIENT_SAMPLE`. Only sustained, preregistered evidence across many days can promote a `CAPABILITY_CONCERN` into an action.

## Public language

| Internal | Public | Never |
|---|---|---|
| raw model output | raw simulation probability / simulated distribution | true win probability, validated prediction |
| calibrated output | calibrated simulation estimate | sportsbook-beating probability |
| market comparison | sportsbook no-vig probability, model–market gap | edge, advantage |
| daily board | today's research slate, simulation reads | locks, best bets, guaranteed plays |
| learning | what the platform learned after settlement | the model got smarter overnight |

"The model learns every day" is a true statement about the *platform's* knowledge and a false one about the *model's* parameters. Public copy must not blur it.

## Evidence labels

- **PROVEN** — the loop's ordering is enforced by the pipeline: settlement is lineage-gated and fail-closed, the corpus is append-only, and the production calibrator is applied from a persisted, versioned artifact rather than refitted.
- **BLOCKED** — 2026-07-29 produced no learning artifact because no board existed to settle. Documented in the execution log; not reconstructed.
- **WALL_CLOCK_OPEN** — the first clean post-gate settlement has still not been observed, so the loop has not yet run end-to-end on a stamped slate.
- **REJECTED** — same-day retraining; refitting the calibrator on fresh outcomes; reactivating a disabled market on a good day.
- **FUTURE WORK** — a date-versioned machine-readable learning artifact per settled date, once a clean settlement exists to generate the first one honestly.
