# MLB Lineup & Starter Status Audit

_Exactly what lineup / pitcher / game-status information the PUBLIC MLB product can honestly surface, traced to the
real artifacts. Confirmed against `app/public/data/mlb/boards/<date>.json` (game + lean rows). We only expose a
confirmation when the source actually supports it — otherwise the field is pending/absent, never fabricated._

## What the artifacts carry

Board **game** rows carry: `gamePk`, `gameDate`, `date`, `venue`, `status`, team ids/abbrs/names, and
`{away,home}ProbablePitcherId` / `{away,home}ProbablePitcherName`. Board **lean** rows carry: `playerId`,
`playerName`, `playerTeamAbbr`, `playerRole`, `marketKey`, `line`, odds. There is **no** batter-lineup,
batting-order, scratch, or "confirmed starter" field anywhere in the MLB artifacts.

## Field-by-field

| Field | Source artifact | Timestamp | Available? | Public-safe wording | Coverage | Missing-data behavior |
|---|---|---|---|---|---|---|
| Batter lineup confirmation | — (no field) | — | **No** | "Batter lineups aren't posted yet" | 0% | `LINEUP_PENDING`; never "confirmed" |
| Batting order | — (no field) | — | **No** | (not shown) | 0% | omit — never invent an order |
| Probable pitcher | game `{away,home}ProbablePitcherName` | board capture time | **Yes** | "Probable starter: NAME" | high (most games) | show "Starter TBD" when null |
| Confirmed starting pitcher | — (only *probable* exists) | — | **No** (as *confirmed*) | reflect as **probable**, never "confirmed" | 0% confirmed | treat probable as probable |
| Scratched player | — (no field) | — | **No** | (not shown) | 0% | a projection stays a projection; no scratch overlay |
| Replacement player | — (no field) | — | **No** | (not shown) | 0% | no replacement inference |
| Postponed / rescheduled | game `status` | board capture time | **Partial** | drives "Game started / frozen" | present | non-pregame `status` ⇒ `GAME_STARTED`; a new gamePk on reschedule is a distinct game (see identity fix) |
| Game start (first pitch) | `team-markets[gameId].commenceTime` | market capture time | **Yes** | "Scheduled first pitch H:MM PM ET" | high | null ⇒ "first pitch unavailable" |

## How this maps to the public completeness model

- **Batter props** → `LINEUP_PENDING` (there is no confirmed-lineup source). The tooltip says "Batter lineups aren't
  posted yet — batter projections are provisional, not final." It never claims a lineup is confirmed.
- **Pitcher props** → can reach `FULLY_SUPPORTED` when a probable starter + a captured market are present, because a
  pitcher's participation is anchored to the probable-starter field (still "probable", surfaced as such).
- **A non-pregame game `status`** (or a market captured after first pitch) → `GAME_STARTED` (frozen pregame read).
- **A rescheduled/resumed game** gets a new `gamePk`, so it is a distinct fixture with its own canonical URL (see
  `MLB_GAME_IDENTITY_INCIDENT.md`) — never merged with the original.

## Non-negotiables

1. "Probable" is never rendered as "confirmed" — the source only supports *probable* starters.
2. A missing lineup is `LINEUP_PENDING`, never "complete" and never a fabricated order.
3. A missing timestamp is not "pregame"; a post-first-pitch capture is never labelled pregame.
4. Batter certainty is never invented — no field supports it, so the UI must not imply it.
