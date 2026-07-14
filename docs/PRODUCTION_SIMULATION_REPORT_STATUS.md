# Production Simulation-Report Status (2026-07-14)

A reality check on what `gametime-picks.vercel.app` actually serves *right now*, because "prod looks stale" is
usually deploy-lag or a cached client, not the code. Verified against the deployed HTML (curl -sL, trailing
slash), real ET clock `date`.

## Verdict: production is CURRENT, not stale
The founder's "stale prod" perception was **deploy-lag / browser cache**, not a code regression. The live site
matches `main` at the time of this check.

## What prod serves (verified in the deployed HTML)

### World Cup — France vs Spain (Jul 14) and England vs Argentina (Jul 15) reports
- Button reads **"Generate Simulation Report"** (not "Generate Market Dashboard").
- **Bracket impact** card present — "Semifinal", "Advances to the World Cup Final", loser "Plays in the
  third-place game", final/third-place **TBD** (no fabricated opponent).
- Real market-implied probabilities present (France/Draw/Spain 3-way, total 2.5, BTTS, DC, DNB).
- `/simulate` features **France vs Spain + England vs Argentina** with a **Market-implied** badge — no stale
  Athletics MLB card leaking in as "today".

### MLB
- Game report shows **"Simulation result"** + **"Strongest simulated player-prop"** + a **"Previous slate"**
  badge on the July-11 games (real ET clock gates staleness).

## This upgrade's additions (deploying with this push)
- **`WorldCupSimulationResultSummary`** — the WC report now opens on a probability center (3-way bar +
  total/BTTS/DC/DNB + no-play/efficient-market explanation), above the market detail.
- Everything remains market-implied / 90'-only labelled. No new money, no new claims.

## How to re-verify after a deploy (so "stale" is never a mystery again)
```
date                                              # confirm real ET date/kickoff
curl -sL https://gametime-picks.vercel.app/games/soccer/<matchId>/ | grep -o "Simulation result\|Generate Simulation Report\|Bracket impact"
curl -sL https://gametime-picks.vercel.app/simulate/ | grep -o "France vs Spain\|Market-implied"
```
If the deployed HTML shows the new strings, prod is current — a stale *browser* is a hard refresh, not a code
change.

## Money
portfolio.json md5 `affe6b21` unchanged. Record 19-14, bankroll $19,065.40, exposure $0. This is a
display/report upgrade only.
