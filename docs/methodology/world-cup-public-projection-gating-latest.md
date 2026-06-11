# World Cup Public Projection Gating Policy (latest)

A World Cup model projection is **public** only when it is classified `active`. Everything else
stays in the artifact for audit but never renders on a public surface. This prevents thin-sample
or extreme-underdog artifacts (e.g. a +750 moneyline) from appearing as normal picks.

## Ensemble (model)
- de-vigged **market** prior: 0.60 (folds in missing components → up to 1.0)
- **FIFA-points strength** prior: 0.25 (0 if either team unranked in the source)
- **opponent-adjusted recent form**: 0.15, scaled by opponent-strength coverage
Probabilities are normalized H/D/A (Draw is a real third outcome). The model never copies the
market: strength + form move it on real, independent data.

## projectionStatus
- `active` — public. Clears every gate below.
- `gated_market_sanity` — underdog with market probability < 15% (never public).
- `gated_opponent_strength_missing` — a team's strength rating is unavailable (underdog gated).
- `gated_sample_size` — recent-form sample < 5.
- `gated_missing_features` — underdog model-lift exceeds the cap allowed without opponent
  adjustment.
- `gated_low_edge` — edge below the market's active threshold.
- `research_only` — retained for audit / future graduation.

## Active thresholds
- **Moneyline**: edge ≥ 3.0%, market probability ≥ 15% (no extreme underdogs), sample ≥ 5,
  opponent-strength coverage present.
- **Totals**: edge ≥ 2.5%, sample ≥ 5 (totals carry no underdog market-sanity floor).
- **Confidence**: capped **Low** early; Medium/High require a deeper sample + multiple agreeing
  signals (not available on opening day).

## Underdog & Longshot rules
- No extreme-underdog ML in Low/Medium parlay cards or Bank Builder.
- Longshot outcomes are separated and never the default "suggested" card.

## Bank Builder eligibility
Active **Low-risk** card only, no extreme-underdog ML, no research/gated picks, payout that
reasonably moves toward the $2,000 Step-3 target. Otherwise Step 3 stays pending.

## Graduation (research_only → active)
A pick graduates when the sample deepens, opponent-strength coverage is high, and the ensemble
edge clears the market threshold with strength + form agreement — re-evaluated every build.
