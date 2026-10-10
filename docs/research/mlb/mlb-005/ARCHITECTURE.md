# MLB-005 · coherent game, batter and pitcher simulation: architecture research (2026-10-10)

**Research note.** No code changes, no new forecasting architecture, no rewrite of the published engine, no activation.

**The goal (founder decision 5):** wherever the product claims one model, these all derive from the **same simulated games**:
- winner, final score, total and run line;
- batter hits, total bases and home runs;
- pitcher strikeouts and outs.

## Today: two models, not one

| Output | Produced by | Inputs |
|---|---|---|
| Winner, score, total, run line | Full-game PA engine (`app/src/lib/mlb/full-game/engine.ts`, pa-v2), 10,000 games per matchup | The **prop model's means** (`expHits`, `expTotalBases`, `expStrikeouts`), via `board-adapter.ts` |
| Batter hits, TB, H+R+RBI, pitcher K **leans** | Prop model (`pipeline/mlb/mlb_model.py`): last-N/season mean + normal CDF, with no matchup | Player game logs |
| Simulated box score (`players` in the artifact) | The same full-game engine | Same as the first row |

So game outcomes and the published player leans are **not** coherent today. The leans come from a normal approximation around a mean. The game simulation turns that mean into per-PA rates and plays it out. The two can disagree, for example on P(hits ≥ 1), even for the same player in the same game.

## The integration path: reuse the engine

The full-game engine already simulates every PA for every batter, with the starter, a bullpen hand-off and a strikeout rate. Its per-game player lines (`BatterGameLine`, `PitcherGameLine`) are exactly the counts the props need. So the coherent design is:

1. **One set of per-PA rates per (batter, pitcher-state).** Improved MLB-003 / MLB-004 components plug in **as engine inputs**, not as a parallel model:
   - batter K / BB / HR / balls-in-play rates and the slot's PA (the matchup-v1 path, `EngineParams.matchup`);
   - the starter's batters-faced distribution, which replaces the fixed 25-BF cap with a per-pitcher workload draw (MLB-004's E[BF]).
2. **Player props become read-outs of the simulated games:** P(hits ≥ 1) = the share of the 10,000 games in which the batter got at least one hit. No second distribution is fitted, so props, scores and totals are coherent by construction.
3. **The artifact carries per-player count distributions,** not only means. They are small histograms (0, 1, 2, 3+ for hits; 0–4, 5+ for TB; 0–12 for K; outs in thirds), additive to `players`, with no change to existing fields.

## Dependencies, data gaps and contracts (before any implementation)

| Need | Status | Notes |
|---|---|---|
| Point-in-time batter splits, handedness, slots | Captured pregame from 07-22 (`pregame-features`) | Slots often unknown for early prop-derived lineups |
| Per-start workload history (BF, pitches, outs) | **Now available**: `data/internal/mlb/boxscore-outcomes/` (2026 season, `POSTGAME_OUTCOMES`) | An input only for **later** games |
| Bullpen quality | **Missing** | A bullpen-by-team rate model needs the same box scores aggregated over relief appearances (available now) |
| Engine workload model | **Missing** | The starter leaves at a fixed 25 BF or 7 runs. A per-pitcher BF distribution is an engine-parameter change (research path, like `EngineParams.matchup`) |
| Artifact contract for per-player distributions | **Missing** | An additive field (for example `players.distributions`), versioned with the model version; a contract decision under CONTRACT-001 |
| Product contract: which props derive from the game model | **Decision** | Today's props are "market context only" (no MLB prop market is `PUBLIC_MODEL_OK`). Any change is a founder eligibility decision |
| Evaluation | **Partly available** | 52k settled prop rows (2026, all exposed). The forward 2027 season. A 2025 historical holdout if its box scores are captured |

## Proposed sequence (each step research-only until qualified)

1. **Coherence measurement, on existing data:** score the full-game simulation's own per-player outcomes against the settled player lines, using the simulated box-score means plus the matchup-v1 shadow. The question is whether the game model's player distributions already beat the separate prop model.
2. **MLB-004 workload in the engine:** per-pitcher batters-faced draws (from `mlb-k-workload-v1`'s E[BF]) behind an `EngineParams` research switch. Measure strikeouts, outs and game totals together.
3. **MLB-003 batter rates in the engine:** this is matchup-v1, already built and NOT QUALIFIED for the winner. Measure its player-level distributions.
4. **Per-player distribution read-outs** in a shadow artifact. Props evaluated forward against the market and the current model.
5. **Promotion:** only through the registered gates and a founder decision. The published engine is unchanged until then.
