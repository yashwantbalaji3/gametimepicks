# EPL player projections — club identity (Soccer Department, 2026-10-05)

Owner: Soccer Department. Code: `app/src/lib/sports/epl/espn-club-match.mjs` (pinned by `espn-club-match.test.mjs`),
used by `app/scripts/epl/build-epl-player-projections.mjs` and `app/scripts/epl/grade-epl-player-projections.mjs`.

## The rule

Every place the player lane compares an ESPN club spelling with an EPL fixture club goes through **one** resolver:
`buildEplClubIndex().resolve` in `app/src/lib/soccer/epl-clubs.ts`, the canonical alias table. No substring
containment, no edit distance. A name the table cannot place resolves to nothing and the match is refused:

| Comparison | Exact rule | When it cannot resolve |
|---|---|---|
| Fixture → ESPN event | exactly one scoreboard event whose home AND away clubs resolve to the fixture's clubs | no event: the fixture stays `AWAITING_LINEUP` (builder) or ungraded (grader) |
| Posted lineup → home/away side | the two lineups resolve to exactly the fixture's home club and away club, one each | the lineup is not used; rows stay the conditional pre-lineup quantity and the run logs why |
| Fixture club → pre-lineup squad | exactly one squad whose club resolves to the fixture club | that club's players are not projected; the run logs it |

The squad file (`data/internal/research/epl/players/squads-2026-27.json`) is refreshed by `epl-matchweek.yml` at most
once every 20 hours. Before 2026-10-05 it was captured once (2026-08-21) and never refreshed.

## Known issue in published history: Bournemouth v Brentford, 2026-09-12

**What happened.** ESPN spells the club "AFC Bournemouth"; EPL artifacts say "Bournemouth". The builder decided each
lineup's side with an exact letters-only compare (`"afcbournemouth" !== "bournemouth"`), so once lineups were posted
BOTH elevens were treated as the away side. Every Bournemouth player's anytime-scorer probability was allocated from
**Brentford's** team-goal distribution (snapshot coherence shows `{ away: 1 }` only, no home entry).

**Where it is.** Projection snapshots `app/public/data/soccer/epl/player-projections/snapshot-202609121342.json` and
`snapshot-202609121352.json`. The 13:52 snapshot is the projection of record, and **80 rows** in
`app/public/data/soccer/epl/results/graded-player-projections.jsonl` were graded from it (fixture
`bournemouth-v-brentford-2026-09-12`: 9 HIT, 53 MISS, 18 VOID). Brentford's rows were allocated from the correct
(away) distribution.

**Why it is left as published.** Those numbers are what the site showed before kickoff. The forecast record measures
what was published, so the rows are not regraded, rewritten or removed. Anyone explaining EPL player calibration
(Results, Ask) should name this fixture as the one match whose Bournemouth player rows used the wrong side's goal curve.

**Scope.** Only Bournemouth HOME fixtures with a posted lineup were exposed (an away Bournemouth eleven correctly fell
through to "away"). Across all 127 committed snapshots, the fix changes the side decision for that one fixture and no
other (pinned by the probe in `espn-club-match.test.mjs`). The next Bournemouth home match is v Sunderland, 2026-10-18.
