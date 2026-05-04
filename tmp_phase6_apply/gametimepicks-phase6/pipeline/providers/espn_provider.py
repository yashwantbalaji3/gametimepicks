"""
ESPN public-API provider (SCAFFOLD ONLY).

Tier: 3 — optional, last-resort fallback. Read-only access to ESPN's public
endpoints (e.g. site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard).

When implemented, this provider will support:
  - schedule (scoreboard endpoint)
  - rosters (team roster endpoint)
  - game metadata (team logos, broadcast info — supplemental only)

It will NOT support:
  - player game logs (ESPN public API doesn't expose detailed per-game logs cleanly)
  - box scores (use nba_api / BallDontLie for those)

Compliance note:
  Use ESPN's documented `site.api.espn.com` endpoints. Do not scrape ESPN's
  HTML pages. Do not use undocumented mobile-app endpoints. If ESPN ever
  returns 401/403/429, fall back to demo gracefully and don't retry
  aggressively — they're being generous letting their public site API exist.

To implement:
  1. Set ENABLE_ESPN_FALLBACK=true in .env.
  2. Replace the NotImplementedError raises with requests calls.
  3. Map ESPN's response fields to our dataclasses.
  4. Cache aggressively (1-hour TTL minimum) to be a good citizen.
"""
from __future__ import annotations

from .. import config as C
from .base import (
    Game, Player, GameLog,
    NBADataProvider,
    ProviderStatus, ProviderNotImplemented,
    now_iso,
)


class EspnProvider(NBADataProvider):
    name = "espn"
    tier = 3
    requires_api_key = False
    supported = {"schedule", "rosters"}     # explicitly limited

    def get_status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            kind="nba",
            tier=self.tier,
            enabled=False,
            requires_api_key=False,
            api_key_configured=True,
            is_demo=False,
            is_stub=True,
            last_status="stub",
            last_error=None,
            last_run_at=None,
            notes=(
                "Scaffolded only. ESPN public API used for schedule + roster "
                "fallback, not core. Set ENABLE_ESPN_FALLBACK=true to enable, "
                "then implement. Never scrapes HTML."
            ),
        )

    def fetch_schedule(self, date: str) -> list[Game]:
        raise ProviderNotImplemented("espn.fetch_schedule — scaffold only")

    def fetch_player_game_logs(self, player_id: int, last_n: int = 10) -> list[GameLog]:
        raise ProviderNotImplemented(
            "espn.fetch_player_game_logs — not supported by this provider"
        )

    def fetch_team_roster(self, team_abbr: str) -> list[Player]:
        raise ProviderNotImplemented("espn.fetch_team_roster — scaffold only")

    def fetch_box_score(self, game_id: str) -> list[GameLog]:
        raise ProviderNotImplemented(
            "espn.fetch_box_score — not supported by this provider"
        )
