# June 19 — World Cup player-prop visual polish + per-game multi-card context

_Branch `worldcup-player-prop-visual-polish-game-context` off main `eff4c520`. Audit at 2026-06-19 21:38 UTC (Morocco 22:00Z, Brazil 00:30Z, Turkey 03:00Z pre-event; USA started)._

## Audit
| area | current behavior | issue | planned fix | success condition |
|---|---|---|---|---|
| WC player-prop photos | identity map built only from team-projection `public` rows | prop-only players (153/192 have real API-Football photos) miss headshots → monogram fallback | load the player-projections feed into `wcPlayerByName` (photo + player team code) | prop-leg rows show real headshots |
| WC player-prop flags | `countryCode` null for prop players | flag falls back to initials | resolve player's team via `wcTeamCodeFromName` | flag renders per leg |
| opponent / kickoff | `legDisplay` carries `opponent` + `startTime`, but `LegRow` didn't render them | rows show name + market + odds only | add a "vs {opponent} · {kickoff}" line | every leg shows who + when |
| card drawer | shows Why / Risk only | no correlation disclosure / limited-data note for player-prop High/Longshot | add correlation + limited-data lines | High/Longshot drawers disclose correlation + data quality |
| WC game pages | show same-game cards (`getGameSpecificCardsForGame`) | no "this game in multi-game cards" | add `getWorldCupMultiGameCardsForGame` + a section | per-game multi-card section, grouped by risk |
| active Bank Builder / Moonshot / Mr. Dub | active | — | **never touched** (display-only enrichment) | unchanged |
| protected history | immutable | — | **never touched** | unchanged |

## Player-prop source fields (Phase 1)
`world-cup/player-projections/latest.json` → `pp.matches[].player`: `{ id, name, team, position, photo }`. **`photo`** = real API-Football headshot URL (`media.api-sports.io/football/players/<id>.png`), present on **153/192** props. `team` = full name (resolve to flag code via the alias resolver). Fixture + kickoff inherited by the adapter's fixture→team-event join. **No photo fabricated** when absent → flag/initials fallback.

## Plan
1. `buildIdentityMaps` loads the player-projections feed → `wcPlayerByName` gains photo + the player's own team flag code (date-aware; never overwrites a team-projection entry).
2. `LegRow` renders a "vs {opponent} · {kickoff} UTC" line; the existing `LegIdentity` already renders `photoUrl` (player) / `FlagBadge` (team).
3. `ParlayCard` drawer adds a correlation-disclosure line (same-game / correlationScore) + a limited-data note when the card has WC player props.
4. `getWorldCupMultiGameCardsForGame(fixture)` + a "This game in multi-game cards" section on WC game pages (grouped by risk, with counts, link to Parlay Lab).

## Guards
Display-only enrichment: **no odds, no card counts, no active artifacts changed**. Photos only from the real feed (no fabrication); pre-event only; protected `public/data/bank-builder/*` untouched; canonical/allowed copy only.
