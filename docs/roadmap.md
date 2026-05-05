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
- ✅ **Phase 7B-1.1 (real-slate / demo separation)** — explicit DataMode
  state machine, demo content never mixed into real slate, smoke-test
  contract
- ✅ **Phase 7B-1.2 (schedule resolution + manual override)** — manual
  schedule override JSON safety net, `ScheduleUnavailable` distinct from
  `NoGames`, full schedule diagnostic metadata in `board.json`
- ✅ **Phase 7B-2 (optional Odds API integration)** — The Odds API
  free-tier client with file-based response caching, slate-aware event
  matching to conserve credits, full diagnostic metadata, three explicit
  "props-unavailable" sub-states (`not_configured` / `ok_no_props` /
  `failed`), no fake odds or fabricated props ever, key still optional —
  app ships and runs unchanged when `ODDS_API_KEY` is absent. Walkthrough
  in [docs/odds_api_setup.md](./odds_api_setup.md).

## Next — Phase 7B-3 (model scoring cleanup, blocked on real-prop volume)

Status: **planned, depends on operator running 7B-2 with a key for some
time so we have real prop rows in `leans_log.jsonl` to inspect**.

- [ ] **Vig-stripped fair price** surfaced prominently on the prop card,
  not just in the JSON
- [ ] **"Insufficient data" guardrails** — minimum sample size, minutes
  trend filter, position-aware projection notes
- [ ] **Calibration tracking** once enough real prop rows are settled
  (depends on Phase 7C settlement)
- [ ] **Better player→team mapping** for cases where rosters are stale
  or `nba_api` is unreachable but odds are available
- [ ] **Edge-aware confidence** — currently a static High/Medium/Low
  bucket; should reflect both edge magnitude AND sample reliability

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
- ❌ Use any paid API. Free-only is the permanent constraint.
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
