# Founder Public Review Checklist — July 21

Everything below is **paper / review mode · $0 official-money exposure**. Official record 19-14, bankroll
$19,065.40, crown $20,465.40, money md5 `affe6b21` — all unchanged. Nothing here places real money.

## Routes to review (localhost or the deployed build)
| route | what it should show | status |
|---|---|---|
| `/` | MLB-first hero (July-21 games), "Simulate today", no World Cup hero | ✓ |
| `/simulate` | current MLB games first; World Cup archived below | ✓ |
| `/mlb` | July-21 15-game slate; honest liveness ("next up" tonight → "today" tomorrow) | ✓ |
| `/games/mlb/<game>-2026-07-21` | V2 report: 10k player-prop sim + market snapshot + "full-game model validating" (no projected score / win prob) | ✓ (3 priced games) |
| `/bank-builder` | **Step 1 · restarted · Paper · $0** (Lane A review card; Lane B awaiting) | ✓ status (legs in doc — display gap) |
| `/moonshot` | **Step 1 · Review Mode · $0** with the Wheeler+Gausman legs | ✓ |
| `/today` | July-21, active MLB, honest No-Play/Step-1 states | ✓ |
| `/results` | official 19-14 vs paper/internal clearly separated; pending not counted as loss | ✓ |
| `/world-cup` | archive/completed (no "Live today"); round-of-32 "completed" page | ✓ |
| `/methodology` | no overclaims | ✓ |

## The restarted products (exact Step-1 review cards)
**Bank Builder — Lane A · Step 1 · Review · $0** (combined +268):
- Justin Wrobleski · pitcher K **Over 5.5** · +112 · model 60% vs mkt 47% (edge +13%) — LAD @ PHI
- Walker Buehler · pitcher K **Over 3.5** · −136 · model 60% vs mkt 58% — SD @ ATL
- Lane B · Step 1 · awaiting a qualified value card (thin slate tonight).

**Moonshot — Step 1 · Review · $0** (combined +278):
- Zack Wheeler · pitcher K **Over 6.5** · −122 · model 86% vs mkt 55% (edge +31%) — LAD @ PHI
- Kevin Gausman · pitcher K **Over 5.5** · +108 · model 72% vs mkt 48% (edge +24%) — TB @ TOR

All legs: MLB pitcher strikeouts, deterministic MLB Stats API settlement, real model edge from the 10k sim.
Independent games. No official money, no settlement-pending props, no World Cup, no internal model outputs.

## Honest limitations (know before you launch)
- **Only 3 of 15 July-21 games are priced tonight** — books post the rest through tomorrow. Re-run the morning
  refresh for full coverage + more eligible legs.
- **Public MLB shows the player-prop simulation + market-anchored full-game snapshot** — NOT a projected score or
  public win probability (the internal full-game model mirrors the market and stays internal).
- **World Cup is complete → archive.** France-vs-Spain and later rounds remain **pending** settlement (no trusted
  90'-separated official score source).
- **`/bank-builder` shows the Step-1 status but not the individual review legs yet** (a display wiring gap; the
  legs are listed above + in the ladder artifact).

## How to approve / hold products
- These are **review cards**, not placed bets. To go live for real money you must give a **separate, explicit
  money-exposure instruction** — this build does not authorize official-money exposure.
- To activate a real paper/official card tomorrow: re-run the morning refresh, review the eligible legs, and
  approve via the md5-guarded promoter (`promote-bank-builder-proposal.mjs`). To hold: leave Step 1 as review/
  awaiting. Never force a correlated or 0-edge card.

## Screenshots to capture before public launch
Homepage hero · `/simulate` MLB cards · a `/games/mlb/...` V2 report · `/moonshot` Step-1 card · `/bank-builder`
Step-1 · `/world-cup` archive · `/results` (official vs paper separation).

## Not official money
Nothing in tonight's build changed official money, bankroll, crown, record, or exposure. Money md5 `affe6b21`,
19-14, $0 exposure — verified by forensic audit.
