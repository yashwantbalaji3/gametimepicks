# UFC free-stats data requirements (Stage 1 moneyline model)

Fields the first REAL UFC moneyline model needs, classified by stage.

## Required for Stage 1 (moneyline)
fighter canonical name + source id · fight date · opponent · result (W/L/D/NC) ·
method · round · weight class · event name · career record before fight · recent
fight history before fight · days since last fight · height/reach/stance ·
finish/decision rates.

## Useful for Stage 2 (richer model)
sig strikes landed/attempted, absorbed, accuracy, defense · takedowns
landed/attempted, accuracy, defense · submission attempts · per-minute rates ·
opponent-quality proxy · age at fight · fight location.

## Nice-to-have
time/round detail, referee, scorecards, control time, KD, reversals.

## For grading
result (winner), method, round, time, push/void/NC, by bout.

## For backtest
historical results (above) + historical pre-fight odds (forward OddsAPI logging,
or a licensed historical-odds dataset).

**Coverage check vs free sources:** Greco1899 CSVs supply nearly all Stage-1 +
Stage-2 fields (tale-of-the-tape + per-fight strike/TD stats + results). Historic
odds are the one gap free-and-clean → solve by logging OddsAPI snapshots forward.
