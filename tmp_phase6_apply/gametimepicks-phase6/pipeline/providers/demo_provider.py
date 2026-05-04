"""
Demo provider — reads the bundled demo_data/ JSON files.

This always works: no API keys, no network. It's the fallback when every
other provider fails, AND it powers offline development. It implements
both NBADataProvider and OddsProvider via two adapter classes.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .. import config as C
from .base import (
    Game, Player, GameLog, PropLine,
    NBADataProvider, OddsProvider,
    ProviderStatus, ProviderError,
    now_iso,
)


def _load(name: str) -> dict[str, Any]:
    path = C.DEMO_DATA_DIR / name
    if not path.exists():
        raise ProviderError(f"demo file missing: {path}")
    return json.loads(path.read_text())


# ---------------------------------------------------------------------------
# NBA side
# ---------------------------------------------------------------------------
class DemoNBAProvider(NBADataProvider):
    name = "demo"
    tier = 1   # acts as primary in demo mode
    requires_api_key = False
    supported = {"schedule", "rosters", "game_logs", "box_scores"}

    def __init__(self) -> None:
        self._last_status = "not_run"
        self._last_error: str | None = None
        self._last_run_at: str | None = None

    def get_status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            kind="nba",
            tier=self.tier,
            enabled=True,
            requires_api_key=False,
            api_key_configured=True,
            is_demo=True,
            is_stub=False,
            last_status=self._last_status,
            last_error=self._last_error,
            last_run_at=self._last_run_at,
            notes="Bundled demo data. Always works.",
        )

    # -- queries -------------------------------------------------------------
    def fetch_schedule(self, date: str) -> list[Game]:
        try:
            data = _load("board.json")
            seen: dict[str, Game] = {}
            for lean in data.get("leans", []):
                home_team_abbr = lean["team"] if lean["homeAway"] == "Home" else lean["opponent"]
                home_team_full = lean["teamFullName"] if lean["homeAway"] == "Home" else lean["opponentFullName"]
                away_team_abbr = lean["opponent"] if lean["homeAway"] == "Home" else lean["team"]
                away_team_full = lean["opponentFullName"] if lean["homeAway"] == "Home" else lean["teamFullName"]
                # Dedup by HOME-AWAY pair so two leans on opposite sides of the
                # same game don't produce two entries.
                key = f"{home_team_abbr}-{away_team_abbr}"
                if key in seen:
                    continue
                seen[key] = Game(
                    game_id=f"demo-{lean['date']}-{home_team_abbr}-{away_team_abbr}",
                    date=lean["date"],
                    tipoff_et=lean["tipoff"],
                    home_team_abbr=home_team_abbr,
                    home_team_full=home_team_full,
                    away_team_abbr=away_team_abbr,
                    away_team_full=away_team_full,
                    status="Scheduled",
                )
            self._mark_ok()
            return list(seen.values())
        except Exception as e:
            self._mark_err(str(e))
            raise ProviderError(f"demo schedule failed: {e}") from e

    def fetch_player_game_logs(self, player_id: int, last_n: int = 10) -> list[GameLog]:
        try:
            data = _load("trends.json")
            for p in data.get("players", []):
                if int(p.get("playerId", -1)) == int(player_id):
                    logs = []
                    for g in p.get("recentGames", [])[:last_n]:
                        logs.append(GameLog(
                            player_id=int(p["playerId"]),
                            game_date=g["date"],
                            opponent_abbr=g["opponent"],
                            home_away=g["homeAway"],
                            minutes=float(g["minutes"]),
                            pts=int(g["pts"]),
                            reb=int(g["reb"]),
                            ast=int(g["ast"]),
                        ))
                    self._mark_ok()
                    return logs
            self._mark_ok()
            return []
        except Exception as e:
            self._mark_err(str(e))
            raise ProviderError(f"demo game logs failed: {e}") from e

    def fetch_team_roster(self, team_abbr: str) -> list[Player]:
        try:
            data = _load("trends.json")
            roster = []
            for p in data.get("players", []):
                if p.get("team") == team_abbr:
                    roster.append(Player(
                        player_id=int(p["playerId"]),
                        player_name=p["playerName"],
                        team_abbr=p["team"],
                        position=p.get("position", ""),
                        status=p.get("status", "Active"),
                    ))
            self._mark_ok()
            return roster
        except Exception as e:
            self._mark_err(str(e))
            raise ProviderError(f"demo roster failed: {e}") from e

    def fetch_box_score(self, game_id: str) -> list[GameLog]:
        # Demo box scores aren't a thing — we only have scheduled games.
        self._mark_ok()
        return []

    # -- internal ------------------------------------------------------------
    def _mark_ok(self) -> None:
        self._last_status = "ok"
        self._last_error = None
        self._last_run_at = now_iso()

    def _mark_err(self, msg: str) -> None:
        self._last_status = "error"
        self._last_error = msg
        self._last_run_at = now_iso()


# ---------------------------------------------------------------------------
# Odds side
# ---------------------------------------------------------------------------
class DemoOddsProvider(OddsProvider):
    name = "demo"
    tier = 1
    requires_api_key = False
    supported = {"player_points", "player_rebounds", "player_assists"}

    def __init__(self) -> None:
        self._last_status = "not_run"
        self._last_error: str | None = None
        self._last_run_at: str | None = None

    def get_status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            kind="odds",
            tier=self.tier,
            enabled=True,
            requires_api_key=False,
            api_key_configured=True,
            is_demo=True,
            is_stub=False,
            last_status=self._last_status,
            last_error=self._last_error,
            last_run_at=self._last_run_at,
            notes="Bundled demo prop lines. Always works.",
        )

    def fetch_props(
        self,
        date: str,
        markets: list[str] | None = None,
    ) -> list[PropLine]:
        try:
            data = _load("board.json")
            wanted = set(markets) if markets else {"PTS", "REB", "AST"}
            out: list[PropLine] = []
            for lean in data.get("leans", []):
                if lean["market"] not in wanted:
                    continue
                out.append(PropLine(
                    player_id=int(lean["playerId"]),
                    player_name=lean["playerName"],
                    team_abbr=lean["team"],
                    market=lean["market"],
                    line=float(lean["line"]),
                    odds_over=int(lean["oddsOver"]),
                    odds_under=int(lean["oddsUnder"]),
                    bookmaker=lean.get("bookmaker", "demo"),
                    game_date=lean["date"],
                    last_update=data.get("generatedAt", now_iso()),
                ))
            self._last_status = "ok"
            self._last_error = None
            self._last_run_at = now_iso()
            return out
        except Exception as e:
            self._last_status = "error"
            self._last_error = str(e)
            self._last_run_at = now_iso()
            raise ProviderError(f"demo props failed: {e}") from e
