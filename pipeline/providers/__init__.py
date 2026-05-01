"""Provider package — multi-source data adapter system."""
from .base import (
    Game, Player, GameLog, PropLine,
    NBADataProvider, OddsProvider,
    ProviderStatus,
    ProviderError, ProviderUnavailable, ProviderRequestFailed, ProviderNotImplemented,
    now_iso,
)
from .registry import (
    get_nba_provider_chain,
    get_odds_provider_chain,
    all_provider_statuses,
    diagnostic_summary,
)

__all__ = [
    "Game", "Player", "GameLog", "PropLine",
    "NBADataProvider", "OddsProvider",
    "ProviderStatus",
    "ProviderError", "ProviderUnavailable", "ProviderRequestFailed", "ProviderNotImplemented",
    "now_iso",
    "get_nba_provider_chain", "get_odds_provider_chain",
    "all_provider_statuses", "diagnostic_summary",
]
