"""
Fetch NBA player data — game logs and rosters — using the provider chain.

This module sits above the providers and handles failover. Each function
walks the provider chain in priority order and returns the first success.
"""
from __future__ import annotations

import logging

from .providers import (
    Player, GameLog,
    ProviderError, get_nba_provider_chain,
)


log = logging.getLogger(__name__)


def fetch_player_game_logs(player_id: int, last_n: int = 10) -> tuple[list[GameLog], str]:
    chain = get_nba_provider_chain()
    last_error = None
    for provider in chain:
        try:
            logs = provider.fetch_player_game_logs(player_id, last_n=last_n)
            return logs, provider.name
        except ProviderError as e:
            last_error = e
            log.warning(f"[game_logs] {provider.name} failed for player {player_id}: {e}")
            continue
    log.error(f"[game_logs] all providers failed for player {player_id}: {last_error}")
    return [], "none"


def fetch_team_roster(team_abbr: str) -> tuple[list[Player], str]:
    chain = get_nba_provider_chain()
    last_error = None
    for provider in chain:
        try:
            roster = provider.fetch_team_roster(team_abbr)
            return roster, provider.name
        except ProviderError as e:
            last_error = e
            log.warning(f"[roster] {provider.name} failed for {team_abbr}: {e}")
            continue
    log.error(f"[roster] all providers failed for {team_abbr}: {last_error}")
    return [], "none"


def fetch_box_score(game_id: str) -> tuple[list[GameLog], str]:
    chain = get_nba_provider_chain()
    last_error = None
    for provider in chain:
        try:
            box = provider.fetch_box_score(game_id)
            return box, provider.name
        except ProviderError as e:
            last_error = e
            log.warning(f"[box_score] {provider.name} failed for {game_id}: {e}")
            continue
    log.error(f"[box_score] all providers failed for {game_id}: {last_error}")
    return [], "none"
