# Phase 14 — real-time freshness sync and public-user cleanup

This package fixes the stale-date bug users were seeing on the live site, removes admin-facing copy from public pages, adds an auto-refresh workflow that runs every 2 hours, and ships a freshness UX so visitors can see at a glance whether the data is current.

## Summary

- **Date staleness fix**: pages now use the user's real ET clock to compute "Today / Yesterday / Tomorrow" labels instead of trusting whatever date the pipeline froze into the static build. May 5 cannot be labeled "Today" when actual today is May 7.
- **Admin-copy purge**: every public page is free of file paths, environment variable names, terminal commands, and operator instructions. The `/results` empty state no longer walks visitors through "edit pipeline/overrides/X.json / run python ... / rebuild & redeploy" — it shows a public-friendly explanation of what verified results look like instead.
- **Auto-refresh workflow**: `.github/workflows/auto-refresh.yml` runs every 2 hours during NBA-active windows. Free tasks (recent10, results export, tests, build) run automatically. Paid Odds API refreshes are gated behind `ENABLE_ODDS_REFRESH=true` and `ODDS_DRY_RUN=false` — both default to safe values.
- **Freshness UX**: the footer shows a live freshness pill ("fresh / recently updated / stale / outdated") that updates every minute on the client. The board page surfaces a "latest available slate" banner when the slate is older than today.
- **49 new test assertions** in `pipeline/freshness_test.py` lock the date-label and freshness-classification rules. Total Python assertion count is now **493** across 11 suites.
- **2 new e2e specs** add regression guards: `admin-copy.spec.ts` walks every public page and fails if any admin phrase appears; `freshness.spec.ts` verifies the freshness UX renders correctly.

## Current live-site audit findings

The user's report was confirmed in sandbox:

- `meta.lastPipelineRun = 2026-05-05T17:25:39+00:00` while real today is 2026-05-07 → 48 hours stale.
- `slate.json.primaryDate = "2026-05-05"` and `slate.days[1].dayLabel = "Today"` — frozen by the pipeline two days ago.
- The board page's `dayLabelFor()` was anchoring synthetic labels to `slate.primaryDate`, so even tabs synthesized from disk inherited the stale "Today" label.
- The home page's "X NBA games today" copy reads `board.todayGames` regardless of the calendar gap.
- Admin-y copy was found on:
  - `empty-results-card.tsx` — three-step terminal walkthrough
  - `props-unavailable.tsx` — `ODDS_API_KEY=...`, `ODDS_DRY_RUN=...`, "re-run the pipeline"
  - `no-games-today.tsx` — `pipeline/manual_overrides/schedule_overrides.json`, "install nba_api"
  - `demo-fallback-banner.tsx` — `NBA_DATA_MODE=demo` env var
  - `methodology/page.tsx` — `ODDS_API_KEY isn't set`, `pipeline/manual_overrides/news_signals.json`, `docs/news_overrides.md`, "operator workflow", "in the repo"
  - `page.tsx` — `NBA_DATA_MODE=demo`, "Phase 7B-2 wires the real Odds API integration"
  - `board/page.tsx` DemoForced subline — `NBA_DATA_MODE=demo`

All eliminated.

## What changed

### Real-time date logic

`app/src/lib/freshness.ts` is the new central utility. Pure functions that take `today` as a parameter:
- `currentEtDate(now?)` — returns today's date in ET as `YYYY-MM-DD` (uses `Intl.DateTimeFormat` with `America/New_York`, DST-safe)
- `offsetEtDate(today, days)` — date arithmetic
- `dayLabelFor(date, today)` — `Today` / `Yesterday` / `Tomorrow` / long-form fallback
- `classifySlate(primaryDate, today)` → `current` / `previous` / `future` / `no_data`
- `daysOldVs(primaryDate, today)` — days delta
- `classifyRun(lastRunIso, now)` → `fresh` / `recent` / `stale` / `very_stale` / `unknown`
- `runFreshnessLabel`, `slateFreshnessLabel`, `relativeTimeLabel` — public-facing strings

### Today-aware UI

- `app/src/components/today-aware-slate-banner.tsx` — client component on the board page. Starts with the build-time `today`, switches to the user's real ET clock after hydration. Renders "latest available slate (N days old)" or "no current slate" when appropriate. Renders nothing when slate is genuinely current.
- `app/src/components/slate-tabs.tsx` — accepts `buildTimeToday` prop. After hydration, recomputes every tab's day label from the user's real clock. The pipeline-stamped label is used only as the SSR fallback before hydration.
- `app/src/components/board-with-tabs.tsx` — passes `buildTimeToday` through.
- `app/src/app/board/page.tsx` — anchors synthetic dayLabels to the build-time today (not the stale primaryDate), wires the banner above the tabs, passes `buildTimeToday` through to `BoardWithTabs`.
- `app/src/components/footer-freshness.tsx` — small client island in the footer. Shows the run-freshness pill ("fresh / recently updated / stale / outdated") with relative time. Updates every minute on a tab that's left open.

### Public-copy cleanup

The full list of replacements:

| File | Before | After |
|---|---|---|
| `empty-results-card.tsx` | "edit `pipeline/overrides/results_overrides.json` / run python / rebuild & redeploy" | "Verified results appear after each slate is reviewed" + list of what users will see |
| `props-unavailable.tsx` (no_props) | "Re-run the pipeline closer to game time" | "Check back closer to game time" |
| `props-unavailable.tsx` (dry_run) | env var instructions | "Odds fetching paused to preserve credits — real props will appear when fetching is re-enabled on the next refresh cycle" |
| `props-unavailable.tsx` (not_configured) | `ODDS_API_KEY=...` and `.env` and `docs/odds_api_setup.md` | "Once the odds source is reconnected, model leans will appear here automatically" |
| `no-games-today.tsx` (schedule_failed) | `pipeline/manual_overrides/schedule_overrides.json` and "install nba_api" | "The next refresh will retry; check back in a couple hours" |
| `no-games-today.tsx` (demo_future) | `NBA_DATA_MODE=auto` | "Live mode is needed to show schedules for future dates" |
| `demo-fallback-banner.tsx` | `NBA_DATA_MODE=demo` env var instructions | "The site is showing a representative sample slate — live data appears when the primary data sources are available" |
| `methodology/page.tsx` (Manual news overrides) | `pipeline/manual_overrides/news_signals.json`, "operator manually adds", `docs/news_overrides.md`, "operator workflow" | "Verified news signals — when verifiable news appears, we manually log it with a source link and timestamp" |
| `methodology/page.tsx` (DemoForced ModeCard) | `NBA_DATA_MODE=demo or ODDS_DATA_MODE=demo is set in the environment` | "The site is showing a representative sample slate — happens when an operator explicitly enables demo mode for screenshots or testing" |
| `methodology/page.tsx` (sources) | "Every key lives in environment variables; nothing is hardcoded" | "Provider credentials live in secured environment configuration; nothing is exposed in the codebase" |
| `methodology/page.tsx` (ScheduleLiveOddsUnavailable ModeCard) | "ODDS_API_KEY isn't set... Sub-state on board.json tells you which" | "the odds source isn't configured, the odds fetch failed, or the slate has zero props. The site labels which case applies." |
| `page.tsx` (DemoForced banner) | `NBA_DATA_MODE=demo`, "Phase 7B-2 wires the real Odds API integration" | "This deployment is showing a representative sample slate instead of live data. Real props and projections appear when the live data sources are active." |
| `page.tsx` (manual override note) | "operator-verified manual override" | "manually-verified schedule override" |
| `board/page.tsx` (DemoForced subline) | `NBA_DATA_MODE=demo · representative slate · not tonight's real games` | "representative sample slate · not tonight's real games" |

### Auto-refresh workflow

`.github/workflows/auto-refresh.yml` runs:
- **On a 2-hour cron** during NBA active windows (12:00, 14:00, 16:00, 18:00, 20:00, 22:00, 00:00, 02:00, 04:00 UTC)
- **On manual trigger** via Actions UI (`workflow_dispatch`)
- **With `concurrency` cancellation** so a slow run doesn't block the next slot

Default behavior (zero Odds API credits):
1. Hydrate `recent10` trend data via free `nba_api`
2. Re-export any newly-settled results
3. Run `inspect_trends` diagnostic
4. Run all 11 Python test suites (`run_all_tests.sh --python-only`)
5. Run TypeScript typecheck + Next.js build
6. Commit any allowlisted public-data changes (`app/public/data/`, `pipeline/validation/`)

Odds API safety layers:
- `ENABLE_ODDS_REFRESH=false` (default) — paid step is a no-op
- `ODDS_DRY_RUN=true` (default if enabled) — even when enabled, fetches are dry-run
- `ODDS_MAX_EVENTS_PER_RUN=12` (configurable cap)
- `ODDS_CACHE_TTL_MINUTES=120` (configurable)
- `ODDS_MIN_CREDITS_REMAINING=50` (configurable threshold)
- The actual paid-fetch step in the workflow is currently a no-op that prints what *would* happen — wiring the real fetch is deferred until you've reviewed your Odds API credit balance

### E2E regression guards

`app/e2e/admin-copy.spec.ts`:
- Walks all 7 public routes
- Fails if any of 16 forbidden admin phrases (env var names, file paths, terminal commands) appear in rendered body text
- Specific assertions for methodology page (allowed to mention "Odds API" but NOT `ODDS_API_KEY`) and results page (no terminal walkthrough)

`app/e2e/freshness.spec.ts`:
- Verifies slate tabs render with either real-relative labels or long-form date labels
- Verifies the today-aware banner doesn't contradict the slate state
- Verifies footer freshness pill renders one of the known states
- Verifies home page never claims "X games today" while simultaneously showing "stale slate"

## Files added

| Path | Purpose |
|---|---|
| `app/src/lib/freshness.ts` | Pure date/freshness utility (used by both server pages and client islands) |
| `app/src/components/today-aware-slate-banner.tsx` | Client banner that shows staleness state after hydration |
| `app/src/components/footer-freshness.tsx` | Client island — freshness pill in the footer |
| `pipeline/freshness_test.py` | 49 regression assertions (Python port of TS logic) |
| `app/e2e/admin-copy.spec.ts` | Public-page admin-copy guard |
| `app/e2e/freshness.spec.ts` | Date-label staleness guard |
| `.github/workflows/auto-refresh.yml` | Every-2-hour scheduled refresh |
| `docs/PHASE14_NOTES.md` | This file |

## Files modified

| Path | Change |
|---|---|
| `app/src/app/board/page.tsx` | Wires `TodayAwareSlateBanner`, passes `buildTimeToday` to children, anchors synthetic dayLabels to today, rewrites DemoForced subline |
| `app/src/app/page.tsx` | Rewrites DemoForced banner copy, replaces "operator-verified" |
| `app/src/app/methodology/page.tsx` | Removes env var refs and file paths; rewrites "Manual news overrides" as "Verified news signals" |
| `app/src/components/slate-tabs.tsx` | Accepts `buildTimeToday`, recomputes labels client-side after hydration |
| `app/src/components/board-with-tabs.tsx` | Threads `buildTimeToday` through |
| `app/src/components/footer.tsx` | Adds freshness row to status block |
| `app/src/components/empty-results-card.tsx` | Full rewrite — public-friendly empty state |
| `app/src/components/props-unavailable.tsx` | Three admin-y blocks rewritten for public users |
| `app/src/components/no-games-today.tsx` | Schedule-failed and demo-future cases rewritten |
| `app/src/components/demo-fallback-banner.tsx` | Body rewritten without env var references |
| `scripts/run_all_tests.sh` | Wires `freshness_test` into the runner |
| `scripts/automation_refresh.sh` | Wires `freshness_test` into the runner |

## Files deleted

None this phase. (`empty-results-card.tsx` was rewritten in place.)

## Tests

11 Python suites, 493 assertions:

```
✓ pipeline.filter_test                  58
✓ pipeline.settle_test                  66
✓ pipeline.grouping_test                69
✓ pipeline.diagnostics_test             43
✓ pipeline.recent10_test                23
✓ pipeline.export_results_test          38
✓ pipeline.confidence_guardrails_test   43
✓ pipeline.inspect_trends_test          29
✓ pipeline.grouping_collision_test      31
✓ pipeline.parlay_lab_test              44
✓ pipeline.freshness_test               49  ← NEW
                                       ───
                              TOTAL    493
```

E2E coverage from Phase 13 + 14: ~30 Playwright cases across 6 spec files (navigation, board, parlay-lab, newsletter, **admin-copy**, **freshness**).

## Known acceptable limitations after Phase 14

- **Per-day boards for May 6+ are empty in the sandbox** because real games haven't been generated for those dates. Once the auto-refresh workflow runs on a real date with games, the boards will hydrate naturally. The today-aware banner correctly surfaces this state.
- **The paid Odds API refresh step is a no-op placeholder.** Wiring the real fetch is deferred to a future phase; this protects credits until you've decided how aggressive to be.
- **The footer freshness pill briefly shows `—` during SSR** (intentional — prevents hydration mismatch). Updates within ~50ms after hydration.
- **The auto-refresh workflow doesn't include browser-based e2e tests yet.** Adding Playwright to CI requires the ~250MB browser cache step; we'll wire it once the e2e suite has stabilized.
- **`docs/odds_api_setup.md` reference removed from props-unavailable** — that file lives in docs for operators; users don't need it.

## What this phase intentionally did NOT do

- **No model rewrite**, no scoring changes
- **No paid API integrations**, no scraping
- **No real-money or affiliate-link surfaces**
- **No internal `--vault-*` token rename** (still cosmetic-only, deferred)
- **No actual Odds API calls anywhere** in this package
- **No data fabrication** — empty boards stay empty, stale boards are honestly labeled as such
