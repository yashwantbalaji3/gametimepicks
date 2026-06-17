# NBA Prediction Methodology (canonical)

_Registry: `app/src/lib/methodology/nba.ts`. Existing notes: `nba-methodology-current.md`._

## Targets
- **Game:** moneyline, spread, total, team total, first-half / quarter spread & total.
- **Player props:** points, rebounds, assists, threes, steals, blocks, turnovers, PRA + combos.

## Feature priority (opportunity-first)
```
1 projected_minutes → 2 starter_status → 3 rotation_stability → 4 injury_context
→ 5 vacated_usage → 6 usage_rate → 7 touches → 8 pace → 9 team_implied_total
→ 10 stat_specific_opportunity → 11 matchup → 12 rest/travel → 13 blowout_risk
→ 14 efficiency → 15 market
```
**Recent role matters more than recent box-score form.** Projected minutes is the single biggest
driver of every counting prop.

## Vacated usage rule
Do **not** distribute an injured star's usage/minutes equally. Allocate by historical on/off splits,
role similarity, and projected rotation. Surface `projected_usage_bump` / `minutes_bump` per player.

## Prop-priority logic (highlights)
- **Points:** minutes → usage → FGA/FTA/3PA per-min → team implied total → pace → vacated usage →
  shot-quality matchup → defender/rim/perimeter → blowout risk → market.
- **Rebounds:** minutes → rebound chances → reb% → opponent missed-shot projection + shot profile →
  teammate bigs out → pace → market.
- **Assists:** minutes → time-of-possession → potential assists → ast% → teammate shooting → pace →
  double-team rate → primary-creator injuries → market.

## Coverage (honest, v1)
`implemented`: usage/TS rolling (excl. target), rest/B2B, market implied prob, minutes-uncertainty.
`partial`: active status, projected minutes, starter flag, opponent pace, team implied total,
blowout risk. `planned`: vacated-usage allocation, rotation stability, primary-defender matchup.
NBA has no active live slate today — this is the framework for when one returns.
