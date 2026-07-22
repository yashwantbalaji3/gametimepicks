# MLB Simulation Engine — Current State & Roadmap

The public simulator is a **deterministic, precomputed** artifact — the same output for every user, paper-only and educational. This document freezes what it is today and defines a gated evolution path. **Nothing here builds a predictive model or claims profitability.** Any future version stays `producesPredictions: false` until the research gate (30 dates / 500 settled observations) passes AND the founder approves.

---

## Current engine (v1 — shipped)

**Script:** `app/scripts/generate-mlb-game-simulations.mjs` → `app/public/data/mlb/game-simulations/<date>.json`, read by the game-detail page via `readGameSimulation`.

**Inputs:**
- The projection **board** (`boards/<date>.json`) only — projections + per-market sigma for the modeled prop markets.
- No network, no odds fetch, no money artifacts. Seeded/deterministic (same date → identical output; `--now` stamps `generatedAt` only).

**What it computes:**
- A 10,000-run Monte Carlo over the **player-prop markets that carry both a projection and a sigma** — currently 4 modeled markets: strikeouts (K), hits, total bases (TB), hits+runs+RBIs (H+R+RBI). Each lean samples `N(projection, sigma)` and tallies the over/under frequency.
- `runCount: 10000`, `generatedPicks` (the model's leans), and per-market distributions surfaced on the game page after the "Generate Simulation" reveal.

**Outputs:** `runCount`, `generatedPicks[]`, per-pick distributions, `artifactHash`. Consumed only by the public game page; gated behind an explicit user action (the dense report lives in `postReveal`).

**Limitations & assumptions (stated honestly on-site):**
- It is a **sampling summary of the board's projections**, not an independent forecast. Its accuracy is bounded by the board's projections.
- The 4 modeled markets were audited vs the market and found **not market-beating** (worse Brier + log loss; model overconfident) → they are surfaced as *market context / research signal*, never as a proven edge. See `app/src/lib/mlb/model-calibration-status.ts` and `docs/` calibration notices.
- Unmodeled prop markets (HR, RBI, runs, pitcher outs, ER) are **market-context only** — never rendered as predictions.
- **No full-game score simulation** is web-served. A team-level/full-game distribution engine exists internally but is BLOCKED from the public product (no team-odds ingest validated; would be a fabricated forecast otherwise).
- Markets/coverage are governed by `app/src/lib/mlb/market-coverage.ts` (per-market: modeled / market-context / settlement_blocked / experimental); `experimental` + `settlement_blocked` are excluded from anything product-facing.

## Roadmap (each stage gated; no stage ships until the one below is validated)

| Version | Scope | Gate to advance |
|---|---|---|
| **v1 — market + historical baseline** *(current)* | Deterministic 10k sampling of board projections for the 4 modeled prop markets; everything else market-context-only. | — (shipped, honest, paper-only) |
| **v2 — validated statistical model** | Replace board-sampled projections with a model trained on the research warehouse for markets that **out-predict the market** on held-out data. | **30 dates + 500 settled observations** in the warehouse, out-of-sample Brier + log loss **better than the market baseline** on ≥1 market, **+ founder approval**. `producesPredictions` stays false until met. |
| **v3 — Monte Carlo player/team engine** | Correlated player+team simulation (lineup → PA outcomes → runs), not per-market independent sampling. | v2 validated on multiple markets; a team-odds ingest exists so full-game output can be settlement-checked; leakage-safe features only. |
| **v4 — full game simulation** | Inning-by-inning game engine producing team totals, run lines, and derived player lines jointly. | v3 validated; full-game distributions independently benchmarked vs closing team markets over a held-out season; founder sign-off. |

## Hard rules across all versions

1. `producesPredictions: false` until the research gate passes **and** the founder approves — enforced on `simulation-feature-contract.ts` (itself `public: false`).
2. No feature may leak (every input `capturedAt < eventStart`, proven timestamp) — see `MLB_FEATURE_COVERAGE_ROADMAP.md`.
3. Never claim "beat the market", "edge", or profitability in any public surface (test-enforced: `mlb-report-public-language.test.mjs`, `shadow-calibration.test.mjs`).
4. The public simulator stays **deterministic + paper-only + educational**. Bank Builder and Moonshot eligibility are unaffected by any simulator change.
