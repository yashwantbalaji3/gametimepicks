"""
Fetch today's NBA schedule.

Walks the NBA provider chain (registry order) and returns the first successful
result. If every provider fails, returns an empty list — caller decides what
to do.

Output:
  list[Game]  — normalized dataclass instances

Usage:
  from pipeline.fetch_nba_schedule import fetch_schedule
  games = fetch_schedule("2026-04-30")
"""
from __future__ import annotations

import logging

from .providers import (
    Game, ProviderError, get_nba_provider_chain,
)


log = logging.getLogger(__name__)


def fetch_schedule(date: str) -> tuple[list[Game], str]:
    """Returns (games, source_name).

    `source_name` tells the caller which provider produced the data.
    """
    chain = get_nba_provider_chain()
    last_error = None
    for provider in chain:
        try:
            games = provider.fetch_schedule(date)
            log.info(f"[schedule] using {provider.name} ({len(games)} games)")
            return games, provider.name
        except ProviderError as e:
            last_error = e
            log.warning(f"[schedule] {provider.name} failed: {e}")
            continue
    log.error(f"[schedule] all providers failed: {last_error}")
    return [], "none"
