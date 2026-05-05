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
- ✅ **Phase 7B-3 (activation diagnostics + QA guardrails)** —
  `python -m pipeline.check_odds_key` validates `ODDS_API_KEY` against
  `/v4/sports/` (FREE per provider docs) without burning credits and
  never logs the key, `python -m pipeline.cache_inspect` lists/clears
  cached responses, `python -m pipeline.diagnose` prints a comprehensive
  report from the latest run, `ODDS_DRY_RUN=true` mode hits `/events`
  (FREE) and reports what would be fetched but skips paid `/odds` calls
  entirely. Operator workflow rewritten in
  [docs/odds_api_setup.md](./odds_api_setup.md).

## Next — Phase 7C (settlement + result tracking)

Status: **planned, depends on operator running 7B-2 with a real key for
some time so settled NBA games + logged leans both exist**.

- [ ] **Wire `settle_results.py` to the validation log.** Mark pending
  leans as W/L/push once final box scores are available.
- [ ] **Closing-line value capture.** The Odds API exposes `historical=true`
  on the free tier — store the closing line for each lean.
- [ ] **Real `hit_rates.json`** populated from settled rows, not seed.
- [ ] **Per-prop calibration tracking** once volume is high enough to
  reason about cohort sizes honestly.

## Later — Phase 7B-4 + Phase 7D (model + automation, gated on signal)

Status: **future, do not implement yet**.

- [ ] **Phase 7B-4 — model scoring cleanup.** Vig-stripped fair price
  surfaced on the prop card, "insufficient data" guardrails (min sample
  size, minutes trend filter, position-aware notes), edge-aware
  confidence (currently static High/Medium/Low). Gated on Phase 7C
  producing real settled rows.
- [ ] **Phase 7D — scheduled daily refresh.** GitHub Actions workflow
  that runs the pipeline once a day at 11 AM ET, commits the updated
  JSON, pushes. Vercel auto-redeploys. Skeleton already drafted in
  `docs/deploy.md`.
- [ ] **Automated settlement.** A second daily action that runs
  `settle_results.py` against the previous day's pending leans, commits
  the updated `hit_rates.json`.
- [ ] **Model backtesting.** Replay historical NBA seasons through the
  pipeline. Build a backtest dashboard showing month-over-month hit
  rate, calibration, and (eventually) ROI.
- [ ] **MLB / NFL / WNBA expansion.** Same pipeline shape. Add adapters,
  swap model weights, reuse the frontend.
- [ ] **ROI tracking.** Only after methodology supports it rigorously.

## Indefinitely deferred

- ❌ **Paid providers** (BallDontLie GOAT, SportsData.io, OpticOdds).
  The free stack is sufficient for the current scope and adding spend
  to a portfolio project for unvalidated upside isn't justified.
- ❌ **X API integration.** Manual overrides are the right answer until
  the model is validated. Even then, posting requires settled hit-rate
  data, which requires Phase 7C.

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
