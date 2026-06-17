# Prediction-Time & Leakage Rules (canonical)

_Enforced in code by `app/src/lib/methodology/validation.ts` (`validateLeakage`) and
`global-rules.ts`._

## The hard rule
```
feature_timestamp <= prediction_time < event_start_time
```
Every feature used for a prediction must be available **at or before** `prediction_time`, and the
prediction must be made **before** the event starts.

## Snapshot metadata (stored on every prediction row)
```
event_id, sport, league_or_competition, prediction_target,
prediction_time, event_start_time, data_cutoff_time, feature_snapshot_time,
market_snapshot_time, lineup_snapshot_time, injury_snapshot_time, weather_snapshot_time
```
`validateLeakage()` checks: prediction < event start; feature snapshot ≤ prediction; and each of
market/lineup/injury/weather/data-cutoff snapshots is **not after** prediction time.

## Never use (would leak the target outcome)
`target_game_final_score`, `target_game_box_score`, `target_game_minutes`,
`target_game_pitch_count`, `target_game_plate_appearances`, an unconfirmed target-event
lineup / starting XI, `fight_result`, `method`, `round_stats`, **rolling averages that include the
target event**, **closing odds if the prediction was made earlier**, post-event injury news, and
post-event weather actuals. (Codified as `NEVER_USE`.)

## Rolling-window rules
All rolling windows **exclude the target event**:
```
season_to_date_excluding_target, last_30_days_excluding_target,
last_15_games_excluding_target, last_10/5/3_games_excluding_target
```
Each rolling metric carries `mean, median, std, min, max, trend, zScoreVsSeason` plus
`windowStartTime, windowEndTime, sampleSize, includesTargetEventFlag` — and
`includesTargetEventFlag` **must always be false**. `validateLeakage()` fails any window whose end
is at/after `event_start_time`.

## Opportunity vs performance separation
For every sport, compute **recent opportunity**, **recent role**, **recent efficiency**, and
**recent result** separately — never collapse them into one vague "recent form" number.

## Validation fixtures (tested)
`app/src/lib/methodology.test.mjs` covers: a valid pre-game prediction passes; a feature snapshot
after prediction fails; a prediction at/after event start fails; a market snapshot after prediction
fails (no closing-odds leak); a rolling window that includes the target fails.
