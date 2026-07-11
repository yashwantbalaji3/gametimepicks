# model/

Quantitative strategy and the model-learning loop. Tracks market reliability, calibration, and the disciplined rule for *when* a settled sample justifies a change (never overfit one night).

Living files to keep here: `RELIABILITY_LEDGER.md` (running settled record by market, the single scoreboard), `LADDER_V2_DECISION.md` (the biggest pending model call), and pointers to `docs/MODEL_REVIEW_<date>.md`.

**Hard rule:** do not tune any market with <10 settled observations in its cell.
