# Soccer World Cup Prediction Methodology (canonical)

_Registry: `app/src/lib/methodology/world-cup.ts`. Existing notes: `world-cup-methodology-current.md`,
`world-cup-soccer-props-factor-guide-latest.md`._

## Targets
- **Match/team:** 90-minute result, moneyline (90), draw-no-bet, **advancement**, team goals, total
  goals, BTTS, clean sheet, corners, cards, penalties.
- **Player props:** goals / anytime goalscorer, shots, shots on target, assists, cards, fouls,
  tackles, goalkeeper saves.

> **`90_minute_result != advancement`.** A team can draw after 90 and still advance via extra time /
> penalties — model these separately.

## Feature priority (opportunity-first)
```
1 starting_status → 2 projected_minutes → 3 role_for_country → 4 team_strength
→ 5 team_implied_goals → 6 tactical_matchup → 7 set_pieces → 8 penalty_role
→ 9 tournament_context → 10 referee → 11 venue/weather
→ 12 club_form_blended_with_country_role → 13 market
```
National-team samples are small: **blend country role with club form**, but never assume club role
equals country role (`role_difference_flag`). The starting XI confirms ~1h pre-kickoff — until then,
player props carry a `lineup_not_confirmed_flag` and are limited-data (not Bank Builder eligible).

## Feature groups (see registry for status)
Match identity + tournament context (must-win / draw-is-enough, yellow-card suspension risk); rest/
travel/venue/weather; team strength (FIFA/Elo, squad value, experience); team attack & defense
(xG/xGA per 90, set-piece xG); tactical style + matchup scores; player availability/role + attacking
+ defensive/card features; player-vs-player matchups; referee tendencies.

## Prop-priority logic (highlights)
- **90-min result:** team strength → XI quality → tactical matchup → team xG/xGA → tournament
  incentive → rest/travel/venue → injuries/suspensions → referee → market.
- **Anytime goalscorer:** projected minutes → starter flag → penalty-taker → team implied goals →
  country & club xG/90 → shots/90 → touches-in-box → opponent xGA/CB/GK → set-piece role → market.
- **Cards:** player card/foul rate → position/defensive role → opponent dribble volume/speed →
  referee card rate → match importance/knockout → tactical-foul likelihood → market.

## Coverage (honest, v1 — June 2026)
`implemented`: 3-way/double-chance/DNB/BTTS/totals de-vigged prices, recent form (last-5 W/D/L),
goalscorer + shots-on-target settled by API-Football player id, lineup/limited-data flags.
`partial`: confirmed-XI flag, projected minutes, team implied goals, country xG, role-for-country.
`planned`: penalty/set-piece taker, tactical matchup scores, opponent CB quality, club-form blend.
`not_available`: referee tendency feeds.
