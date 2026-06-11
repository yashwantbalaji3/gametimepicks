# World Cup Markets — Status (latest)

Public projection **visibility** is separate from **parlay eligibility**: a market's model
probability VIEW is published whenever real odds + features exist; a market only becomes a
suggested-card leg when its edge clears the stricter eligibility gate.

## Team / game markets — PUBLIC PROBABILITY VIEWS LIVE
| Market | Odds | Data | Public view | Parlay-eligible | Note |
|---|---|---|---|---|---|
| Moneyline (90-min H/D/A) | ✅ `h2h` | ✅ market+FIFA+form | ✅ live | ❌ | edges ≤ ~1.3% < 3% threshold |
| Total goals | ✅ `totals` | ✅ | ✅ live | ❌ | edges ≤ ~2.0% < 2.5% threshold |
| Total corners | ✅ `alternate_totals_corners` | ✅ 10-match corner sample | ✅ live | ❌ | deepening the sample (5→10) collapsed the apparent +6–7% edge to ~+1.5%/+0.6% — it was thin-sample noise; honestly below threshold |

The corner case is the key lesson: the previous +6–7% "edges" were a 2–4 match artifact. With a
real 10-match corner sample the edges are small — so corners are a public view, not a card.

## Player markets — odds EXIST, waiting on lineups
The Odds API returns all four (`player_shots`, `player_shots_on_target`, `player_assists`,
`player_goal_scorer_anytime`). They publish only with confirmed lineups/minutes, which post
~1 hour before kickoff (Mexico–S.Africa KO 15:00 ET, Korea–Czechia 22:00 ET). Re-dispatch the
discovery workflow near kickoff to activate them — no code change needed.

## Parlay eligibility (what would publish a card)
- Moneyline: edge ≥ 3%, market prob ≥ 15% (no extreme-underdog pick), sample ≥ 5.
- Totals / corners: edge ≥ 2.5%, sample ≥ 5 (corners need ≥ 5 corner-stat matches).
- Anytime goalscorer: never Low-risk; requires lineup + role.
Today **0 markets** clear eligibility → 0 suggested cards (honest), while 6 probability views
are public. Bank Builder Step 3 stays protected at $728.76 (no Low-risk eligible card).

## Re-run hook (lineup time)
`gh workflow run world-cup-stats-discovery.yml -f provider=api_football -f date=2026-06-11 -f dry_run=false`

## Pre-lineup player projections (2026-06-11)
Player projections are now published PRE-LINEUP using the sportsbook player universe (the books'
own listed players) mapped to API-Football squad identities (real photos/positions) + recent
national-team stats. 19 players matched across today's two games; 76 projection views (shots,
SOT, assists, anytime goalscorer), each labeled pre-lineup. The model is heavily market-anchored
(+ a ±6pt cap) because pre-lineup samples are tiny, so 0 player legs are parlay-eligible today —
honest: we don't turn thin-sample noise into picks. They upgrade/gate automatically when official
lineups post (confirmed_starter / confirmed_sub / not_in_lineup). Anytime goalscorer is never
Low-risk; pre-lineup player props are never Bank Builder.
