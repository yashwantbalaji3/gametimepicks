"""
prop_odds_base — INACTIVE interface contract for a future UFC prop-odds provider
(method / distance / round markets). No provider is connected and none is activated
here. This only documents the shape a real provider must satisfy so integration is a
drop-in once a paid provider is approved (OpticOdds / SportsDataIO — see
docs/research/ufc-prop-odds-provider-search-latest.md).

NO network calls, NO credentials, NO fabricated odds.
"""
from __future__ import annotations

from typing import Protocol, TypedDict


class PropQuote(TypedDict, total=False):
    boutId: str
    fighter: str            # side the price refers to (or None for over/under markets)
    market: str             # "method_ko_tko" | "method_sub" | "method_dec" | "go_distance" | "round_total" ...
    selection: str          # human label of the selection
    price: int              # American odds
    bookmaker: str
    commenceTime: str


class PropOddsProvider(Protocol):
    """Contract a real provider module must implement before props can be enabled."""

    name: str
    supported_markets: list[str]  # e.g. ["method_of_victory", "go_the_distance", "rounds"]

    def available(self) -> bool:
        """True only when credentials are configured AND the feed is reachable."""

    def fetch_card_props(self, event_id: str) -> list[PropQuote]:
        """Return real pre-fight prop quotes for a single card. MUST return [] when
        unavailable — never fabricate. Card-only; off-card/futures dropped upstream."""


# Until a provider is approved + implemented, this is the only honest answer.
ACTIVE_PROVIDER: PropOddsProvider | None = None


def props_available() -> bool:
    return ACTIVE_PROVIDER is not None and ACTIVE_PROVIDER.available()
