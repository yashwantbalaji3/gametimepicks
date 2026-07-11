# July-10 World Cup Report State (2026-07-10)

State snapshot behind wiring the shared FreeSim report UI into the World Cup game page.

## The July-10 World Cup slate

- Newest projections artifact: `app/public/data/world-cup/projections/2026-07-10.json` — **15 fixture rows-groups**,
  each carrying `moneyline_90`, `match_total_goals`, `double_chance`, `btts`, `draw_no_bet`.
- Statically-generated game pages today (real, committed data): **Spain vs Belgium**, **Norway vs England**,
  **Argentina vs Switzerland** (`out/games/world-cup/<slug>-2026-07-10/`).
- **Status: `scheduled`** for all. World Cup is DISPLAY-ONLY — there is no committed live/final score and no
  settlement artifact, so the report never fabricates a live/final state. (At 7:50 PM EST a game may in reality
  be live/final, but the repo carries no such source; we render the honest pre-match read.)

## Data that exists (per fixture)

| market | source | in report |
|---|---|---|
| Match result (moneyline 90') | de-vigged odds | ✅ Market Snapshot + Simulation Output win/draw/loss |
| Double chance | de-vigged odds | ✅ Market Snapshot |
| Draw no bet | de-vigged odds | ✅ Market Snapshot |
| Total goals | de-vigged odds | ✅ Market Snapshot / lean when supported |
| BTTS | de-vigged odds | ✅ Market Snapshot |

## Data that does NOT exist (roadmap only — never a lean)

Scoreline distribution, goal-margin / total histograms, corners, cards, first goal scorer, xG / shots,
player-prop distributions, per-team recent-form model. All listed in `details.unavailableMarkets`.

## Source of truth for the read

`app/src/lib/game-lab/wc-report.ts` (`buildWcGameLabReport`) already derives a pure, honest odds-only
model-vs-market view (`WcGameLabView`) from the projections artifact. It is **market-implied** — a de-vigged
read of the sportsbook price, NOT an independent stat model, NO persisted Monte-Carlo artifact, NO run count.

## Prior UI (the problem)

The WC game page led — after the Generate gate — with `WcGameCenter` (a market **dashboard**) + collapsed
disclosures. It read as a market board, not a FreeSim-style simulation report, because there was no uniform
six-section spine and no explicit "Market-implied simulation" source-mode badge.

## What was wired (this pass)

`WcGameLabView` → `wcGameLabViewToReport()` → a validated `MultiSportGameReport` → `MultiSportReportShell`,
rendered as the PRIMARY post-Generate content. The market dashboard (`WcGameCenter`) moves into the shell's
Expandable Details as the "advanced market dashboard" — nothing lost, the report leads. Source mode
`market_implied_simulation`, label **"Market-implied simulation"**, all `publicClaims` false. See
`docs/WORLD_CUP_FREESIM_REPORT_IMPLEMENTATION.md`.
