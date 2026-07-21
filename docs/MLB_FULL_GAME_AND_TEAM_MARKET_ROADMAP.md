# MLB Full-Game & Team-Market Roadmap — honest path to SimTheGame-level outputs

**Purpose:** SimTheGame shows scorelines, win probabilities, half/period results, team totals, and total distributions. This doc states exactly what GameTime does today, what is **market context only**, and what real work is required to reach honest full-game outputs — **without** publishing our internal full-game engine as a model.

**Guardrail:** no `public projected score`, `public win probability`, `public full-game run distribution`, or `independent full-game model` ships from this doc. Money untouched.

## SimTheGame → MLB market mapping

| SimTheGame (soccer) | MLB analogue | GTP today | Honest status |
|---|---|---|---|
| Scoreline | Final score | internal engine mirrors market | **not public** |
| Win probability | Moneyline win % | team-markets `noVigProb` | **market context** (de-vigged market, not a model) |
| Half results | Inning markets (F5, 1st inning) | not ingested | **provider_unavailable** |
| Team goal totals | Team run totals | not in current team-markets file | **provider_unavailable** (context if ingested) |
| Total goals distribution | Total-runs distribution | internal engine only | **not public** |
| Asian handicap | Run line | team-markets | **market context** |
| Result / total / double chance | Moneyline / game total | team-markets | **market context** |
| BTTS / corners / cards / first scorer | — | soccer-only | **N/A for MLB** (honestly listed `unavailableModules`) |

## What we ship now (market context, not predictions)

A **Market Snapshot** card on the MLB game report, sourced from `team-markets/<date>.json`, showing:
- **De-vigged moneyline** (`noVigProb`) — labelled *market-implied win %, not a model win probability*.
- **Run line** and **game total** — labelled *market context*.
- Every value tagged: `market context · not a simulation · not a product edge`.

This closes the *presentation* gap (users see the same market categories SimTheGame shows) while staying truthful that these are market reads, not GameTime model outputs.

## What is required to reach an honest full-game model

Our internal engine (`scripts/build-mlb-full-game-sim-*.mjs`, `src/lib/full-game-sim/`) currently **mirrors the market** and is **not** an independent model. To publish full-game outputs (score, win prob, run distribution) as a *model*, all of the following must be true and gated:

1. **Independent run-scoring model** — a lineup-vs-pitcher run distribution that does **not** anchor to the market line.
2. **Validated inputs** — confirmed lineups, starter projections, **bullpen usage/fatigue**, park factors, weather.
3. **Team run projections** with calibrated variance (Poisson/negative-binomial run scoring, not Gaussian).
4. **Backtest** — rolling multi-week backtest vs official finals (`backtest-mlb-full-game-sim-rolling.mjs` is the harness; needs a passing, documented result).
5. **Calibration report** — reliability curve on win prob + totals, persisted like the player-prop calibration rows.
6. **Public gate** — a readiness artifact (`build-full-game-sim-readiness.mjs`) flips to `public:true` **only** after 1–5, reviewed by the founder.
7. **No market leakage** — features must be available pre-first-pitch (same leakage discipline as the player-prop model).

Until every item is met, full-game outputs stay in `data/internal` (never web-served) and the public report shows **market context + player-prop model** only.

## Team-total / inning-market coverage (nearer-term)

- **Team totals** and **F5 / first-inning** markets are *provider-addable* (The Odds API exposes them for MLB). If ingested into `team-markets`, they ship as **market context** immediately (no model needed), and become model candidates only under the full-game roadmap above.
- Action: extend `ingest-mlb-team-market-lines-daily.mjs` to request `totals`/`team_totals`/inning markets when we choose to spend the credits; surface as context. **Not done in this pass** (credit-gated, market-context only).

## Where we remain behind SimTheGame (stated plainly)

- **Full-game score / win probability / run distribution as a model:** behind. We show market context only; our engine is market-mirroring and not public-ready.
- **Inning / half markets:** behind (not ingested).
- **Team totals:** behind (not in current file), but cheap to add as context.
- **Player-prop breadth as predictions:** we match on 4 markets (K, hits, TB, H+R+RBI) and are behind on 5 (outs, ER, HR, RBI, runs) which need per-stat models — see `MLB_PROP_COVERAGE_AUDIT_JULY21.md`.
