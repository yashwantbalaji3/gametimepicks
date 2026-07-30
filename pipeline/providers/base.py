"""
Provider base classes.

Two provider types:
  - NBADataProvider — schedule, players, game logs
  - OddsProvider    — sportsbook lines and odds for player props

Every concrete provider inherits from one of these and implements the methods
declared by the abstract base. The orchestration layer (fetch_nba_data.py,
fetch_odds_data.py) talks to providers through these interfaces only — it
does not import nba_api or requests directly.

If a provider fails (network error, API down, missing credentials), it should
raise a ProviderError. The orchestrator catches it, logs the failure, and
falls over to the next provider in priority order.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class ProviderError(Exception):
    """Raised when a provider cannot fulfill a request.

    The orchestrator catches this and falls through to the next provider.
    Subclasses give the orchestrator (and our logs) more context.
    """


class ProviderUnavailable(ProviderError):
    """Provider is not configured (missing API key, disabled, etc.)."""


class ProviderRequestFailed(ProviderError):
    """Provider was reachable but the request failed (HTTP error, parse error)."""


class ProviderNotImplemented(ProviderError):
    """Provider is scaffolded but not yet implemented."""


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
@dataclass
class ProviderStatus:
    """Reported by every provider. Written into meta.json so the UI can render
    a 'Data Source' badge accurately.
    """
    name: str
    kind: str                         # "nba" | "odds"
    tier: int                         # 1 = primary, 2 = secondary, 3 = optional fallback
    enabled: bool                     # configured + reachable + not stubbed
    requires_api_key: bool
    api_key_configured: bool
    is_demo: bool                     # True only for the demo provider
    is_stub: bool                     # True for scaffolded-only providers
    last_status: str                  # "ok" | "error" | "not_run" | "not_configured" | "stub"
    last_error: str | None = None
    last_run_at: str | None = None    # ISO 8601
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Normalized data shapes
# ---------------------------------------------------------------------------
# These are the shapes every provider must return. Keep them flat and
# JSON-serializable so we can pass them straight through to the frontend.

@dataclass
class Game:
    game_id: str
    date: str                         # YYYY-MM-DD (ET)
    tipoff_et: str                    # "7:30 PM ET"
    home_team_abbr: str
    home_team_full: str
    away_team_abbr: str
    away_team_full: str
    status: str = "Scheduled"         # "Scheduled" | "Live" | "Final"
    # ISO 8601 tip-off INSTANT, when the provider supplied one. Optional and defaulted so every
    # existing provider keeps working unchanged. It exists because `tipoff_et` is display text:
    # `capturedAt < eventStart` is unevaluable against "7:30 PM ET", which is why every NBA board
    # through 2026-06-13 is research-ineligible. Never reconstructed from the display string.
    tipoff_iso: str | None = None


@dataclass
class Player:
    player_id: int
    player_name: str
    team_abbr: str
    position: str = ""
    status: str = "Active"            # "Active" | "Questionable" | "Out" | "GTD"


@dataclass
class GameLog:
    """One stat line for one player in one game.

    Extended box-score fields (fg3m/blk/stl/tov) default to 0 so every existing
    provider + consumer keeps working unchanged; ESPN populates them when the
    source row carries them. They power expanded NBA prop markets (3PM, defense
    props) only once odds + model support exist — PTS/REB/AST are unchanged."""
    player_id: int
    game_date: str                    # YYYY-MM-DD
    opponent_abbr: str
    home_away: str                    # "Home" | "Away"
    minutes: float
    pts: int
    reb: int
    ast: int
    fg3m: int = 0                     # made three-pointers
    blk: int = 0
    stl: int = 0
    tov: int = 0                      # turnovers


@dataclass
class PropLine:
    """One sportsbook line on a player prop. Note this is BEFORE the model
    runs — we attach projections, edges, and leans downstream.
    """
    player_id: int                    # may be 0 if provider returns names only
    player_name: str
    team_abbr: str
    market: str                       # "PTS" | "REB" | "AST"
    line: float
    odds_over: int                    # American odds, e.g. -110
    odds_under: int
    bookmaker: str
    game_date: str                    # YYYY-MM-DD
    last_update: str                  # ISO 8601
    # Phase 7B-2: provider-supplied event metadata so the orchestrator can
    # match props back to schedule games even when the player→team roster
    # lookup fails (e.g. when nba_api is unreachable). Defaults to "" so
    # legacy providers don't have to set them.
    event_home_team: str = ""
    event_away_team: str = ""


# ---------------------------------------------------------------------------
# NBA data provider interface
# ---------------------------------------------------------------------------
class NBADataProvider(ABC):
    """Schedule, player, game log, box score data."""

    name: str
    tier: int
    requires_api_key: bool
    supported: set[str]   # subset of {"schedule", "rosters", "game_logs", "box_scores"}

    @abstractmethod
    def get_status(self) -> ProviderStatus: ...

    @abstractmethod
    def fetch_schedule(self, date: str) -> list[Game]:
        """All NBA games scheduled on `date` (YYYY-MM-DD, ET)."""

    @abstractmethod
    def fetch_player_game_logs(
        self, player_id: int, last_n: int = 10
    ) -> list[GameLog]:
        """Most-recent N game logs for a player, newest first."""

    @abstractmethod
    def fetch_team_roster(self, team_abbr: str) -> list[Player]:
        """Active players on a team."""

    @abstractmethod
    def fetch_box_score(self, game_id: str) -> list[GameLog]:
        """Final box score for a completed game (one row per player)."""


# ---------------------------------------------------------------------------
# Odds provider interface
# ---------------------------------------------------------------------------
class OddsProvider(ABC):
    """Sportsbook lines and odds for player props."""

    name: str
    tier: int
    requires_api_key: bool
    supported: set[str]   # subset of {"player_points", "player_rebounds", "player_assists"}

    @abstractmethod
    def get_status(self) -> ProviderStatus: ...

    @abstractmethod
    def fetch_props(
        self,
        date: str,
        markets: list[str] | None = None,
    ) -> list[PropLine]:
        """All player-prop lines available for the given date.

        `markets` is a subset of the provider's supported markets (e.g.
        ["PTS", "REB", "AST"]). If None, the provider returns all supported
        markets.
        """


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
