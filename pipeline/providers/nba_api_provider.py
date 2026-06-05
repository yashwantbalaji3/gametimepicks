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


def _parse_player_gamelog_rows(df, player_id: int) -> list[GameLog]:
    """Parse an nba_api PlayerGameLog dataframe into GameLog rows. Pure parsing
    helper shared across season types (Regular Season + Playoffs) so the
    most-recent-N merge in fetch_player_game_logs has one consistent shape."""
    rows: list[GameLog] = []
    try:
        iterator = df.iterrows()
    except AttributeError:
        return rows
    for _, r in iterator:
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
        rows.append(GameLog(
            player_id=int(player_id),
            game_date=iso_date,
            opponent_abbr=opp,
            home_away=home_away,
            minutes=float(r.get("MIN") or 0),
            pts=int(r.get("PTS") or 0),
            reb=int(r.get("REB") or 0),
            ast=int(r.get("AST") or 0),
        ))
    return rows


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
        """Existing single-strategy schedule fetch — kept for back-compat with
        the orchestrator's older code path. New callers should use
        fetch_schedule_with_diagnostics() which returns the raw counts and
        endpoint history needed to distinguish "confirmed empty" from
        "fetch failed".
        """
        result = self.fetch_schedule_with_diagnostics(date)
        if result["games"]:
            return result["games"]
        if result["fetch_succeeded"]:
            # Empty but successful — return [] (caller distinguishes via diag)
            return []
        # All endpoints failed — raise so legacy callers see an error
        raise ProviderRequestFailed(
            f"nba_api schedule failed: {result['failure_reason']}"
        )

    def fetch_schedule_with_diagnostics(self, date: str) -> dict:
        """Phase 7B-1.2 — schedule fetch with full diagnostic metadata.

        Returns a dict with:
            games:                   list[Game]   parsed games
            fetch_attempted:         bool         did we try at all
            fetch_succeeded:         bool         did at least one endpoint return without error
            failure_reason:          str | None   error message if all endpoints failed
            raw_count_before:        int          rows in the raw provider response
            parsed_count_after:      int          games after parsing/filtering
            endpoint_used:           str | None   "scoreboardv2" | "leaguegamefinder" | None
            endpoint_history:        list[dict]   one entry per attempted endpoint

        Strategy:
            1. ScoreboardV2 (primary)  — official daily scoreboard, supports playoffs
            2. LeagueGameFinder       — fallback if ScoreboardV2 returns empty
        """
        diag: dict = {
            "games": [],
            "fetch_attempted": False,
            "fetch_succeeded": False,
            "failure_reason": None,
            "raw_count_before": 0,
            "parsed_count_after": 0,
            "endpoint_used": None,
            "endpoint_history": [],
        }

        try:
            self._ensure_available()
        except ProviderUnavailable as e:
            diag["failure_reason"] = f"nba_api package not installed: {e}"
            return diag

        # Cache check (only for the diagnostic shape — old cache is per-key)
        cache_key = f"schedule_diag_{date}"
        cached = _cache_get(cache_key)
        if cached is not None and isinstance(cached, dict) and "games" in cached:
            self._mark_ok()
            cached["games"] = [Game(**row) for row in cached["games"]]
            return cached

        diag["fetch_attempted"] = True

        # ----------------- Strategy 1: ScoreboardV2 -----------------
        sv2_diag = self._try_scoreboardv2(date)
        # Strip Game dataclass instances from the history entry before storing —
        # they live at the top-level diag["games"]. Without this the board write
        # fails with "Object of type Game is not JSON serializable" on every
        # cache-miss schedule fetch.
        diag["endpoint_history"].append(
            {k: v for k, v in sv2_diag.items() if k != "games"}
        )
        if sv2_diag["status"] == "ok" and sv2_diag["games"]:
            diag["games"] = sv2_diag["games"]
            diag["fetch_succeeded"] = True
            diag["raw_count_before"] = sv2_diag["raw_count"]
            diag["parsed_count_after"] = len(sv2_diag["games"])
            diag["endpoint_used"] = "scoreboardv2"
            self._mark_ok()
            self._cache_diag(cache_key, diag)
            return diag

        # ScoreboardV2 returned empty or failed — try LeagueGameFinder
        # (LeagueGameFinder is more forgiving for future/playoff dates that
        # ScoreboardV2 sometimes drops or returns inconsistent data for.)
        # ----------------- Strategy 2: LeagueGameFinder -----------------
        lgf_diag = self._try_leaguegamefinder(date)
        # See sv2 note above — keep the history entry JSON-serializable.
        diag["endpoint_history"].append(
            {k: v for k, v in lgf_diag.items() if k != "games"}
        )
        if lgf_diag["status"] == "ok" and lgf_diag["games"]:
            diag["games"] = lgf_diag["games"]
            diag["fetch_succeeded"] = True
            diag["raw_count_before"] = lgf_diag["raw_count"]
            diag["parsed_count_after"] = len(lgf_diag["games"])
            diag["endpoint_used"] = "leaguegamefinder"
            self._mark_ok()
            self._cache_diag(cache_key, diag)
            return diag

        # Both endpoints attempted. Did at least one succeed (just with empty)?
        any_ok = any(h["status"] == "ok" for h in diag["endpoint_history"])
        if any_ok:
            # Confirmed empty — both endpoints came back successfully with 0 games
            diag["fetch_succeeded"] = True
            diag["endpoint_used"] = next(
                (h["endpoint"] for h in diag["endpoint_history"] if h["status"] == "ok"),
                None,
            )
            diag["raw_count_before"] = max(
                (h["raw_count"] for h in diag["endpoint_history"]), default=0
            )
            self._mark_ok()
            self._cache_diag(cache_key, diag)
            return diag

        # All endpoints failed
        diag["failure_reason"] = "; ".join(
            f"{h['endpoint']}: {h.get('error', 'unknown error')}"
            for h in diag["endpoint_history"]
        )
        self._mark_err(diag["failure_reason"])
        return diag

    def _try_scoreboardv2(self, date: str) -> dict:
        """Try ScoreboardV2 endpoint. Returns endpoint-history-shaped dict."""
        out = {
            "endpoint": "scoreboardv2",
            "status": "error",
            "raw_count": 0,
            "games": [],
            "error": None,
        }
        try:
            from nba_api.stats.endpoints import scoreboardv2
            mmddyyyy = datetime.fromisoformat(date).strftime("%m/%d/%Y")
            sb = scoreboardv2.ScoreboardV2(
                game_date=mmddyyyy,
                timeout=C.HTTP_TIMEOUT_SECONDS,
            )
            game_header = sb.game_header.get_dict()
            line_score = sb.line_score.get_dict()

            raw_rows = game_header.get("data", []) or []
            out["raw_count"] = len(raw_rows)

            team_idx: dict[int, dict[str, str]] = {}
            for row in line_score.get("data", []) or []:
                d = dict(zip(line_score["headers"], row))
                team_idx[int(d["TEAM_ID"])] = {
                    "abbr": d.get("TEAM_ABBREVIATION") or "",
                    "full": f"{d.get('TEAM_CITY_NAME','')} {d.get('TEAM_NAME','')}".strip(),
                }

            games: list[Game] = []
            for row in raw_rows:
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
            out["games"] = games
            out["status"] = "ok"
            return out
        except Exception as e:
            out["error"] = str(e)
            return out

    def _try_leaguegamefinder(self, date: str) -> dict:
        """Try LeagueGameFinder as a fallback. Less commonly used for future
        dates but sometimes succeeds when ScoreboardV2 returns empty for
        playoff dates with TBD opponents.
        """
        out = {
            "endpoint": "leaguegamefinder",
            "status": "error",
            "raw_count": 0,
            "games": [],
            "error": None,
        }
        try:
            from nba_api.stats.endpoints import leaguegamefinder
            # date_from_nullable / date_to_nullable accept MM/DD/YYYY
            mmddyyyy = datetime.fromisoformat(date).strftime("%m/%d/%Y")
            lgf = leaguegamefinder.LeagueGameFinder(
                date_from_nullable=mmddyyyy,
                date_to_nullable=mmddyyyy,
                league_id_nullable="00",  # NBA
                timeout=C.HTTP_TIMEOUT_SECONDS,
            )
            df = lgf.league_game_finder_results.get_data_frame()
            out["raw_count"] = len(df)

            # LeagueGameFinder returns one row per team per game (so 2 rows
            # per game). Group by game_id and pair home/away by MATCHUP.
            games_by_id: dict[str, dict] = {}
            for _, r in df.iterrows():
                gid = str(r.get("GAME_ID", ""))
                if not gid:
                    continue
                matchup = str(r.get("MATCHUP", ""))
                team_abbr = str(r.get("TEAM_ABBREVIATION", "") or "")
                team_full = str(r.get("TEAM_NAME", "") or "")
                # MATCHUP is "X vs. Y" (home) or "X @ Y" (away)
                is_home = "vs." in matchup
                if gid not in games_by_id:
                    games_by_id[gid] = {}
                if is_home:
                    games_by_id[gid]["home_abbr"] = team_abbr
                    games_by_id[gid]["home_full"] = team_full
                else:
                    games_by_id[gid]["away_abbr"] = team_abbr
                    games_by_id[gid]["away_full"] = team_full

            games: list[Game] = []
            for gid, info in games_by_id.items():
                if "home_abbr" not in info or "away_abbr" not in info:
                    # Incomplete pairing — skip
                    continue
                games.append(Game(
                    game_id=gid,
                    date=date,
                    tipoff_et="TBD",
                    home_team_abbr=info["home_abbr"],
                    home_team_full=info["home_full"],
                    away_team_abbr=info["away_abbr"],
                    away_team_full=info["away_full"],
                    status="Scheduled",
                ))

            out["games"] = games
            out["status"] = "ok"
            return out
        except Exception as e:
            out["error"] = str(e)
            return out

    def _cache_diag(self, key: str, diag: dict) -> None:
        """Cache the diag dict — convert games to dicts for JSON serialization."""
        cacheable = {**diag, "games": [vars(g) for g in diag.get("games", [])]}
        try:
            _cache_put(key, cacheable)
        except Exception:
            pass

    def fetch_player_game_logs(self, player_id: int, last_n: int = 10) -> list[GameLog]:
        self._ensure_available()
        cache_key = f"gamelogs_{player_id}_{last_n}"
        cached = _cache_get(cache_key)
        if cached is not None:
            self._mark_ok()
            return [GameLog(**row) for row in cached]

        try:
            from nba_api.stats.endpoints import playergamelog
            # Fetch BOTH Regular Season AND Playoffs, then take the most-recent
            # N across both. Hardcoding "Regular Season" froze "recent form" at
            # the final regular-season games during the postseason (the player's
            # actual recent playoff games were never surfaced — see
            # docs/audits/nba-recent-form-source-audit-2026-06-05.md). Playoffs
            # returns empty outside the postseason, so this is a no-op then.
            collected: list[GameLog] = []
            for season_type in ("Playoffs", "Regular Season"):
                try:
                    log = playergamelog.PlayerGameLog(
                        player_id=player_id,
                        season_type_all_star=season_type,
                        timeout=C.HTTP_TIMEOUT_SECONDS,
                    )
                    df = log.player_game_log.get_data_frame()
                except Exception:
                    # A single season-type query failing (e.g. no playoff games
                    # yet) must not lose the other; skip it honestly.
                    continue
                collected.extend(_parse_player_gamelog_rows(df, player_id))
            # Most-recent N across both season types (ISO dates sort lexically).
            collected.sort(key=lambda g: g.game_date or "", reverse=True)
            logs = collected[:last_n]

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

            # ESPN/nba_api use different abbreviations for some teams.
            # Map the ESPN abbreviation (used everywhere else in the
            # pipeline) onto nba_api's static-index abbreviation so the
            # roster lookup actually finds the team.
            # Known mismatches as of 2025-26:
            #   ESPN  → nba_api
            #   NY    → NYK   (Knicks)
            #   SA    → SAS   (Spurs)
            #   GS    → GSW   (Warriors)
            #   NO    → NOP   (Pelicans)
            #   UTAH  → UTA   (Jazz)
            #   WSH   → WAS   (Wizards)
            ABBR_ALIAS = {
                "NY": "NYK",
                "SA": "SAS",
                "GS": "GSW",
                "NO": "NOP",
                "UTAH": "UTA",
                "WSH": "WAS",
            }
            lookup_abbr = ABBR_ALIAS.get(team_abbr, team_abbr)
            team = next(
                (t for t in static_teams.get_teams() if t["abbreviation"] == lookup_abbr),
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
