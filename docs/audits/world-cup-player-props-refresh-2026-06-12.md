# World Cup player-props refresh — 2026-06-12

## User report verified: the markets WERE there
The June-12 player-market universe (Odds API) carried **4 player markets, 553 priced
outcomes, 88 distinct players** (FanDuel 122 + DraftKings 51 of the final projections),
yet the 15:36 UTC run published **0** player projections.

## Root causes found
1. **API-Football `/players/squads` returns EMPTY for most national teams** — on June 12
   only Bosnia's squad came back; Canada/USA/Paraguay were empty, so 86/88 priced players
   had no identity squad to match against (June 11 worked because those teams' squads were
   populated).
2. The surname+first-initial fallback ("M. Almirón" style) was classified `low`
   confidence and dropped even when the surname was unique in the squad.

## Fixes (zero extra API calls; real identities only)
- `_recent_player_stats` already calls `/fixtures/players` — it now captures each
  appearing player's real id/name/photo, and an empty squad is backfilled from those
  identities.
- `match_player`: unique-surname + first-initial upgrades to `medium`; ambiguous surnames
  stay dropped, never guessed. Unit-tested.

## Outcome (16:40 UTC re-run, after the fix merged)
**215 player projections · 75 matched / 13 unmatched** · byMarket: shots 49, shots-on-
target 56, assists 35, anytime-goalscorer 75 · all 215 carry real api-sports photo URLs ·
bookmaker preserved (FanDuel/DraftKings labels render only from artifact fields) · all
labelled `pre_lineup_public_projection` (lineups not posted at build time) → public
views, never Bank-Builder-eligible.

Verified rendering: /world-cup Player Props tab, both fixture pages (photos + book
badges + pre-lineup chips), counts on /today and /games.
