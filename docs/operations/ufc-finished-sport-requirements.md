# UFC finished-sport requirements

Minimum bar per layer (each gates the next; picks require ALL).
- **A. Schedule** (have source): event name/date/venue, bouts, fighters, weight
  class, bout order, status → `scheduleReady`.
- **B. Odds** (missing): moneyline + method + rounds total/props, book + timestamp,
  freshness; never odds-only picks → `oddsReady`.
- **C. Fighter stats** (missing): record, age/height/reach/stance, strike & TD
  off/def, sub rate, finish/decision rate, recent history, layoff, opponent-quality
  proxy, freshness → `fighterStatsReady`.
- **D. Projections** (gated): calibrated win/method/round probabilities + a
  market-implied baseline + model-vs-implied edge + backtest-calibrated uncertainty
  → `projectionsReady = schedule & odds & stats & grading`.
- **E. Grading** (missing): winner, method, round/time, prop results, push/void/NC,
  idempotent settlement, Results integration → `gradingReady`.
- **F. Backtest** (missing): historical odds + outcomes, walk-forward validation,
  Brier/calibration, per-market thresholds → `backtestReady`.
- **G. Product**: polished `/ufc` page, gated empty states, methodology, Results
  only when graded, no fake picks, no banned copy.

Readiness is emitted by `pipeline/ufc/build_readiness.py` →
`app/public/data/ufc/readiness-latest.json`, derived from real gate state (never
hardcoded optimism). `parlayReady` requires every gate true.
