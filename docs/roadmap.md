# Roadmap

A clear separation of what's done, what's next, and what's later. This
file is the single source of truth — the README's "Roadmap" section
mirrors the headlines below.

## Shipped

- ✅ **Phases 1-4 (foundation)** — pipeline, provider system, six-route
  frontend, model logic, demo data, docs, deploy guide
- ✅ **Phase 5 (launch)** — public deployment at
  `gametimepicks.yashwantbalaji.com`, GitHub repo, Vercel auto-deploy
- ✅ **Phase 6 (live polish)** — Sample Slate framing, duplicate-game
  fix, recruiter-ready language, README/roadmap cleanup
- ✅ **Phase 7A (research)** — full free-vs-paid API audit, Stack A
  decision documented
- ✅ **Phase 7B-1 (free slate foundation)** — multi-day slate (today + 3
  days), 4-day date selector, real `nba_api` schedule path, manual news
  overrides system, validation logger, clean unavailable states, demo
  fallback preserved, free-only end-to-end

## Next — Phase 7B-2 (when a free Odds API key is available)

Status: **planned, not yet started**. Requires the operator to grab a
free key from <https://the-odds-api.com/> first (no payment, no card).

- [ ] **Wire The Odds API client.** Real player-prop fetching with
  proper auth headers.
- [ ] **File-based response caching.** Stay under the 500-req/mo free
  tier with a smart cache TTL strategy (e.g. 30 min cache during the day,
  4 hours overnight).
- [ ] **Rate-limit awareness.** Surface remaining credits in
  `meta.json`. Pipeline pauses gracefully when budget is low.
- [ ] **Apply news-signal `modelAction`.** Phase 7B-1 records signals;
  Phase 7B-2 makes the projection / risk flags reactive to them.
- [ ] **Source-reliability score in scoring output.** Already computed
  in 7B-1; expose it visibly in the lean reason text.
- [ ] **Wire `gameId` onto leans for settlement.** Already in the
  pipeline schema; needs the settle_results.py side wired up.
- [ ] **Improved reason text.** When a news signal applies, the reason
  string mentions it ("Embiid status flagged — confidence reduced").

## Later — Phase 7C+ (production hardening, not yet committed)

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
- [ ] **Evaluate BallDontLie GOAT upgrade ($39.99/mo).** After 30+ days
  of free-only operation, decide whether the unified injuries + props
  + lineups bundle is worth the spend. See Phase 7A research.
- [ ] **MLB / NFL / WNBA expansion.** Same pipeline shape. Add adapters,
  swap model weights, reuse the frontend.
- [ ] **ROI tracking.** Only after methodology supports it rigorously.

## Explicit non-goals

Things this project will not do:

- ❌ Charge for picks. This is educational analytics, not a tipster
  service.
- ❌ Use any paid API in Phase 7B-1. Stack A free-only is the constraint.
- ❌ Scrape sportsbook websites or apps (DraftKings, FanDuel, etc.).
- ❌ Scrape Twitter/X. The X API is also deferred — manual overrides
  are the right answer until the model is validated.
- ❌ Reverse-engineer mobile APIs of any provider.
- ❌ Use gambling-hype language: "lock," "guaranteed," "smash,"
  "free money," "premium picks." All copy stays educational and honest.
- ❌ Make profitability claims, period.
- ❌ Auto-post to social platforms before there's something validated to
  post about.
- ❌ Fabricate injury / news / lineup / status data. Manual overrides
  with verifiable source URLs only.
