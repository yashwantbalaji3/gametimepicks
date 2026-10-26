# Roadmap

A clear separation of what's done, what's next, and what's later. This
file is the single source of truth — the README's "Roadmap" section
mirrors the headlines below.

> **Planning lives in the GitHub Project "GameTimePicks — Public Launch Roadmap"** (owners, priority, launch gates;
> see `docs/ENGINEERING_START_HERE.md` §7). This file records what is verified in Production. The phase history
> below it is the original 2026-05 plan, kept as history.

## Current status — 2026-10-26 (Release J, verified in Production)

**Deployed:** `50d2d3fc6f` (built 2026-10-25 21:38Z). It contains the Vehicle J merge `916f9fedd6`
(#1245 + #1246 + #1247, one Production build). Main CI (`quality-gate`) is green on the merge commit. It had
been red on three unit tests since 10-24.

**Verified on Production** (axe-core 4.10.2, 390 px phone and 1280 px desktop, before → after):

| Change | Route | Before | After |
|---|---|---|---|
| Methodology states where each sport's picks appear | `/methodology/` | 5 rows said NBA / EPL / Ligue 1 "never enter" the products that show them | NBA, EPL, Ligue 1: "only as unpriced model suggestions"; NFL and UFC rows unchanged (correct per registry) |
| Results labels | `/results/` | 12 raw policy ids (`…@1/…`) on screen | 0; reader labels ("NBA Parlay Center card" ×8) |
| Corrected NBA stats flagged, grades untouched | `/nba/projections/2026-10-23/` | Avdija REB 7 shown unlabelled while graded on 6 | † flag, plus "Deni Avdija REB 6 → 7, PRA 38 → 39, P+R 32 → 33" in Model details |
| Back links | `/results/nba/`, `/nba/projections/`, `/nfl/game/<id>/` | 14–16 px | 24 px desktop / 44 px phone |
| Footer site map | every page | ~30 links at 16 px | 40 of 44 links at ≥ 24 / 44 px |
| Keyboard-reachable tables, labelled result dots | `/nba/simulation/<id>/`, `/results/nba/`, `/results/` | 5 + 11 + 1 axe violations | 0 |

**NFL forecast revisions: verified on Production runs.**
- Event window run 413 (22:35Z) wrote exactly the two expected one-time revisions, KC @ SEA and DAL @ PHI, each with a `forecastSummary` identical to the receipt it replaced.
- The next four windows (22:59, 23:03, 23:27, 23:53Z; the last 27 min before KC @ SEA kicked off) wrote **none**.
- Before, every window revised every game: 99 timestamp-only revisions for 12 games by 16:40Z on 10-25.

**Regression found and fixed (follow-up release).**
- **Problem:** the consistency audit tied each NFL player board to its forecast record by timestamp. That held only while every window rewrote every receipt. After the revisions stopped, main's `audit.test.mjs` failed on live data for 401873009 and 401873022, with identical numbers on both sides (no public effect).
- **Fix:** the board now names the record it was published beside (`forecastInputHash`), and the audit compares hashes. A board left behind by a real revision still fails.

**Released, verified before release, Production run still to observe:**
- **NFL odds budget:** an exhausted allowance ends the capture green, with a `BUDGET_EXHAUSTED` warning and step summary, before any request. Before, 68 of 100 windows were red for this reason alone. Run 413 skipped the odds step (the kickoff dispatcher passes `skip_odds`); the first run that executes it is the 10-26 14:30Z cron.
- **NBA Level A grading:** NBA-only cards are graded inside the `nba-results-refresh` finals commit, instead of about 5 h later in nightly-settle. A rebase that conflicts only on `graded.jsonl` is regraded instead of dropping the settlement commit.

**Unresolved limitations**
- **Vercel:** the first deployment of the merge sat "pending" for 46 min, then failed. The next queued commit built in about 5 min. Locally, the release builds in the same time and memory as the commit before it (503 s vs 500 s; 13.5 GB). Vercel's logs need dashboard access; worth a look if it repeats.
- **Footer:** "Contact support" is still 16 px. The three data-source chips are 27 px on phones (≥ 24 AA, below the 44 px project rule).
- **Sandbox-only test limits:** the live RLS battery needs a non-root Postgres (passed 15/15 that way; CI runs it). The EPL recovery rerun test needs git ≥ 2.44 date output (CI passes).
- **Flake risk:** `adoption-mutation.test.mjs` rewrites `src/lib/analytics/adoption.ts` while sibling tests run in parallel. Mutating a temp copy would remove the race.
- **Inert until next preseason:** the NFL preseason hash still carries the run clock.
- **Follow-up from #1246:** `grade-nba-top-boards.mjs` should read stored corrections and append `CORRECTION` entries.

**Remaining customer-facing priorities** (founder decisions marked ★)
1. ★ **NFL odds allowance:** renew, raise, or stay on the 10-11 capture. Market comparison is "NO_MARKET" until then.
2. **Mixed-sport Level A cards (#1244)** with the tested fallback patch. Ships OFF; ★ activation after a §7 package on a real slate.
3. ★ **Terms and Privacy** (counsel), then public sign-up.
4. ★ **NBA Top-10 board** and challenger-model promotion (evidence first).
5. The remaining footer tap targets (above).
6. `/results` page weight (1,366 KB against a 2,300 KB ceiling).
7. Event-driven grading for EPL-only Level A cards. This needs `epl-settle` on the same conflict resolver first.

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
