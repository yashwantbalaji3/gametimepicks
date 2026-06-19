# June 19 10:00 AM ET — daily ops: slate generation + Bank Builder

_Branch `june19-10am-daily-ops-slate-bankbuilder` off main `e92b339c` (#530). Run at 10:00–11:00 AM ET (14:09–15:00 UTC)._

## Current-state audit (live probes, real data)
| area | source | status | action |
|---|---|---|---|
| June 19 WC odds | The Odds API `soccer_fifa_world_cup` (active) | **2 pre-event games w/ odds** (USA vs Australia 19:00Z, Scotland vs Morocco 22:00Z) + Brazil/Haiti 00:30Z next-day | generate |
| June 19 MLB | MLB statsapi: 14 games; board generator multi-source: **0 games** (provider returned empty) | board provider unavailable | document, no fabrication |
| committed slate | `world-cup/projections` stale; `market-outlook` June 11; `mlb/boards/` latest June 18 | site fell back to June 18 | regenerate WC; fix slate-date resolver |
| Bank Builder | active artifact: Lane A advanced/awaiting Step 2, Lane B stopped/queued | unchanged | placement only if a qualified card exists |
| UFC | settled June 15 | stale → results-only | unchanged |
| protected history | `public/data/bank-builder/*` | immutable | untouched |

## Today's task list (generated from real state)
| # | task | success | done |
|---|---|---|---|
| 1 | Refresh live WC market outlook | outlook dated June 19, games "ready" | ✅ 44 events, credits 147→131 |
| 2 | WC team projections (odds-backed) | `provider:odds_api`, dataQuality B, 19 markets | ✅ 4 fixtures · ML/DC/BTTS/DNB/totals |
| 3 | WC player props (real markets only) | only posted markets | ✅ **192 props · 4 markets** (goalscorer, SoT, **assists, total shots**) |
| 4 | WC suggested cards (4 buckets) | engine cards by risk | ✅ engine: Low 5 / Medium 5 / High 5 / Longshot 5 |
| 5 | MLB board | real games | ⚠️ provider returned **0 games** → honest empty (no fabrication) |
| 6 | MLB cards | — | empty (no board) → diagnostic |
| 7 | Mixed cards | — | empty (needs WC+MLB) → diagnostic |
| 8 | card-factory diagnostics | real counts | ✅ 26 cards passed; MLB/Mixed empty w/ reasons |
| 9 | fix slate-date resolver | site shows June 19 | ✅ `latestSlateDate` now reads WC projections too |
| 10 | Bank Builder placement | only if qualified | **not placed** — see below |

## Critical fix
`latestSlateDate()` only read `mlb/boards/` (latest June 18) — so the site stayed on June 18 even with a real WC June 19 slate. Now it takes the max date across **`mlb/boards/` AND `world-cup/projections/`**, so a WC-only day surfaces as today's slate. Verified: default slate flips to **2026-06-19** (WC 211 eligible legs; Low/Medium/High/Longshot all populated; 6 single-game groups).

## Bank Builder decision (Lane A Step 2 / Lane B Step 1)
- The MLB board provider returned **0 games** → **no MLB partner leg available**. The dual-lane methodology prefers one World Cup leg + one MLB leg per lane for diversification.
- Per the integrity stop-rules ("prefer WC+MLB; do not place if no qualified card exists; do not fabricate"), **no qualified diversified WC+MLB card exists today**, so **both lanes remain awaiting next qualified card** — Lane A Step 2 ($197.88) awaiting, Lane B Step 1 ($100) queued. No legs placed; active artifact + Mr. Dub unchanged; protected history untouched.
- A single-sport (WC-only) Bank Builder card is technically constructible from the 6 WC games but departs from the established WC+MLB diversification standard — held pending owner approval (one-line follow-up). The Parlay Lab / picks / build DO surface the real WC cards (where single-sport WC is appropriate).

## Mr. Dub
No placement → no exposure change. Bankroll $10,176.17, open exposure $0, record 8-2-0-0 — unchanged (honest; no fabricated exposure).

## Results
No settlement: at 10 AM ET the June 19 games are pre-event. The June 18 Bank Builder settlement is already recorded (#527). No Results changes.

## Guards
- No fabrication — every WC market/prop/odds from The Odds API + API-Football (real). MLB documented as unavailable (provider 0 games). Protected `public/data/bank-builder/*` untouched; no settlement changes; no new BB legs. Stale UFC stays results-only. Canonical risk labels only; no banned copy.
