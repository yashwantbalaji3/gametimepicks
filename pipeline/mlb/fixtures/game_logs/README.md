Hand-built fixtures in the documented MLB Stats API `/schedule` and `/game/{gamePk}/boxscore` shapes, trimmed to the
fields `capture_game_logs.py` reads. They are NOT captured provider responses and contain no real players or games
(gamePk 9000xx, player ids 1xxx/2xxx). `schedule-2026-09-20-later.json` is the same day re-fetched after game
900004 went final. `boxscore-900002.json` is deliberately absent to exercise the BOXSCORE_UNAVAILABLE gap.
