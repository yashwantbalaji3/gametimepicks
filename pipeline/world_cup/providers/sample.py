"""Sample/dev provider — returns NOTHING (unconfigured). Used by tests + as the
default when no real provider key is present, so the runtime fails closed. It
never fabricates data."""
from __future__ import annotations

from .base import SoccerStatsProvider
from ..models import WorldCupFixture, TeamStrength, PlayerRole


class SampleProvider(SoccerStatsProvider):
    name = "sample"
    env_key = ""  # no key → never configured → always fails closed

    def is_configured(self) -> bool:
        return False

    def fixtures(self, date: str) -> list[WorldCupFixture]:
        return []

    def team_strength(self, team: str) -> TeamStrength | None:
        return None

    def player_roles(self, team: str) -> list[PlayerRole]:
        return []
