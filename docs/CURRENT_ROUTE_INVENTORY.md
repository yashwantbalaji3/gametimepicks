# Current Route Inventory — 2026-07-13

65 page routes (Next App Router, `output: export` static, `trailingSlash: true`). Real ET **2026-07-13**;
newest slate **2026-07-11**. The honest `SlateLivenessBanner` (real-ET, "No games today · next up semifinals
Jul 14-15") is on **6 routes**: `/`, `/today`, `/mlb`, `/picks`, `/moonshot`, `/world-cup`.

Anchor: `ET` = real clock · `SLATE` = presented slate (07-11 today) · `settled` = graded history · `static`.

## 🔴 RED — internal surfaces publicly exported (top launch blockers)
| path | issue | action (founder decision) |
|---|---|---|
| `/ops` | internal ops/admin dashboard — `noindex` but **statically exported + world-readable**; leaks doc paths, gate CLI commands (`forensic-money-audit.mjs`…), agent playbooks, "Claude team" section | exclude from public export or accept exposure — **noindex ≠ private on a static host** |
| `/preview/june20` | internal June-20 review build — publicly reachable + **stale** ("Tonight's launch checklist", "June 19 settlement pending") on Jul 13 | delete / exclude from build |

## 🟡 YELLOW — usable, needs work
| path | nav | issue | action |
|---|---|---|---|
| `/mlb/board`, `/mlb/power` | sport tab | land on the 07-11 slate, **no liveness banner** (games marked settled, so not a hard lie) | add banner / latest-slate framing |
| `/simulate` ≡ `/games` | Simulate / Game Reports | **identical** `SimulateLobby`, different labels+titles | collapse `/games`→redirect or differentiate |
| `/projections` | unlinked | NBA-centric (off-season) + hero `sub="today"` frozen-clock nit + no banner | relabel/link or gate the "today" sub |
| `/sports` | **orphaned (0 inbound links)** | now honest ("no live slate today" — fixed this pass) but unlinked; promotes UFC as co-equal | link it or retire; decide UFC prominence |
| `/ufc` | UFC (rail) + home + /picks + /sports | experimental (fail-closed, "moneyline only") but **surfaced on the flagship home**; advertises the finished 07-11 card as "Completed — awaiting settlement" (never settles) | decide launch scope; settle or relabel the 07-11 card |

## ⚪ GRAY — intentionally offseason / retired / experimental / alias
`/homer-nukes` (retired badge, noindex) · `/trends` (retired, noindex) · `/nba` + `/nba/*` + `/board` (off-season,
"Between slates") · `/nhl` + `/nhl/*` (provider-pending) · `/ipl` + `/ipl/*` (provider-pending, de-linked) ·
`/mlb/parlays` (placeholder) · `/parlays` · `/parlay-lab` · `/nba/parlays` (→ redirect `/picks`) ·
`/results/nba|nhl|ipl` (dup URLs). All **honestly labeled**. ⚠️ **Verify the `redirect()` routes actually emit
under `output:export`** — if they no-op they render blank (→ RED).

## 🟢 GREEN — launch-ready
`/` · `/today` · `/mlb` · `/world-cup` · `/picks` · `/moonshot` (all 6 carry the liveness banner) · `/bank-builder`
(derives no-play honestly) · `/mr-dub` (settled dashboard) · `/results` (+ `/results/model-audit`,
`/results/date/[date]`, `/results/parlays`, `/results/mlb`) · `/build` (honest "no eligible legs") ·
`/world-cup-specials` (status-derived) · `/world-cup/schedule|groups|teams|team/[code]|round-of-32|round-of-32/[slug]`
(static/honest-empty) · `/games/[sport]/[gameId]` (`dynamicParams=false`+notFound) · `/learn` · `/about` ·
`/methodology` · `/responsible-use` · `/market-guide` · `/events`.

## Duplicates / IA cleanup (P1-P2, not blockers)
- `/simulate` ≡ `/games`; `/board` ≡ `/nba/board`; `/mlb/results` ≡ `/results/mlb` (and nba/nhl/ipl pairs).
- Overlapping pick surfaces: `/picks` vs `/projections` vs `/build` vs `/bank-builder`/`/moonshot`/`/world-cup-specials`.
- Label vs title drift: `/picks` nav "Picks Lab" / title "Parlay Lab"; `/mr-dub` nav "Daily Dashboard" / page "Mr. Dub".
- Route name `/world-cup/round-of-32` is stale vs the current semifinal stage (cosmetic).

## Headline
Off-season/retired routes are consistently + honestly labelled (GRAY is correct). The two RED internal surfaces
are the priority. The liveness fix covers the 6 hubs + (this pass) `/sports`; power-user sub-routes
(`/mlb/board`, `/mlb/power`, `/projections`) are the YELLOW follow-ups. See `PUBLIC_LAUNCH_READINESS_SCORECARD.md`.
