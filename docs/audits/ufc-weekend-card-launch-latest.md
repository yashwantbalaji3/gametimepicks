# UFC weekend real-card launch — DECISION: HOLD (Case B), with real internal projections

**Source of truth = the actual ESPN card. Public picks remain LOCKED (no backtest).
Real internal projections generated for the real card.**

## Real card (schedule-latest.json, source ESPN MMA)
**UFC Freedom 250: Topuria vs. Gaethje**, 2026-06-15T00:00Z, 7 bouts, isRealCard=true:
Garcia/Lopes, Daukaus/Nickal, Chandler/Ruffy, Lewis/Hokit, Zahabi/O'Malley,
Gane/Pereira, Gaethje/Topuria.

## Odds reconciliation (schedule wins; futures dropped)
Fresh OddsAPI fetch (20 events, 20 credits, ~19,409 remaining) included the real
card PLUS futures (Pereira ×3 same-time) PLUS other-card bouts (Shevchenko/Silva,
Kape/Horiguchi…). Card-only reconciliation kept **6/7** real-card bouts, dropped 14
non-card/futures. The 7th (Garcia "Jr.") fail-closed at the fighter-stats lookup
(suffix mismatch in the stats index — conservative, not guessed).

## Real internal projections (projections-internal-card-latest.json)
Market baseline + capped ≤4pp shrunk stats adjustment. e.g. Topuria 80%,
Nickal 74%, O'Malley 78%, Pereira/Gane 50/50. All adjustments tiny (±0.001),
all **publicEligible=0/6**, all labeled "No-play".

## Why public is HELD (Case B)
backtestReady=false (0 completed clean pregame-odds rows → no out-of-sample
validation) and parlaySimReady=false. Per the gates, no public projections/parlays.
readiness stays `grading-internal`; `/ufc` shows odds + readiness + an honest
"model built / internal projections / awaiting validation" note.

## What this added
- `build_schedule.py` (ESPN, source of truth; futures/duplicate-fighter detector).
- card-only reconciliation in `build_features.py` (suffix-tolerant matching; drops
  futures/off-card; reports unmatched scheduled fights).
- card-only modes in `model_moneyline.py` + `build_suggested_parlays.py`.
- internal artifacts: schedule, features-card, projections-internal-card,
  suggested-parlays-internal-card (publicReady=false).

## Path to public
Accumulate clean pregame odds forward (snapshots now logged) → ~150 graded rows →
backtest passes → projectionsReady; + parlay sim → parlayReady. Then the same
card-only pipeline publishes automatically. Also: make the fighter-stats lookup
suffix-tolerant so Garcia-type matches resolve (currently fail-closed).
