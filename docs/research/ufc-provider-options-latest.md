# UFC provider options (research — NO paid activation)

## Odds
- **The Odds API — MMA/UFC** (`sport=mma_mixed_martial_arts`): moneyline widely
  available; method/rounds vary by book. Same key we already use for MLB → paid
  credits per event×market×region. **Recommended first integration** (lowest new
  surface; reuses `mlb_odds.py` patterns). First step: a credit-guarded
  `fetch_ufc_odds` behind `oddsReady`.

## Schedule / results
- **ESPN MMA** (free, already used elsewhere): event + card + fighters + status;
  good for `scheduleReady` and a results source. **Recommended** for schedule now,
  results later. UFCStats/SportsDataIO MMA are alternatives (scrape/ToS or paid).

## Fighter stats
- **UFCStats / FightMetric-style**: rich (strikes, TD, control) but scrape/ToS risk
  + ID-mapping cost. **SportsDataIO MMA**: clean but paid. ESPN fighter pages: thin.
  **Recommendation:** evaluate SportsDataIO MMA (paid) vs a careful UFCStats
  ingestion; decision deferred (billing/ToS) → `fighterStatsReady` stays false.

## Historical backtest
- Need historical MMA odds + outcomes. The repo has none. Options: archived Odds
  API pulls going forward, or a one-time historical dataset (often paid). Minimum
  sample: enough fights for per-market calibration (hundreds+). Start by **logging
  live odds + results forward** to self-build the backtest set (no purchase).

## Decisions requiring user approval (STOPPED here)
- Any **paid** odds credits beyond MLB budget, **SportsDataIO MMA** key, or a
  **historical-odds purchase**. Document + stop — not activated.
