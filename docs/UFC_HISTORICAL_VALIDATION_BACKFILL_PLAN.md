# UFC Historical Validation Backfill Plan (2026-07-10)

The real work to unlock model-adjusted UFC picks (`publicPicksVisible=true`). **No faking, no threshold
lowering** — this is the honest path only.

## Current state

```
moneylineValidated:  false
publicPicksVisible:  false
cleanGradedRows:     0
targetRowsForPublic: 150
backtestReady:       false      blocker: "no historical backtest yet"
```

The pipeline to reach validation ALREADY EXISTS — it just has no graded history yet:

| script (`pipeline/ufc/`) | role |
|---|---|
| `build_schedule.py` | real ESPN MMA cards (free) |
| `build_odds.py` | The Odds API MMA moneylines (paid, credit-guarded) |
| `build_results.py` | fight outcomes for settled cards |
| `grade_moneylines.py` | grade model moneyline picks vs outcomes → graded rows |
| `build_backtest_dataset.py` | assemble the no-leakage backtest set |
| `backtest_moneyline_model.py` | Brier / log-loss / hit-rate on graded history |
| `build_readiness.py` / `build_ops_status.py` | recompute flags (`cleanGradedRows`, `moneylineValidated`) |

## The gap

There is **no historical graded corpus**. `graded-moneylines-latest.json` grades only the current/most-recent
card; `cleanGradedRows = 0` toward the 150 target. To validate we need **~150 clean graded fights** =
**pre-fight odds snapshot + model pick + official result**, with NO leakage (odds/model as of before the
fight).

### Missing sources
- **Historical pre-fight MMA moneylines.** The Odds API's historical endpoint (`/v4/historical/...`) can
  provide past MMA odds but costs credits per snapshot — needs a founder-approved credit budget. Live odds
  alone don't backfill history.
- **Historical results.** ESPN MMA scoreboard can supply past-card outcomes (free) — a dated backfill of
  completed cards.

## Exact next steps (no fake data)

1. **Historical event index** — enumerate completed UFC cards (ESPN MMA, free) over enough time to reach
   ~150 fights. Commit `data/internal/ufc/historical-cards.json` (internal).
2. **Historical results fetch** — `build_results.py` over that index → per-fight winners.
3. **Historical pre-fight odds** — founder-approved Odds API historical pull (credit-guarded, md5 money
   before/after) → per-fight closing/pre-fight moneyline. If credits aren't approved, STOP here and report.
4. **Grade** — `grade_moneylines.py` joining model pick (as-of) ↔ result → graded rows. Enforce no-leakage.
5. **Backtest** — `backtest_moneyline_model.py` → Brier, log-loss, hit-rate, calibration.
6. **Recompute flags** — `build_readiness.py` + `build_ops_status.py`. `moneylineValidated` flips true ONLY
   if `cleanGradedRows ≥ 150` AND the backtest clears the calibration bar. `publicPicksVisible` is a separate
   founder gate.
7. **Tests** — extend `ufc-public-ready` + `ufc-model-gate`: when `publicPicksVisible=true` in a fixture,
   model output MAY render; otherwise it must stay gated.

## Unlock criteria (all required)
```
cleanGradedRows ≥ 150   AND   backtest calibration passes (no leakage)
AND   publicPicksVisible flipped by founder   AND   tests green   AND   money md5 unchanged
```

## Optional scaffolding (safe, not done this pass)
A `historical-cards.json` index builder + a grader shell that runs on free ESPN results only (odds left
`provider_needed`) could be built with zero paid credits — it would populate the *results* half and make the
odds gap explicit. Deferred to keep this pass money-safe and focused on the leakage gate.
