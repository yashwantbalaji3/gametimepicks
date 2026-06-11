"""
Pure soccer 3-way odds parsing for World Cup 90-minute markets.

Honesty / fail-closed contract (no I/O — fully unit-testable):
  - Soccer moneyline is THREE-WAY: Home / Draw / Away. A market missing the Draw
    outcome is NOT a soccer moneyline → returns None (fail closed). A 2-way h2h must
    never masquerade as a soccer 3-way result.
  - De-vig normalizes the three raw implied probabilities by the overround so they
    sum to 1.0. Raw American prices + best book are preserved.
  - Totals (Over/Under goals) are de-vigged two-way.
  - Futures / to-advance markets are excluded — only the regulation `h2h` market is a
    valid 90-minute result here. The caller never passes outright/winner markets.
  - Malformed odds (non-numeric, zero) → None.
"""
from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# Odds math
# ---------------------------------------------------------------------------
def american_to_prob(odds: float) -> float | None:
    """American odds → raw implied probability. None on malformed input."""
    if not isinstance(odds, (int, float)) or odds == 0:
        return None
    if odds > 0:
        return 100.0 / (odds + 100.0)
    return -odds / (-odds + 100.0)


def devig_three_way(
    p_home: float, p_draw: float, p_away: float
) -> tuple[float, float, float] | None:
    """Normalize three raw implied probs by the overround. None if degenerate."""
    total = p_home + p_draw + p_away
    if total <= 0:
        return None
    return (p_home / total, p_draw / total, p_away / total)


def devig_two_way(p_a: float, p_b: float) -> tuple[float, float] | None:
    total = p_a + p_b
    if total <= 0:
        return None
    return (p_a / total, p_b / total)


def _find_market(bookmaker: dict[str, Any], key: str) -> dict | None:
    for m in bookmaker.get("markets") or []:
        if isinstance(m, dict) and m.get("key") == key:
            return m
    return None


# ---------------------------------------------------------------------------
# 3-way h2h (Home / Draw / Away)
# ---------------------------------------------------------------------------
def parse_h2h_3way(
    bookmaker: dict[str, Any], *, home_team: str, away_team: str
) -> dict[str, Any] | None:
    """Pull the 3-way 90-minute result from one bookmaker. Returns None (fail
    closed) when the Draw outcome is absent or any side is malformed — a 2-way
    market is never treated as a soccer moneyline."""
    market = _find_market(bookmaker, "h2h")
    if market is None:
        return None
    home = draw = away = None
    for o in market.get("outcomes") or []:
        if not isinstance(o, dict):
            continue
        name = (o.get("name") or "").strip()
        price = o.get("price")
        if not isinstance(price, (int, float)):
            continue
        if name == home_team:
            home = price
        elif name == away_team:
            away = price
        elif name.lower() == "draw":
            draw = price
    # Fail closed unless ALL THREE 3-way outcomes are present.
    if home is None or draw is None or away is None:
        return None
    ph, pd, pa = american_to_prob(home), american_to_prob(draw), american_to_prob(away)
    if ph is None or pd is None or pa is None:
        return None
    devigged = devig_three_way(ph, pd, pa)
    if devigged is None:
        return None
    dh, dd, da = devigged
    return {
        "homeOdds": int(home), "drawOdds": int(draw), "awayOdds": int(away),
        "homeWinPct": round(dh, 4), "drawPct": round(dd, 4), "awayWinPct": round(da, 4),
        "bookmaker": bookmaker.get("key"),
        "market": "90min_result_3way",
    }


def parse_totals(bookmaker: dict[str, Any]) -> dict[str, Any] | None:
    """Over/Under total goals — main line, de-vigged two-way. None if absent."""
    market = _find_market(bookmaker, "totals")
    if market is None:
        return None
    line = over = under = None
    for o in market.get("outcomes") or []:
        if not isinstance(o, dict):
            continue
        side = (o.get("name") or "").lower()
        point, price = o.get("point"), o.get("price")
        if isinstance(point, (int, float)):
            line = float(point)
        if not isinstance(price, (int, float)):
            continue
        if side == "over":
            over = price
        elif side == "under":
            under = price
    if line is None or over is None or under is None:
        return None
    dv = devig_two_way(american_to_prob(over) or 0, american_to_prob(under) or 0)
    if dv is None:
        return None
    return {
        "line": line, "overOdds": int(over), "underOdds": int(under),
        "overPct": round(dv[0], 4), "underPct": round(dv[1], 4),
        "bookmaker": bookmaker.get("key"),
    }


# ---------------------------------------------------------------------------
# Event → outlook card (picks the first bookmaker that yields a valid 3-way)
# ---------------------------------------------------------------------------
def build_event_outlook(
    event: dict[str, Any],
    *,
    preferred_books: tuple[str, ...] = ("draftkings", "fanduel"),
) -> dict[str, Any]:
    """Build one match's market-outlook from an Odds API event. Always returns a
    dict with a `status`; `unavailable_*` when the 3-way can't be built."""
    home = (event.get("home_team") or "").strip()
    away = (event.get("away_team") or "").strip()
    base = {
        "oddsEventId": event.get("id"),
        "homeTeam": home, "awayTeam": away,
        "commenceTime": event.get("commence_time"),
    }
    bookmakers = event.get("bookmakers") or []
    if not isinstance(bookmakers, list) or not bookmakers:
        return {**base, "status": "unavailable_no_odds"}
    by_key = {b.get("key"): b for b in bookmakers if isinstance(b, dict)}
    ordered = [by_key[k] for k in preferred_books if k in by_key] + [
        b for b in bookmakers if b.get("key") not in preferred_books
    ]
    result = None
    totals = None
    for bk in ordered:
        r = parse_h2h_3way(bk, home_team=home, away_team=away)
        if r is not None and result is None:
            result = r
        t = parse_totals(bk)
        if t is not None and totals is None:
            totals = t
        if result is not None and totals is not None:
            break
    if result is None:
        # Odds present but no valid 3-way (likely 2-way only or wrong shape).
        return {**base, "status": "unavailable_bad_market_shape", "totals": totals}
    return {
        **base,
        "status": "ready",
        "result": result,
        "totals": totals,
        "marketRules": "90-minute regulation result. Draw is included. Does not include extra time or penalties.",
    }
