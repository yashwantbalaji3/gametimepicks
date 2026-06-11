"""
API-Football (API-Sports v3) adapter — real World Cup fixtures + team/player stats.

Auth: header `x-apisports-key: <API_FOOTBALL_KEY>`. Base https://v3.football.api-sports.io.
World Cup = league id 1, season 2026 (overridable). No xG from this provider → supports_xg
False. Bounded + cached: the orchestrator (build_stats) caps total calls; this adapter never
loops. Returns []/None when the source lacks data — never fabricates.
"""
from __future__ import annotations

import os
from typing import Any

from .base import SoccerStatsProvider
from ..models import WorldCupFixture, TeamStrength, PlayerRole

API_BASE = "https://v3.football.api-sports.io"
WC_LEAGUE_ID = int(os.environ.get("WC_API_FOOTBALL_LEAGUE", "1"))
WC_SEASON = int(os.environ.get("WC_API_FOOTBALL_SEASON", "2026"))


class ApiFootballProvider(SoccerStatsProvider):
    name = "api_football"
    env_key = "API_FOOTBALL_KEY"
    supports_team_stats = True
    supports_lineups = True
    supports_player_stats = True
    supports_xg = False  # API-Football does not provide xG

    def __init__(self) -> None:
        self._calls = 0

    # -- HTTP (cloud only) ---------------------------------------------------
    def _get(self, path: str, params: dict) -> dict | None:
        import requests
        key = os.environ.get(self.env_key, "")
        if not key:
            return None
        self._calls += 1
        r = requests.get(
            f"{API_BASE}{path}", params=params,
            headers={"x-apisports-key": key}, timeout=30,
        )
        if r.status_code != 200:
            return {"_httpStatus": r.status_code, "response": [], "errors": r.json().get("errors") if r.headers.get("content-type","").startswith("application/json") else None}
        return r.json()

    @property
    def calls_made(self) -> int:
        return self._calls

    # -- Interface -----------------------------------------------------------
    def fixtures(self, date: str) -> list[WorldCupFixture]:
        data = self._get("/fixtures", {"league": WC_LEAGUE_ID, "season": WC_SEASON, "date": date})
        out: list[WorldCupFixture] = []
        for f in (data or {}).get("response", []) or []:
            fix, lg, tm, ven = f.get("fixture", {}), f.get("league", {}), f.get("teams", {}), (f.get("fixture", {}) or {}).get("venue", {})
            out.append(WorldCupFixture(
                match_id=str(fix.get("id")), provider_match_id=str(fix.get("id")),
                date=(fix.get("date") or "")[:10], kickoff_utc=fix.get("date") or "",
                home_team=(tm.get("home") or {}).get("name", ""), away_team=(tm.get("away") or {}).get("name", ""),
                stage=lg.get("round"), venue=(ven or {}).get("name"), city=(ven or {}).get("city"),
                status=((fix.get("status") or {}).get("short") or "NS"),
            ))
        return out

    def _team_id(self, team: str) -> int | None:
        data = self._get("/teams", {"league": WC_LEAGUE_ID, "season": WC_SEASON, "search": team[:20]})
        for t in (data or {}).get("response", []) or []:
            if (t.get("team") or {}).get("name", "").lower() == team.lower():
                return (t.get("team") or {}).get("id")
        resp = (data or {}).get("response", []) or []
        return ((resp[0].get("team") or {}).get("id")) if resp else None

    def team_strength(self, team: str) -> TeamStrength | None:
        tid = self._team_id(team)
        if tid is None:
            return None
        data = self._get("/teams/statistics", {"league": WC_LEAGUE_ID, "season": WC_SEASON, "team": tid})
        s = (data or {}).get("response") or {}
        if not s:
            return None
        played = (((s.get("fixtures") or {}).get("played") or {}).get("total")) or 0
        goals = s.get("goals") or {}
        gf = (((goals.get("for") or {}).get("average") or {}).get("total"))
        ga = (((goals.get("against") or {}).get("average") or {}).get("total"))
        return TeamStrength(
            team=team, sample_size=int(played),
            recent_form=s.get("form"),
            goals_for_90=float(gf) if gf not in (None, "") else None,
            goals_against_90=float(ga) if ga not in (None, "") else None,
        )

    def recent_form(self, team_id: int, *, last: int = 8) -> dict:
        """Recent FINISHED national-team fixtures → goals for/against per match. Used for the
        team-strength baseline when the WC-2026 season has no completed games yet. 1 call."""
        data = self._get("/fixtures", {"team": team_id, "last": last})
        rows = (data or {}).get("response", []) or []
        gf = ga = played = 0
        recent, opponents = [], []
        for f in rows:
            status = ((f.get("fixture") or {}).get("status") or {}).get("short")
            if status not in ("FT", "AET", "PEN"):
                continue
            tm, goals = f.get("teams") or {}, f.get("goals") or {}
            home, away = tm.get("home") or {}, tm.get("away") or {}
            is_home = home.get("id") == team_id
            hg, ag = goals.get("home"), goals.get("away")
            if not isinstance(hg, int) or not isinstance(ag, int):
                continue
            scored, conceded = (hg, ag) if is_home else (ag, hg)
            opp = (away if is_home else home).get("name")
            gf += scored; ga += conceded; played += 1
            recent.append({"for": scored, "against": conceded, "opponent": opp})
            if opp:
                opponents.append(opp)
        if played == 0:
            return {"played": 0, "goalsFor90": None, "goalsAgainst90": None, "recent": [], "opponents": []}
        return {
            "played": played,
            "goalsFor90": round(gf / played, 3),
            "goalsAgainst90": round(ga / played, 3),
            "recent": recent[:last],
            "opponents": opponents[:last],
        }

    def recent_corners(self, team_id: int, *, last: int = 20, target: int = 10) -> dict:
        """Recent corners for/against per match from fixture statistics. Scans up to `last` recent
        finished fixtures, stopping early once `target` matches with real corner stats are found
        (corner stats aren't recorded for every international fixture). Bounded: 1 fixtures call +
        ≤ last statistics calls. Real data only."""
        data = self._get("/fixtures", {"team": team_id, "last": last})
        rows = (data or {}).get("response", []) or []
        cf = ca = played = 0
        for f in rows:
            if played >= target:
                break
            status = ((f.get("fixture") or {}).get("status") or {}).get("short")
            if status not in ("FT", "AET", "PEN"):
                continue
            fid = (f.get("fixture") or {}).get("id")
            if not fid:
                continue
            stats = (self._get("/fixtures/statistics", {"fixture": fid}) or {}).get("response", []) or []
            mine = oppo = None
            for ts in stats:
                corners = None
                for s in ts.get("statistics") or []:
                    if (s.get("type") or "").lower().startswith("corner"):
                        corners = s.get("value")
                if corners is None:
                    continue
                if (ts.get("team") or {}).get("id") == team_id:
                    mine = corners
                else:
                    oppo = corners
            if isinstance(mine, int) and isinstance(oppo, int):
                cf += mine; ca += oppo; played += 1
        if played == 0:
            return {"played": 0, "cornersFor90": None, "cornersAgainst90": None}
        return {"played": played, "cornersFor90": round(cf / played, 2),
                "cornersAgainst90": round(ca / played, 2)}

    def player_roles(self, team: str) -> list[PlayerRole]:
        tid = self._team_id(team)
        if tid is None:
            return []
        data = self._get("/players", {"league": WC_LEAGUE_ID, "season": WC_SEASON, "team": tid, "page": 1})
        out: list[PlayerRole] = []
        for p in (data or {}).get("response", []) or []:
            pl = p.get("player") or {}
            stats = (p.get("statistics") or [{}])[0]
            games = stats.get("games") or {}
            shots = stats.get("shots") or {}
            goals = stats.get("goals") or {}
            mins = games.get("minutes")
            out.append(PlayerRole(
                player_id=str(pl.get("id")), player_name=pl.get("name", ""), team=team,
                position=games.get("position"),
                national_team_minutes=float(mins) if mins not in (None, "") else None,
                recent_minutes=float(mins) if mins not in (None, "") else None,
                shots90=None, sot90=None,
                goals90=None, assists90=None,
                sample_size=int(games.get("appearences") or 0),
            ))
        return out
