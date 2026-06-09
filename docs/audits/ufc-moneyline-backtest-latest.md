# UFC moneyline backtest (June 9)

**Decision: backtestReady = FALSE (collecting data). Public picks stay LOCKED.**

## State today
- Durable pregame odds-snapshot logging is live (build_odds writes immutable
  `odds-snapshots/odds-<ts>.json` + per-bout `pregame` flag).
- Backtest dataset builder + market-implied calibration harness are implemented +
  tested (leakage-safe: pregame odds only, final fights only, licensed source only).
- **Current backtest rows = 0** — the only clean odds we have are for *future*
  fights (e.g., the June-14 card); no completed fight yet has a clean pregame
  OddsAPI snapshot. So Brier is uncomputable and launchDecision = hold.

## Why not bootstrap from historical odds?
Clean historical MMA odds are not freely/licensed-available (jansen88's betmma.tips
odds carry no license; Kaggle varies). Per the rules we do NOT use unlicensed odds
in production. So we accumulate clean odds FORWARD via the snapshot logger.

## Path to backtestReady
- Each UFC card: run `ufc-odds-refresh` pregame (logs a snapshot) → after the card,
  `ufc-results-refresh` builds results + dataset + summary.
- ~150 completed clean rows (≈ 5–10 cards of full slates, weeks of accumulation)
  → market-implied baseline validated → backtestReady can flip → projections-public.
- A fighter-stat MODEL additionally requires point-in-time pre-fight feature
  snapshots (we now also keep dated fighter-stat artifacts) to avoid leakage.
- Public PARLAYS need a further parlay simulation (`parlaySimReady`) — separate gate.

## Re-run when
After each completed UFC card. Re-evaluate backtestReady once rowCount ≥ 150.
