# MLB Simulation Report — End-to-End Upgrade (2026-07-14)

Make the MLB game report's first post-generate screen read as a cohesive **simulation result** instead of a
stack of collapsed accordions — using ONLY the real 10,000-run artifact. Money untouched (md5 `affe6b21`).

## The problem
`mlbReportDetails` (the post-reveal) was entirely **collapsed accordions** ("Player props by market", "Advanced
report", "Methodology"), so the actual result was buried. MLB also kept showing the **July-11** slate as current
on July-14.

## What the artifact actually contains (so we don't invent)
`game-simulations/<date>.json` per game: `simulationSummary.headline`, `generatedPicks` (player, market, side,
line, **modelProbability**, marketProbability, **edgePct**, **confidence**, riskTier, reasonBullets), and
**player-prop `distributions`** (bins per prop). The `unavailableModules` explicitly states a full-game
**scoreline** distribution is a soccer module and is **not generated for MLB** — so there is **no** game-level
win-probability, total-runs, margin, or scoreline distribution to show. The 10k sim is a **player-prop** sim.

## What was built (`MlbSimulationResultSummary`, above the fold, expanded)
- **Strongest simulated player-prop leans** — the top `generatedPicks` ranked by edge: player · market · side ·
  line · **model % vs market %** · edge · confidence · risk tier. (e.g. "Shane Drohan · Strikeouts under 4.5 ·
  +13.8% edge · model 59% vs market".) This is the genuine 10k output.
- **Plain-English recap** from `simulationSummary.headline`.
- **Honest scope note:** "N-run player-prop simulation. Full-game markets (moneyline / run line / total) below
  are the **de-vigged sportsbook lines — market-anchored, not an independent game simulation**. No projected
  score, total-runs or margin distribution is generated for MLB."
- **Previous-slate badge** — "Previous slate · 2026-07-11" when `detail.date < currentEtDate()` (real ET clock),
  so a stale slate is never presented as current.
- The animation (`GameSimulationRunner`) is unchanged; the summary is the first thing in the reveal.

## What we did NOT do (honest — no fabrication)
No invented win probability from the sim, projected score, total-runs distribution, margin distribution,
scoreline buckets, team totals, F5, alt lines, or pitcher markets. Those aren't in the artifact — team totals /
F5 / alt lines remain in the advanced detail / unavailable-modules, and MlbGameCenter honestly says a full-game
score sim is "coming soon … not shown until it is real." Team markets stay market-anchored, labelled.

## Gates
tsc clean · suite 2190/0 (+ `mlb-report-summary.test`) · build exit 0 · forensic PERFECT · money `affe6b21` ·
health HEALTHY. Verified in the build: the summary + strongest lean + Previous-slate badge render above the fold.

## Residual
A genuine full-game MLB sim (win probability, total-runs/margin distributions) needs a **dedicated full-game
artifact + a validated model** — a data/modeling item, not UI. Until then the report is honestly a player-prop
simulation + market-anchored full-game lines.
