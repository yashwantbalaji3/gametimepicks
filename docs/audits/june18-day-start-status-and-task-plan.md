# June 18 Day Start — Status Audit & Task Plan

_Thursday June 18 2026, ~10:40 AM ET. Branch `june18-day-start-step2-bankbuilder-slate` off main `1515f66f`._

## A. Repo / production state
- **Latest main SHA:** `1515f66f` (nightly settle cron 2026-06-18 07:36 ET — it completed the June 17 MLB
  `/results` cumulative export that the prior PR had intentionally deferred). Prior feature merge: `8d8c1aa` (#514).
- **Working tree:** clean before this branch; protected `public/data/bank-builder/*` untouched.

## B. Active Dual Bank Builder
- Artifact: `app/public/data/methodology/launch/dual-bank-builder-active.json` (NON-protected engine namespace).
- `run.status = settled`, `run.date = 2026-06-17`, runId `dual-bank-builder-2026-06-17`.
- **Lane A (survival 93):** Colombia or Draw — WON (Uzbekistan 1–3 Colombia FT) · JR Ritchie Strikeouts Over 3.5 — WON (4 K). combinedOdds −119. **WON → advanced.**
- **Lane B (survival 84):** Ghana or Draw — WON (Ghana 1–0 Panama FT) · Javier Assad Strikeouts Under 4.5 — WON (1 K). combinedOdds +117. **WON → advanced.**
- **Step 2 exists?** No — the artifact is single-step. Step 2 is what today builds.
- June 17 settlement: complete, official, preserved. Protected completed-ladder proof ($100→$10,376.17, 5–0) untouched.

## C. Provider health (no secrets printed)
- **The Odds API:** live. 149 credits remaining after today's WC+MLB refresh (started 193).
- **API-Football:** key present; **0 finals for 2026 WC** (known provider gap) — used only for fixture/identity, NOT settlement. ESPN `soccer/fifa.world` is the WC official-finals fallback.
- **MLB Stats API:** live (free) — 9 real games for June 18.

## D. June 18 slate inventory (generated fresh this run)
| sport | scheduled | upcoming/pregame | odds-backed | team markets | player props | projected candidates | notes |
|---|---|---|---|---|---|---|---|
| World Cup | 4 | 4 | 4 | ML / DC / DNB / totals / BTTS (20 proj) | 96 (48 ATGS, 48 SOT; 80 matched) | 116 eligible legs | wc-odds-only-v2, dataQuality limited (market-implied; no independent model) |
| MLB | 9 | 9 | 9 | 4 MVP markets | 395 leans / prop rows | 366 eligible legs | DK+FD, US region |
| NBA | 0 | 0 | 0 | — | — | 0 | season over → no-qualified state |
| UFC | 0 | 0 | 0 | — | — | 0 | no upcoming card → no-qualified state |

- **WC fixtures (UTC):** Czechia–South Africa 16:00, Switzerland–Bosnia 19:00, Canada–Qatar 22:00, Mexico–South Korea (June 19) 01:00. All pregame at generation time (14:48 UTC ≈ 10:48 ET).
- **MLB games:** 9, earliest 17:35 UTC (1:35 PM ET) — all Preview/pregame.
- Engine "now" gate = 2026-06-18T14:49Z; every BB/projection leg is strictly pre-event.

## E. Engine output (dry-run, June 18)
- Eligible legs: MLB 366, WORLD_CUP 116. Suggested parlays: MLB {5/5/5/5}, WC {5/5/5/5}. Game-specific: 45.
- **Dual Bank Builder qualifies (soccer-per-lane):**
  - Lane A (survival 93): **Canada or Draw** + **Shane Drohan Strikeouts Under 5.5**
  - Lane B (survival 88): **Switzerland or Draw** + **Ha-Seong Kim Hits+Runs+RBIs Under 1.5**
- → These become **Step 2** of the active Dual Bank Builder (not a new run).

## F. Route inventory
Present: `/` `/today` `/bank-builder` `/parlays` `/picks` `/parlay-lab` `/build` `/world-cup` `/mlb` `/ufc` `/nba` `/results` `/methodology` `/projections` `/sports` `/games` `/board` (+ nhl/ipl/learn/about). WC game pages under `/world-cup/...`. All build statically.

## G. Today's task plan
| priority | task | why it matters | execute today | blocker |
|---|---|---|---|---|
| 1 | Confirm Step 1 settled + lanes advanced | foundation for Step 2 | ✅ done | none |
| 2 | Generate fresh June 18 WC + MLB slates | public-ready, pre-event, odds-backed | ✅ done | none |
| 3 | June 18 suggested parlays (by sport/risk) + game-specific + mixed | core public value | ✅ yes | none |
| 4 | Select Step 2 Dual Bank Builder legs (soccer per lane) | owner's primary ask | ✅ yes — qualifies | none |
| 5 | Restructure /bank-builder into two lane ladders (Step1 cleared → Step2 active → 3–5 soon) | public-ready clarity | ✅ yes | none |
| 6 | Per-game WC projections + player props visible | user-friendly | ✅ yes | none |
| 7 | De-stale Today / Parlays / Picks / Parlay Lab / Build | no June 17 stale cards | ✅ yes | none |
| 8 | Tests / build / audits / QA / PR / deploy | ship safely | ✅ yes | none |

**Non-negotiables honored:** no fabrication (all odds from The Odds API; WC finals via ESPN; MLB via Stats API); leakage-safe + timestamped + pre-event; protected bank-builder history never hand-edited; Step 2 launched only because real odds-backed leakage-safe legs qualified.
