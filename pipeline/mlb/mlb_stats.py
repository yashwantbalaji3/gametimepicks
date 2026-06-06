"""MLB Stats API client (FREE).

API: https://statsapi.mlb.com/api/v1/
No key required. No rate-limit headers documented — be polite (small delays).

Used for:
  - Schedule + probable pitchers (one call per date)
  - Team rosters (one call per team) — optional
  - Per-player season game logs (one call per player)

Player-game-log shape (excerpt):
  stats[0].splits[*].stat  -> dict with strikeOuts, inningsPitched, hits,
                              totalBases, doubles, triples, homeRuns, rbi,
                              runs, baseOnBalls, atBats, plateAppearances
"""
from __future__ import annotations

import json
import socket
import time
import urllib.error
import urllib.request
from typing import Any, Iterable

API_BASE = "https://statsapi.mlb.com/api/v1"
USER_AGENT = "gametimepicks/0.4 (educational analytics)"

# Stable MLB Stats API team-id → abbreviation. The gameLog `opponent` object
# carries only {id, name} (no abbreviation), so we resolve the abbreviation
# from the id here. IDs are stable across seasons. 133 = Athletics ("ATH",
# matching the schedule/board convention).
TEAM_ID_ABBR: dict[int, str] = {
    108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC", 113: "CIN",
    114: "CLE", 115: "COL", 116: "DET", 117: "HOU", 118: "KC", 119: "LAD",
    120: "WSH", 121: "NYM", 133: "ATH", 134: "PIT", 135: "SD", 136: "SEA",
    137: "SF", 138: "STL", 139: "TB", 140: "TEX", 141: "TOR", 142: "MIN",
    143: "PHI", 144: "ATL", 145: "CHW", 146: "MIA", 147: "NYY", 158: "MIL",
}


class MlbStatsError(Exception):
    """Raised when the MLB Stats API call fails terminally (after retries)."""


def _http_get(
    path: str,
    params: dict[str, str] | None = None,
    timeout: int = 30,
    retries: int = 3,
    backoff: float = 1.0,
) -> Any:
    """GET a JSON endpoint from MLB Stats API. Returns parsed JSON or raises.

    Retries on network/timeout errors. Catches socket.timeout explicitly
    because Python 3.9 does not unify socket.timeout into TimeoutError.
    """
    url = f"{API_BASE}{path}"
    if params:
        from urllib.parse import urlencode
        url = f"{url}?{urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            # 4xx/5xx response — don't retry on 4xx, do retry on 5xx
            if e.code < 500 or attempt == retries - 1:
                raise MlbStatsError(f"MLB Stats HTTP {e.code} for {path}")
            last_err = e
        except (urllib.error.URLError, TimeoutError, socket.timeout) as e:
            last_err = e
        time.sleep(backoff * (attempt + 1))
    raise MlbStatsError(f"MLB Stats network error for {path}: {last_err}")


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------
def fetch_schedule(date: str) -> list[dict]:
    """Return the schedule for `date` (YYYY-MM-DD) with probable pitchers.

    Each game has: gamePk, gameDate (UTC ISO), status.detailedState, venue,
    teams.away/home {team {id, name, abbreviation}, probablePitcher {id, fullName}}.
    """
    payload = _http_get(
        "/schedule",
        {
            "sportId": "1",
            "date": date,
            "hydrate": "probablePitcher,team,linescore",
        },
    )
    games: list[dict] = []
    for date_block in payload.get("dates", []):
        if date_block.get("date") != date:
            continue
        games.extend(date_block.get("games", []))
    return games


def normalize_schedule_games(date: str, games: list[dict]) -> list[dict]:
    """Trim the MLB schedule payload to the fields our app needs."""
    out: list[dict] = []
    for g in games:
        away = (g.get("teams") or {}).get("away") or {}
        home = (g.get("teams") or {}).get("home") or {}
        away_team = away.get("team") or {}
        home_team = home.get("team") or {}
        pp_a = (away.get("probablePitcher") or {}) or {}
        pp_h = (home.get("probablePitcher") or {}) or {}
        out.append(
            {
                "gamePk": g.get("gamePk"),
                "gameDate": g.get("gameDate"),
                "date": date,
                "venue": (g.get("venue") or {}).get("name"),
                "status": (g.get("status") or {}).get("detailedState", "Unknown"),
                "awayTeamId": away_team.get("id"),
                "awayTeamAbbr": away_team.get("abbreviation"),
                "awayTeamName": away_team.get("name"),
                "homeTeamId": home_team.get("id"),
                "homeTeamAbbr": home_team.get("abbreviation"),
                "homeTeamName": home_team.get("name"),
                "awayProbablePitcherId": pp_a.get("id"),
                "awayProbablePitcherName": pp_a.get("fullName"),
                "homeProbablePitcherId": pp_h.get("id"),
                "homeProbablePitcherName": pp_h.get("fullName"),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Player game logs
# ---------------------------------------------------------------------------
def fetch_player_game_log(player_id: int, season: int, group: str) -> list[dict]:
    """Fetch a single player's season game log.

    group: "pitching" for pitchers, "hitting" for batters.
    Returns a list of game stat dicts (most recent last per API ordering).
    Empty list if no games or API quietly returns nothing.
    """
    payload = _http_get(
        f"/people/{player_id}/stats",
        {"stats": "gameLog", "season": str(season), "group": group},
    )
    stats = payload.get("stats", [])
    if not stats:
        return []
    splits = stats[0].get("splits", []) or []
    out: list[dict] = []
    for s in splits:
        stat = s.get("stat", {}) or {}
        # isHome is provided by the gameLog split when available; emit it so the
        # leg-detail modal can show @ / vs. None when the API omits it (the UI
        # then shows the opponent without a home/away marker).
        is_home = s.get("isHome")
        # The gameLog `opponent` object carries id + name but NOT abbreviation
        # (only the schedule endpoint has abbreviation). Resolve via the stable
        # team-id map, falling back to an explicit abbreviation if present.
        opp = s.get("opponent") or {}
        team = s.get("team") or {}
        out.append(
            {
                "date": s.get("date"),
                "opponentAbbr": opp.get("abbreviation") or TEAM_ID_ABBR.get(opp.get("id")),
                "opponentName": opp.get("name"),
                "playerTeamAbbr": team.get("abbreviation") or TEAM_ID_ABBR.get(team.get("id")),
                "isHome": is_home if isinstance(is_home, bool) else None,
                "stat": stat,
            }
        )
    return out


def fetch_player_game_logs_bulk(
    player_ids: Iterable[int],
    season: int,
    group: str,
    polite_delay_seconds: float = 0.1,
    max_failures: int = 8,
) -> dict[int, list[dict]]:
    """Bulk-fetch game logs for many players. Returns {player_id: logs}.

    Empty list on per-player failure (never raises) so the orchestrator can
    fall back to "insufficient_data" confidence.
    """
    out: dict[int, list[dict]] = {}
    failures = 0
    for pid in player_ids:
        if pid is None:
            continue
        try:
            out[int(pid)] = fetch_player_game_log(int(pid), season, group)
            time.sleep(polite_delay_seconds)
        except MlbStatsError:
            out[int(pid)] = []
            failures += 1
            if failures >= max_failures:
                # Stop early on systemic failure; remaining players will be
                # treated as "insufficient_data" by the projection model.
                break
    return out


# ---------------------------------------------------------------------------
# Team roster (for batter discovery if Odds API doesn't list batters)
# ---------------------------------------------------------------------------
def fetch_team_roster(team_id: int) -> list[dict]:
    """Return the active roster for a team. Each entry has person.id,
    person.fullName, position.abbreviation, position.type."""
    payload = _http_get(f"/teams/{team_id}/roster", {"rosterType": "active"})
    return payload.get("roster", []) or []
