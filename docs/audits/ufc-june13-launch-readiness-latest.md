# UFC June-13 launch readiness — DECISION: HOLD (Case B)

**Public June-13 UFC projections/parlays are NOT published. The full model is built
and internal; public picks stay LOCKED — honestly.**

## Two independent blockers
1. **No backtest yet** (`backtestReady=false`): 0 completed fights with a clean
   pregame OddsAPI snapshot. No out-of-sample validation → no public projections.
   `parlaySimReady=false` too → no parlays.
2. **No real June-13 card in the odds**: the available OddsAPI MMA events are
   **futures/hypothetical** — Alex Pereira appears in 3 different same-time bouts
   (vs Ulberg / Prochazka / Jones) + Ankalaev/Ulberg. The feature builder flagged
   **all 4 as `isFutures=true`** and blocked 1 (unmatched name). There is no clean
   scheduled card to project.

## Point-in-time feature audit (Phase 2)
`fighters-latest.json` is **full-career** summaries. Using it for an UPCOMING fight
is leakage-safe (the fight hasn't happened). Using it for a HISTORICAL backtest is
NOT (career stats include the predicted fight). So we do **not** claim a valid
historical backtest from full-career features; a point-in-time feature builder
(reconstructing pre-fight stats from dated Greco history) is required first.

## What was built (internal, real, tested)
- `build_features.py` → `features-latest.json` (matchup deltas + data-quality +
  futures detection; fail-closed on missing stats / non-pregame odds).
- `model_moneyline.py` → `projections-internal-latest.json` (market baseline +
  capped ±4pp shrunk stats adjustment; **publicEligible=0/4**, all "No-play").
- `build_suggested_parlays.py` → `suggested-parlays-internal-latest.json`
  (publicReady=false; blockers: backtest + parlaySim + no eligible legs).
- 59 UFC tests pass; readiness stays `grading-internal`.

## Path to a real launch
1. Point-in-time feature builder (pre-fight stats from dated Greco history).
2. Forward clean odds accumulation (~150 graded rows) OR a licensed historical
   odds set → backtest passes → `backtestReady`.
3. Parlay simulation on graded projections → `parlaySimReady`.
4. A real scheduled card in the odds (not futures) with matched fighters.
Then the readiness ladder flips and `/ufc` publishes — no copy edits needed.
