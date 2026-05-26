"""
Phase 8.1 — pure recent10 extractor.

Given a list of game-log records (or dicts) and a market label, return
the last-10 stat values in chronological order (OLDEST → NEWEST).

Why oldest-to-newest:
  Sparkline rendering reads left-to-right. Oldest on the left, newest
  on the right means an upward slope = improving; downward = declining.
  This matches viewer intuition.

Input shape:
  Each log entry must have at least:
    - game_date: "YYYY-MM-DD"
    - pts (int or float)
    - reb (int or float)
    - ast (int or float)
  Both dataclass-like objects (with attributes) and plain dicts are
  accepted, so this works with `pipeline.providers.base.GameLog`
  instances and with serialized JSON.

If a stat value is missing or non-numeric for a particular log entry,
that ENTIRE entry is dropped (we don't want a sparkline with zeros
that didn't actually happen). If FEWER than 1 valid entry exists,
returns an empty list — frontend then shows the "no trend" fallback.

Honest framing: this never invents data. No padding, no zero-fill,
no interpolation.
"""
from __future__ import annotations

from typing import Any, Iterable

SUPPORTED_MARKETS = ("PTS", "REB", "AST")

# Map market label → log attribute / dict key
_MARKET_TO_FIELD = {
    "PTS": "pts",
    "REB": "reb",
    "AST": "ast",
}


def _get_field(log: Any, key: str) -> Any:
    """Read `key` from either an attribute or a dict entry."""
    if isinstance(log, dict):
        return log.get(key)
    return getattr(log, key, None)


def _is_real_number(v: Any) -> bool:
    if isinstance(v, bool):
        return False
    if not isinstance(v, (int, float)):
        return False
    if v != v:  # NaN
        return False
    return True


def extract_recent10(
    logs: Iterable[Any],
    market: str,
    *,
    last_n: int = 10,
) -> list[float]:
    """
    Extract the most recent N stat values for `market` from `logs`.

    Args:
      logs: iterable of game-log entries (dataclass instances or dicts).
            Each entry must have `game_date` and the stat field.
      market: one of "PTS", "REB", "AST" (case-sensitive).
      last_n: how many most-recent entries to return (default 10).

    Returns:
      List of floats in OLDEST → NEWEST order, length 0..last_n.
      Empty list when:
        - market unsupported
        - logs empty
        - no log has a valid game_date AND a valid numeric stat value
    """
    if market not in SUPPORTED_MARKETS:
        return []

    field = _MARKET_TO_FIELD[market]
    if not isinstance(last_n, int) or last_n <= 0:
        return []

    # Filter to only entries with both a valid game_date and a valid
    # numeric stat value for this market.
    valid: list[tuple[str, float]] = []
    for log in logs or []:
        date = _get_field(log, "game_date")
        if not isinstance(date, str) or len(date) < 8:
            continue
        v = _get_field(log, field)
        if not _is_real_number(v):
            continue
        valid.append((date, float(v)))

    if not valid:
        return []

    # Sort ascending by game_date (oldest first), break ties with
    # original index for determinism.
    valid_indexed = list(enumerate(valid))
    valid_indexed.sort(key=lambda t: (t[1][0], t[0]))

    # Take the last N (most recent) — already in oldest→newest order.
    sorted_rows = [pair for _, pair in valid_indexed]
    if len(sorted_rows) > last_n:
        sorted_rows = sorted_rows[-last_n:]

    return [v for _, v in sorted_rows]


def extract_recent10_all_markets(
    logs: Iterable[Any],
    *,
    last_n: int = 10,
) -> dict[str, list[float]]:
    """
    Convenience: returns {"PTS": [...], "REB": [...], "AST": [...]}.

    Markets where extraction returned an empty list are still included
    in the dict with an empty value, so callers can rely on the keys
    existing (or omit them — both are fine).
    """
    # Materialize once if it's a generator
    if not isinstance(logs, (list, tuple)):
        logs = list(logs or [])
    return {
        m: extract_recent10(logs, m, last_n=last_n)
        for m in SUPPORTED_MARKETS
    }


# ---------------------------------------------------------------------------
# PR #116 — recentGames metadata extractor
# ---------------------------------------------------------------------------
# Companion to `extract_recent10`. Same filtering rules, same chronological
# ordering, same `last_n` cap — but emits per-game DICTS carrying:
#   - date          ISO YYYY-MM-DD (`game_date`)
#   - opponent      opponent team abbreviation (`opponent_abbr`)
#   - isHome        True iff `home_away` == "Home" (case-insensitive)
#   - value         numeric stat for the requested market
#
# Honesty rules:
#   - When `game_date` is missing OR the stat value is non-numeric, the
#     ENTIRE entry is dropped (mirrors `extract_recent10`).
#   - When `opponent_abbr` is missing, we emit `opponent: None` rather
#     than guessing. The UI knows how to render "—".
#   - When `home_away` is missing, we emit `isHome: None`.
#
# Order is OLDEST → NEWEST (matches `recent10`) so the drawer's display
# logic can slice the LAST 5 entries cleanly without re-sorting.


def extract_recent_games(
    logs: Iterable[Any],
    market: str,
    *,
    last_n: int = 10,
) -> list[dict[str, Any]]:
    """Per-game metadata + value list for the recent-form drawer.

    Returns a list of `{date, opponent, isHome, value}` dicts in
    oldest→newest order, capped at `last_n`. Empty list when no entries
    have both a valid `game_date` and a valid numeric stat value.

    Pure read-only helper. No I/O, no fabrication. Each row in the
    output corresponds 1:1 to a row in `extract_recent10(logs, market)`
    so the drawer can cross-check if it wants to.
    """
    if market not in SUPPORTED_MARKETS:
        return []
    field = _MARKET_TO_FIELD[market]
    if not isinstance(last_n, int) or last_n <= 0:
        return []
    # Same valid-row filter as `extract_recent10`.
    valid: list[tuple[str, dict[str, Any]]] = []
    for log in logs or []:
        date = _get_field(log, "game_date")
        if not isinstance(date, str) or len(date) < 8:
            continue
        v = _get_field(log, field)
        if not _is_real_number(v):
            continue
        opp = _get_field(log, "opponent_abbr")
        ha = _get_field(log, "home_away")
        is_home: bool | None
        if isinstance(ha, str):
            ha_norm = ha.strip().lower()
            if ha_norm == "home":
                is_home = True
            elif ha_norm == "away":
                is_home = False
            else:
                # Unknown sentinel ("?", "-", etc.) — emit None rather
                # than guessing. UI renders "—" / "vs" in this case.
                is_home = None
        else:
            is_home = None
        valid.append(
            (
                date,
                {
                    "date": date,
                    "opponent": opp if isinstance(opp, str) and opp else None,
                    "isHome": is_home,
                    "value": float(v),
                },
            )
        )
    if not valid:
        return []
    # Same deterministic sort + truncation as `extract_recent10`.
    valid_indexed = list(enumerate(valid))
    valid_indexed.sort(key=lambda t: (t[1][0], t[0]))
    sorted_rows = [pair for _, pair in valid_indexed]
    if len(sorted_rows) > last_n:
        sorted_rows = sorted_rows[-last_n:]
    return [row for _, row in sorted_rows]


def extract_recent_games_all_markets(
    logs: Iterable[Any],
    *,
    last_n: int = 10,
) -> dict[str, list[dict[str, Any]]]:
    """Returns {"PTS": [{date, opponent, isHome, value}, ...], "REB":..., "AST":...}."""
    if not isinstance(logs, (list, tuple)):
        logs = list(logs or [])
    return {
        m: extract_recent_games(logs, m, last_n=last_n)
        for m in SUPPORTED_MARKETS
    }
