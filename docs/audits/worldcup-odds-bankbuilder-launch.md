# Audit — World Cup Odds Slate + Soccer-Qualified Dual Bank Builder Launch

_Branch `worldcup-odds-bankbuilder-launch` off main `71e487b`. Owner-approved active launch._

## What changed vs the prior assumption
The previous task assumed live World Cup odds were unavailable. **That was wrong.** The Odds API is
reachable, the key is valid, and `soccer_fifa_world_cup` is **active** (234 credits at start). So real
odds-backed World Cup projections were generated and a soccer-qualified Dual Bank Builder was launched.

## Provider + fetch (real, recorded)
- Free `/sports` probe: network OK, `soccer_fifa_world_cup` active, 234 credits.
- Free `/events`: 51 fixtures; identified next upcoming not-started slate.
- `build_odds_only_projections --date 2026-06-17`: 3 fixtures, 13 team-market projections (credits 234→219).
- `build_odds_only_projections --date 2026-06-18`: 4 fixtures, 20 team-market projections (219→199).
- `build_player_props --date 2026-06-17`: 72 player props (goal-scorer-anytime + shots-on-target),
  62/72 matched to API-Football identity. Credits used responsibly; ~199 remaining.
- Markets fetched: h2h, totals, double_chance, btts, draw_no_bet (team) + 2 player markets.

## Methodology changes (principled, all-sports)
1. **Survival credits low-variance high-probability legs** (`survivalScore`): a heavy-favorite
   double-chance (~90%+ to cover) is a textbook survival leg even with zero edge. Survival now credits
   model probability (capped), distinct from value/edge. This is why WC double-chance legs qualify.
2. **Soccer-per-lane selection** (`selectDualBankBuilder` `preferSoccerPerLane`): when ≥2 qualified
   soccer matches exist, place one WC leg in EACH lane + a non-soccer leg, game-disjoint,
   non-correlated. Falls back to game-diversified if soccer-per-lane is impossible (never forced).
3. **WC kickoff join already in place** (#510) lets player props inherit `event_start_time`.

## The launched run (paper, non-protected namespace)
`dual-bank-builder-2026-06-17`, written to `public/data/methodology/launch/` (NOT the protected
`public/data/bank-builder/*`). Selected as-of a conservative deploy time so all legs stay upcoming:
- **Lane A · survival 93**: Colombia or Draw (double_chance, kickoff 02:00Z) + JR Ritchie K 3.5 (23:15Z) — combined −119 → $184 from $100.
- **Lane B · survival 84**: Ghana or Draw (double_chance, 23:00Z) + Javier Assad K 4.5 (00:06Z) — combined +117 → $217 from $100.
- One World Cup leg per lane; no shared legs; game-disjoint; pre-event; odds-backed; leakage-passed.

## Integrity
- **Protected Bank Builder data untouched** — Run #1 ($100→$10,376.17), Run #2, Run #3 preserved;
  the active run lives in the engine namespace and the UI reads it without writing protected files.
- No fabrication — all odds/props from The Odds API + API-Football; missing data surfaced honestly.
- Started/live matches excluded (England-Croatia 20:00Z deliberately not used — too close to kickoff).
- NBA off-season + UFC no-event → honest no-qualified.

## Verification
tsc clean · 1008 app tests pass · build OK · copy/secret/protected-data audits clean · browser QA
(mobile + desktop): active Lane A/B trackers with soccer markers + flags, Run #1 history intact.
