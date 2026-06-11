# World Cup Markets — Status (latest)

Every requested market has an explicit, honest status (surfaced on /world-cup). Real probe of
The Odds API (per-event) + API-Football, 2026-06-11.

## Team / game markets
| Market | Odds | Data | Status | Note |
|---|---|---|---|---|
| Moneyline (90-min H/D/A) | ✅ The Odds API `h2h` | ✅ market + FIFA strength + opponent-adj form | **Model research** | ensemble edge below the 3% publish threshold today |
| Total goals | ✅ The Odds API `totals` | ✅ | **Model research** | edge below the 2.5% publish threshold today |
| Total corners | ✅ The Odds API `alternate_totals_corners` | ✅ API-Football fixture-statistics corners | **Model research** | real edges (~6–7%) but corner-stat sample < 5 → `gated_sample_size` |

## Player markets — odds EXIST, waiting on lineups
The Odds API returns all four for the WC: `player_shots`, `player_shots_on_target`,
`player_assists`, `player_goal_scorer_anytime`. They publish only with confirmed lineups/minutes,
which post ~1 hour before kickoff — so today they are **Waiting on lineups** (not unavailable).

| Market | Odds | Gate |
|---|---|---|
| Player total shots | ✅ | lineups/minutes not posted |
| Player shots on target | ✅ | lineups/minutes not posted |
| Player assists | ✅ | lineups/minutes not posted |
| Anytime goalscorer | ✅ | lineups/minutes not posted; never Low-risk |

## How a market goes live
A team market publishes when its ensemble edge clears the threshold (ML 3% / totals 2.5%) with
sample + strength backing. Player markets publish when lineups post AND a player's prop has real
shot/SOT/assist/role evidence + edge. Anytime goalscorer is never Low-risk. Bank Builder requires
an active Low-risk card near +174 — none today, so Step 3 stays protected at $728.76.

## Bounded provider usage
Odds API per-event probe (player + corners) for today's 2 matches; API-Football lineups +
corner-stat probes. ~30 Odds API credits used across runs (19,249 remaining).
