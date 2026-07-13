# Empty / Thin-Slate Hardening Log (2026-07-12)

Consolidates the failure audit (`EMPTY_THIN_SLATE_FAILURE_AUDIT`) + the fixes.

## Why July-13 broke (root causes, classified)
| # | symptom | root cause | class | fixed? |
|---|---|---|---|---|
| 1 | refresh exited 1 | MLB team-markets step (`ingest-mlb-team-markets.mjs`) errored `board has no gameIds` on a 0-game day; `set -e` propagated it | **real pipeline bug** | ✅ this pass |
| 2 | "master-ledger crashed on thin slate" | **misdiagnosis** — `build-master-ledger.mjs` reads `app/public/...` relative to REPO ROOT; the prior run invoked it from `app/`. It works fine from root (how the refresh calls it). | not a bug | n/a |
| 3 | `generate-mlb-game-simulations` "0 games" | already writes a valid `games=0` artifact (exit 0) | expected / already-safe | n/a |
| 4 | 15 tests failed on the July-13 slate | Top-10 / MLB-sim / availability / admin tests assume a **populated MLB slate** exists | test-assumption bug (thin-slate) | ⏳ deferred (see below) |
| 5 | in-focus > scheduled | slate-window test hardcoded a 2-day window; a knockout slate can span 3 days | test bug | ✅ fixed prior pass |

## Fix shipped: 0-game MLB guard
`scripts/refresh_daily_products.sh` now computes `MLB_GAMES` from the board and runs team markets +
internal-evidence + (implicitly) sims ONLY when `games > 0`. On a 0-game day it prints
**"MLB: 0 games — All-Star break / no games. Skipping team markets + simulations."** and continues to the WC
+ product + portfolio steps, exiting 0. Board-read errors fail closed to 0 (skip). Pinned by
`refresh-empty-slate-guard.test.mjs` (3 tests).

**Result:** the daily refresh no longer crashes on an MLB break day. It writes an honest empty board + the
WC/product artifacts and completes.

## Pass 2 (2026-07-12): honest thin-slate UI SHIPPED (Phase 3 + 6.5)

The prior pass hardened the pipeline but left the LIVE site presenting July-11 as "today". That is now fixed —
**without advancing the committed slate data** (which is what breaks the 15 slate-coupled tests and, anyway,
there is no committed July-14 semifinal data to advance to).

**Root of the "shows July-11 as live" bug:** six public routes framed everything on `currentSlateDate()`
(the newest committed slate = July-11) instead of the real ET clock, e.g. `page.tsx` had
`const today = currentSlateDate() ?? currentEtDate()` and printed "Saturday, July 11" as the current date.

**Fix — a pure liveness layer + one banner, wired into all six stale routes:**
- `lib/slate-liveness.ts` — `computeSlateLiveness({today, latestSlate, hasGamesToday, nextFocus, leagueNotes})`
  keyed off the REAL ET clock (`freshness.currentEtDate`); returns `live-today` / `latest-available` / `no-data`
  with honest headline + detail. Fabricates nothing.
- `lib/wc-tournament-calendar.ts` — WC 2026 knockout DATES ONLY (public record); `nextWorldCupFocus(today)`
  names the next round (semifinals Jul 14 & 15) with matchups explicitly TBD. No teams, no odds, no picks.
- `lib/mlb-season-calendar.ts` — All-Star break window (Jul 13–16); the break note fires ONLY inside the
  window (so July-12 is NOT falsely called a "break" — it just has no committed board).
- `components/slate-liveness-banner.tsx` — client banner; re-derives today post-hydration; renders NOTHING on
  a genuinely live day; on a no-games day shows "No games today · <real date> · Most recent slate: … (N days
  ago) · Next up: World Cup semifinals (Jul 14 & 15)" + a link to the most-recent slate as an archive.
- Wired into `/`, `/today`, `/mlb`, `/picks`, `/moonshot`, `/world-cup` (the six routes recon flagged as
  framing on the slate date). `/mlb` uses MLB-focused framing (`includeWcFocus=false`, All-Star note).

**Why this is test-safe:** the ~15 slate-coupled tests (Top-10 has picks, MLB-sim detail/lobby, availability
badges) read the newest *committed* artifacts. Those stay July-11, so all pass. The banner is a display layer
ON TOP — it reframes July-11 as "most recent slate" via the real clock without touching the data. **Full suite
2141/0 green** (+15 new pins), tsc clean, build green.

**Verified in the built static export** (the artifact that deploys): all six routes render "No games today" +
"Most recent slate"; `bodyHasJul11Live = false`; zero "Live today" strings; no console errors. The freshness
badge ("Latest slate · N days ago") coexists as a second honest signal.

## Phase 4/5 — advancing to July-14 + WC QF settlement (blunt status)
- **July-14 live advance: NOT done, by design.** There is no committed July-14 semifinal data (schedule.json is
  empty; all WC data lives in the projections files, newest = July-11 QFs; SF matchups depend on unsettled QFs).
  Advancing the live slate to an empty/thin July-14 would either fabricate games (forbidden) or empty the
  committed artifacts (breaks the 15 data-coupled tests). The honest resolution — naming the semifinals as
  "next up" from the public calendar — is now shipped in the banner. The pipeline is empty-MLB-safe to run
  July-14 whenever real SF odds post.
- **WC July-11 QF settlement: PENDING (blocked, not skipped).** Committed official scores stop at
  `settlement/official-scores-2026-07-07.json`; there are no official QF box scores in the repo. Settling
  without them would fabricate results, so QFs stay pending. No money touched (official 19-14 unchanged).

The full slate resumes on its own when MLB returns (~July-17). See `CURRENT_VS_ARCHIVED_SLATE_POLICY.md` and
`JULY13_DAILY_AUTOMATION_STATUS.md`.

## Guardrails
Money md5 `affe6b21…` unchanged. No fake games/odds/cards. No stale-as-live shipped. UFC still excluded from
products; the past-event UFC homepage guard (prior pass) still suppresses the finished card.
