"""
Provider registry.

Central source-of-truth for which providers exist and which are active. The
orchestrator (fetch_nba_data.py / fetch_odds_data.py) asks the registry for
"give me the active NBA provider" and gets back the right instance based on
env config + tier ordering + stub vs. real.

Registration model:
  REGISTRY = {
      "nba": [NbaApiProvider(), BallDontLieProvider(), EspnProvider(),
              SportsDataNBAProvider(), DemoNBAProvider()],
      "odds": [OddsApiProvider(), OpticOddsProvider(),
               SportsDataOddsProvider(), DemoOddsProvider()],
  }

Selection logic for `get_active_nba_provider()`:
  1. Read NBA_DATA_PROVIDER env var (default "nba_api"). If that provider
     is enabled (not a stub, available), use it.
  2. Otherwise iterate enabled, non-stub providers in tier order.
  3. Demo provider is always last and always works.

Same for odds.
"""
from __future__ import annotations

from .. import config as C
from .base import (
    NBADataProvider, OddsProvider,
    ProviderError, ProviderStatus,
)
from .demo_provider import DemoNBAProvider, DemoOddsProvider
from .nba_api_provider import NbaApiProvider
from .odds_api_provider import OddsApiProvider
from .balldontlie_provider import BallDontLieProvider
from .espn_provider import EspnProvider
from .opticodds_provider import OpticOddsProvider
from .sportsdata_provider import SportsDataNBAProvider, SportsDataOddsProvider


# ---------------------------------------------------------------------------
# Singleton instances — created once per process
# ---------------------------------------------------------------------------
_nba_providers: list[NBADataProvider] | None = None
_odds_providers: list[OddsProvider] | None = None


def _all_nba_providers() -> list[NBADataProvider]:
    global _nba_providers
    if _nba_providers is None:
        _nba_providers = [
            NbaApiProvider(),
            BallDontLieProvider(),
            EspnProvider(),
            SportsDataNBAProvider(),
            DemoNBAProvider(),
        ]
    return _nba_providers


def _all_odds_providers() -> list[OddsProvider]:
    global _odds_providers
    if _odds_providers is None:
        _odds_providers = [
            OddsApiProvider(),
            OpticOddsProvider(),
            SportsDataOddsProvider(),
            DemoOddsProvider(),
        ]
    return _odds_providers


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_nba_provider_chain() -> list[NBADataProvider]:
    """Return NBA providers in the order they should be tried.

    1. If NBA_DATA_MODE == "demo", force demo provider only.
    2. Otherwise: configured NBA_DATA_PROVIDER if it exists and is enabled,
       then all other enabled non-stub providers in tier order,
       then demo as final fallback (always works).
    """
    chain: list[NBADataProvider] = []
    used: set[str] = set()
    all_providers = _all_nba_providers()

    # Forced demo mode — short-circuit
    if C.NBA_DATA_MODE == "demo":
        for p in all_providers:
            if p.name == "demo":
                return [p]

    # Preferred (from env)
    preferred_name = C.NBA_DATA_PROVIDER
    for p in all_providers:
        if p.name == preferred_name:
            status = p.get_status()
            if status.enabled and not status.is_stub:
                chain.append(p)
                used.add(p.name)
            break

    # Other non-stub, enabled providers in tier order
    for p in sorted(all_providers, key=lambda x: x.tier):
        if p.name in used:
            continue
        if p.name == "demo":
            continue   # demo goes last, always
        status = p.get_status()
        if status.enabled and not status.is_stub:
            chain.append(p)
            used.add(p.name)

    # Demo always last
    for p in all_providers:
        if p.name == "demo" and p.name not in used:
            chain.append(p)
            used.add(p.name)
            break

    return chain


def get_odds_provider_chain() -> list[OddsProvider]:
    """Same logic as NBA — preferred → tier order → demo. Honors ODDS_DATA_MODE=demo."""
    chain: list[OddsProvider] = []
    used: set[str] = set()
    all_providers = _all_odds_providers()

    # Forced demo mode — short-circuit
    if C.ODDS_DATA_MODE == "demo":
        for p in all_providers:
            if p.name == "demo":
                return [p]

    preferred_name = C.ODDS_PROVIDER
    for p in all_providers:
        if p.name == preferred_name:
            status = p.get_status()
            if status.enabled and not status.is_stub:
                chain.append(p)
                used.add(p.name)
            break

    for p in sorted(all_providers, key=lambda x: x.tier):
        if p.name in used:
            continue
        if p.name == "demo":
            continue
        status = p.get_status()
        if status.enabled and not status.is_stub:
            chain.append(p)
            used.add(p.name)

    for p in all_providers:
        if p.name == "demo" and p.name not in used:
            chain.append(p)
            used.add(p.name)
            break

    return chain


def all_provider_statuses() -> list[ProviderStatus]:
    """Every provider's current status. Written into meta.json."""
    statuses: list[ProviderStatus] = []
    for p in _all_nba_providers():
        statuses.append(p.get_status())
    for p in _all_odds_providers():
        statuses.append(p.get_status())
    return statuses


# ---------------------------------------------------------------------------
# Diagnostic dump — prints the registry for debugging
# ---------------------------------------------------------------------------
def diagnostic_summary() -> dict[str, object]:
    """Returns a dict suitable for logging or meta.json embedding."""
    nba_chain = get_nba_provider_chain()
    odds_chain = get_odds_provider_chain()
    return {
        "nba_active_chain": [p.name for p in nba_chain],
        "odds_active_chain": [p.name for p in odds_chain],
        "all_statuses": [s.to_dict() for s in all_provider_statuses()],
    }
