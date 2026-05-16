"""MLB MVP pipeline (Phase MLB-1).

Sibling to the NBA pipeline. Does not import from `pipeline.generate_daily_board`
or any NBA-specific module. Reuses only:
  - `pipeline.config` for ODDS_API_KEY, paths, timeouts
  - `pipeline.public_copy_test` forbidden-token rules (in spirit only)

Files written:
  app/public/data/mlb/schedule/YYYY-MM-DD.json
  app/public/data/mlb/boards/YYYY-MM-DD.json
  app/public/data/mlb/power/YYYY-MM-DD.json
"""
