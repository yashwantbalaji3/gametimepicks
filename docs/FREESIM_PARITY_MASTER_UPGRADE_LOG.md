# FreeSim-Parity Master Upgrade — Log (2026-07-14)

One pass toward a mature simulation product (SimTheGame / FreeSim class), **without faking capability**. Money
untouched: portfolio md5 `affe6b21`, record 19-14, bankroll $19,065.40, exposure $0.

## Priority order (per the mission: ship #1 + #2 first)
- **#1 Production reality check** — DONE. Prod is CURRENT (WC "Generate Simulation Report" + Bracket impact +
  France/Draw/Spain probabilities; MLB "Simulation result" + Previous-slate). Founder's "stale" was deploy-lag /
  cache. → `docs/PRODUCTION_SIMULATION_REPORT_STATUS.md`.
- **#2 World Cup report → simulation experience** — DONE. New `WorldCupSimulationResultSummary` above the fold:
  a market-implied probability center (3-way win/draw/win bar + total/BTTS/DC/DNB snapshots + most-likely
  result + no-play/efficient-market explanation), honestly labelled 90'/market-implied, over the market detail.
- **#3 Internal MLB full-game prototype** — ALREADY BUILT (prior slice); **verified honest + not web-served**
  this pass. → `docs/MLB_FULL_GAME_MONTE_CARLO_PROTOTYPE.md`.

## What shipped this pass
| Item | File |
|---|---|
| WC probability-center summary (above the fold) | `app/src/components/game/wc-simulation-result-summary.tsx` |
| Wired into the WC report (both freeSim + fallback branches) | `app/src/components/game/game-detail-page.tsx` |
| WC report-summary tests (6) | `app/src/lib/wc-report-summary.test.mjs` |
| Gap audit vs SimTheGame standard | `docs/FREESIM_PARITY_MASTER_GAP_AUDIT.md` |
| Production status | `docs/PRODUCTION_SIMULATION_REPORT_STATUS.md` |
| Provider gap roadmap | `docs/PROVIDER_GAP_ROADMAP.md` |
| UI simplification plan | `docs/UI_SIMPLIFICATION_PLAN.md` |
| Internal MLB prototype status + honesty guarantee | `docs/MLB_FULL_GAME_MONTE_CARLO_PROTOTYPE.md` |

## Honesty guardrails held (nothing faked)
- **No independent soccer sim.** WC stays market-implied 90' — no xG, no projected scoreline, no corners /
  cards / correct score, no fabricated 10k soccer runs. Extra time / penalties excluded.
- **No public MLB full-game claim.** Public MLB report stays player-prop sim + market-anchored lines. The
  full-game Monte Carlo is internal-only, `market_anchored_simulation`, never "independent", never web-served
  (verified by find + grep + 20/20 honesty tests).
- **No-play is a feature.** A market-implied read with no edge is surfaced as "the market is efficient, a valid
  no-play, not a broken simulation".
- **Money untouched.** Display/report + docs only. No settlement, no portfolio, no exposure, no formula.

## Gates
tsc clean · new WC tests 6/6 · honesty/safety/engine 20/20 · (full suite + build + forensic + health recorded in
the commit). Money md5 `affe6b21` unchanged.

## What remains OPEN (honest)
- WC live prop settlement → paid API-Football (2026 season). Engine built + validated on 2022 data.
- MLB full-game public surface → gated on the rolling backtest beating the market baseline out-of-sample.
- Independent soccer model → real event-data provider. Until then: market-implied, never faked.
- UI simplification backlog (display-only) → `docs/UI_SIMPLIFICATION_PLAN.md`.
