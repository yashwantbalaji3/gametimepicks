# Roadmap

A clear separation of what's done, what's next, and what's later. This
file is the single source of truth — the README's "Roadmap" section
mirrors the headlines below.

> **Planning lives in the GitHub Project "GameTimePicks — Public Launch Roadmap"** (owners, priority, launch gates;
> see `docs/ENGINEERING_START_HERE.md` §7). This file records what is verified in Production. The phase history
> below it is the original 2026-05 plan, kept as history.

## Current status — 2026-10-26 05:00Z (verified evidence only)

**Release governance (founder, 10-26).** Launch Readiness owns every Production merge and deployment. Cloud
Engineering develops, tests and prepares branches and PRs, and merges nothing to `main` without an explicit
founder exception. Release J (`916f9fedd6`) and its follow-up #1248 (`9b117ac6ba`) went out under the 10-25
exception.

**Production:** `263043e05a`, built 04:05Z, one bot data commit behind `main`. Main CI is green on #1248.
Public pages carry the 10-26 dates; the Monday-night game and its simulation are linked; the routes checked
return 200 with no error markers.

### Verified in Production
| Item | Evidence |
|---|---|
| Methodology wording, results labels, NBA stat-correction flag, back links, footer, scroll regions | Before → after on Production, 10-25. Axe violations 17 → 0 on the routes checked |
| NFL forecasts revise only on real input changes | Run 413 wrote the 2 expected one-time revisions (identical `forecastSummary`). The next 4 windows wrote 0 |
| NFL board ↔ forecast-record audit (regression from J, fixed in #1248) | Board names its record by `forecastInputHash`. Main green |
| NBA Level A graded in the finals commit | 3 `nba results capture` commits (23:52, 01:38, 04:39Z) appended 1 + 5 + 9 grades for 10-25: append-only, 0 duplicate ids |

**Still to observe:** the NFL odds-budget path. The 10-26 14:30Z cron is the first run that executes the
odds step; dispatched windows pass `skip_odds`.

### Vercel build hangs (open, evidence to date)
- 13 Production deployments have failed since 2026-10-23 14:28Z, each after 46–54 min (the 45-minute
  build limit). The 174 successes on 10-22 → 26 have a median of 8.1 min.
- Daily failures: 1–5 a day 10-10 → 10-15; **0 from 10-16 to 10-22** (after `1b8463c539` capped static
  workers at 4 on 10-15); 2–4 a day since 10-23. Bot data commits wedge too (`d9ef6ff6c6`), so release
  merges are not the trigger.
- With Elastic Concurrency off, one wedge blocks the queue. On 10-26, Production lagged about 1 h 40 min.
- Forecast records are unaffected. Pre-start `publishedAt` comes from git commit time, not deploy time.
- Measured locally with Vercel's settings (4 workers): peak memory is flat across the onset.
  - 13.3 GB at 10-22 14:00Z, 13.6 GB at 10-23 14:16Z, 12.6 GB now, on a 15.7 GB host.
  - The 10-23 onset is therefore not explained by build demand growth. Headroom stays thin, as in the
    September and 10-15 investigations.
  - These figures include page cache. Vehicle K's heartbeat (#1095) splits `anon` from `file`, so the next
    wedge's log will say whether it is out-of-memory.
- **Needs dashboard access (founder or Launch Readiness):** the last `[phase] ALIVE` line of one failed
  deployment (e.g. `9b117ac6ba`), the build machine class, and billed build CPU.
- #1094 (workers 4 → 3) stays a founder decision. Its expected memory saving is about 6%.

### Product readiness vs engineering completion
| Area | Public today | Engineering complete, not public | Blocking public readiness |
|---|---|---|---|
| NFL | Forecasts, game pages, Theater, boards, results | — | ★ odds allowance (market comparison NO_MARKET) |
| NBA | Hub, Official Forecast, Elo estimate, Theater, projections board, Level A cards, results | Challenger research | ★ Top-10 board; challenger promotion (evidence) |
| MLB | Boards, props, results (postseason) | — | Season ending |
| UFC | Bout pages, results | — | Level A closed by design (no independent model) |
| EPL / Ligue 1 | 1X2 forecasts, Level A cards | — | Player markets not modelled |
| Bank Builder / Moonshot / Parlay Center | Single-sport Level A cards | Mixed-sport cards (#1244 + tested patch, switch OFF) | Owner applies patch; ★ activation after a §7 package |
| Parlay Lab V2, sportsbook links | — | Built, flags OFF | ★ legal Terms; correlation caps |
| Accounts / sign-up | — | Schema + RLS (15/15 isolation battery) | ★ Terms and Privacy (counsel) |
| Delivery reliability | Main green | Vehicle K (below) | Vercel wedges (above) |

### Next executable release batch — Vehicle K (prepared by Cloud Engineering, merged by Launch Readiness)
- #1095 heartbeat memory split (observability only).
- The last footer tap targets: "Contact support" 16 px → 24 / 44 px; source-chip links 44 px on touch.
- Test isolation: `adoption-mutation.test.mjs` mutates a temp copy, removing a CI flake on every PR.
- This status section.

It is one Production build. **Merge only while no deployment is pending**, so it does not queue behind a wedge.

### Open engineering follow-ups
- NFL preseason hash still carries the run clock (inert until next preseason).
- `grade-nba-top-boards.mjs` should read stored corrections (#1246 follow-up).
- Event-driven grading for EPL-only Level A cards needs `epl-settle` on the conflict resolver first.
- `/results` page weight: 1,366 KB against a 2,300 KB ceiling.

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
