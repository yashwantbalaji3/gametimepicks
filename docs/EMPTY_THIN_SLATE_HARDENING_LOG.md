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

## Deferred (blunt): advancing the LIVE site to a thin July-14 slate
The pipeline is now safe to run for July-14 (WC semifinal, MLB still on break). BUT advancing the live public
slate to a thin day still fails **15 slate-coupled tests** (Top-10 "overall has picks", MLB-sim detail/lobby,
availability badges, admin-status) because they assume a populated MLB slate. Making the **UI + those tests
thin-slate-aware** (honest "No MLB games — All-Star break" + "Top-10: no qualified picks today" empty states)
is the real remaining work and is a scoped follow-up — it was too large to do safely this pass without risk.

So this pass hardens the PIPELINE (the founder's stated crash), but the LIVE site still shows the last full
July-11 slate (freshness-badged "N days ago") until the thin-slate UI hardening lands or the full slate
resumes (~July-17, MLB back). See `WEEK_OF_JULY13_ACTION_PLAN.md`.

## Guardrails
Money md5 `affe6b21…` unchanged. No fake games/odds/cards. No stale-as-live shipped. UFC still excluded from
products; the past-event UFC homepage guard (prior pass) still suppresses the finished card.
