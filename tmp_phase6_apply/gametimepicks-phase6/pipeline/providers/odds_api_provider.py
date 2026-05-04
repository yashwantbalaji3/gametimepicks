"""
The Odds API provider.

API: https://the-odds-api.com/
Free tier: 500 requests/month. Each NBA prop fetch costs ~1 credit per market
per region, so a daily run with 3 markets (PTS/REB/AST) costs ~3 credits.

Workflow:
  1. /sports/basketball_nba/events  → list of upcoming games + event_ids
  2. for each event_id:
       /sports/basketball_nba/events/{event_id}/odds?markets=player_points,...
     → returns prop lines per bookmaker
  3. We pick a single canonical bookmaker (configurable, default = best price
     across configured books) and emit one PropLine per (player, market).

This gets called once per day. Responses are cached for CACHE_TTL_HOURS to
avoid burning credits on reruns.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .. import config as C
from .base import (
    PropLine,
    OddsProvider,
    ProviderStatus, ProviderError, ProviderRequestFailed, ProviderUnavailable,
    now_iso,
)


API_BASE = "https://api.the-odds-api.com/v4"
SPORT_KEY = "basketball_nba"

# Map our market labels to The Odds API's market keys
MARKET_MAP = {
    "PTS": "player_points",
    "REB": "player_rebounds",
    "AST": "player_assists",
}
INVERSE_MARKET_MAP = {v: k for k, v in MARKET_MAP.items()}


def _cache_path(key: str) -> Path:
    safe = key.replace("/", "_").replace(" ", "_")
    return C.CACHE_DIR / f"odds_api_{safe}.json"


def _cache_get(key: str) -> object | None:
    path = _cache_path(key)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
        cached_at = datetime.fromisoformat(payload["cached_at"])
        age = datetime.now(timezone.utc) - cached_at
        if age < timedelta(hours=C.CACHE_TTL_HOURS):
            return payload["data"]
    except Exception:
        return None
    return None


def _cache_put(key: str, data: object) -> None:
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(key)
    path.write_text(json.dumps({
        "cached_at": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }))


def _http_get(url: str, params: dict[str, str]) -> object:
    """GET with retries. Returns parsed JSON."""
    import requests

    last_err: Exception | None = None
    for attempt in range(C.HTTP_MAX_RETRIES):
        try:
            r = requests.get(url, params=params, timeout=C.HTTP_TIMEOUT_SECONDS)
            if r.status_code == 401:
                raise ProviderUnavailable("Odds API: invalid or missing API key")
            if r.status_code == 429:
                raise ProviderRequestFailed("Odds API: rate-limited (429)")
            r.raise_for_status()
            return r.json()
        except ProviderUnavailable:
            raise
        except Exception as e:
            last_err = e
            if attempt < C.HTTP_MAX_RETRIES - 1:
                time.sleep(C.HTTP_BACKOFF_SECONDS * (attempt + 1))
    raise ProviderRequestFailed(f"Odds API request failed: {last_err}")


class OddsApiProvider(OddsProvider):
    name = "the_odds_api"
    tier = 1
    requires_api_key = True
    supported = {"player_points", "player_rebounds", "player_assists"}

    def __init__(self) -> None:
        self._last_status = "not_run"
        self._last_error: str | None = None
        self._last_run_at: str | None = None
        self._key = C.ODDS_API_KEY

    # -- status --------------------------------------------------------------
    def _is_configured(self) -> bool:
        return bool(self._key)

    def get_status(self) -> ProviderStatus:
        configured = self._is_configured()
        return ProviderStatus(
            name=self.name,
            kind="odds",
            tier=self.tier,
            enabled=configured,
            requires_api_key=True,
            api_key_configured=configured,
            is_demo=False,
            is_stub=False,
            last_status=self._last_status if configured else "not_configured",
            last_error=self._last_error,
            last_run_at=self._last_run_at,
            notes=(
                "the-odds-api.com — free tier 500 req/month. "
                + ("Active." if configured else "Set ODDS_API_KEY in .env to enable.")
            ),
        )

    # -- queries -------------------------------------------------------------
    def fetch_props(
        self,
        date: str,
        markets: list[str] | None = None,
    ) -> list[PropLine]:
        if not self._is_configured():
            raise ProviderUnavailable("ODDS_API_KEY not set in environment")

        wanted = list(markets) if markets else list(C.ODDS_API_MARKETS_DEFAULT)
        # Normalize: accept either ("PTS","REB") or ("player_points","player_rebounds")
        wanted_keys = []
        for m in wanted:
            if m in MARKET_MAP:
                wanted_keys.append(MARKET_MAP[m])
            elif m in INVERSE_MARKET_MAP:
                wanted_keys.append(m)
            else:
                # Unknown — skip rather than fail the whole call
                continue

        cache_key = f"props_{date}_{'_'.join(sorted(wanted_keys))}"
        cached = _cache_get(cache_key)
        if cached is not None:
            self._mark_ok()
            return [PropLine(**row) for row in cached]

        try:
            # Step 1: list events for the date window (today + tomorrow ET)
            events = _http_get(
                f"{API_BASE}/sports/{SPORT_KEY}/events",
                params={
                    "apiKey": self._key,
                    "dateFormat": "iso",
                },
            )
            if not isinstance(events, list):
                raise ProviderRequestFailed("Odds API: events response shape unexpected")

            # Filter to events on the given date
            wanted_events = []
            for ev in events:
                commence = ev.get("commence_time", "")
                if commence.startswith(date):
                    wanted_events.append(ev)

            # Step 2: for each event, fetch the prop markets
            props: list[PropLine] = []
            for ev in wanted_events:
                event_id = ev.get("id")
                if not event_id:
                    continue
                params: dict[str, str] = {
                    "apiKey": self._key,
                    "regions": C.ODDS_API_REGION,
                    "markets": ",".join(wanted_keys),
                    "oddsFormat": "american",
                    "dateFormat": "iso",
                }
                if C.ODDS_API_BOOKMAKERS:
                    params["bookmakers"] = C.ODDS_API_BOOKMAKERS

                event_odds = _http_get(
                    f"{API_BASE}/sports/{SPORT_KEY}/events/{event_id}/odds",
                    params=params,
                )

                home = event_odds.get("home_team", "")
                away = event_odds.get("away_team", "")

                # Take the first bookmaker (most providers return one canonical
                # set if you specify bookmakers; otherwise the first listed).
                bookmakers = event_odds.get("bookmakers", [])
                if not bookmakers:
                    continue
                bk = bookmakers[0]
                bk_key = bk.get("key", "unknown")

                for market in bk.get("markets", []):
                    market_key = market.get("key", "")
                    if market_key not in INVERSE_MARKET_MAP:
                        continue
                    our_market = INVERSE_MARKET_MAP[market_key]

                    # Outcomes come as Over/Under per player
                    by_player: dict[str, dict] = {}
                    for o in market.get("outcomes", []):
                        player_name = o.get("description") or o.get("name", "")
                        side = o.get("name", "").lower()  # "Over" or "Under"
                        line = o.get("point")
                        price = o.get("price")
                        if line is None or price is None:
                            continue
                        d = by_player.setdefault(
                            player_name,
                            {"line": line, "over": None, "under": None}
                        )
                        if "over" in side:
                            d["over"] = int(price)
                        elif "under" in side:
                            d["under"] = int(price)
                        d["line"] = line

                    for pname, sides in by_player.items():
                        if sides["over"] is None or sides["under"] is None:
                            continue
                        # Best-effort team association — Odds API doesn't tag
                        # the player's team. We leave it blank; the model
                        # joiner attaches team via NBA roster data.
                        props.append(PropLine(
                            player_id=0,  # joined later
                            player_name=pname,
                            team_abbr="",
                            market=our_market,
                            line=float(sides["line"]),
                            odds_over=int(sides["over"]),
                            odds_under=int(sides["under"]),
                            bookmaker=bk_key,
                            game_date=date,
                            last_update=event_odds.get("last_update", now_iso()),
                        ))

            _cache_put(cache_key, [vars(p) for p in props])
            self._mark_ok()
            return props
        except ProviderError:
            raise
        except Exception as e:
            self._mark_err(str(e))
            raise ProviderRequestFailed(f"odds_api fetch_props failed: {e}") from e

    # -- internal ------------------------------------------------------------
    def _mark_ok(self) -> None:
        self._last_status = "ok"
        self._last_error = None
        self._last_run_at = now_iso()

    def _mark_err(self, msg: str) -> None:
        self._last_status = "error"
        self._last_error = msg
        self._last_run_at = now_iso()
