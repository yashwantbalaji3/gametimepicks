"""Static NBA team-roster fallback.

Pure-function lookup that maps `playerName → teamAbbr` for the small
set of teams currently in playoff coverage. Used by
`pipeline/team_projection.py` when:

  * the lean's own `team` field is empty (production bug in
    `generate_daily_board.py:875-879` — the fallback defaults to
    `home_away = "Home"` with `team_abbr = ""` when the upstream
    name_to_team lookup fails)
  * the `players.json` roster cache for the same player also has
    `team=""` (Wembanyama, Castle, Vassell, Champagnie, Fox, Harper,
    Johnson on May 20 — these are exactly the SAS players whose nba_api
    roster fetch silently dropped them).

Why a static module:
  * Doesn't change scoring code or run paid APIs.
  * Tested deterministically; no network.
  * Easy for the operator to extend with future series.
  * Transitional — the real upstream fix belongs in the pipeline.

Coverage as of 2026-05-20:
  * SA  — Western Conference Finals
  * OKC — Western Conference Finals
  * CLE — Eastern Conference Finals
  * NY  — Eastern Conference Finals

If a player isn't in the static map, the lookup returns `None` and the
caller falls back to its prior behavior (drops the contribution rather
than misattribute).
"""
from __future__ import annotations

from typing import Mapping


# Authoritative rosters for the 4 teams currently in playoff coverage.
# Names match the form used on Odds API player-prop payloads (which is
# what the lean rows carry). Adding a new player or team only requires
# extending this dict — no other code changes needed.
NBA_PLAYOFF_ROSTERS: Mapping[str, tuple[str, ...]] = {
    "SA": (
        "Victor Wembanyama",
        "Stephon Castle",
        "Devin Vassell",
        "Julian Champagnie",
        "De'Aaron Fox",
        "Dylan Harper",
        "Keldon Johnson",
        "Jeremy Sochan",
        "Tre Jones",
        "Harrison Barnes",
        "Sandro Mamukelashvili",
        "Bismack Biyombo",
        "Blake Wesley",
        "Charles Bassey",
        "Riley Minix",
    ),
    "OKC": (
        "Shai Gilgeous-Alexander",
        "Chet Holmgren",
        "Jalen Williams",
        "Cason Wallace",
        "Luguentz Dort",
        "Alex Caruso",
        "Isaiah Hartenstein",
        "Ajay Mitchell",
        "Aaron Wiggins",
        "Kenrich Williams",
        "Isaiah Joe",
        "Jaylin Williams",
        "Ousmane Dieng",
        "Nikola Topic",
        "Branden Carlson",
    ),
    "CLE": (
        "Donovan Mitchell",
        "Darius Garland",
        "Evan Mobley",
        "Jarrett Allen",
        "Max Strus",
        "Sam Merrill",
        "Dean Wade",
        "Caris LeVert",
        "Isaac Okoro",
        "Ty Jerome",
        "De'Andre Hunter",
        "Georges Niang",
        "Tristan Thompson",
        "Craig Porter Jr.",
        "Jaylon Tyson",
    ),
    "NY": (
        "Jalen Brunson",
        "Karl-Anthony Towns",
        "OG Anunoby",
        "Mikal Bridges",
        "Josh Hart",
        "Miles McBride",
        "Mitchell Robinson",
        "Tyler Kolek",
        "Cameron Payne",
        "Pacome Dadiet",
        "Landry Shamet",
        "Ariel Hukporti",
        "Precious Achiuwa",
        "Delon Wright",
        "MarJon Beauchamp",
    ),
}


# Cached reverse map, lazily built. Keeps the lookup O(1) without
# requiring callers to pre-build it.
_REVERSE: dict[str, str] | None = None


def _build_reverse() -> dict[str, str]:
    out: dict[str, str] = {}
    for team, names in NBA_PLAYOFF_ROSTERS.items():
        for name in names:
            out[name] = team
    return out


def team_for_player(player_name: str) -> str | None:
    """Lookup a player's team. Returns None when not in the map."""
    global _REVERSE
    if _REVERSE is None:
        _REVERSE = _build_reverse()
    if not isinstance(player_name, str):
        return None
    return _REVERSE.get(player_name.strip())


def known_teams() -> tuple[str, ...]:
    """Return the team abbreviations currently in the static roster."""
    return tuple(sorted(NBA_PLAYOFF_ROSTERS.keys()))


def roster_size(team_abbr: str) -> int:
    """Number of players currently mapped to a given team."""
    return len(NBA_PLAYOFF_ROSTERS.get(team_abbr, ()))
