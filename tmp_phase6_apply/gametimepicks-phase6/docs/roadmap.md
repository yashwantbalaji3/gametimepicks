# Roadmap

A clear separation of what's done, what's next, and what's later. This
file is the single source of truth — the README's "Roadmap" section
mirrors the headlines below.

## Now — v1 live demo foundation

Status: **shipped**.

- Pipeline + multi-source provider architecture
- Explainable projection + probability + edge model
- Six-route Next.js frontend (Home, Model Board, Player Trends, Results,
  Methodology, Responsible Use)
- Demo data foundation that always renders
- Public deployment at `gametimepicks.yashwantbalaji.com`
- Persistent disclaimer banner + responsible-use framing
- Public polish: demo snapshot framing, sample-results labeling,
  refreshed README, portfolio card copy
- Smoke test + typecheck + build all clean

## Next — real data validation

Status: **planned, not yet started**.

This is the next milestone. The architecture is ready; what's needed is
the first end-to-end run on real data and the discipline to validate
honestly before claiming any track record.

- [ ] **Validate the real NBA data feed.** Run `fetch_nba_schedule` and
  `fetch_player_game_logs` against `nba_api` for a week. Confirm the
  data shapes match what the model expects. Catch any caching or rate-
  limit issues.
- [ ] **Add Odds API key.** Acquire a key (the free tier is 500 req/mo).
  Verify the live pipeline produces a board with real odds.
- [ ] **Run in live + hybrid modes.** Set `NBA_DATA_MODE=auto` and
  `ODDS_DATA_MODE=auto` in production. Confirm the data-source badge
  flips to Live (or Hybrid) and the dates align with tonight's slate.
- [ ] **Iterate on the projection model.** Compare projections against
  actual results for two weeks. Document the calibration delta. Tune
  weights only if the data clearly justifies it.
- [ ] **Wire `gameId` onto leans.** Currently `settle_results.py` is a
  framework that can settle a lean once the box score arrives — but it
  needs `gameId` on each lean to look up the right box score
  unambiguously. This is a small change in `generate_daily_board.py`.
- [ ] **Complete settlement logic.** Once `gameId` is wired, run
  `settle_results.py` against a day of finished games. Verify the
  `recentSettled` list updates and `byMarket` / `byConfidence` rollups
  recompute correctly.

This whole block is roughly 1-2 weeks of focused work, most of which is
running the pipeline on real data and reading what comes out.

## Later — production hardening

Status: **future, do not implement yet**.

- [ ] **Scheduled daily refresh.** GitHub Actions workflow that runs the
  pipeline once a day at 11 AM ET, commits the updated JSON, pushes.
  Vercel auto-redeploys. Skeleton already drafted in `docs/deploy.md`.
- [ ] **Automated result tracking.** A second daily action that runs
  `settle_results.py` against the previous day's pending leans, commits
  the updated `hit_rates.json`.
- [ ] **Model backtesting.** Replay historical NBA seasons through the
  pipeline. Build a backtest dashboard showing month-over-month hit
  rate, calibration, and (eventually) ROI.
- [ ] **MLB / NFL / WNBA expansion.** Same pipeline shape. Add
  `MLBStatsProvider` + `MLBOddsProvider` adapters, swap the model
  weights for stats appropriate to the sport, reuse the frontend.
- [ ] **Automated launch posts** *(future, not yet)*. When there's
  something concrete to share — e.g. real tracked results from a
  validated live run — consider scheduled X/LinkedIn posting. Do not
  implement until the underlying claims are real.
- [ ] **ROI tracking.** Only after the methodology supports it
  rigorously. Hit rate alone isn't profit; vig means break-even on -110
  is ~52.4%. ROI requires careful per-lean stake sizing accounting.

## Explicit non-goals

Things this project will not do:

- Sell picks
- Run a paid Discord
- Affiliate-link to sportsbooks
- Claim profitability before the data supports it
- Place bets via API or any automation
- Scrape DraftKings / FanDuel / ESPN HTML / theScore app
- Use language like "lock," "guaranteed," "free money," "smash,"
  "can't miss," "beat the books," "premium picks," "sure thing,"
  "profit guaranteed"
