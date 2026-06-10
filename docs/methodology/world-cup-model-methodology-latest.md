# World Cup Model Methodology (planned, fail-closed)
_2026-06-10. The model is NOT live; this documents the intended leakage-safe design._

## Status
Schedule-only. `projectionsReady=false`. No projections/odds/parlays until real providers
(odds + team/player stats + lineups) are connected and gates pass.

## Markets (to be built separately)
90-minute result · advancement · team goals · total goals · player goals · player shots ·
shots on target · assists · cards · corners · goalkeeper saves. **Regulation-time markets
are separated from advancement** (a 90-min draw can still advance via ET/penalties).

## Intended factor weighting (opportunity/role first)
projected minutes + starting status → role for country → team implied goals → tactics →
set pieces / penalty taker → referee (cards/penalties) → tournament context → matchup.
National-team samples are small → blend club form (`small_sample_weight`); club role may
differ from national role (role-difference flag).

## Leakage rules
Lineup features only when confirmed pre-kickoff; rolling form excludes the target match;
all time-sensitive inputs timestamped; missing → explicit flags.

## Path to live
Connect a soccer odds feed (check The Odds API soccer key near the tournament; else
OpticOdds/SportsDataIO — paid, user approval) + a stats feed + a lineup feed → flip the
readiness gates → projections-only surface first, graded parlays after a settlement
contract.
