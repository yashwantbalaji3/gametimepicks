# June 19 — Mr. Dub end-to-end portfolio enhancement

_Branch `june19-mrdub-end-to-end-enhancement` off main `6a6a0e21` (#528). Audit at 2026-06-19._

## Current-state review
| area | current source | current behavior | issue | desired behavior | planned change |
|---|---|---|---|---|---|
| `/mr-dub` | `app/mr-dub/page.tsx` | standings → custom dual-lane → daily → full ledger → basic intel | ledger-ish, not a premium dashboard; dual lanes don't use the new visual ladders | hero+CTAs → today strip → DualLadderBoard + history → active/awaiting → daily → exposure+health → full ledger | full page redesign |
| `mr-dub/portfolio.json` | `build-mr-dub-ledger.mjs` | bankroll/exposure/record/intelligence(HWM,maxDD,winRate,exposureBySport) | missing drawdown%, exposure breakdown (market/player/lane), bankrollHealth, awaiting/completed cards, streaks | richer portfolio contract | enhance generator |
| `mr-dub/ledger.json` | generator | 13 events with legs | events lacked an accountingNote | add per-event accountingNote | generator |
| `mr-dub/daily-summary.json` | generator | opening/closing/staked/returned/pl + embedded events | good; events now carry accountingNote | unchanged shape + accountingNote | generator |
| Bank Builder current artifact | `dual-bank-builder-active.json` | Lane A advanced, Lane B stopped+queued | read-only here | reuse via `loadTodaySlate().bankBuilderPreview` | no change |
| public dual ladders | `DualLadderBoard` (#528) | hides stopped lanes | reuse on Mr. Dub for current paths | reuse + add stopped-lane history drawer | reuse |
| Results BB section | `bank-builder-results.tsx` | settled steps + official sources | no link to Mr. Dub | add "View in Mr. Dub ledger" + impact note | edit |
| homepage / Today | `today/page.tsx` (homepage re-exports it) | no Mr. Dub module | add a compact Mr. Dub card | `MrDubTodayCard` after the BB rail | new component |
| MrDubAvatar | `mr-dub-avatar.tsx` | scientist SVG | make prominent + badge | size 64 + "Paper Portfolio Scientist" badge + ⚗ + microcopy | page |
| exposure calcs | generator intelligence | only `exposureBySport` (empty) | need bySport/byMarket/byTeamOrPlayer/byLane/byStatus + health | full breakdown + health 0–100 | generator |

## Execution plan
| priority | task | files | outcome | risk | now? |
|---|---|---|---|---|---|
| 1 | richer portfolio model + accountingNote | `build-mr-dub-ledger.mjs` | drawdown%, exposure breakdown, bankrollHealth, awaiting/completed, streaks | low | yes |
| 2 | Mr. Dub dashboard redesign + reuse `DualLadderBoard` + character badge | `app/mr-dub/page.tsx` | premium portfolio product | low | yes |
| 3 | Results → Mr. Dub link | `bank-builder-results.tsx` | cross-link + impact note | low | yes |
| 4 | Today/homepage Mr. Dub card | `mr-dub-today-card.tsx`, `today/page.tsx` | at-a-glance bankroll | low | yes |
| 5 | tests (portfolio math, daily, page, integrations) | new + updated | regression-safe | low | yes |

## Accounting rule (documented)
A won **intermediate** Bank Builder step **rolls** into the next step → `paperProfit $0` (unrealized until the ladder completes or stops). A **lost** step realizes minus the lane's original **$100**. The completed crown is realized (it cashed out). So **bankroll = crown final + realized losses**; the sum of every event's realized `paperProfit` equals `settledProfit` (no double-count). Verified by test.

## State after this pass
Bankroll **$10,176.17** · HWM $10,376.17 · drawdown **$200 (1.93%)** · open exposure **$0** · record **8-2-0-0** · ROI **100.76×** · bankroll health **100 / "No open exposure"** · awaiting **2** (Lane A next card, Lane B queued) · completed **Road to $10K (5-0)**.

## Guards
- Protected `public/data/bank-builder/*` untouched. No settlement changes; no new BB legs; no new slates. No banned copy; "safe" never used for health. Inline SVG avatar only (no external images).
