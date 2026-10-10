# 2024–2025 historical MLB box scores: capture provenance and holdout-integrity audit (2026-10-10)

**Founder decision 2 (2026-10-10):** a bounded, rate-limited capture of 2024–2025 completed-game box scores, plus an audit **before** 2025 is called untouched.

## Capture

| Item | Value |
|---|---|
| Source | MLB StatsAPI: `/schedule?season=Y` (one request per season), then `/game/{gamePk}/boxscore` with a field filter. Free, no key. Requests sent one at a time, 400 ms apart, with exponential back-off retries |
| Official totals (verified first) | **2024: 2,472** final games (2,512 schedule entries; 36 postponed, 1 cancelled, 4 completed early; 37 game ids listed on more than one date). **2025: 2,477** (2,511 entries; 30 postponed, 5 completed early; 34 multi-date ids) |
| Rule | Completed games only (`Final`, `Completed Early`, `Game Over`). Each game is captured **once**, on the last date the schedule lists it final, i.e. its completion date. Postponed and cancelled entries are never fetched |
| Identities | Season, date, gamePk, gameType, final state, and player id per line. `retrievedAt` per game, `capturedAt` per file, source endpoint recorded |
| Storage | `data/internal/mlb/boxscore-outcomes-history/<season>/<date>.json`. Internal, outside public assets, not a Vercel build input. Compact per-player lines only; no raw provider payloads |
| Reproducible / resumable | An existing date file is skipped; a game id already present anywhere in the season is skipped. Script: `app/scripts/mlb/capture-mlb-boxscore-outcomes.mjs --season Y --write` |
| Overlap | None. The repository held no 2024–2025 box scores; `linescores-history` holds final scores only |
| Class | `POSTGAME_OUTCOMES`: an evaluation target, and an input only for **later** games |

## Holdout-integrity audit: what in the repository has already touched 2025 outcomes

| Exposure | What | Effect on a 2025 evaluation |
|---|---|---|
| **2025 final scores** (team runs), `data/internal/mlb/linescores-history/2025/` | Acquired and validated for coverage and parity (P601, `finals-history-validation.json`); read only by the data platform; a test isolates them from live model inputs. **No model was fitted, selected or tuned on them** | Game-level 2025 totals were *seen* (counts, coverage), not used for modelling. A 2025 game-level evaluation would be retrospective, not untouched |
| **2025 season batting splits** (vs RHP / LHP), via the `previousSeason` field of the 2026 pregame `batter-splits` captures | An input (weight 0.5) to the MLB-002 matchup-v1 and MLB-003 batter-counts-v1 challengers **for 2026 games**, and to the research-observations builder | These are 2025 **season aggregates**. In a 2025 replay they must **not** be used; splits must be rebuilt from 2024 plus 2025-to-date only. Box scores carry no per-PA pitcher hand, so **handedness splits cannot be rebuilt** for 2025: any handedness component is unavailable there, stated rather than imputed |
| **2025 per-game player outcomes** | **Not present before this capture.** No experiment, parameter, prior, feature or evaluation rule in the repository was chosen with them | Independent of every design decision so far |
| Challenger designs | `mlb-k-workload-v1` and `mlb-batter-counts-v1` were preregistered and developed on **2026** data (already exposed) | Their designs are frozen. A 2025 read does not feed back into them; any change is a new version |

**Conclusion:**
- **2025 per-game player outcomes are independent** of every model and protocol choice made so far.
- **2025 is still not a prospective test.** Its game-level finals were seen, its season aggregates were used as 2026 inputs, and its pregame features are rebuilt, not captured.
- So a chronologically ordered evaluation of 2025 (calibrated on 2024 only, 2025 features rebuilt from games before each date) is labelled **`RETROSPECTIVE_HOLDOUT`**: design frozen before any 2025 per-game outcome was read; not prospective; **not sufficient for qualification**.
- It may be used for development and retrospective validation, in chronological order only.
  - Never train on 2026 and call 2025 a forward test.
  - **Genuine prospective evaluation (remaining 2026 postseason, then 2027) is required for qualification.**

## Pregame reconstruction rules for 2024–2025 (to be applied by any replay)

**Inputs** for a game on date D may only come from box scores of games dated **before D in the same season**, plus the previous **complete** season. These are:
- per-PA rates;
- started-game PA;
- per-start batters faced;
- K and BB rates;
- team K%.

**Not available (never imputed):**
- posted prop lines and prices, so there is no market benchmark;
- confirmed pregame lineups. The box score's batting order is postgame and is not an input for its own game;
- pregame weather;
- per-PA handedness splits.

**Scoring targets:** the actual counts, scored by log score and CRPS, plus threshold probabilities at fixed thresholds stated in each preregistration, since there are no posted lines.

## Data-quality validation (2026-10-10; `validate-boxscore-history.mjs` → `boxscore-validation.json`)

**What checks out:**

| Check | 2024 | 2025 | 2026 |
|---|---|---|---|
| Games | 2,472 | 2,477 | 2,482 |
| Opposing pitchers' runs = official linescore final | **2,429 / 2,429** | **2,430 / 2,430** | — |
| Missing player ids, duplicate players, K > BF, IP ≠ outs | 0 | 0 | 0 |
| Batting PA, K, H, BB and HR against opposing pitching | 0 mismatches | 0 mismatches | 0 mismatches |

**Known capture limitation: pinch runners.**
- The capture keeps a batting line only with PA > 0. A pinch runner who scores without a plate appearance is dropped.
- So team **batting** runs undercount the final in about 9% of games: 215 in 2024, 203 in 2025, 217 opposing-runs mismatches in 2026. They also show 72–85 apparent "ties" per season.
- **Rule:** team runs always come from the **opposing pitchers' runs allowed**, which are complete. Starting batters' own lines (the evaluation targets) are unaffected, because every starter has PA > 0.
- **Effect on the frozen replay:** it used batting runs for its run-environment input (`teamRunsAllowed`, league runs per game). That input is slightly understated, consistently across teams. It is recorded here as a limitation of a frozen design and is not changed.

**Other anomalies:**
- 2 games in 2024 with other than one starter per team.
- 1 game per season with fewer than 24 defensive outs that is not marked Completed Early (suspended or resumed games).

They are kept as captured.
