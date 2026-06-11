"""Provider-neutral soccer stats interface (Phase 4).

A concrete provider (API-Football, Sportmonks, …) implements this. The orchestrator
talks only to this interface. `is_configured()` returns False when the provider's
API key isn't set → the readiness layer fails closed (no projections). No provider
may invent data: methods return [] / None when the source lacks a field.
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod

from ..models import WorldCupFixture, TeamStrength, PlayerRole


class SoccerStatsProvider(ABC):
    name: str = "base"
    env_key: str = ""          # name of the env var holding the API key
    supports_xg: bool = False
    supports_lineups: bool = False
    supports_player_stats: bool = False
    supports_team_stats: bool = False

    def is_configured(self) -> bool:
        """True only when the provider's API key is present in the environment."""
        return bool(self.env_key) and bool(os.environ.get(self.env_key, "").strip())

    @abstractmethod
    def fixtures(self, date: str) -> list[WorldCupFixture]:
        """World Cup fixtures on a date. [] when unconfigured/unavailable."""

    @abstractmethod
    def team_strength(self, team: str) -> TeamStrength | None:
        """Team strength baseline. None when unconfigured/unavailable."""

    @abstractmethod
    def player_roles(self, team: str) -> list[PlayerRole]:
        """Player roles/minutes for a team. [] when unconfigured/unavailable."""
