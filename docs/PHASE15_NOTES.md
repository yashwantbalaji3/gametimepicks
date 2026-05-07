# Phase 15 — live slate rollover and futuristic UI polish

This package fixes the underlying bug Phase 14 surfaced but couldn't fully resolve: pages were defaulting to **May 5** as the active board because that's the date with the most leans, even though real today is May 7. Phase 14 made the labels honest ("latest available slate"); Phase 15 fixes the underlying default. Today is the active slate, past dates move out of the primary tab strip into an archive view, and a beautiful "no current slate" state appears when only past data exists. Combined with a futuristic background grid, glowing tab indicators, and pulsing status dots — without adding a single new dependency.

## Summary

- **Active-slate selector** picks today (or nearest upcoming) instead of defaulting to a past date with content. Past dates DO NOT become the primary tab.
- **Premium "no current slate" state** with subtle gold-glow background, pulsing status dot, and an "archive" teaser that links to Results.
- **Futuristic hero treatment** on home + board: animated radial conic-gradient sweep, faint grid texture, gold glow accents — pure CSS, respects `prefers-reduced-motion`.
- **Glow underline on active date tabs** + soft glow on hover for interactive cards.
- **Past dates hidden from main tab strip** — only today + future appear in the date-tab navigation. Past slates surface via the archive teaser and (eventually) the Results page.
- **42 new test assertions** in `pipeline/active_slate_test.py` lock the selector contract.

Total Python assertion count is now **535 across 12 suites**.

## Current issue diagnosed

Sandbox state confirmed the user report:

| Date | Leans | Games | Mode |
|------|-------|-------|------|
| 2026-05-04 | 0 | 2 | ScheduleLiveOddsUnavailable |
| 2026-05-05 | **24** | 2 | **Live** ← stale primary |
| 2026-05-06 | 0 | 0 | ScheduleUnavailable |
| **2026-05-07** | **0** | **0** | ScheduleUnavailable ← today, empty |
| 2026-05-08 | 0 | 0 | ScheduleUnavailable |
| 2026-05-09 | 0 | 0 | ScheduleUnavailable |

The pipeline ran on May 5, stamped `slate.primaryDate = "2026-05-05"`, and shipped 24 leans for that date. By May 7 (real today), the page was still defaulting to May 5 because:
1. `getSlate()` returned `slate.primaryDate = "2026-05-05"` (frozen)
2. `BoardWithTabs` used `slate.primaryDate` as the initial selected tab
3. The hero called `formatDateLong(slate.primaryDate)` → "Tuesday, May 5"

Phase 14 made the labels honest ("latest available slate") but couldn't fix the underlying default without breaking the data flow. Phase 15 introduces a `selectActiveSlate()` function that takes the real today, walks the available dates, and returns one of four kinds: `today` / `upcoming` / `no_current` / `no_data`.

## What changed

### Active-slate selector

`app/src/lib/active-slate.ts` exports:
- `selectActiveSlate(availableDates, today, boardsByDate?)` → `ActiveSlate`
- `activeSlateHeading(active)` → string for hero
- `activeSlateSubtitle(active)` → string for hero
- Type `ActiveSlate` with `kind`, `selectedDate`, `upcomingAndTodayDates`, `pastDates`, `latestArchivedDate`

Logic:
- **Today exists on disk** → `kind: "today"`, `selectedDate: today`. Even if today is empty (no leans), today wins. An empty today is more honest than yesterday's data.
- **Today doesn't exist, future does** → `kind: "upcoming"`, `selectedDate: <nearest future, prefers ones with leans>`.
- **Only past data** → `kind: "no_current"`, `selectedDate: null`. UI renders the premium empty state.
- **No data at all** → `kind: "no_data"`. UI renders the same empty state with adjusted copy.

`pipeline/active_slate_test.py` mirrors the logic in Python and asserts 42 cases including the exact Phase 15 scenario from sandbox data.

### Board page redesign

`app/src/app/board/page.tsx`:
- Calls `selectActiveSlate(allBoardDates, buildTimeToday, boardsByDate)` early
- When `kind` is `no_current` / `no_data`: renders the hero + `<NoCurrentSlate>` component + newsletter, then returns. **Does not show stale May 5 props as the main board.**
- When `kind` is `today` / `upcoming`: filters `slate.days` to only include `upcomingAndTodayDates` (today + future) before passing to `BoardWithTabs`. Past dates are no longer in the primary tab strip.
- Hero gets the `vault-hero-grid` class for the new futuristic background treatment.

### NoCurrentSlate component

`app/src/components/no-current-slate.tsx` — new premium empty state:
- Pulsing gold status dot + "awaiting next slate" pill
- Large heading ("No current slate available.")
- Subtle grid texture overlay
- Faint radial gold glow
- Archive teaser block: "latest archived slate · Tue, May 5, 2026 · view in results →"
- Newsletter prompt below

CSS-only animations. Respects `prefers-reduced-motion`.

### Futuristic UI primitives

Added to `app/src/app/globals.css`:

- **`.vault-pulse`** — soft scale + opacity pulse for status dots (2.4s loop)
- **`.vault-hero-grid`** — applied to hero `<section>`s. Adds:
  - A faint gold grid-line texture (40px × 40px) masked with a radial gradient so it fades at the edges
  - A slow-rotating conic-gradient sweep (22s loop) creating subtle gold-shimmer ambiance behind the hero
- **`.vault-tab-active`** — applied to the active date tab. Adds a glowing gold gradient underline that extends slightly beyond the tab boundaries
- **`.vault-glow-hover`** — soft gold glow + 1px lift on hover for interactive cards
- **`.vault-rise`** — gentle 8px-rise + fade reveal for the no-current-slate card on first paint
- **`.vault-glass`** — cheap glassmorphism panel utility for future polish

All keyframes wrapped in `@media (prefers-reduced-motion: reduce)` to disable animations for users who request it.

### Home page polish

- Hero `<section>` gets `vault-hero-grid` for the futuristic background sweep
- The live-mode dot gets `vault-pulse` for a gentle attention ping
- Active-slate logic added: home no longer claims "X games today" when slate is genuinely stale. The eyebrow falls through to "no current slate · awaiting next refresh" when active is `no_current`/`no_data`
- `leansToday` and `highConfidence` are computed from the active slate's board, not from the stale top-level `board.json`

### Slate tabs polish

- Active tab gets the `vault-tab-active` class for the new gradient underline
- Phase 14's client-side label re-computation is preserved — tabs still re-label after hydration based on the user's real ET clock

## Files added

| Path | Purpose |
|---|---|
| `app/src/lib/active-slate.ts` | Pure slate-selection logic |
| `app/src/components/no-current-slate.tsx` | Premium empty state with archive teaser |
| `pipeline/active_slate_test.py` | 42 regression assertions |
| `docs/PHASE15_NOTES.md` | Release notes |

## Files modified

| Path | Change |
|---|---|
| `app/src/app/board/page.tsx` | Active-slate render path, hides past dates from tabs, hero gets futuristic grid, no-current-slate render branch |
| `app/src/app/page.tsx` | Active-slate logic for "games today" honesty, hero gets futuristic grid, live dot pulses |
| `app/src/app/globals.css` | Phase 15 animations + utility classes |
| `app/src/components/slate-tabs.tsx` | Active tab gets `vault-tab-active` class for glow underline |
| `scripts/run_all_tests.sh` | Wires `active_slate_test` |
| `scripts/automation_refresh.sh` | Wires `active_slate_test` |

## Files deleted

None this phase.

## Active slate selection behavior

The four kinds, with hero copy:

| Kind | Hero heading | Subtitle | Tab strip | NoCurrentSlate? |
|---|---|---|---|---|
| `today` | "Today's board" (or per-mode copy) | per-mode copy | today + future only | no |
| `upcoming` | per-mode copy with upcoming date | "Today's board hasn't been generated yet — showing the nearest upcoming slate." | future only | no |
| `no_current` | "No current slate available" | "The next slate hasn't been generated yet. The most recent archived slate is May 5." | hidden | **yes** |
| `no_data` | "No slate data available" | "We don't have any slates to show right now." | hidden | yes (no archive) |

## Past slate / Results handoff behavior

Past dates are now segregated from the primary navigation:

- **Hidden from the main date-tab strip** — `BoardWithTabs` only receives `upcomingSlateDays` (today + future)
- **Surfaced in the archive teaser** — the `NoCurrentSlate` component shows "latest archived slate · {date} · view in results →"
- **Linked from `/results`** — the archive teaser links to `/results/`. When the Results page eventually shows settled data, past dates appear there as the canonical history view.

Phase 15 does NOT delete past board data files — they stay on disk for the eventual Results page to read. The site just stops treating them as the active primary slate.

## Automation behavior

No changes in this package. The Phase 14 `auto-refresh.yml` workflow is sufficient — once the daily-refresh cron runs and produces new boards for today (and future days), the active-slate selector picks them up automatically.

If the workflow runs but produces empty boards (e.g. nba_api returns no schedule), the site honestly shows the `no_current` state instead of resurrecting old data. This is the correct behavior — silently substituting old data is exactly what we're trying to avoid.

## Odds API safety

Zero Odds API credits in this package:
- Apply script doesn't call the Odds API
- New components are pure UI (no fetches)
- Active-slate logic reads existing JSON only
- Tests run offline

The Phase 14 env-flag system (`ENABLE_ODDS_REFRESH=false`, `ODDS_DRY_RUN=true`) is unchanged.

## UI/UX redesign summary

What was upgraded:
- **Home hero**: futuristic grid background with slow rotating conic sweep, pulsing live dot
- **Board hero (active state)**: same futuristic grid treatment
- **Board hero (empty state)**: dedicated `NoCurrentSlate` component with grid texture, glow accents, and archive teaser
- **Active date tab**: glowing gold gradient underline extending slightly past the tab edges

What was NOT changed (intentionally — Phase 15 protects against scope creep):
- Player card layout (already polished in Phase 9.1 / 12)
- Filter pill design (already vault-themed)
- Methodology / Responsible Use page redesigns (decent already; defer to a focused copy-polish phase)
- Parlay Lab visual structure (Phase 12 ship; deferred)
- Newsletter signup visuals (Phase 13 ship)

## Animations and graphics added

All CSS-only, no new dependencies:

| Animation | Where | Cycle | Reduced-motion |
|---|---|---|---|
| `vault-pulse` | live-mode dot, status dots | 2.4s | disabled |
| Conic-gradient sweep | hero backgrounds | 22s | reduced opacity, no rotation |
| Grid texture | hero backgrounds | static | unchanged |
| `vault-rise` | NoCurrentSlate first paint | 480ms once | disabled |
| `vault-glow-hover` | future cards/tabs | 240ms transition | disabled |

No images. No SVG sprites. No JavaScript animation libraries. Total CSS additions: ~120 lines.

## Public UX changes

What users will see differently after Phase 15 deploys:

1. **Visiting `/board` on May 7** (with current sandbox data): instead of seeing "Tuesday, May 5" as the heading and 24 stale leans as the board, they see:
   - "No current slate available" heading on a futuristic dark hero
   - A pulsing gold status pill: "awaiting next slate"
   - An archive teaser pointing to the May 5 data via /results
   - The newsletter signup
2. **Visiting `/` on May 7**: the eyebrow says "no current slate · awaiting next refresh" instead of "2 NBA games today"; KPI tiles compute from the active slate (zero), not the stale board.json (24)
3. **Once today's board lands**: the page returns to the normal active state with today's date and games. Past dates remain in archive only.
4. **Visual upgrade**: subtle but noticeable — the home and board heroes now have a faint rotating gold grid behind them, the live dot pulses gently, and active date tabs have a glow underline.

## Tests

12 Python suites, **535 assertions, all green**:

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
✓ pipeline.freshness_test               49
✓ pipeline.active_slate_test            42  ← NEW
                                       ───
                              TOTAL    535
```

The active-slate test includes the exact realistic Phase 15 scenario from sandbox data — May 5 with 24 leans, today is May 7, past dates 04/06 empty, future 08/09 empty — and asserts the result is `kind: "today"`, `selectedDate: "2026-05-07"`, with May 5 as the archived teaser.

## Known acceptable limitations after Phase 15

- **The archive teaser links to `/results`** but the Results page still shows the empty state until you settle a slate. The link is forward-looking; users won't see archived game data until settlement happens.
- **The 22s conic-gradient sweep** is intentionally slow. If you find it distracting, change `animation-duration: 22s` to `45s` or longer in globals.css.
- **No new Playwright tests** in this package. The existing freshness + admin-copy specs cover the no-stale-as-today contract; the active-slate test in Python locks the selector. Adding browser tests for the new visual treatments is a future polish.
- **Methodology and Responsible Use pages** were not redesigned — their copy is already in good shape after Phase 14.

## What was intentionally NOT built

- Past-slate archive index page (deferred — `/results` is the natural home once settlement lands)
- Animation library (Framer Motion) — would add ~50KB; pure CSS suffices
- Methodology / Responsible Use redesigns — decent already
- Parlay Lab visual upgrade — already premium
- Per-page background treatments beyond home + board — overkill
- Mobile-specific layout overhaul — current responsive flow works
