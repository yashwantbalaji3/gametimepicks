"""
The Odds API provider — Phase 7B-2.

API: https://the-odds-api.com/
Free tier: 500 credits per month, resets on the 1st.

Endpoint cost model:
  GET /v4/sports/basketball_nba/events                     FREE (events list)
  GET /v4/sports/basketball_nba/events/{id}/odds           markets × regions
                                                           per call
  Empty responses do NOT count against quota.
  Quota is exposed in response headers: x-requests-remaining, x-requests-used,
  x-requests-last.

Budget math with our defaults:
  ODDS_MARKETS = player_points, player_rebounds, player_assists  (3)
  ODDS_REGIONS = us                                              (1)
  ODDS_MAX_EVENTS_PER_RUN = 6                                    (cap)
  → 6 × 3 × 1 = 18 credits per pipeline run
  → 500 / 18 ≈ 27 runs per month before depletion

The provider is fail-closed: if anything goes wrong it returns a diagnostic
dict with fetch_succeeded=False and a failure_reason, never fabricated data.
The orchestrator decides whether to render "no_props_returned" vs
"odds_provider_failed" based on the diag.

Player→team association: The Odds API doesn't tag the player's team on the
prop, but it DOES include `home_team` and `away_team` on the event. We pass
those through so the orchestrator can match props to schedule games.
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

# Map our market labels to The Odds API market keys
MARKET_MAP = {
    "PTS": "player_points",
    "REB": "player_rebounds",
    "AST": "player_assists",
}
INVERSE_MARKET_MAP = {v: k for k, v in MARKET_MAP.items()}


# ---------------------------------------------------------------------------
# Cache (minute-precision TTL, separate from nba_api's hour-precision cache)
# ---------------------------------------------------------------------------
def _cache_path(key: str) -> Path:
    safe = key.replace("/", "_").replace(" ", "_")
    return C.CACHE_DIR / f"odds_api_{safe}.json"


def _cache_get(key: str) -> tuple[object, datetime] | None:
    """Returns (data, cached_at) tuple if fresh, else None."""
    path = _cache_path(key)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
        cached_at = datetime.fromisoformat(payload["cached_at"])
        age = datetime.now(timezone.utc) - cached_at
        if age < timedelta(minutes=C.ODDS_CACHE_TTL_MINUTES):
            return payload["data"], cached_at
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


# ---------------------------------------------------------------------------
# HTTP with quota header capture
# ---------------------------------------------------------------------------
def _http_get(url: str, params: dict[str, str]) -> tuple[object, dict[str, str]]:
    """GET with retries. Returns (parsed_json, response_headers).

    Raises ProviderUnavailable on 401 (auth issue — surfaced specially so we
    can mark the provider not_configured rather than failed). Raises
    ProviderRequestFailed on other terminal errors after retries.
    """
    import requests

    last_err: Exception | None = None
    for attempt in range(C.HTTP_MAX_RETRIES):
        try:
            r = requests.get(url, params=params, timeout=C.HTTP_TIMEOUT_SECONDS)
            if r.status_code == 401:
                raise ProviderUnavailable("Odds API: invalid or missing API key")
            if r.status_code == 422:
                # Bad request — markets not supported, etc. Don't retry.
                raise ProviderRequestFailed(
                    f"Odds API: 422 — {r.text[:200]}"
                )
            if r.status_code == 429:
                raise ProviderRequestFailed(
                    "Odds API: rate-limited (429) — quota likely exhausted"
                )
            r.raise_for_status()
            return r.json(), dict(r.headers)
        except ProviderUnavailable:
            raise
        except ProviderRequestFailed:
            raise
        except Exception as e:
            last_err = e
            if attempt < C.HTTP_MAX_RETRIES - 1:
                time.sleep(C.HTTP_BACKOFF_SECONDS * (attempt + 1))
    raise ProviderRequestFailed(f"Odds API request failed: {last_err}")


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------
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
        self._quota_remaining: int | None = None
        self._quota_used: int | None = None
        self._last_call_cost: int | None = None

    def _is_configured(self) -> bool:
        return bool(self._key)

    def get_status(self) -> ProviderStatus:
        configured = self._is_configured()
        notes = "the-odds-api.com — free tier 500 credits/month."
        if configured:
            notes += " Active."
            if self._quota_remaining is not None:
                notes += f" Remaining: {self._quota_remaining}."
        else:
            notes += " Set ODDS_API_KEY in .env to enable."
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
            notes=notes,
        )

    # -- Phase 7B-2 diagnostic API --------------------------------------------
    def fetch_props_with_diagnostics(
        self,
        date: str,
        slate_games: list[dict] | None = None,
        markets: list[str] | None = None,
    ) -> dict:
        """Fetch player-prop odds for a date, with full diagnostic metadata.

        Args:
            date: YYYY-MM-DD (in pipeline timezone, usually America/New_York)
            slate_games: optional list of game dicts from the schedule
                resolution, used to scope odds fetching to games we already
                know about and to attach team abbreviations to props.
            markets: optional list of markets — defaults to C.ODDS_MARKETS

        Returns dict with:
            props:                   list[PropLine]   parsed prop rows
            fetch_attempted:         bool             did we try at all
            fetch_succeeded:         bool             did at least one event
                                                       fetch return without error
            failure_reason:          str | None       error message if all failed
            raw_event_count:         int              events returned by /events
            matched_event_count:     int              events that matched our slate
            attempted_event_count:   int              events we actually fetched
            parsed_prop_count:       int              prop rows parsed
            cache_status:            str              "fresh" | "stale" | "miss"
            quota_remaining:         int | None       from x-requests-remaining
            quota_used:              int | None       from x-requests-used
            last_call_cost:          int | None       from x-requests-last
            cost_estimate_per_run:   int              markets × regions × events
            bookmakers:              list[str]
            markets_requested:       list[str]
            regions:                 str
            generated_at:            str (ISO)
            cached_at:               str | None       when cached payload was made
        """
        wanted = list(markets) if markets else list(C.ODDS_MARKETS)
        wanted_keys = self._normalize_markets(wanted)

        diag: dict = {
            "props": [],
            "fetch_attempted": False,
            "fetch_succeeded": False,
            "failure_reason": None,
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
            "markets_requested": wanted_keys,
            "regions": ",".join(C.ODDS_REGIONS),
            "generated_at": now_iso(),
            "cached_at": None,
        }

        if not self._is_configured():
            diag["failure_reason"] = "ODDS_API_KEY not set"
            return diag

        # Cache key includes date + markets + bookmakers + regions
        cache_key = (
            f"props_{date}_"
            f"{'-'.join(sorted(wanted_keys))}_"
            f"{','.join(C.ODDS_BOOKMAKERS) or 'any'}_"
            f"{','.join(C.ODDS_REGIONS)}"
        )
        cached = _cache_get(cache_key)
        if cached is not None:
            cached_data, cached_at = cached
            if isinstance(cached_data, dict) and "props" in cached_data:
                diag["props"] = [PropLine(**row) for row in cached_data["props"]]
                diag["fetch_attempted"] = True
                diag["fetch_succeeded"] = True
                diag["raw_event_count"] = cached_data.get("raw_event_count", 0)
                diag["matched_event_count"] = cached_data.get("matched_event_count", 0)
                diag["attempted_event_count"] = cached_data.get("attempted_event_count", 0)
                diag["parsed_prop_count"] = len(diag["props"])
                diag["cache_status"] = "fresh"
                diag["cached_at"] = cached_at.isoformat()
                self._mark_ok()
                return diag

        diag["fetch_attempted"] = True

        # Step 1 — list events for the date window. /events is FREE.
        try:
            events, headers = self._fetch_events_for_date(date)
            self._update_quota_from_headers(headers, diag)
        except ProviderUnavailable as e:
            diag["failure_reason"] = str(e)
            self._mark_err(str(e))
            return diag
        except ProviderRequestFailed as e:
            diag["failure_reason"] = str(e)
            self._mark_err(str(e))
            return diag

        diag["raw_event_count"] = len(events)

        # Step 2 — match against the slate so we don't waste credits on games
        # we don't show. If slate_games is None we just take the first
        # MAX_EVENTS_PER_RUN events.
        matched_events = self._match_events_to_slate(events, slate_games or [])
        diag["matched_event_count"] = len(matched_events)

        # Step 3 — apply per-run budget cap
        budget_cap = C.ODDS_MAX_EVENTS_PER_RUN
        events_to_fetch = matched_events[:budget_cap]
        diag["attempted_event_count"] = len(events_to_fetch)
        diag["cost_estimate_per_run"] = (
            len(events_to_fetch) * len(wanted_keys) * 1  # 1 region for now
        )

        # Step 4 — fetch each event's odds
        all_props: list[PropLine] = []
        any_succeeded = len(events_to_fetch) == 0  # vacuously true if 0
        last_err: str | None = None

        for ev in events_to_fetch:
            event_id = ev.get("id")
            if not event_id:
                continue
            try:
                props_for_event = self._fetch_event_odds(
                    event_id=event_id,
                    event_meta=ev,
                    wanted_keys=wanted_keys,
                    date=date,
                )
                all_props.extend(props_for_event)
                any_succeeded = True
            except ProviderUnavailable as e:
                # Auth lost mid-run — bail completely
                diag["failure_reason"] = str(e)
                self._mark_err(str(e))
                return diag
            except ProviderRequestFailed as e:
                last_err = str(e)
                # Continue — partial results still useful
                continue

        if any_succeeded:
            diag["fetch_succeeded"] = True
        else:
            diag["failure_reason"] = last_err or "all event-odds fetches failed"

        diag["props"] = all_props
        diag["parsed_prop_count"] = len(all_props)

        # Step 5 — cache the result (only if at least one event succeeded)
        if diag["fetch_succeeded"]:
            cacheable = {
                "props": [vars(p) for p in all_props],
                "raw_event_count": diag["raw_event_count"],
                "matched_event_count": diag["matched_event_count"],
                "attempted_event_count": diag["attempted_event_count"],
            }
            try:
                _cache_put(cache_key, cacheable)
            except Exception:
                pass
            self._mark_ok()
        else:
            self._mark_err(diag["failure_reason"] or "unknown")

        return diag

    # -- legacy method (back-compat with provider chain registry) -------------
    def fetch_props(
        self,
        date: str,
        markets: list[str] | None = None,
    ) -> list[PropLine]:
        """Legacy non-diagnostic API. Phase 7B-2 callers should use
        fetch_props_with_diagnostics()."""
        if not self._is_configured():
            raise ProviderUnavailable("ODDS_API_KEY not set in environment")
        diag = self.fetch_props_with_diagnostics(date, markets=markets)
        if diag["fetch_succeeded"]:
            return diag["props"]
        raise ProviderRequestFailed(diag["failure_reason"] or "unknown")

    # -- internals ------------------------------------------------------------
    def _normalize_markets(self, wanted: list[str]) -> list[str]:
        """Accept either ('PTS','REB') or ('player_points','player_rebounds')."""
        keys: list[str] = []
        for m in wanted:
            if m in MARKET_MAP:
                keys.append(MARKET_MAP[m])
            elif m in INVERSE_MARKET_MAP:
                keys.append(m)
            # Unknown markets are silently dropped — fail-closed for budget
        return keys

    def _fetch_events_for_date(self, date: str) -> tuple[list, dict]:
        """List events whose commence_time is on `date` in ET.

        Use commenceTimeFrom and commenceTimeTo to scope server-side. The
        `date` is in pipeline TZ (America/New_York by default), but the API
        wants UTC ISO timestamps. Convert: ET 00:00 → UTC, ET 23:59 → UTC.
        """
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(C.TIMEZONE)
        local_start = datetime.fromisoformat(date).replace(tzinfo=tz)
        local_end = local_start + timedelta(days=1)
        utc_start = local_start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        utc_end = local_end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        params = {
            "apiKey": self._key,
            "dateFormat": "iso",
            "commenceTimeFrom": utc_start,
            "commenceTimeTo": utc_end,
        }
        events, headers = _http_get(
            f"{API_BASE}/sports/{SPORT_KEY}/events",
            params=params,
        )
        if not isinstance(events, list):
            raise ProviderRequestFailed(
                "Odds API: events response shape unexpected"
            )
        return events, headers

    def _match_events_to_slate(
        self,
        events: list[dict],
        slate_games: list[dict],
    ) -> list[dict]:
        """Match Odds API events to slate game dicts.

        Slate games have `homeTeamFull` like 'New York Knicks'. Odds API
        events have `home_team` like 'New York Knicks'. Direct match works
        for ~all real cases. If slate_games is empty, we return all events
        (truncated by budget cap downstream).
        """
        if not slate_games:
            return events

        slate_pairs = set()
        for g in slate_games:
            home = (g.get("homeTeamFull") or "").lower().strip()
            away = (g.get("awayTeamFull") or "").lower().strip()
            if home and away:
                slate_pairs.add((home, away))

        matched: list[dict] = []
        for ev in events:
            home = (ev.get("home_team") or "").lower().strip()
            away = (ev.get("away_team") or "").lower().strip()
            if (home, away) in slate_pairs:
                matched.append(ev)
        return matched

    def _fetch_event_odds(
        self,
        event_id: str,
        event_meta: dict,
        wanted_keys: list[str],
        date: str,
    ) -> list[PropLine]:
        """Fetch odds for one event. Costs (markets × regions) credits."""
        params: dict[str, str] = {
            "apiKey": self._key,
            "regions": ",".join(C.ODDS_REGIONS),
            "markets": ",".join(wanted_keys),
            "oddsFormat": "american",
            "dateFormat": "iso",
        }
        bookmakers_csv = ",".join(C.ODDS_BOOKMAKERS)
        if bookmakers_csv:
            params["bookmakers"] = bookmakers_csv

        event_odds, headers = _http_get(
            f"{API_BASE}/sports/{SPORT_KEY}/events/{event_id}/odds",
            params=params,
        )
        # Update quota from this call's headers
        self._update_quota_from_headers(headers, diag={})

        return self._parse_event_props(event_odds, event_meta, date)

    def _parse_event_props(
        self,
        event_odds: dict,
        event_meta: dict,
        date: str,
    ) -> list[PropLine]:
        """Parse the event-odds response into PropLine objects."""
        if not isinstance(event_odds, dict):
            return []

        home_team = event_odds.get("home_team") or event_meta.get("home_team", "")
        away_team = event_odds.get("away_team") or event_meta.get("away_team", "")
        bookmakers = event_odds.get("bookmakers", []) or []

        props: list[PropLine] = []

        for bk in bookmakers:
            if not isinstance(bk, dict):
                continue
            bk_key = bk.get("key", "unknown")

            for market in bk.get("markets", []) or []:
                market_key = market.get("key", "")
                if market_key not in INVERSE_MARKET_MAP:
                    continue
                our_market = INVERSE_MARKET_MAP[market_key]

                # Outcomes are pairs of Over/Under per player. Group by player.
                by_player: dict[str, dict] = {}
                for o in market.get("outcomes", []) or []:
                    player_name = o.get("description") or o.get("name", "")
                    side = (o.get("name", "") or "").lower()
                    line = o.get("point")
                    price = o.get("price")
                    if not player_name or line is None or price is None:
                        continue
                    d = by_player.setdefault(
                        player_name,
                        {"line": line, "over": None, "under": None},
                    )
                    if "over" in side:
                        d["over"] = int(price)
                    elif "under" in side:
                        d["under"] = int(price)
                    d["line"] = line

                for pname, sides in by_player.items():
                    if sides["over"] is None or sides["under"] is None:
                        # Skip if we don't have both sides — model requires it
                        continue
                    props.append(PropLine(
                        player_id=0,  # joined later via roster lookup
                        player_name=pname,
                        team_abbr="",  # joined later via player→team lookup
                        market=our_market,
                        line=float(sides["line"]),
                        odds_over=int(sides["over"]),
                        odds_under=int(sides["under"]),
                        bookmaker=bk_key,
                        game_date=date,
                        last_update=event_odds.get(
                            "last_update", now_iso(),
                        ),
                        event_home_team=home_team,
                        event_away_team=away_team,
                    ))

        return props

    def _update_quota_from_headers(self, headers: dict, diag: dict) -> None:
        try:
            rem = headers.get("x-requests-remaining")
            used = headers.get("x-requests-used")
            last = headers.get("x-requests-last")
            if rem is not None:
                self._quota_remaining = int(rem)
                if "quota_remaining" in diag or diag is not None:
                    diag["quota_remaining"] = int(rem)
            if used is not None:
                self._quota_used = int(used)
                if diag is not None:
                    diag["quota_used"] = int(used)
            if last is not None:
                self._last_call_cost = int(last)
                if diag is not None:
                    diag["last_call_cost"] = int(last)
        except Exception:
            pass

    def _mark_ok(self) -> None:
        self._last_status = "ok"
        self._last_error = None
        self._last_run_at = now_iso()

    def _mark_err(self, msg: str) -> None:
        self._last_status = "error"
        self._last_error = msg
        self._last_run_at = now_iso()


def _split_bookmakers(s: str) -> list[str]:
    if not s:
        return []
    return [b.strip() for b in s.split(",") if b.strip()]
