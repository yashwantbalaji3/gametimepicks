# UFC Saturday Launch Decision (latest)

> Next card: **UFC Freedom 250 (2026-06-15)**, 7 bouts (no 06-13 card).

1. **Show UFC schedule?** YES — event + bouts + matchups are available free
   (ESPN). A schedule-only / "coming soon" surface is compliant and ready.
2. **Show UFC projections?** **NO** — no odds ingestion, no fighter stats, no
   model. Cannot project without fabricating.
3. **Show UFC suggested parlays?** **NO** — no odds, no grading, no backtest.
   Fail-closed (`ufcCanPublishParlays(UFC_CURRENT_GATES) === false`).
4. **If yes, which markets?** None publishable.
5. **Exact blockers:** (a) MMA odds ingestion (configurable Odds API sport key +
   cost-guarded fetch); (b) fighter-stat provider; (c) results/grading source
   (ESPN MMA results are free — most tractable); (d) sample-controlled backtest.
6. **Fastest SAFE path:** schema + fail-closed gates (DONE) → add MMA odds key +
   free ESPN results grader → market-implied baseline (INTERNAL only) → fighter-
   stat provider → real model → backtest → gated public projections → parlays.
   Each step flips one `UfcLaunchGates` flag; nothing publishes until the
   resolver clears it.
7. **Paid calls used:** **none.**
8. **Remains internal:** everything beyond the schedule until the gates pass.

## Bottom line
This Saturday: **UFC schedule-only** is honest and shippable; **no UFC
projections or parlays** — that would require faking data the app does not have.
The fail-closed schema/gates + this path are the real progress.
