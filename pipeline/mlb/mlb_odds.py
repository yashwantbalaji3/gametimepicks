"""MLB-specific Odds API client.

The Odds API endpoint cost model (the same applies to MLB as to NBA):
  GET /v4/sports/baseball_mlb/events                    FREE (events list)
  GET /v4/sports/baseball_mlb/events/{id}/odds          markets × regions credits

Markets used for the MLB main board (no home runs — those live on a separate
Power Board):
  pitcher_strikeouts
  batter_hits
  batter_total_bases
  batter_hits_runs_rbis

Cost for May 16 with 15 events × 4 markets × 1 region = 60 credits.
Caller is responsible for gating spend.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .. import config as C

API_BASE = "https://api.the-odds-api.com/v4"
SPORT_KEY = "baseball_mlb"

# Markets supported on the main board (HR is intentionally not in this list).
DEFAULT_MARKETS = [
    "pitcher_strikeouts",
    "batter_hits",
    "batter_total_bases",
    "batter_hits_runs_rbis",
]
DEFAULT_REGIONS = ["us"]
DEFAULT_BOOKMAKERS = ["draftkings", "fanduel"]


class MlbOddsError(Exception):
    """Raised on terminal Odds API failure (auth, rate-limit, malformed)."""


def _cache_path(key: str) -> Path:
    safe = key.replace("/", "_").replace(" ", "_")
    return C.CACHE_DIR / f"odds_api_mlb_{safe}.json"


def _cache_get(key: str, ttl_minutes: int) -> Any | None:
    p = _cache_path(key)
    if not p.exists():
        return None
    try:
        payload = json.loads(p.read_text())
        cached_at = datetime.fromisoformat(payload["cached_at"])
        if datetime.now(timezone.utc) - cached_at < timedelta(minutes=ttl_minutes):
            return payload["data"]
    except Exception:
        return None
    return None


def _cache_put(key: str, data: Any) -> None:
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    p = _cache_path(key)
    p.write_text(
        json.dumps(
            {"cached_at": datetime.now(timezone.utc).isoformat(), "data": data}
        )
    )


def _http_get(url: str, params: dict[str, str]) -> tuple[Any, dict[str, str]]:
    import requests

    for attempt in range(C.HTTP_MAX_RETRIES):
        try:
            r = requests.get(url, params=params, timeout=C.HTTP_TIMEOUT_SECONDS)
        except Exception as e:
            if attempt < C.HTTP_MAX_RETRIES - 1:
                time.sleep(C.HTTP_BACKOFF_SECONDS * (attempt + 1))
                continue
            raise MlbOddsError(f"network error: {e}")
        if r.status_code == 401:
            raise MlbOddsError("auth failed (401) — check ODDS_API_KEY")
        if r.status_code == 429:
            raise MlbOddsError("rate limited (429)")
        if r.status_code == 422:
            raise MlbOddsError(f"bad request (422) — {r.text[:200]}")
        if r.status_code >= 500:
            if attempt < C.HTTP_MAX_RETRIES - 1:
                time.sleep(C.HTTP_BACKOFF_SECONDS * (attempt + 1))
                continue
            raise MlbOddsError(f"server error {r.status_code}")
        if r.status_code != 200:
            raise MlbOddsError(f"unexpected {r.status_code}: {r.text[:200]}")
        try:
            return r.json(), dict(r.headers)
        except Exception as e:
            raise MlbOddsError(f"could not parse json: {e}")
    raise MlbOddsError("retries exhausted")


def list_events_for_date(date_iso: str) -> tuple[list[dict], dict[str, str]]:
    """List MLB events for the calendar day. FREE.

    `date_iso` is YYYY-MM-DD in ET. We return any event whose commence_time
    UTC date falls within the [date 00:00 ET, date+1 09:00 ET) window so
    late-night ET games (which have UTC commence_time on the next calendar
    day) are still grouped under that ET game-day.
    """
    if not C.ODDS_API_KEY:
        raise MlbOddsError("ODDS_API_KEY is not configured")
    data, headers = _http_get(
        f"{API_BASE}/sports/{SPORT_KEY}/events",
        {"apiKey": C.ODDS_API_KEY},
    )
    if not isinstance(data, list):
        raise MlbOddsError("events response not a list")
    # ET-day window: convert ET midnight to UTC. ET is UTC-4 (EDT, May).
    # Game day [date 00:00 ET, date+1 09:00 ET) ≈ [date 04:00 UTC, date+1 13:00 UTC).
    from datetime import datetime as _dt

    start_utc = _dt.fromisoformat(f"{date_iso}T04:00:00+00:00")
    end_utc = start_utc + timedelta(days=1, hours=5)

    out: list[dict] = []
    for e in data:
        if not isinstance(e, dict):
            continue
        ct = e.get("commence_time", "")
        try:
            ct_dt = _dt.fromisoformat(ct.replace("Z", "+00:00"))
        except Exception:
            continue
        if start_utc <= ct_dt < end_utc:
            out.append(e)
    return out, headers


def fetch_event_odds(
    event_id: str,
    markets: list[str],
    regions: list[str],
    bookmakers: list[str],
    *,
    cache_ttl_minutes: int = 1440,
    force_refresh: bool = False,
) -> tuple[dict, dict[str, str]]:
    """Fetch player-prop odds for one event. PAID — cost = markets × regions.

    A successful response is cached to disk under
    `pipeline/cache/odds_api_mlb_event_<id>_<markets>_<regions>.json`. If the
    cache is fresh, subsequent calls cost 0 credits and return the cached
    payload with synthetic headers (`x-requests-last=0`).
    """
    cache_key = f"event_{event_id}_{'-'.join(sorted(markets))}_{'-'.join(sorted(regions))}"
    if not force_refresh:
        cached = _cache_get(cache_key, cache_ttl_minutes)
        if cached is not None:
            return cached, {"x-requests-last": "0", "x-requests-remaining": "cache"}

    if not C.ODDS_API_KEY:
        raise MlbOddsError("ODDS_API_KEY is not configured")
    params = {
        "apiKey": C.ODDS_API_KEY,
        "markets": ",".join(markets),
        "regions": ",".join(regions),
        "oddsFormat": "american",
    }
    if bookmakers:
        params["bookmakers"] = ",".join(bookmakers)
    data, headers = _http_get(
        f"{API_BASE}/sports/{SPORT_KEY}/events/{event_id}/odds",
        params,
    )
    # Cache only on success
    try:
        _cache_put(cache_key, data)
    except Exception:
        # Never let cache I/O fail the pipeline
        pass
    return data, headers


def implied_probability_from_american(odds: float) -> float:
    """Convert American odds to implied probability (0..1)."""
    odds = float(odds)
    if odds < 0:
        return -odds / (-odds + 100.0)
    return 100.0 / (odds + 100.0)


def parse_event_odds(payload: dict, bookmaker_priority: list[str]) -> list[dict]:
    """Flatten the Odds API event-odds payload to one dict per (player, market, line).

    The Odds API returns per-bookmaker, per-market arrays of outcomes.
    For each (player, market), we pick the BEST primary book (first one in
    `bookmaker_priority` that quotes both Over and Under at the same line).

    Returns rows shaped like:
      {
        "gameId": "...",        # event id
        "commenceTime": "...",
        "homeTeam": "...",
        "awayTeam": "...",
        "marketKey": "pitcher_strikeouts",
        "playerName": "...",
        "line": 5.5,
        "oddsOver": -120,
        "oddsUnder": +100,
        "impliedOver": 0.5455,
        "impliedUnder": 0.5000,
        "bookmaker": "draftkings",
      }
    """
    out: list[dict] = []
    event_id = payload.get("id")
    commence = payload.get("commence_time")
    home = payload.get("home_team")
    away = payload.get("away_team")

    # Index: (market_key, player_name, line) -> {bookmaker -> (over, under)}
    pivot: dict[tuple, dict[str, dict[str, float]]] = {}

    for book in payload.get("bookmakers", []) or []:
        book_key = book.get("key")
        for market in book.get("markets", []) or []:
            mkey = market.get("key")
            for outcome in market.get("outcomes", []) or []:
                # Outcome shape: name=Over/Under, description=player name,
                # point=line, price=american odds
                side = outcome.get("name")  # "Over" or "Under"
                player = outcome.get("description")
                line = outcome.get("point")
                price = outcome.get("price")
                if (
                    side not in ("Over", "Under")
                    or player is None
                    or line is None
                    or price is None
                ):
                    continue
                key = (mkey, player, float(line))
                pivot.setdefault(key, {}).setdefault(book_key, {})[side] = float(price)

    for (mkey, player, line), books in pivot.items():
        chosen_book = None
        chosen_over = None
        chosen_under = None
        # Prefer the first book in priority order that has BOTH sides.
        for bk in bookmaker_priority:
            sides = books.get(bk)
            if sides and "Over" in sides and "Under" in sides:
                chosen_book = bk
                chosen_over = sides["Over"]
                chosen_under = sides["Under"]
                break
        if chosen_book is None:
            # Fall back to any book with both sides
            for bk, sides in books.items():
                if "Over" in sides and "Under" in sides:
                    chosen_book = bk
                    chosen_over = sides["Over"]
                    chosen_under = sides["Under"]
                    break
        if chosen_book is None:
            # Skip incomplete markets (only one side quoted)
            continue
        out.append(
            {
                "gameId": event_id,
                "commenceTime": commence,
                "homeTeam": home,
                "awayTeam": away,
                "marketKey": mkey,
                "playerName": player,
                "line": float(line),
                "oddsOver": chosen_over,
                "oddsUnder": chosen_under,
                "impliedOver": implied_probability_from_american(chosen_over),
                "impliedUnder": implied_probability_from_american(chosen_under),
                "bookmaker": chosen_book,
            }
        )
    return out
