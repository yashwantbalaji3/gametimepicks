# Aug 3 Production Deployment Proof (Program 100-103 Lane G)

**Production serves the August 3 slate.** Verified against the live domain, not local output.

## Deployment

| Item | Evidence |
|---|---|
| Production build metadata | `sha 059f95fd`, `builtAt 2026-08-03T04:38:05Z` (00:38 ET) — the daily-production slate commit carrying the Aug 3 board, sims, predictions |
| Canonical project | deployments for that SHA: **`["Production"]`** — a single environment, the suffix-free naming that proves only one project is Git-connected |
| Dormant duplicate | `Production – gametimepicks` last deployment still **2026-07-31T17:16:04Z** — zero deployments in the 3 days since disconnect, including through this incident and its recovery |
| Ignored-build behavior | data commits built (this one); the docs-tail behavior is unchanged and covered by its own proofs |

## Live public-route verification (production domain, HTTP 200 on all)

| Route | Aug-3 references | Jul-31 references | Reading |
|---|---|---|---|
| `/` | 24 | 2 | current |
| `/today/` | **100** | **0** | fully current |
| `/markets/` | **223** | **0** | fully current |
| `/mlb/` | 94 | 175 | current slate + historical sections |
| `/results/` | 12 | 435 | **correct** — Results shows the newest *settled* date (July 31); Aug 3 has not been played |
| `/system-status/` | 6 | 4 | current |
| `/games/mlb/sf-vs-tex-2026-08-03/` | 51 | — | HTTP 200 |
| `/games/mlb/tb-vs-col-2026-08-03/` | 51 | — | HTTP 200 |
| `/games/mlb/wsh-vs-phi-2026-08-03/` | 71 | — | HTTP 200 |

**The cross-route freshness contract holds:** current-slate surfaces (Today, Markets, game
reports) are anchored to August 3; Results is anchored to the newest legitimately settled date
(July 31) and does **not** pretend Aug 1–2 were losses. `/data/*` returns 404 by design — the
prune boundary inlines data into the HTML and keeps only `build-info.json` public.

## Workflow health at close

`morning-projections` **success** (the first since July 31) · `mlb-daily-production` **success**
via the `workflow_run` chain · `mlb-pregame-capture`, `auto-refresh` success · alerting 5/5
routed. `nightly-settle` next runs 01:30 ET and will settle nothing for Aug 1–2 (no published
population — correct) and Aug 3 tomorrow night.
