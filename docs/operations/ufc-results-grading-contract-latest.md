# UFC results + grading contract

## Result fields (build_results → results-latest.json)
boutId, eventName, eventDate, fighterA, fighterB, winner, loser, resultStatus
(final | no_contest | draw | unknown), method (ko_tko|submission|decision|other),
round, time, weightClass, source, warnings[]. Final fights only counted in
finalBoutCount; pending/future fights are simply absent.

## Moneyline grading (grade_moneylines → graded-moneylines-latest.json)
Per side: boutId, eventDate, fighter, opponent, market=h2h, price,
impliedProbability, resultStatus, grade (win|loss|push|void|pending|unknown),
gradeReason, winner, sourceOddsFetchedAt, sourceResultFetchedAt, warnings[].
Rules: final+winner-match → win; final+loser-match → loss; no_contest → void;
draw → push (two-way moneyline); no final result → **pending** (never a loss);
ambiguous name → **unknown** (not graded). Name match via normalized fighter pair.

## Scope
Moneyline (h2h) ONLY. Method/round props documented but NOT graded yet. No parlays.
Source: Greco1899 UFCStats CSVs (GPL-3.0) + (future) ESPN MMA for live/forward.
Idempotent: boutId keyed by date+fighter-pair; re-runs overwrite cleanly.
