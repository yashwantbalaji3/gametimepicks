"""
Fetch player-prop odds via the odds provider chain.

Walks providers in priority order. First successful response wins. If every
provider fails (rare — demo always works), returns empty list.
"""
from __future__ import annotations

import logging

from .providers import (
    PropLine,
    ProviderError, get_odds_provider_chain,
)


log = logging.getLogger(__name__)


def fetch_props(date: str, markets: list[str] | None = None) -> tuple[list[PropLine], str]:
    chain = get_odds_provider_chain()
    last_error = None
    for provider in chain:
        try:
            props = provider.fetch_props(date, markets=markets)
            log.info(f"[props] using {provider.name} ({len(props)} props)")
            return props, provider.name
        except ProviderError as e:
            last_error = e
            log.warning(f"[props] {provider.name} failed: {e}")
            continue
    log.error(f"[props] all providers failed: {last_error}")
    return [], "none"
