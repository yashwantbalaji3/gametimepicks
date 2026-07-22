# GameTimePicks — MLB Product Roadmap (internal, 2026-07-22)

Internal planning for future MLB products built on the research warehouse + simulation foundation. **Nothing here is live, public, or approved.** No product ships a prediction, a probability, or an "edge" claim until the research gate passes (30 dates / 500 settled-eligible observations), a model beats the de-vig market **out of sample**, and the founder approves. Money md5 `affe6b21071f2b3be96bb2774eb347c3` unchanged.

## Gate legend
- **[data]** needs 500 settled observations across ≥30 dates (currently 0/500 · 2/30).
- **[valid]** needs a model that beats the de-vig market baseline out of sample.
- **[approve]** needs explicit founder sign-off before any public exposure.

## Products

### 1. Simulation Lab
- **Exists today:** the `SimulationFeatureContract`, `SimulationPipeline` (7 stages), benchmark framework, feature-coverage scoring — all internal architecture, no models.
- **Needs:** [data] to fit/validate any engine · [valid] to show it out-predicts the market · [approve] before any UI. Until then: internal-only, outputs all null.

### 2. Player Prop Explorer
- **Exists today:** captured player-prop markets + de-vig probabilities, batter splits/form/matchup/vs-pitcher, and (public) the honest MLB results/hit-rate ledgers.
- **Needs:** [data]+[valid] before showing any modeled probability. A **market-only** explorer (showing captured lines + de-vig market probability, clearly "market, not our prediction") could ship earlier with [approve] — no model required.

### 3. Game Simulator
- **Exists today:** pregame game/pitcher/batter/park/weather features + the settlement join. No generative full-game model.
- **Needs:** a validated generative engine [data]+[valid], plus [approve]. Highest bar — do not surface simulated scores/distributions until then (matches the standing "no public full-game run distribution" rule).

### 4. Market Comparison Tool
- **Exists today:** sportsbook implied + de-vig probabilities per captured lean; the benchmark can score market baselines on settled data.
- **Needs:** [data] to populate calibration/accuracy of the *market itself* (factual, not a model). A market-vs-market comparison (books vs de-vig consensus) is the **nearest-term** candidate — factual, no model — but still [approve] before public.

### 5. Research Dashboard
- **Exists today:** `status/latest.json`, `research-quality.json`, `benchmark.json`, `simulation-readiness.json`, `completeness-<date>.json` — a full internal daily view (gate progress, coverage, quality, readiness).
- **Needs:** [approve] to expose any of it. It contains **no predictions**, so it is the **lowest-risk** first product — an internal/ops dashboard could be surfaced (noindex, like `/ops`) with founder sign-off, reporting only collection + gate progress, never "edge".

## Recommended sequencing (lowest risk first)
1. **Research Dashboard** (internal/ops, no predictions) — [approve] only.
2. **Market Comparison / market-only Prop Explorer** (factual market data) — [approve], no model.
3. **Simulation Lab → Player Prop Explorer (modeled) → Game Simulator** — each gated on [data]+[valid]+[approve], in that order.

Until [data] clears, every item stays in "accumulate + quality-check" mode. No profitability, edge, or beat-market language anywhere.
