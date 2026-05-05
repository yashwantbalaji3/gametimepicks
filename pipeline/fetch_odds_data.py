"""
Fetch player-prop odds via the odds provider.

Phase 7B-2: returns full diagnostic metadata so the orchestrator can
distinguish "not configured", "no_props_returned", "provider_failed", and
"ok_with_props" — instead of silently substituting empty results.
"""
from __future__ import annotations

import logging

from . import config as C
from .providers import (
    PropLine,
    ProviderError, get_odds_provider_chain,
)


log = logging.getLogger(__name__)


def fetch_props(
    date: str,
    markets: list[str] | None = None,
) -> tuple[list[PropLine], str]:
    """Legacy chain-based fetch — kept for back-compat. Use
    fetch_props_with_diagnostics() for Phase 7B-2 callers.
    """
    chain = get_odds_provider_chain()
    last_error: ProviderError | None = None
    for provider in chain:
        try:
            props = provider.fetch_props(date, markets=markets)
            log.info(f"[props] using {provider.name} ({len(props)} props)")
            return props, provider.name
        except ProviderError as e:
            last_error = e
            log.warning(f"[props] {provider.name} failed: {e}")
    return [], "unavailable"


def fetch_props_with_diagnostics(
    date: str,
    slate_games: list[dict] | None = None,
    markets: list[str] | None = None,
) -> dict:
    """Phase 7B-2 — fetch player props with full diagnostic metadata.

    Returns the diag dict from OddsApiProvider.fetch_props_with_diagnostics(),
    or a synthetic "not_configured" diag if no key is present. NEVER returns
    fabricated odds data.

    Args:
        date: YYYY-MM-DD
        slate_games: optional list of game dicts from schedule resolution,
            used to scope which Odds API events to fetch
        markets: optional list of market keys; defaults to C.ODDS_MARKETS

    Returns dict with: props, fetch_attempted, fetch_succeeded, failure_reason,
    raw_event_count, matched_event_count, attempted_event_count,
    parsed_prop_count, cache_status, quota_remaining, quota_used,
    last_call_cost, cost_estimate_per_run, bookmakers, markets_requested,
    regions, generated_at, cached_at.
    """
    from .providers.odds_api_provider import OddsApiProvider

    provider = OddsApiProvider()

    # If no key, return a synthetic diag so callers don't have to special-case
    if not provider._is_configured():
        return _empty_diag(reason="ODDS_API_KEY not set")

    return provider.fetch_props_with_diagnostics(
        date=date,
        slate_games=slate_games,
        markets=markets,
    )


def _empty_diag(reason: str) -> dict:
    """Build a not-configured diagnostic dict."""
    from datetime import datetime, timezone
    return {
        "props": [],
        "fetch_attempted": False,
        "fetch_succeeded": False,
        "failure_reason": reason,
        "raw_event_count": 0,
        "matched_event_count": 0,
        "attempted_event_count": 0,
        "parsed_prop_count": 0,
        "cache_status": "miss",
        "quota_remaining": None,
        "quota_used": None,
        "last_call_cost": None,
        "cost_estimate_per_run": 0,
        "bookmakers": list(C.ODDS_BOOKMAKERS),
        "markets_requested": list(C.ODDS_MARKETS),
        "regions": ",".join(C.ODDS_REGIONS),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cached_at": None,
    }
