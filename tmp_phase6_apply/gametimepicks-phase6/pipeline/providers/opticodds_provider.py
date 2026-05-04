"""
OpticOdds provider (SCAFFOLD ONLY).

API: https://opticodds.com/
Tier: 2 — alternative to The Odds API for broader sportsbook coverage,
including theScore Bet where available.

When implemented, this provider will support:
  - player_points
  - player_rebounds
  - player_assists
  - (potentially) player_pra, player_threes — extend MARKETS in config

Why this is interesting:
  OpticOdds aggregates more US sportsbooks than The Odds API's free tier,
  and includes theScore Bet on certain plans. This is the compliant path to
  theScore data — never via app scraping.

To implement:
  1. Sign up for OpticOdds.
  2. Set OPTICODDS_API_KEY in .env.
  3. Set ENABLE_OPTICODDS=true.
  4. Replace the NotImplementedError raises with requests calls.
  5. Use OpticOdds's player-prop endpoints (consult their API docs).
  6. Map their response fields to PropLine.

When BOTH the_odds_api AND opticodds are enabled, the registry's priority
order decides which is consulted first. By default the_odds_api is tier-1
and opticodds is tier-2; reorder via env if you want opticodds primary.
"""
from __future__ import annotations

from .. import config as C
from .base import (
    PropLine,
    OddsProvider,
    ProviderStatus, ProviderNotImplemented,
    now_iso,
)


class OpticOddsProvider(OddsProvider):
    name = "opticodds"
    tier = 2
    requires_api_key = True
    supported = {"player_points", "player_rebounds", "player_assists"}

    def __init__(self) -> None:
        self._key = C.OPTICODDS_API_KEY

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
                "Scaffolded only. OpticOdds is the compliant path to theScore "
                "data and broader US sportsbook coverage. Set OPTICODDS_API_KEY "
                "and ENABLE_OPTICODDS=true to enable, then implement."
            ),
        )

    def fetch_props(
        self,
        date: str,
        markets: list[str] | None = None,
    ) -> list[PropLine]:
        raise ProviderNotImplemented("opticodds.fetch_props — scaffold only")
