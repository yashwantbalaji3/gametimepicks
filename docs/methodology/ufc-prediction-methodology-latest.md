# UFC prediction methodology (moneyline, Stage 1)

Built like MLB/NBA: real factors → feature deltas → transparent model → gated
publish. Moneyline (h2h) first; method/round deferred until separately validated.

## Data sources
- Odds: The Odds API MMA (`mma_mixed_martial_arts`) — h2h, pregame snapshots.
- Fighter stats: Greco1899/UFCStats-derived (GPL-3.0), DERIVED features only.
- Results/grading: Greco history + ESPN MMA (forward).

## Stage-1 factors (real fields only)
- **Market baseline:** American odds → implied prob, normalized two-way; pregame
  freshness; (movement when multiple snapshots exist).
- **Record/experience:** career win rate, recent-5 win rate, UFC fight count.
- **Finish profile:** finish rate (KO+sub / wins), decision tendency.
- **Striking:** sig strikes landed/round. **Grappling:** takedowns/round.
- **Physicals:** reach, age (stance/height available).
- **Activity:** days since last fight. **Data quality:** completeness per fighter.
- **Matchup deltas:** every factor as A−B; data-quality + futures flags.

## Model formula (model_moneyline.py)
`market_prob` = normalized implied prob. `stats_score` = Σ wₖ·deltaₖ (recent form,
win rate, finish rate, striking, grappling, reach, experience). `adj =
logistic_cap(stats_score, ±0.04)` then **shrunk** toward market (50%, or 85% when
data quality < 0.75). `model_prob = clip(market_prob + adj, 0.03..0.97)`. Caps keep
the model within ~4pp of market until a backtest earns more.

## Launch gates (fail-closed)
- **projectionsReady** requires schedule+odds+stats+grading+**backtest** (no
  out-of-sample validation → no public projections).
- **parlayReady** additionally requires **parlaySimReady** (a separate parlay
  simulation). Moneyline only; Bank/Low/Med 2 legs, High 3; no same-card stacking.
- `publicEligible` per projection requires validation + a real (non-futures),
  high-quality bout.

## Why moneyline first / vs sportsbook
Moneyline is the most data-available + gradable market. The model starts FROM the
sportsbook line and only nudges it with capped, shrunk stats — it is explicitly a
**sportsbook baseline + small validated adjustment**, never sold as certainty.
Method/round picks need their own data + validation and are not launched.
