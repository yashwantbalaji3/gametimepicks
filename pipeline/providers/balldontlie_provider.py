"""
balldontlie API provider — primary game-log source.

Implements fetch_player_game_logs against balldontlie's /nba/v1/stats
endpoint. Other methods raise ProviderNotImplemented so the registry
chain falls through to nba_api for schedule/roster/box-score requests.

Includes a module-level rate limiter sized for the free tier (5 req/min)
so a batch of game-log fetches doesn't trigger 429s.

API base:    https://api.balldontlie.io
Free tier:   5 requests/minute, 60-sec window
Auth:        Authorization header (raw API key, no "Bearer" prefix)

Tunable via env (defaults are free-tier safe):
  BALLDONTLIE_REQUEST_INTERVAL_SECONDS — min seconds between requests (default 13)

Player-ID mapping (nba_api id → balldontlie id):
  Built lazily on first run by paginating /nba/v1/players/active and
  matching names via pipeline.player_resolver. Cached to
  pipeline/cache/balldontlie_player_index.json with a 7-day TTL.
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Optional

import requests

from .. import config as C
from .base import (
    Game, Player, GameLog,
    NBADataProvider,
    ProviderStatus,
    ProviderRequestFailed, ProviderUnavailable, ProviderNotImplemented,
    now_iso,
)


log = logging.getLogger(__name__)

API_BASE = "https://api.balldontlie.io"
PLAYER_INDEX_KEY = "player_index"
PLAYER_INDEX_TTL_HOURS = 168  # 7 days

_DEFAULT_INTERVAL_S = 13.0
try:
    _REQUEST_INTERVAL_S = float(
        os.getenv("BALLDONTLIE_REQUEST_INTERVAL_SECONDS", _DEFAULT_INTERVAL_S)
    )
except ValueError:
    _REQUEST_INTERVAL_S = _DEFAULT_INTERVAL_S

# Module-level rate limiter. Every balldontlie HTTP request goes through
# this so a burst of fetch_player_game_logs calls stays under the free-tier
# 5 req/min ceiling.
_RATE_LOCK = Lock()
_LAST_REQUEST_AT: float = 0.0


def _rate_limit_wait() -> None:
    """Sleep so that at least _REQUEST_INTERVAL_S seconds have passed
    since the last balldontlie request from this process."""
    global _LAST_REQUEST_AT
    with _RATE_LOCK:
        now = time.time()
        wait = _REQUEST_INTERVAL_S - (now - _LAST_REQUEST_AT)
        if wait > 0:
            time.sleep(wait)
        _LAST_REQUEST_AT = time.time()


def _do_get(url: str, key: str, params: dict | None = None,
            max_retries: int = 2) -> dict:
    """One rate-limited GET against balldontlie with simple 429 retry.
    Returns parsed JSON. Raises requests.RequestException on hard failure."""
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        _rate_limit_wait()
        try:
            r = requests.get(
                url,
                headers={"Authorization": key},
                params=params or {},
                timeout=15,
            )
            if r.status_code == 429:
                retry_after = r.headers.get("Retry-After")
                wait_s = int(retry_after) if retry_after and retry_after.isdigit() else 30
                log.warning(f"balldontlie 429, sleeping {wait_s}s (attempt {attempt+1})")
                time.sleep(wait_s)
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            last_exc = e
            if attempt < max_retries:
                time.sleep(5)
            continue
    raise last_exc or requests.RequestException("balldontlie request failed")


def _cache_path(key: str) -> Path:
    safe = key.replace("/", "_").replace(" ", "_")
    return C.CACHE_DIR / f"balldontlie_{safe}.json"


def _cache_get(key: str, ttl_hours: int | None = None) -> object | None:
    path = _cache_path(key)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
        cached_at = datetime.fromisoformat(payload["cached_at"])
        ttl = ttl_hours if ttl_hours is not None else C.CACHE_TTL_HOURS
        if datetime.now(timezone.utc) - cached_at < timedelta(hours=ttl):
            return payload["data"]
    except Exception:
        return None
    return None


def _cache_put(key: str, data: object) -> None:
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        _cache_path(key).write_text(json.dumps({
            "cached_at": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }))
    except Exception as e:
        log.warning(f"balldontlie cache write failed for {key}: {e}")


def _current_season() -> int:
    """NBA season convention: season N = N → N+1 (Oct N – Jun N+1)."""
    now = datetime.now()
    return now.year if now.month >= 10 else now.year - 1


class BallDontLieProvider(NBADataProvider):
    name = "balldontlie"
    tier = 1
    requires_api_key = True
    supported = {"game_logs"}

    def __init__(self) -> None:
        self._key = C.BALLDONTLIE_API_KEY
        self._enabled = C.ENABLE_BALLDONTLIE_FALLBACK
        self._player_index: dict[int, int] | None = None
        self._last_status = "not_run"
        self._last_error: Optional[str] = None
        self._last_run_at: Optional[str] = None

    def get_status(self) -> ProviderStatus:
        ok = bool(self._key) and self._enabled
        return ProviderStatus(
            name=self.name,
            kind="nba",
            tier=self.tier,
            enabled=ok,
            requires_api_key=True,
            api_key_configured=bool(self._key),
            is_demo=False,
            is_stub=False,
            last_status=self._last_status if ok else "not_configured",
            last_error=self._last_error,
            last_run_at=self._last_run_at,
            notes="balldontlie API. Game logs only. Rate-limited to free-tier safe.",
        )

    def _ensure_configured(self) -> None:
        if not self._key:
            raise ProviderUnavailable("BALLDONTLIE_API_KEY not set")
        if not self._enabled:
            raise ProviderUnavailable("ENABLE_BALLDONTLIE_FALLBACK=false")

    def _ensure_player_index(self) -> None:
        if self._player_index is not None:
            return
        cached = _cache_get(PLAYER_INDEX_KEY, ttl_hours=PLAYER_INDEX_TTL_HOURS)
        if cached is not None:
            try:
                self._player_index = {int(k): int(v) for k, v in cached.items()}
                log.info(f"balldontlie: loaded {len(self._player_index)} player mappings from cache")
                return
            except Exception as e:
                log.warning(f"balldontlie: cache parse failed, rebuilding: {e}")
        log.info("balldontlie: building player index (one-time, ~1-2 min on free tier)")
        try:
            self._player_index = self._build_player_index()
            _cache_put(PLAYER_INDEX_KEY, {str(k): v for k, v in self._player_index.items()})
        except Exception as e:
            raise ProviderRequestFailed(f"player index build failed: {e}") from e

    def _build_player_index(self) -> dict[int, int]:
        from ..player_resolver import resolve_player_id
        mapping: dict[int, int] = {}
        cursor = None
        page = 0
        max_pages = 20
        while page < max_pages:
            params: dict[str, object] = {"per_page": 100}
            if cursor is not None:
                params["cursor"] = cursor
            data = _do_get(f"{API_BASE}/nba/v1/players/active", self._key, params)
            players = data.get("data") or []
            for p in players:
                full_name = f"{p.get('first_name','')} {p.get('last_name','')}".strip()
                bdl_id = p.get("id")
                if not full_name or not isinstance(bdl_id, int):
                    continue
                nba_id, _conf = resolve_player_id(full_name)
                if nba_id and nba_id > 0:
                    mapping[int(nba_id)] = int(bdl_id)
            cursor = (data.get("meta") or {}).get("next_cursor")
            page += 1
            if not cursor or not players:
                break
        log.info(f"balldontlie: built player index with {len(mapping)} mappings ({page} pages)")
        return mapping

    def fetch_player_game_logs(self, player_id: int, last_n: int = 10) -> list[GameLog]:
        self._ensure_configured()
        self._ensure_player_index()

        bdl_id = (self._player_index or {}).get(int(player_id))
        if not bdl_id:
            raise ProviderRequestFailed(
                f"player_id {player_id} not in balldontlie index"
            )

        cache_key = f"gamelogs_{player_id}_{last_n}"
        cached = _cache_get(cache_key)
        if cached is not None:
            self._mark_ok()
            try:
                return [GameLog(**row) for row in cached]
            except Exception:
                pass

        season = _current_season()
        try:
            data = _do_get(
                f"{API_BASE}/nba/v1/stats",
                self._key,
                params={
                    "player_ids[]": bdl_id,
                    "seasons[]": season,
                    "per_page": 100,
                },
            )
        except requests.RequestException as e:
            self._mark_err(str(e))
            raise ProviderRequestFailed(f"balldontlie game logs failed: {e}") from e
        except Exception as e:
            self._mark_err(str(e))
            raise ProviderRequestFailed(f"balldontlie parse error: {e}") from e

        stats = data.get("data") or []
        stats.sort(
            key=lambda s: (s.get("game") or {}).get("date", ""),
            reverse=True,
        )
        stats = stats[:last_n]

        logs: list[GameLog] = []
        for s in stats:
            game = s.get("game") or {}
            team = s.get("team") or {}
            home_team_id = game.get("home_team_id")
            visitor_team_id = game.get("visitor_team_id")
            this_team_id = team.get("id")
            if this_team_id == home_team_id:
                home_away = "Home"
            elif this_team_id == visitor_team_id:
                home_away = "Away"
            else:
                home_away = "Home"
            game_date = (game.get("date") or "")[:10]
            min_str = str(s.get("min") or "0")
            try:
                minutes = float(min_str.split(":")[0]) if ":" in min_str else float(min_str)
            except ValueError:
                minutes = 0.0
            logs.append(GameLog(
                player_id=int(player_id),
                game_date=game_date,
                opponent_abbr="",
                home_away=home_away,
                minutes=minutes,
                pts=int(s.get("pts") or 0),
                reb=int(s.get("reb") or 0),
                ast=int(s.get("ast") or 0),
            ))

        _cache_put(cache_key, [vars(g) for g in logs])
        self._mark_ok()
        return logs

    def fetch_schedule(self, date: str) -> list[Game]:
        raise ProviderNotImplemented("balldontlie.fetch_schedule — nba_api handles this")

    def fetch_team_roster(self, team_abbr: str) -> list[Player]:
        raise ProviderNotImplemented("balldontlie.fetch_team_roster — nba_api handles this")

    def fetch_box_score(self, game_id: str) -> list[GameLog]:
        raise ProviderNotImplemented("balldontlie.fetch_box_score — nba_api handles this")

    def _mark_ok(self) -> None:
        self._last_status = "ok"
        self._last_error = None
        self._last_run_at = now_iso()

    def _mark_err(self, msg: str) -> None:
        self._last_status = "error"
        self._last_error = msg
        self._last_run_at = now_iso()
