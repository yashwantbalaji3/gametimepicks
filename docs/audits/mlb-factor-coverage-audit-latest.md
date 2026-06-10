# MLB Factor Coverage Audit
_2026-06-10. Honest map of requested MLB factors vs what `pipeline/mlb/mlb_model.py` computes._

## Active (computed + consumed)
- Pitcher K projection = 0.55·last-3-starts + 0.45·season; σ=max(stdev(season),1.6).
- Batter (hits/TB/HR) = 0.5·last-10 + 0.5·season/game; σ=max(stdev(season), market floor).
- Normal-CDF P(over); edge=(P−implied)×100; confidence High≥5pp / Med≥2.5pp; insufficient_data <3 games; R5 anomaly flag ≥20pp.
- Market: line, implied probability, edge (The Odds API).

## Provider-needed (NOT computed — do not claim active)
Lineup spot, expected PA, confirmed-lineup flag · expected innings, pitch-count projection, days rest · handedness, platoon, batter-vs-pitcher (small-sample — downweight) · pitch mix + pitch-type performance · Statcast (xwOBA, barrel, hard-hit, EV, LA, ISO) · park factors, weather, wind, umpire · bullpen fatigue.

## Safe additions to implement next (data already available)
- Odds **freshness timestamp** + `freshness_status` on the market block.
- **Sample-size flag** + `insufficient_data` reasons already present; expose via manifest.
- Line-movement if odds snapshots exist (snapshots present for some dates).

## Cautions honored
No tiny-BvP overvaluation (provider-needed, will use `small_sample_weight`); season means
exclude the target game; weather/lineups treated as time-sensitive once sourced.
