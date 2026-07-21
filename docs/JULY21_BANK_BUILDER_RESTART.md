# July 21 Bank Builder Restart (Review Mode)

Both Bank Builder lanes restarted from **Step 1** for the July-21 public review. **Review/Paper mode, exposure
$0, no official money change.** Money md5 `affe6b21` unchanged; forensic PERFECT. Prior WC-era cycles preserved
in `priorLane` (history), canonical bankroll/crown/record untouched. Mechanism: `restart-both-lanes-0721.mjs`
(mirrors the proven `restart-both-lanes-0701.mjs`).

## New state (`methodology/launch/dual-bank-builder-active.json`)
- **Lane A** — lower-volatility survival lane · **cycle 9 · active · Step 1** · stake $0 · `reviewMode: true`
  ("Review Mode · MLB · paper · $0 exposure"). Step-1 review card (combined **+268**):
  - Justin Wrobleski · pitcher_strikeouts **Over 5.5** · +112 · model 60.2% vs mkt 47.2% (edge +13.0%, anchor) — LAD @ PHI
  - Walker Buehler · pitcher_strikeouts **Over 3.5** · −136 · model 59.8% vs mkt 57.6% (core) — SD @ ATL
  - Independent games (not a same-game stack). Deterministic MLB Stats API settlement.
- **Lane B** — value lane · **cycle 8 · active · Step 1** · stake $0 · **awaiting** a qualified value card. Only 4
  clean deterministic-settlement legs existed tonight; the survival anchor+core took two, the other two went to
  Moonshot, so Lane B is honestly left awaiting rather than forcing a correlated same-market card.

## Honesty / eligibility
- Legs are **MLB pitcher-strikeout player props** — deterministic StatsAPI settlement, real model edge from the
  10k sim. NO settlement-pending props, NO World Cup, NO internal full-game / pitcher-v1 / bullpen-v1 outputs, NO
  market-anchored "edge". Review/paper labels; no best-bet/lock/EV/edge language.
- Bank Builder's money engine hard-forbids player props, so these review legs live in the **ladder display
  artifact's Step-1 (review data, stake $0)** — never routed through the money path. Exposure stays $0.

## Known display gap (residual)
The `/bank-builder` ClimbHero renders the Step-1 **status** ("Step 1 · Paper · $0", restarted from stopped/stale)
but not the individual Wrobleski/Buehler review legs (ClimbHero reads the daily-portfolio card, not the ladder's
review legs). The legs are in the artifact + this doc. Wiring them into ClimbHero is a follow-up UI task.
