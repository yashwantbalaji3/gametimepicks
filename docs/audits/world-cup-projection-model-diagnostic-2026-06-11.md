# World Cup Projection Model — Diagnostic (2026-06-11)

Model under review: `pipeline/world_cup/projection_model.py` +
`build_team_projections.py` + `build_suggested_parlays.py`.

## How the current model works
- **Prior** = de-vigged market H/D/A (and over/under).
- **Independent signal** = recent national-team form → expected goals
  (`exp_home=(homeGF90+awayGA90)/2`, `exp_away=(awayGF90+homeGA90)/2`) → Poisson H/D/A.
- **Blend** = `(1-w)*market + w*model`, where `w = min(0.35, 0.05*min_sample)`.
- **Pick** = the side with the largest `model - market`. Confidence fixed Low.

## Failure modes found
1. **Recent-form Poisson is over-weighted for the evidence quality.** `w` reaches **0.35** at
   7 games. 0.35 of a *thin, opponent-unadjusted* signal is enough to move an 11.2% market
   underdog to 13.0% and make it the "best edge" pick. That is how South Africa became a lean.
2. **No opponent-strength adjustment.** `goalsFor90`/`goalsAgainst90` are raw — a team that
   padded goals vs weak opponents looks strong. South Africa's recent form isn't discounted for
   weaker opposition, and Mexico's isn't credited for tougher opposition.
3. **No FIFA rank / Elo / squad-value / talent proxy.** The only team-quality signal the model
   has beyond raw form is the market — and it under-trusts it. Talent/rank (which the market
   encodes) is exactly what says "Mexico >> South Africa."
4. **Market-implied probability is under-respected.** A 0.65–0.75 market weight is too low for
   opening day when form samples are tiny and noisy.
5. **No market-sanity / extreme-underdog caution.** An 11.2% underdog can become a public "edge"
   pick with no floor on market probability and no cap on the model's lift over market.
6. **Draw calibration is implicit only** (Poisson draw mass); not separately validated.
7. **"Best edge" selection favors longshots.** Picking `argmax(model-market)` structurally
   prefers high-variance underdog/over legs, because small absolute model noise is a larger
   *relative* swing on a low-probability outcome.
8. **Risk tier = odds only.** `_risk_tier` buckets purely on American odds, ignoring model
   confidence, sample quality, and variance.
9. **Confidence is a constant** ("Low") — never escalates with evidence, but also never gates.
10. **No minimum model-probability / minimum-edge threshold** for publishing.
11. **Parlays combine weak underdog edges.** The Longshot (South Africa + Czechia) stacks two
    fragile plus-money ML legs; the engine had no rule that extreme underdogs can't anchor a
    surfaced card.

## What the upgrade must add
- Raise market prior (≥ ~0.82 opening day); cap recent-form weight low; reduce further when
  opponent adjustment is missing.
- Opponent-strength adjustment interface (use it when available; otherwise lower the cap and
  mark `gated_missing_features` for aggressive underdog moves).
- FIFA rank / talent interface (null until a real/curated+sourced source exists — never faked).
- Market-sanity gates: underdog market-prob floor (15%), max model lift over market, min edge.
- `projectionStatus` enum; only `active` is public.
- Risk tier from variance + confidence + sample, not odds alone.
- Parlays from `active` only; no extreme underdog in Low/Medium; Longshot separated.
