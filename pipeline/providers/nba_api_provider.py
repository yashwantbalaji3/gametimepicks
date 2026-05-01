"""
NBA Stats provider via the `nba_api` library.

`nba_api` wraps NBA.com's official public Stats endpoints. It's the primary
source for: schedule, game logs, rosters, and box scores. No API key required;
the library handles request signing and rate limiting.

Strategy:
  - On initialization, only check that nba_api is importable. We don't make
    a network request until someone actually calls a fetch method.
  - Cache responses to pipeline/cache/ so we don't hammer the endpoint when
    a developer reruns the pipeline within the same day.
  - Convert nba_api's pandas-shaped responses to our dataclass shapes.
  - Wrap every call in try/except — if NBA.com hiccups, raise ProviderError
    so the orchestrator can fall through to demo.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .. import config as C
from .base import (
    Game, Player, GameLog,
    NBADataProvider,
    ProviderStatus, ProviderError, ProviderRequestFailed, ProviderUnavailable,
    now_iso,
)


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------
def _cache_path(key: str) -> Path:
    safe = key.replace("/", "_").replace(" ", "_")
    return C.CACHE_DIR / f"nba_api_{safe}.json"


def _cache_get(key: str) -> object | None:
    path = _cache_path(key)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
        cached_at = datetime.fromisoformat(payload["cached_at"])
        age = datetime.now(timezone.utc) - cached_at
        if age < timedelta(hours=C.CACHE_TTL_HOURS):
            return payload["data"]
    except Exception:
        return None
    return None


def _cache_put(key: str, data: object) -> None:
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(key)
    path.write_text(json.dumps({
        "cached_at": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }))


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------
class NbaApiProvider(NBADataProvider):
    name = "nba_api"
    tier = 1
    requires_api_key = False
    supported = {"schedule", "rosters", "game_logs", "box_scores"}

    def __init__(self) -> None:
        self._last_status = "not_run"
        self._last_error: str | None = None
        self._last_run_at: str | None = None
        self._available: bool | None = None

    # -- availability check --------------------------------------------------
    def _ensure_available(self) -> None:
        if self._available is True:
            return
        if self._available is False:
            raise ProviderUnavailable(
                "nba_api package not installed. `pip install nba_api`"
            )
        try:
            import nba_api  # noqa: F401
            self._available = True
        except ImportError as e:
            self._available = False
            self._last_status = "error"
            self._last_error = "nba_api not installed"
            raise ProviderUnavailable(str(e)) from e

    def get_status(self) -> ProviderStatus:
        try:
            self._ensure_available()
            available = True
            err = None
        except ProviderUnavailable as e:
            available = False
            err = str(e)

        return ProviderStatus(
            name=self.name,
            kind="nba",
            tier=self.tier,
            enabled=available,
            requires_api_key=False,
            api_key_configured=True,
            is_demo=False,
            is_stub=False,
            last_status=self._last_status if available else "not_configured",
            last_error=self._last_error or err,
            last_run_at=self._last_run_at,
            notes="Official NBA.com Stats endpoints. No API key needed.",
        )

    # -- queries -------------------------------------------------------------
    def fetch_schedule(self, date: str) -> list[Game]:
        self._ensure_available()
        cache_key = f"schedule_{date}"
        cached = _cache_get(cache_key)
        if cached is not None:
            self._mark_ok()
            return [Game(**row) for row in cached]

        try:
            from nba_api.stats.endpoints import scoreboardv2
            # date format: MM/DD/YYYY for nba_api
            mmddyyyy = datetime.fromisoformat(date).strftime("%m/%d/%Y")
            sb = scoreboardv2.ScoreboardV2(
                game_date=mmddyyyy,
                timeout=C.HTTP_TIMEOUT_SECONDS,
            )
            game_header = sb.game_header.get_dict()
            line_score = sb.line_score.get_dict()

            # Build team_id → abbreviation map from line_score
            team_idx: dict[int, dict[str, str]] = {}
            for row in line_score["data"]:
                d = dict(zip(line_score["headers"], row))
                team_idx[int(d["TEAM_ID"])] = {
                    "abbr": d.get("TEAM_ABBREVIATION") or "",
                    "full": f"{d.get('TEAM_CITY_NAME','')} {d.get('TEAM_NAME','')}".strip(),
                }

            games: list[Game] = []
            for row in game_header["data"]:
                d = dict(zip(game_header["headers"], row))
                home = team_idx.get(int(d["HOME_TEAM_ID"]), {"abbr": "", "full": ""})
                away = team_idx.get(int(d["VISITOR_TEAM_ID"]), {"abbr": "", "full": ""})
                games.append(Game(
                    game_id=str(d["GAME_ID"]),
                    date=date,
                    tipoff_et=str(d.get("GAME_STATUS_TEXT", "TBD")),
                    home_team_abbr=home["abbr"],
                    home_team_full=home["full"],
                    away_team_abbr=away["abbr"],
                    away_team_full=away["full"],
                    status="Scheduled",
                ))

            _cache_put(cache_key, [vars(g) for g in games])
            self._mark_ok()
            return games
        except Exception as e:
            self._mark_err(str(e))
            raise ProviderRequestFailed(f"nba_api schedule failed: {e}") from e

    def fetch_player_game_logs(self, player_id: int, last_n: int = 10) -> list[GameLog]:
        self._ensure_available()
        cache_key = f"gamelogs_{player_id}_{last_n}"
        cached = _cache_get(cache_key)
        if cached is not None:
            self._mark_ok()
            return [GameLog(**row) for row in cached]

        try:
            from nba_api.stats.endpoints import playergamelog
            log = playergamelog.PlayerGameLog(
                player_id=player_id,
                season_type_all_star="Regular Season",
                timeout=C.HTTP_TIMEOUT_SECONDS,
            )
            df = log.player_game_log.get_data_frame()
            df = df.head(last_n)

            logs: list[GameLog] = []
            for _, r in df.iterrows():
                # MATCHUP looks like "GSW @ DAL" or "GSW vs. DAL"
                matchup = str(r.get("MATCHUP", ""))
                home_away = "Home" if "vs." in matchup else "Away"
                opp = matchup.split()[-1] if matchup else ""
                game_date = str(r.get("GAME_DATE", ""))
                # nba_api returns "MMM DD, YYYY" — normalize to YYYY-MM-DD
                try:
                    iso_date = datetime.strptime(game_date, "%b %d, %Y").strftime("%Y-%m-%d")
                except ValueError:
                    iso_date = game_date
                logs.append(GameLog(
                    player_id=int(player_id),
                    game_date=iso_date,
                    opponent_abbr=opp,
                    home_away=home_away,
                    minutes=float(r.get("MIN") or 0),
                    pts=int(r.get("PTS") or 0),
                    reb=int(r.get("REB") or 0),
                    ast=int(r.get("AST") or 0),
                ))

            _cache_put(cache_key, [vars(g) for g in logs])
            self._mark_ok()
            return logs
        except Exception as e:
            self._mark_err(str(e))
            raise ProviderRequestFailed(f"nba_api game logs failed: {e}") from e

    def fetch_team_roster(self, team_abbr: str) -> list[Player]:
        self._ensure_available()
        cache_key = f"roster_{team_abbr}"
        cached = _cache_get(cache_key)
        if cached is not None:
            self._mark_ok()
            return [Player(**row) for row in cached]

        try:
            from nba_api.stats.static import teams as static_teams
            from nba_api.stats.endpoints import commonteamroster

            team = next(
                (t for t in static_teams.get_teams() if t["abbreviation"] == team_abbr),
                None,
            )
            if team is None:
                self._mark_ok()
                return []
            roster = commonteamroster.CommonTeamRoster(
                team_id=team["id"],
                timeout=C.HTTP_TIMEOUT_SECONDS,
            )
            df = roster.common_team_roster.get_data_frame()
            players: list[Player] = []
            for _, r in df.iterrows():
                players.append(Player(
                    player_id=int(r["PLAYER_ID"]),
                    player_name=str(r["PLAYER"]),
                    team_abbr=team_abbr,
                    position=str(r.get("POSITION", "")),
                    status="Active",
                ))
            _cache_put(cache_key, [vars(p) for p in players])
            self._mark_ok()
            return players
        except Exception as e:
            self._mark_err(str(e))
            raise ProviderRequestFailed(f"nba_api roster failed: {e}") from e

    def fetch_box_score(self, game_id: str) -> list[GameLog]:
        self._ensure_available()
        cache_key = f"boxscore_{game_id}"
        cached = _cache_get(cache_key)
        if cached is not None:
            self._mark_ok()
            return [GameLog(**row) for row in cached]

        try:
            from nba_api.stats.endpoints import boxscoretraditionalv2
            box = boxscoretraditionalv2.BoxScoreTraditionalV2(
                game_id=game_id,
                timeout=C.HTTP_TIMEOUT_SECONDS,
            )
            df = box.player_stats.get_data_frame()
            logs: list[GameLog] = []
            for _, r in df.iterrows():
                logs.append(GameLog(
                    player_id=int(r["PLAYER_ID"]),
                    game_date="",  # box score doesn't carry the date — caller knows
                    opponent_abbr="",
                    home_away="",
                    minutes=float(str(r.get("MIN") or "0").split(":")[0]),
                    pts=int(r.get("PTS") or 0),
                    reb=int(r.get("REB") or 0),
                    ast=int(r.get("AST") or 0),
                ))
            _cache_put(cache_key, [vars(g) for g in logs])
            self._mark_ok()
            return logs
        except Exception as e:
            self._mark_err(str(e))
            raise ProviderRequestFailed(f"nba_api box score failed: {e}") from e

    # -- internal ------------------------------------------------------------
    def _mark_ok(self) -> None:
        self._last_status = "ok"
        self._last_error = None
        self._last_run_at = now_iso()

    def _mark_err(self, msg: str) -> None:
        self._last_status = "error"
        self._last_error = msg
        self._last_run_at = now_iso()
