"""
SportsData.io provider (SCAFFOLD ONLY).

API: https://sportsdata.io/
Tier: 2 — commercial provider for NBA stats, schedules, injuries, and (on
higher tiers) odds and player props.

This provider can act as either an NBADataProvider OR an OddsProvider
depending on which SportsData.io product you've subscribed to. We expose
two adapter classes so the registry can route NBA queries to one and odds
queries to the other.

When implemented, this provider will support:
  - schedule, rosters, game_logs, injuries (NBA stats endpoints)
  - player_props (depending on subscription tier)

To implement:
  1. Sign up for SportsData.io and pick a subscription tier.
  2. Set SPORTSDATA_API_KEY in .env.
  3. Set ENABLE_SPORTSDATA=true.
  4. Replace the NotImplementedError raises with requests calls.
"""
from __future__ import annotations

from .. import config as C
from .base import (
    Game, Player, GameLog, PropLine,
    NBADataProvider, OddsProvider,
    ProviderStatus, ProviderNotImplemented,
    now_iso,
)


class SportsDataNBAProvider(NBADataProvider):
    name = "sportsdata_nba"
    tier = 2
    requires_api_key = True
    supported = {"schedule", "rosters", "game_logs", "box_scores"}

    def __init__(self) -> None:
        self._key = C.SPORTSDATA_API_KEY

    def get_status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            kind="nba",
            tier=self.tier,
            enabled=False,
            requires_api_key=True,
            api_key_configured=bool(self._key),
            is_demo=False,
            is_stub=True,
            last_status="stub",
            last_error=None,
            last_run_at=None,
            notes=(
                "Scaffolded only. Commercial NBA stats provider. Set "
                "SPORTSDATA_API_KEY and ENABLE_SPORTSDATA=true to enable, "
                "then implement."
            ),
        )

    def fetch_schedule(self, date: str) -> list[Game]:
        raise ProviderNotImplemented("sportsdata_nba.fetch_schedule — scaffold only")

    def fetch_player_game_logs(self, player_id: int, last_n: int = 10) -> list[GameLog]:
        raise ProviderNotImplemented("sportsdata_nba.fetch_player_game_logs — scaffold only")

    def fetch_team_roster(self, team_abbr: str) -> list[Player]:
        raise ProviderNotImplemented("sportsdata_nba.fetch_team_roster — scaffold only")

    def fetch_box_score(self, game_id: str) -> list[GameLog]:
        raise ProviderNotImplemented("sportsdata_nba.fetch_box_score — scaffold only")


class SportsDataOddsProvider(OddsProvider):
    name = "sportsdata_odds"
    tier = 2
    requires_api_key = True
    supported = {"player_points", "player_rebounds", "player_assists"}

    def __init__(self) -> None:
        self._key = C.SPORTSDATA_API_KEY

    def get_status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            kind="odds",
            tier=self.tier,
            enabled=False,
            requires_api_key=True,
            api_key_configured=bool(self._key),
            is_demo=False,
            is_stub=True,
            last_status="stub",
            last_error=None,
            last_run_at=None,
            notes=(
                "Scaffolded only. SportsData.io player props (subscription "
                "tier dependent). Implement when key is provided."
            ),
        )

    def fetch_props(
        self,
        date: str,
        markets: list[str] | None = None,
    ) -> list[PropLine]:
        raise ProviderNotImplemented("sportsdata_odds.fetch_props — scaffold only")
