"""
BallDontLie API provider (SCAFFOLD ONLY).

API: https://www.balldontlie.io/
Tier: 2 — secondary fallback for NBA data when nba_api fails.

When implemented, this provider will support:
  - schedule (via /games endpoint)
  - rosters (via /players endpoint)
  - game_logs (via /stats endpoint)
  - box_scores (via /stats endpoint with game_id filter)

To implement:
  1. Sign up for BallDontLie API key (some endpoints are free, some paid).
  2. Set BALLDONTLIE_API_KEY in .env.
  3. Set ENABLE_BALLDONTLIE_FALLBACK=true.
  4. Replace the NotImplementedError raises with real requests calls.
  5. Map BallDontLie's response fields to our Game / Player / GameLog dataclasses.
  6. Add caching (mirror nba_api_provider.py's cache pattern).

Until then, this provider reports as scaffolded/disabled in the registry and
the orchestrator skips it.
"""
from __future__ import annotations

from .. import config as C
from .base import (
    Game, Player, GameLog,
    NBADataProvider,
    ProviderStatus, ProviderNotImplemented,
    now_iso,
)


class BallDontLieProvider(NBADataProvider):
    name = "balldontlie"
    tier = 2
    requires_api_key = True
    supported = {"schedule", "rosters", "game_logs", "box_scores"}

    def __init__(self) -> None:
        self._key = C.BALLDONTLIE_API_KEY

    def get_status(self) -> ProviderStatus:
        configured = bool(self._key) and C.ENABLE_BALLDONTLIE_FALLBACK
        return ProviderStatus(
            name=self.name,
            kind="nba",
            tier=self.tier,
            enabled=False,                            # scaffolded only
            requires_api_key=True,
            api_key_configured=bool(self._key),
            is_demo=False,
            is_stub=True,
            last_status="stub",
            last_error=None,
            last_run_at=None,
            notes=(
                "Scaffolded only. Set BALLDONTLIE_API_KEY and "
                "ENABLE_BALLDONTLIE_FALLBACK=true, then implement."
            ),
        )

    def fetch_schedule(self, date: str) -> list[Game]:
        raise ProviderNotImplemented("balldontlie.fetch_schedule — scaffold only")

    def fetch_player_game_logs(self, player_id: int, last_n: int = 10) -> list[GameLog]:
        raise ProviderNotImplemented("balldontlie.fetch_player_game_logs — scaffold only")

    def fetch_team_roster(self, team_abbr: str) -> list[Player]:
        raise ProviderNotImplemented("balldontlie.fetch_team_roster — scaffold only")

    def fetch_box_score(self, game_id: str) -> list[GameLog]:
        raise ProviderNotImplemented("balldontlie.fetch_box_score — scaffold only")
