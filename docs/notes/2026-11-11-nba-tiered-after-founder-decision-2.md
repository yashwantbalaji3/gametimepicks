# NBA tiered Level A cards recorded after founder decision 2 (2026-11-11)

Founder decision 2, 2026-11-10T19:51:23Z (Parlay Lab V3; `~/gtp-evidence/nov10-founder-parlay-v3-decisions.md`): NBA Elo is never used for an official risk tier. The code that enforces this (#1306, slice 3a) deployed to Production at 2026-11-11T05:58:37Z.

In between, the pre-#1306 code still published NBA game-winner tiers. The Level A recorder (`auto: level-a record 09b121d0a7`, commit 01afb44bb3) recorded three cards that Production deployment 09b121d0a7 served from 2026-11-11T01:13:54Z. All three are product day 2026-11-10, and each card's first leg was MIA @ UTAH at 02:00Z:

| Line | Policy | Tier | Legs | Line sha256 |
|---|---|---|---|---|
| 424 | nba-game-winner-tiers@1/parlay-lab | medium | 2 | 8ec9578d… |
| 425 | nba-game-winner-tiers@1/parlay-lab | high | 3 | b6cfda86… |
| 426 | nba-game-winner-tiers@1/bank-builder | medium | 2 | b7c95f8f… |

**Where they showed.** The cards were on `/build` (Parlay Lab) and `/bank-builder` from 01:13:54Z. The next Production deployment, 2f37511d5c at 02:44:30Z, was built after their first leg had started, so it no longer showed them. No withdrawal was recorded: disappearing after the cutoff is the normal end of a suggestion.

**What happens to them.** History is immutable, so the record is not edited. The cards are graded by the normal Level A grader once the NBA finals are committed, and they appear in history as ordinary Level A cards.

**The guard.** `nba-untier.test.mjs` pins exactly these three lines (recordedAt, policy, tier and the line's sha256) as `KNOWN_POST_DECISION_NBA_TIERED`. Any other NBA tiered entry recorded after the decision still fails the test.
