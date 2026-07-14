# Soccer Simulation Report V2 (2026-07-14)

The World Cup game report was rebuilt from a "probability card stacked on a dense odds dashboard" into a clean,
scannable SimTheGame-style **simulation report** — honest about the market-implied data. Money untouched
(`affe6b21`). This is a display-only change.

## What changed
`app/src/components/game/soccer-simulation-report-v2.tsx` (`SoccerSimulationReportV2`) replaces the old
post-generate flow (`WorldCupSimulationResultSummary` + a dominant `WcGameCenter` dashboard). The old dashboard
+ advanced report are **demoted into a single collapsed "Full market detail" block at the very bottom** — nothing
is lost, but the page no longer reads like an odds table.

### The new flow (in order)
1. **Match header** — teams, monograms, stage, kickoff, `Simulation report · Market-implied 90′` label.
2. **Simulation result** — the probability center: 1X2 bar (France 41 / Draw 30 / Spain 29), most-likely 90'
   result, total / BTTS / double-chance / DNB tiles, and the no-play / market-efficient explanation.
3. **Score center** — "scoreline model · validating"; **no fabricated projected score** (the internal Poisson
   scoreline loses to market, so it stays internal).
4. **Team goal totals** — provider-needed (not ingested), demoted.
5. **Player props** — fixture-specific goalscorer / shots / SOT / assists, with pick / probability / bookmaker,
   labelled **settlement-pending + product-ineligible**.
6. **Market watchlist** — the market's own strongest reads, framed as a watchlist, **never** best-bet / lock /
   EV / edge / official-pick language.
7. **Market agreement** — why a market-implied report has no advantage over the price, and no strong lean = a
   valid no-play.
8. **Bracket impact** — semifinal → Final / third-place, opponent **TBD** (no fabrication).
9. **Coming soon** — correct score, xG, corners, cards, lineups, player-prop settlement (each with a real reason).
10. **Methodology** — market-implied, 90' only, no independent-model / no 10k claim, paper-only.

### UI cleanup
Fewer micro-badges, larger cards, numbered section headers, softer palette (gold/grey/blue, not red-on-black),
supported outputs first, unavailable lower, mobile-friendly. Verified in a real browser on the built static
export (screenshots: probability center + player-props grid).

## Model status (Phase 5 — internal-only, do not surface numbers)
**Soccer Engine V1 (FIFA-Poisson) and V2 (rating-Poisson + form) both currently LOSE to the closing market** and
stay internal:
- V1 vs 2022 closing market (64 matches): model Brier 0.5925 / log loss 1.0024 vs market 0.5826 / 0.9961 — model
  loses by ~1% on every proper score.
- V2 (in-tournament form) is monotonically worse than V1; tuning overfits. See
  `SOCCER_PROJECTION_ENGINE_V1_BACKTEST.md`, `SOCCER_ENGINE_TUNING_RESULTS.md`,
  `SOCCER_ENGINE_FEATURE_UPGRADE_PLAN.md`.

Therefore the **public report remains market-implied**. No internal engine probabilities are shown. The report
will only display internal model numbers if a future engine **beats the market** or the founder explicitly
approves an internal-preview label. The score center says "validating" precisely because of this.

## Honesty guarantees (tested)
`soccer-simulation-report-v2.test.mjs`: V2 is wired + fed the fixture's own props; no "Generate Market Dashboard";
old dashboard demoted below the result; player props settlement-pending + product-ineligible; no 10k / projected-
score / independent-model claim; no best-bet/lock/EV/edge language; bracket final/3rd stay TBD; no internal model
numbers; money md5 unchanged.

## Known data issue (flagged separately)
The props grid intentionally **omits the player's team label** because the game-detail props join mislabels away-
team players (Spain players tagged "France"). The player names + markets + prices are correct; only the team tag
was unreliable, so it's hidden until the pipeline join is fixed (separate task).
