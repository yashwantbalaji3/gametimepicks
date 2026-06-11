# World Cup 2026 — Soccer Props & Match Markets Factor Guide

**Status: DESIGN / MODEL-PLAN — not yet active.** World Cup stays **fail-closed**: no
projections, odds, or parlays ship until real soccer **odds** + **stats** providers are
connected (see `world-cup/readiness-latest.json`, `publicLevel: schedule-only`). This doc
translates the World Cup-specific drivers into model-ready factors, market selection, and
risk-tier logic for when those gates pass. It is not a guarantee of profit; paper/educational.

Tournament context: 48 teams, 12 groups of four, 104 matches across Canada/Mexico/USA, 16
host cities, top two + eight best third-place teams → Round of 32, final July 19.

---

## 1. Prop priority matrix
| Market | Betting profile | Most important drivers | Best risk tier |
|---|---|---|---|
| Anytime goalscorer | High interest, high variance | proj. minutes, penalty duty, xG/90, team implied goals, box touches, opp. defense, set pieces | Medium/High/Longshot |
| Shots on target | High interest, more modelable than goals | shots/90, SOT rate, shot locations, team chance volume, opp. pressure, role, minutes | Low/Medium |
| Player shots | Very modelable volume market | shots/90, minutes, role, possession, opp. block, match state, set pieces | Low/Medium |
| Player assists | Popular, teammate-dependent | xA/90, key passes, crosses, set pieces, teammate finishing, opp. side weakness | Medium |
| Corners | Strong team-style market | crossing volume, attacking width, opp. blocks/clearances, possession, game state, low block | Low/Medium |
| Team total goals | Core scoring market | team implied goals, xG, opp. xGA, lineup quality, tactical matchup, must-win state | Medium |
| Total score (match) | Macro environment market | both teams xG/xGA, tempo, conservatism, referee, weather, knockout context | Medium/High |
| Moneyline (90-min) | Foundation market | team strength, projected XI, rest/travel, tactics, incentives, venue, market odds | Low/Medium |

## 2. World Cup-specific drivers (affect every market)
- **Tournament format** — group-table math changes incentives (some need goals, some only a
  draw, some rotate). Affects ML, team totals, total score, corners, shots.
- **Group-stage incentive state** — must-win / draw-is-enough / GD-chase / already-qualified
  / nearly-eliminated / third-place ranking. Affects shots, corners, team totals, ML.
- **Knockout risk profile** — regulation-time ML/totals ≠ advancement markets; knockouts can
  be more conservative; late draws more acceptable.
- **Travel & climate** — three countries, many climates/altitudes/time zones; heat/humidity/
  altitude/travel reduce pressing + shift subs. Affects total score, shots, corners, ML.
- **Venue/stadium** — dome/retractable roof, turf vs grass, altitude, pitch size, weather,
  crowd. Affects totals, corners, shots, ML.
- **Squad rotation** — short rest + expansion → rotation, esp. group match 3 / after
  qualification. Affects player props, ML, team totals.
- **National-team role vs club role** — use **country role first, club form second**.
- **Referee profile** — card/foul/penalty tendencies affect goalscorer, totals, momentum.

## 3. Per-market reads (strategic + key features + red flags + WC nuance)

### Anytime goalscorer (Medium/High/Longshot)
Most popular, naturally high variance. Drivers: **projected minutes + starting prob (non-
negotiable)**, **penalty duty** (huge boost), non-pen xG/90, box touches, big chances, central
striker role, set-piece target share, team implied goals, opp. xGA, opp. CB injuries/weak
fullback. Features: `projected_start/minutes, substitution_risk, country_role, non_pen_xg90,
shots90, sot90, touches_box90, penalty_taker, aerial_set_piece_target, team_implied_goals,
opponent_cb_quality, referee penalties_per_match`. **Red flags:** wide creator with low box
touches, ≤60-min cap, low team total / deep underdog, cautious knockout, name-inflated price.
**WC nuance:** group match 3 rotation; verify 90-min vs extra-time market; penalty-taker
certainty can flip if usual taker benched.

### Shots on target (Low/Medium)
More modelable than goals — rewards process. Drivers: projected shot volume × SOT rate, shot
distance/location (central box > long shots), opp. pressure + blocked-shot rate, team
possession, set pieces. Features: `player_shots90, sot_rate, shots_inside_box_rate,
average_shot_distance, team_xg90, opponent_pressure_rate, blocks90, favorite_status,
knockout_conservatism`. **Red flags:** mostly distance shots under pressure, shot-blocking
opponent, wide crosser role, low-possession underdog. **WC nuance:** separate raw shots from
SOT vs low blocks (volume up, quality down); fatigue → cleaner late shots but more sub risk.

### Player shots (Low/Medium)
Often the **safest attacking prop** — no accuracy/finishing required. Drivers: shots/90 +
minutes, possession/territory, opp. block type, **match state** (chasing → more shots), role
(inverted wingers / central strikers > touchline creators), set-piece shooters. Features:
`position, inverted_winger_flag, central_forward_flag, shots90, shot_share, touches_box90,
low_block_opponent, must_win, chasing_probability, shots_allowed90`. **Red flags:** wide-passer
role for country, favorite likely to rotate after leading, possession-dominated, low-tempo
knockout. **WC nuance:** GD incentives create shots-over spots; group match 3 needs scenario
logic (draw-is-enough → fewer shots than power rating implies).

### Player assists (Medium)
Volatile (good chance + teammate misses = loss). **Model xA + chance creation first**, actual
assists second. Drivers: xA, key passes, through balls, crosses, set-piece taker, teammate
finishing, opp. side weakness, team implied goals. Features: `xA90, key_passes90,
big_chances_created90, corner_taker, crosses90, teammate_xg_finishers, fullback_weakness_side`.
**Red flags:** deeper country role, weak finishers/striker rotation, cross-defending opponent,
early sub. **WC nuance:** set-piece takers often > open-play creators; cautious knockouts
suppress assist volume.

### Corners (Low/Medium)
Team-style market — territory/width/crossing/blocked shots/game state, not finishing. Drivers:
possession + field tilt, wide attacking + crossing, opp. deep block + clearances, late chasing
surges, favorites vs low blocks. Features: `crosses90, attacking_width, field_tilt,
low_block_flag, clearances90, corners_allowed90, chasing_probability, wind/rain/dome_flag`.
**Red flags:** favorite scores early + slows, central-attacking team, high-pressing opponent
(transitions not corner pressure), mutual-draw game state. **WC nuance:** third-place chase →
late corner surges; cautious knockouts slow early.

### Team total goals (Medium)
Between player props and result. **team_implied_goals from odds is the baseline — adjust with
model edges, not narratives.** Projected XI quality > full-squad; opp. xGA + CB/keeper quality;
set-piece + penalty-drawing edges; must-win/GD incentives. Features: `team_implied_goals,
team_xg90, set_piece_xg90, opponent_xga90, keeper_quality, starting_xi_value, rotation_risk,
must_win, knockout_flag`. **Red flags:** brand-inflated favorite price, rotation after
qualifying, mutual-caution knockout, elite keeper / low block. **WC nuance:** expansion → more
talent-gap matches but more rotation/incentive complexity.

### Total score / match total (Medium/High)
Macro environment — both teams' xG/xGA, tempo, conservatism, referee, weather, knockout.
**Red flags:** both advance on a draw, elite low-block sides, heat/travel suppressing tempo,
fear-of-conceding knockouts. **WC nuance:** group match 3 needs **live table math**, not static
ratings; regulation total usually **excludes extra time** — confirm market rules.

### Moneyline (90-minute) (Low/Medium)
Foundation market — but the **90-minute draw is a real third outcome**; treat regulation ML
**separately** from advancement/to-qualify. Drivers: projected XI strength + Elo/power, rest/
travel/venue/climate, tactical matchup, group incentives, knockout 90-min ≠ to-advance.
**Red flags:** confusing 90-min ML with to-advance, ignoring draw incentives, club form without
checking country role/availability, overvaluing FIFA rank vs a bad matchup. **WC nuance:** host
crowd boost exists but don't overfit "home advantage"; secured-first-place favorites go
conservative.

## 4. Match-day workflow
1. Load fixture, venue, kickoff, stage, **group-table state**, and **market rules (90-min vs
   to-advance)**.
2. Confirm projected lineups; update starting status + minutes after **official lineups**.
3. Compute team implied goals, possession projection, tactical matchup scores.
4. Generate player prop projections **only** for players with stable minutes + clear country
   roles.
5. Apply prop-specific filters (goalscorer: xG/touches/penalties; shots/SOT: volume; assists:
   xA/set pieces; corners: team style; totals: team environment).
6. Correlation + exposure checks — no single player/team/match dominates the cards.
7. Split into risk buckets by **variance + price**, not just projected edge.
8. After settlement, log hits/misses by market, odds band, team style, role, stage, venue,
   referee → feed market reliability + feature weights.

## 5. Practical model rules
- Model **minutes + role before talent** (a star in the wrong country role is not a strong prop).
- Shots/SOT are better Low/Medium markets than goalscorer (process-driven).
- Anytime goalscorer: price- and penalty-duty-sensitive.
- Corners: style + game state + opp. block, not raw team strength.
- Moneyline: separate **90-minute** result from to-advance.
- Group match 3 needs scenario logic; WC lineups/rotation > club-season averages.
- **Never count extra time / penalties** unless the market explicitly includes them.
- Public risk buckets stay honest — short odds are not "safe" without minutes/role/matchup support.

## 6. Soccer markets are explicit (display rules — already enforced fail-closed)
- 90-minute regulation result ≠ advancement / qualification / lift-trophy.
- Draw is a valid 90-minute moneyline outcome (3-way: Home / Draw / Away).
- Never mix full-time 3-way ML, draw-no-bet, spread/handicap, totals, and advancement markets
  without clear per-card labels.

## 7. Unlock path (what fail-closed is waiting on)
1. **Odds provider** — a soccer odds source (e.g. The Odds API `soccer_fifa_world_cup`) **with a
   3-way (Home/Draw/Away) parser** (the current `fetch_game_markets` is 2-way only) → enables a
   de-vigged **90-minute Market Outlook** card. Schedule-only until then.
2. **Stats/features provider** — minutes/lineups, xG/xGA, shots/SOT, xA, crossing, set pieces,
   referee/venue context → enables the player-prop + team-total model above.
3. Only with **both** do projections/parlays ship — conservative markets first (90-min ML if
   3-way odds exist, totals/team totals, then shots/SOT), with the risk-tier + correlation
   guardrails in §4–5.

## Sources
- FIFA — 2026 format (48 teams, 12 groups of four, Round of 32):
  https://www.fifa.com/en/articles/article-fifa-world-cup-2026-mexico-canada-usa-new-format-tournament-football-soccer
- FIFA — schedule/fixtures/stadiums (16 host cities):
  https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums
- FIFA ticketing support — format details (72 group matches, top two + 8 best third, July 19 final):
  https://gpcustomersupportfwc2026.tickets.fifa.com/hc/en-gb/articles/28784798873117
- Market-rule note: sportsbooks commonly separate 90-minute regulation markets from extra-time/
  penalty advancement markets — always verify market rules before modeling or displaying picks.
