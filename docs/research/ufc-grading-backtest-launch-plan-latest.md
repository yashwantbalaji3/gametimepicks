# UFC grading + backtest launch plan (June 9)

1. **Odds-snapshot logging (start now, free):** the refresh workflow already writes
   `odds-latest.json`; persist dated snapshots so we accumulate a real odds history
   for a self-built backtest (no purchase).
2. **Result ingestion:** ESPN MMA (free) for winner/method/round once a fight is
   final; mirror `settle_mlb_results` idempotency.
3. **Moneyline grading first** → method/rounds later (separate thresholds).
4. **Historical sample needed:** ~50–100 graded fights for internal calibration;
   **150+** (or strong walk-forward) before any PUBLIC moneyline projection.
5. **Calibration metrics:** Brier + calibration curve per market (reuse the MLB
   backtest-harness pattern).
6. **Launch gates (ladder already enforced):**
   - Stage 1 (NOW): odds board live, picks locked (`odds-internal`).
   - Stage 2: + fighter stats → internal moneyline probabilities only.
   - Stage 3: + grading + backtest pass → `projectionsReady` (public projections).
   - Stage 4: + Suggested-Parlay simulation positive → `parlayReady` (strict
     Low/Bank controls).
Each gate flips only from real, validated state via `build_readiness.py`.
