# Full-Site State Audit Log (2026-07-13)

Consolidates the Phase-0 log + route inventory + data-freshness + product/settlement audit.

## Phase 0
- Start: 2026-07-13 ET (Mon). Starting HEAD `91f605d2` → fast-forwarded to `8b6a2e09` (nightly settle drift,
  money-clean) → this pass. Branch `june30-reset` (+ `main`). Money md5 `affe6b21071f2b3be96bb2774eb347c3`.
- Forensic PERFECT · Health HEALTHY. Origin drift = 2 nightly-settle commits (money-clean), fast-forwarded.

## Route inventory (public, primary)
| route | purpose | data source | status 07-13 |
|---|---|---|---|
| `/` | homepage (spotlight + hero + flagship + featured sims + trust) | many | 🟢 (stale UFC spotlight fixed) |
| `/today` | daily slate hub | MLB board + WC proj + daily-portfolio | 🟡 July-11 slate |
| `/picks` `/parlay-lab` | Parlay Lab (model-qualified pool) | `loadTodaySlate` (MLB+WC) | 🟢 |
| `/build` | advanced builder | eligible-leg pool | 🟡 (custom builder deferred) |
| `/simulate` (via `/games`) | sim-first lobby | MLB game-simulations | 🟡 July-11 |
| `/games`, `/games/[sport]/[gameId]` | Game Lab (WC/MLB) | game-detail | 🟡 July-11 (WC QFs now played) |
| `/mlb` (+ board/parlays/power/results) | MLB hub | mlb board/props/team-markets | 🟡 July-11 |
| `/ufc` | UFC fight simulator | schedule+odds+fighters | 🟡 UFC 329 over, not settled |
| `/moonshot` | Moonshot ladder | daily-portfolio | 🟢 $25 paper lane |
| `/bank-builder` | Bank Builder ladder | daily-portfolio | 🟢 no-play |
| `/results` (+ mlb/nba/ipl/model-audit/date) | track record + trust | results artifacts | 🟢 |
| `/mr-dub` | money/journey | portfolio + master-ledger | 🟢 19-14 / $0 |
| `/methodology` `/market-guide` `/learn` `/about` `/responsible-use` | trust/education | static | 🟢 |
| `/ops` | admin status (noindex, read-only) | admin/status.json | 🟢 |
| `/nba` `/nhl` `/ipl` (+ board/parlays/power/results) | other-sport scaffolds | — | ⚪ off-season/placeholder |
| `/homer-nukes` | retired product landing | — | ⚪ retired |

## Data freshness (as of 07-13)
| domain | newest artifact | age |
|---|---|---|
| MLB board / sims | `2026-07-11.json` | 2 days |
| World Cup projections | `2026-07-11.json` | 2 days (QFs now played) |
| UFC odds | `generatedAt 2026-07-10` | event 07-11 over; provider had no post-event refresh with the card |
| Daily portfolio | `date 2026-07-11` | 2 days (Moonshot $25 paper, BB candidate/no-play) |

**All display-only artifacts; official money (`portfolio.json`) untouched, md5 `affe6b21…`.**

## Product cards / settlement
- **Bank Builder:** no active lane (candidate proposal only) → honest no-play. **Moonshot:** 1 active $25 paper
  lane. **Official exposure $0.** UFC excluded (tested). MLB/WC legs eligible via the normal pipeline.
- **Settlement pending:** World Cup July-11 QFs (90' team markets, official scores), UFC 329 (internal
  experimental grading only — never into the official 19-14). No pending is marked as a loss.

## Fixes this pass (low-risk)
- **Past-event guard**: `buildUfcSpotlight` + `loadUfcPredictionRows` now return null once the event day passes
  (or the card settles), so the homepage stops showing a stale "Tonight's UFC picks" for a finished card.
  Verified: suppressed @2026-07-13, shown @2026-07-11 (event day).

## Known residuals → see `WEEK_OF_JULY13_ACTION_PLAN.md`
Daily-refresh automation (weekends go stale), UFC post-event framing, WC knockout completion, MLB model-perf
tracking, Picks Lab custom builder.
