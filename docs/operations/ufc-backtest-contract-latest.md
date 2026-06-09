# UFC backtest contract

## Dataset row (build_backtest_dataset → backtest-dataset-latest.json)
boutId, eventName, eventDate, fighter, opponent, result, winner, market=h2h,
oddsPrice, impliedProbability, oddsSource, oddsFetchedAt, oddsWasPregame (always
true — post-commence excluded), leakageCheck. Metadata: sourceOddsSnapshots,
rowCount, eventCount, excluded{post_commence,no_result,non_final,ambiguous,
unlicensed}, leakageFailures, backtestReadyCandidate, insufficiencyReason.

## Leakage rules (HARD)
- Only odds snapshots fetched STRICTLY before commence time (pregame).
- Use the LAST pregame snapshot per bout.
- Only final fights; pending/unknown/no-contest/draw excluded.
- Only licensed odds sources (The Odds API MMA); unlicensed excluded.
- No synthetic odds. No post-fight odds. No future results.

## Calibration (backtest_moneyline_model → backtest-summary-latest.json)
Market-implied baseline Brier + calibration buckets. The fighter-stat MODEL is
NOT validated (no point-in-time pre-fight feature snapshots yet → leakage); only
the market baseline is leakage-safe today. launchDecision = pass only at >=150
clean rows + no leakage + computed Brier.

## Gate (backtest_gate → backtestReady)
backtestReady=true only if summary rowCount>=150 AND launchDecision==pass AND no
leakage. parlayReady additionally requires parlaySimReady (separate gate).
