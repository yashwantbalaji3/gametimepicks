"""
UFC odds via The Odds API (MMA). Mirrors pipeline/mlb/mlb_odds.py conventions.

  GET /v4/sports/mma_mixed_martial_arts/events                 FREE (events list)
  GET /v4/sports/mma_mixed_martial_arts/events/{id}/odds       markets×regions credits

Fetch functions require `requests` + ODDS_API_KEY (run in CI). `parse_h2h` is pure
and unit-tested with mocked payloads. ODDS ONLY — no model output, no picks.
"""
from __future__ import annotations

import os

API_BASE = "https://api.the-odds-api.com/v4"
SPORT_KEY = "mma_mixed_martial_arts"
HTTP_TIMEOUT = 20


class UfcOddsError(Exception):
    pass


def _api_key() -> str:
    key = (os.getenv("ODDS_API_KEY") or "").strip()
    if not key:
        raise UfcOddsError("ODDS_API_KEY is not configured")
    return key


def implied_probability_from_american(odds: float) -> float:
    """De-vig-free single-side implied probability from American odds."""
    o = float(odds)
    return (-o) / ((-o) + 100.0) if o < 0 else 100.0 / (o + 100.0)


def fetch_events() -> list[dict]:
    """FREE events list for the MMA sport key."""
    import requests
    r = requests.get(f"{API_BASE}/sports/{SPORT_KEY}/events",
                     params={"apiKey": _api_key()}, timeout=HTTP_TIMEOUT)
    if r.status_code == 401:
        raise UfcOddsError("auth failed (401) — check ODDS_API_KEY")
    r.raise_for_status()
    return r.json() or []


def fetch_event_odds(event_id: str, regions: str = "us", markets: str = "h2h") -> tuple[dict, dict]:
    """PAID per markets×regions. Returns (payload, credit_headers)."""
    import requests
    r = requests.get(
        f"{API_BASE}/sports/{SPORT_KEY}/events/{event_id}/odds",
        params={"apiKey": _api_key(), "regions": regions, "markets": markets, "oddsFormat": "american"},
        timeout=HTTP_TIMEOUT,
    )
    if r.status_code == 401:
        raise UfcOddsError("auth failed (401) — check ODDS_API_KEY")
    r.raise_for_status()
    headers = {"x-requests-last": r.headers.get("x-requests-last", "?"),
               "x-requests-remaining": r.headers.get("x-requests-remaining", "?")}
    return r.json() or {}, headers


def parse_h2h(payload: dict, bookmaker_priority: list[str] | None = None) -> dict | None:
    """Pure: normalize one event's H2H (moneyline) odds. Returns a bout dict with
    two-sided American prices + market-implied probabilities (clearly odds-only),
    or None if no usable two-sided H2H market exists."""
    if not isinstance(payload, dict):
        return None
    fighters = [payload.get("home_team"), payload.get("away_team")]
    fighters = [f for f in fighters if f]
    books = payload.get("bookmakers") or []
    if not books:
        return None
    priority = bookmaker_priority or ["draftkings", "fanduel"]
    def book_rank(b):
        key = (b.get("key") or "").lower()
        return priority.index(key) if key in priority else len(priority)
    for book in sorted(books, key=book_rank):
        for mk in (book.get("markets") or []):
            if mk.get("key") != "h2h":
                continue
            outs = mk.get("outcomes") or []
            priced = [o for o in outs if isinstance(o.get("price"), (int, float))]
            if len(priced) < 2:
                continue
            return {
                "eventId": payload.get("id"),
                "commenceTime": payload.get("commence_time"),
                "fighters": fighters,
                "bookmaker": book.get("key"),
                "market": "h2h",
                "lastUpdate": (mk.get("last_update") or book.get("last_update")),
                "sides": [
                    {
                        "name": o.get("name"),
                        "price": o.get("price"),
                        "impliedProbability": round(implied_probability_from_american(o["price"]), 4),
                    }
                    for o in priced
                ],
            }
    return None
