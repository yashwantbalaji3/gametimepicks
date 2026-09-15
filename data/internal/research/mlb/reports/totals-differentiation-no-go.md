# MLB game totals — between-game differentiation (P331, 2026-09-15)

**Status:** DEV ONLY · SECOND LOOK · **NO-GO for the candidates the repository's data can support today.** Nothing is
registered, scored against a target, or adopted. The over/under call stays **PAUSED** under the live-record gate.

## What was already known (not rediscovered)
The P317 study (`totals-engine-prior-sensitivity.md`) showed the published engine's level is repairable with documented league
rates but that the over/under call fails on **slope**: the simulated mean rises 0.21 runs per point of posted line where actual
rises 1.32. A level correction alone is not a reason to resume total calls.

## Candidate A — trailing venue run environment (walk-forward, committed linescores)
Built exactly as specified: for each final, the trailing mean total at its venue over games completed strictly before its date
this season, shrunk toward the league mean to date with a prior of K = 20 games, from the committed StatsAPI linescores
(2026-07-04 →) with the venue read from the committed boards. No target-game or later result enters a factor; no sportsbook
number is an input. Evidence: `venue-run-environment-dev.json` (784 usable finals, 32 venues, 612 with a posted line).

| figure | value | reading |
|---|---|---|
| corr(factor, actual total) | 0.006 (July −0.07 · Aug +0.05 · Sept −0.03) | no usable pregame signal at this sample |
| slope of actual on factor × league mean | −0.06 runs per run | a calibrated venue mean would read ≈ 1 |
| corr(factor, posted line) | 0.38 | the books price the venue — the factor is not new information to them |
| corr(posted line, actual) | 0.19; slope 0.96 | the line itself is informative and calibrated on this record |
| partial corr(line, actual | factor) | 0.19 | what the line knows beyond the venue is essentially all of what it knows |
| factor SD | 0.05 (≈ ±0.45 runs) at a mean of 14 venue games | the standard error of a 14-game venue mean is ≈ 1.2 runs — larger than any true park effect except Coors |

**Why it fails:** the repository holds one partial season of finals. A single-season, walk-forward venue mean is dominated by
sampling noise; the true park effects that exist (Coors Field 11.4 runs over 21 games; Camden Yards 7.5 over 25) cannot be
separated from noise with fourteen games apiece, and by the time a venue has 25 games the season is ending. The signal the
diagnosis needs (a 1.3-runs-per-point slope) is not in this feature on this data.

**What would change the verdict:** a multi-season park table built from committed historical finals (three or more seasons of
StatsAPI linescores, walk-forward by season with a between-season prior). That data is not in the repository; committing it
is a source decision for the founder, not something this program may improvise.

## Candidate B — starter run prevention beyond strikeouts
No pregame, leakage-safe starter run-prevention input is committed. The board carries only a strikeout projection;
`data/internal/mlb/model-inputs/pitcher-strength/*` records a NEUTRAL rating with the note that a leakage-safe rating needs
as-of-date per-start data; the July research caches (`reference/pitcher-gamelog-*-cache.json`) hold outs, strikeouts and
batters faced per start to 2026-07-20 only, never runs allowed; `reference/mlb-pitcher-strength.json` covers seven July dates.
A forward-only candidate would first need a daily as-of capture of each probable starter's season-to-date runs allowed and
innings (free StatsAPI, the source the pipeline already uses for lineups and finals), accumulated before any development look.
That is a capture program with its own registration, not a candidate this phase can score.

## Decision
- P331 ends with a **documented no-go** for the differentiation candidates available on committed data.
- The MLB over/under call remains PAUSED; grading continues; the P317 engine-level shadow is unaffected and unrelated to call eligibility.
- Next research prerequisite, in order: (1) founder decision on committing historical MLB finals for a multi-season park table;
  (2) a registered daily starter run-prevention capture; only then a preregistered differentiation candidate, forward-only.
