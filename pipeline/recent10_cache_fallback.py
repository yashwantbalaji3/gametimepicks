"""
Stale-cache fallback for NBA recent10 game-log fetches.

Background
==========
The morning pipeline attaches `recent10` to every NBA lean by calling
``fetch_player_game_logs`` (nba_api via ``pipeline.providers.nba_api_provider``).
That provider has a 12-hour fresh-cache TTL and a 25-second HTTP timeout
per request. When ``stats.nba.com`` is unresponsive (the documented
2026-05-28 outage), every live call times out, the 12-hour cache often
expires, and the workflow ends up emitting an NBA board with zero
``recent10`` values. The R1 guardrail then correctly downgrades every
NBA lean to ``lean="No Play"``/``confidence="insufficient_data"`` and
the optimizer correctly produces no NBA-only or Mixed slips.

This module is the lowest-risk fix: when the live fetch fails, fall back
to the SAME ``pipeline/cache/nba_api_gamelogs_<pid>_<n>.json`` file the
provider already populated on a healthier day. We:

  1. Accept the cache up to ``max_age_days`` old (default 14) — wider than
     the provider's 12-hour fresh TTL.
  2. Filter out any cached game whose ``game_date`` is on or after the
     target slate date — belt-and-suspenders so we never let a future
     game leak in.
  3. Return the cached ``cached_at`` timestamp so the caller can stamp
     ``_recent10Source`` + ``_recent10CachedAt`` on the lean for honest
     provenance.

What this module is NOT
=======================
  * NOT a way to invent recent-game values when no real cache exists.
  * NOT a way to use today's in-progress game data — the ``game_date``
    filter rejects same-day entries.
  * NOT a way to bypass the R1 guardrail. R1 already runs on the
    populated ``recent10`` array; if cached values are enough to clear
    the threshold, the existing rescue logic in ``attach_recent10.py``
    (lines 219–239) restores the model's ORIGINAL pre-suppression
    confidence and derives the lean side from the model's projection vs
    the book line — never from outcomes.

Pure local I/O. No network. No paid API calls.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from . import config as C
from .providers import GameLog


log = logging.getLogger(__name__)


# Default fallback window. Game logs describe finished games whose box
# scores are immutable, so a 14-day stale-cache acceptance is honest:
# we're using real prior recent-form history, just one or two days older
# than ideal. Tuneable via the function arg.
DEFAULT_STALE_TTL_DAYS = 14


def _cache_path_for_player(player_id: int, last_n: int) -> Path:
    """Resolve the cache path the nba_api provider would have written."""
    return C.CACHE_DIR / f"nba_api_gamelogs_{player_id}_{last_n}.json"


def load_stale_recent10_cache(
    player_id: int,
    *,
    last_n: int = 10,
    target_date: str | None = None,
    max_age_days: int = DEFAULT_STALE_TTL_DAYS,
) -> tuple[list[GameLog] | None, str | None]:
    """Read the existing nba_api game-log cache file and return its
    contents as a ``list[GameLog]`` plus the original ``cached_at``
    ISO string, or ``(None, None)`` if no usable cache exists.

    Parameters
    ----------
    player_id : int
        The NBA player ID to look up.
    last_n : int, default 10
        Mirrors the ``last_n`` the provider uses to key the cache file.
    target_date : str | None
        ``YYYY-MM-DD`` of the slate this fetch is for. When provided,
        any cached game with ``game_date >= target_date`` is dropped
        — this prevents a future game from ever sneaking into the
        recent-form array.
    max_age_days : int, default 14
        Maximum staleness allowed for the cache file's ``cached_at``
        timestamp.

    Returns
    -------
    (logs, cached_at_iso) where ``logs`` is a list of ``GameLog``
    instances (possibly empty after the date filter) or ``None`` when
    the cache file is absent, malformed, expired, or has no rows.
    """
    if player_id <= 0:
        return None, None
    path = _cache_path_for_player(player_id, last_n)
    if not path.exists():
        return None, None
    try:
        payload = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None, None
    cached_at_raw = payload.get("cached_at")
    if not isinstance(cached_at_raw, str):
        return None, None
    try:
        cached_at = datetime.fromisoformat(cached_at_raw)
    except ValueError:
        return None, None
    # Reject ancient caches even when ``stats.nba.com`` is down —
    # 14-day-old game logs are real history; 3-month-old logs are
    # likely from the previous season and would mislead the model.
    age = datetime.now(timezone.utc) - cached_at
    if age.days > max_age_days:
        return None, None

    rows = payload.get("data")
    if not isinstance(rows, list):
        return None, None

    logs: list[GameLog] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        # Belt-and-suspenders: drop any cached game that would describe
        # today's or a future game. Cached rows have an ISO ``game_date``
        # written by the provider — see nba_api_provider.fetch_player_game_logs.
        game_date = row.get("game_date")
        if target_date and isinstance(game_date, str) and game_date >= target_date:
            continue
        try:
            logs.append(GameLog(**row))
        except TypeError:
            # Cache schema drift — skip the row honestly rather than crash.
            continue

    if not logs:
        return None, None
    return logs, cached_at_raw


def cache_age_label(cached_at_iso: str | None) -> str:
    """Compact human-readable age (e.g. ``"2d 03h"``) for log/UI use.

    Pure helper — no I/O. Returns ``"unknown"`` on parse failure.
    """
    if not cached_at_iso:
        return "unknown"
    try:
        cached_at = datetime.fromisoformat(cached_at_iso)
    except ValueError:
        return "unknown"
    delta = datetime.now(timezone.utc) - cached_at
    total_seconds = max(int(delta.total_seconds()), 0)
    days, rem = divmod(total_seconds, 86_400)
    hours, _ = divmod(rem, 3_600)
    if days > 0:
        return f"{days}d {hours:02d}h"
    return f"{hours}h"
