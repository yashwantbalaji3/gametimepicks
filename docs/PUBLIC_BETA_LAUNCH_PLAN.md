# GameTimePicks — Public Beta Launch Plan

Launch the product as a **public beta** while the research science continues in the background. This document is the single source of truth for positioning and allowed/forbidden claims. Money is untouched (portfolio md5 `affe6b21071f2b3be96bb2774eb347c3`); the modeling gate stays **BLOCKED**.

## Product positioning

**GameTimePicks is a simulation-powered sports analytics platform (public beta).** Users explore probabilities, 10,000-run game simulations, and market comparisons — not guaranteed picks.

One-liner: *"Explore probabilities, simulations, and market comparisons."*

Premium, sportsbook-style branding; deterministic + educational; paper-only.

## Allowed claims ✅
- "Simulation-powered sports analytics"
- "10,000-run game simulations" (true — deterministic, same result for every user)
- "Market comparison" / "compare the simulation's projection to the market line"
- "Research-backed analytics platform" / "Public beta"
- "Deterministic — everyone sees the same result"
- "Paper-only · educational"
- Honest record framing on /results ("official settlement only", "pending is not a loss")

## Forbidden claims ⛔ (test-enforced)
- ❌ "AI picks beat the market" / "market-beating" / "beat the market"
- ❌ "profitable" / "profit" / promotional ROI / "our model found edges"
- ❌ "edge" (as a betting edge), "value", "lock", "best bet", "sure thing", "sharp" — in user-facing copy
- ❌ "guaranteed" / any implied validated predictive superiority
- ❌ fabricated historical performance; presenting the deterministic simulator's projection as a proven prediction
- ❌ exposing internal research blockers/bugs/gates in public copy

Guardrails: `mlb-report-public-language.test.mjs`, `shadow-calibration.test.mjs`, `methodology-content.test.mjs`, and the new `public-beta-safety.test.mjs`. The word "difference" replaces "edge" in all public simulation-vs-market surfaces.

## Public vs internal separation
- **Public** = the deterministic 10k simulator (existing, approved), market comparison, honest results/record. Rendered from `app/public/data`.
- **Internal (never public)** = the research warehouse (observations, benchmark, readiness, feature attachment, forward-attachment). Lives under `data/internal/` (outside the `output:export` root) and is pruned by `prune-internal-routes.mjs`. The research *status* is communicated on the public research page as **progress**, never as blockers.

## Research roadmap (public-facing framing)
✓ Automated pregame data capture · ✓ Settlement pipeline · ✓ Observation quality validation · ✓ Benchmark framework — **Next milestone: 30 qualifying MLB observation dates** (accumulating). Communicated as forward progress on the public research page; the benchmark/gate internals stay internal.

## Social strategy
- Daily analytics content from `build-mlb-social-content.mjs` (`data/internal/mlb/social/<date>.json`) — largest simulation-vs-market **differences**, highest-volatility games, interesting matchups. Never a betting recommendation.
- Shareable game cards + OpenGraph previews for /mlb, /simulate, /today and game pages.
- Channels: X/Twitter, Instagram, Discord, TikTok — always framed as *analytics/comparison*, never *picks/edge/value*.

## Future model activation criteria (do NOT ship a model before ALL are met)
1. **30 qualifying observation dates** (a qualifying date = ≥1 official-final game + eligible market rows + ≥1 settled observation).
2. **≥500 settled observations** (already satisfied).
3. **Out-of-sample** performance that **out-predicts** the de-vig market baseline on ≥1 market (Brier + log loss), on held-out data.
4. **Founder approval.**
Until then `modelingStatus: BLOCKED`, `producesPredictions: false`, and no predictive-superiority claim appears anywhere.

## Money / product invariants (never touched by beta work)
Bank Builder, Moonshot, portfolio, official record (19-14), exposure ($0), and the World Cup archive are unchanged. Beta work is copy, a research status page, social metadata, an exportable content artifact, and tests — nothing that writes money or bypasses the gate.
