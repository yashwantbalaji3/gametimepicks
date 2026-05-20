"""NBA game-level market fetcher — moneyline (h2h), spreads, totals.

Why this module exists:
  The existing odds plumbing in `fetch_odds_data` / `OddsApiProvider`
  fetches **player-prop** markets only (player_points / rebounds /
  assists). The team-game projection card has slots for `marketSpread`,
  `marketMoneyline`, and now `marketTotal`, but those have always been
  null because nothing on disk carries them. This module closes that gap
  for NBA only — one call per playoff game, three credits each.

Cost model (per The Odds API docs):
  GET /v4/sports/basketball_nba/events                  FREE
  GET /v4/sports/basketball_nba/events/{id}/odds       markets × regions
  3 markets (h2h, spreads, totals) × 1 region (us) × 1 event = 3 credits

Output shape (written to app/public/data/nba/game-markets/<date>.json):

    {
      "sport": "NBA",
      "date": "2026-05-20",
      "generatedAt": "...iso...",
      "bookmakers": ["draftkings", "fanduel"],
      "regions": ["us"],
      "creditsSpent": 3,
      "quotaRemainingAfter": 297,
      "games": {
        "401873198": {
          "gameId": "401873198",
          "homeTeam": "Oklahoma City Thunder",
          "awayTeam": "San Antonio Spurs",
          "moneyline": {"home": -350, "away": 280},
          "spread": {"home": -7.5, "away": 7.5},
          "total": {"line": 218.5, "over": -110, "under": -110},
          "bookmaker": "draftkings",
          "lastUpdate": "...iso..."
        }
      }
    }

Honest framing:
  * If a market is missing for a game (DraftKings hasn't posted spreads
    yet, etc.), the slot stays None — never fabricated.
  * The fetcher is fail-closed: if a balance probe fails, the per-event
    fetch fails, or the floor would be breached, it aborts and writes
    nothing.
  * Costs are estimated from real event counts × real market counts
    before any paid call is made.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import config as C
from .credit_guard import check_balance
from .providers.odds_api_provider import _http_get, API_BASE, SPORT_KEY


# Markets we ask The Odds API for. h2h = moneyline.
GAME_MARKETS = ("h2h", "spreads", "totals")


# ---------------------------------------------------------------------------
# Pure parsing — no I/O
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GameMarketLines:
    """Parsed market lines for one game from one bookmaker.

    Any field can be None when the bookmaker hasn't posted it yet.
    """

    moneyline: dict[str, int] | None  # {"home": -350, "away": 280}
    spread: dict[str, float] | None   # {"home": -7.5, "away": 7.5}
    total: dict[str, Any] | None      # {"line": 218.5, "over": -110, "under": -110}
    bookmaker: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "moneyline": self.moneyline,
            "spread": self.spread,
            "total": self.total,
            "bookmaker": self.bookmaker,
        }


def parse_event_markets(
    event_odds: dict[str, Any],
    *,
    preferred_bookmakers: tuple[str, ...] = ("draftkings", "fanduel"),
) -> GameMarketLines | None:
    """Pull moneyline / spread / total out of an /events/{id}/odds response.

    The response carries one or more bookmakers, each with markets.
    We pick the first preferred bookmaker that has data; if none of the
    preferred books are present we take the first bookmaker in the
    response. If no bookmakers carry data we return None.
    """
    if not isinstance(event_odds, dict):
        return None
    bookmakers = event_odds.get("bookmakers") or []
    if not isinstance(bookmakers, list) or not bookmakers:
        return None

    home_team = event_odds.get("home_team", "")
    away_team = event_odds.get("away_team", "")

    # Index bookmakers by key so we can prefer DK > FD > first available.
    by_key: dict[str, dict] = {}
    for bk in bookmakers:
        if isinstance(bk, dict) and isinstance(bk.get("key"), str):
            by_key[bk["key"]] = bk

    chosen: dict | None = None
    chosen_key = ""
    for k in preferred_bookmakers:
        if k in by_key:
            chosen = by_key[k]
            chosen_key = k
            break
    if chosen is None:
        first = bookmakers[0]
        if isinstance(first, dict):
            chosen = first
            chosen_key = first.get("key", "unknown")
    if chosen is None:
        return None

    moneyline = _parse_h2h(chosen, home_team=home_team, away_team=away_team)
    spread = _parse_spreads(chosen, home_team=home_team, away_team=away_team)
    total = _parse_totals(chosen)

    # If every market is empty for this bookmaker, return None so the
    # caller knows to record "no lines posted" rather than an empty row.
    if moneyline is None and spread is None and total is None:
        return None

    return GameMarketLines(
        moneyline=moneyline,
        spread=spread,
        total=total,
        bookmaker=chosen_key,
    )


def _parse_h2h(
    bookmaker: dict[str, Any],
    *,
    home_team: str,
    away_team: str,
) -> dict[str, int] | None:
    market = _find_market(bookmaker, "h2h")
    if market is None:
        return None
    out: dict[str, int] = {}
    for o in market.get("outcomes") or []:
        if not isinstance(o, dict):
            continue
        name = o.get("name", "")
        price = o.get("price")
        if not isinstance(price, (int, float)):
            continue
        if name == home_team:
            out["home"] = int(price)
        elif name == away_team:
            out["away"] = int(price)
    if "home" in out and "away" in out:
        return out
    return None


def _parse_spreads(
    bookmaker: dict[str, Any],
    *,
    home_team: str,
    away_team: str,
) -> dict[str, float] | None:
    market = _find_market(bookmaker, "spreads")
    if market is None:
        return None
    out: dict[str, float] = {}
    for o in market.get("outcomes") or []:
        if not isinstance(o, dict):
            continue
        name = o.get("name", "")
        point = o.get("point")
        if not isinstance(point, (int, float)):
            continue
        if name == home_team:
            out["home"] = float(point)
        elif name == away_team:
            out["away"] = float(point)
    if "home" in out and "away" in out:
        return out
    return None


def _parse_totals(
    bookmaker: dict[str, Any],
) -> dict[str, Any] | None:
    market = _find_market(bookmaker, "totals")
    if market is None:
        return None
    line: float | None = None
    over_price: int | None = None
    under_price: int | None = None
    for o in market.get("outcomes") or []:
        if not isinstance(o, dict):
            continue
        side = (o.get("name") or "").lower()
        point = o.get("point")
        price = o.get("price")
        if isinstance(point, (int, float)):
            line = float(point)
        if not isinstance(price, (int, float)):
            continue
        if side == "over":
            over_price = int(price)
        elif side == "under":
            under_price = int(price)
    if line is None:
        return None
    out: dict[str, Any] = {"line": line}
    if over_price is not None:
        out["over"] = over_price
    if under_price is not None:
        out["under"] = under_price
    return out


def _find_market(bookmaker: dict[str, Any], key: str) -> dict | None:
    markets = bookmaker.get("markets") or []
    if not isinstance(markets, list):
        return None
    for m in markets:
        if isinstance(m, dict) and m.get("key") == key:
            return m
    return None


def match_events_to_games(
    *,
    events: list[dict[str, Any]],
    games: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Pair Odds API events with board games by (home, away) full names.

    Returns a dict keyed by the **board** gameId -> the matched event dict.
    """
    by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    for ev in events:
        home = (ev.get("home_team") or "").strip().lower()
        away = (ev.get("away_team") or "").strip().lower()
        if home and away:
            by_pair[(home, away)] = ev
    matched: dict[str, dict[str, Any]] = {}
    for g in games:
        home = (g.get("homeTeamFull") or "").strip().lower()
        away = (g.get("awayTeamFull") or "").strip().lower()
        ev = by_pair.get((home, away))
        if ev:
            matched[str(g.get("gameId"))] = ev
    return matched


# ---------------------------------------------------------------------------
# I/O — Odds API HTTP
# ---------------------------------------------------------------------------


def _fetch_events_for_date(api_key: str, date: str) -> tuple[list, dict]:
    from datetime import timedelta
    from zoneinfo import ZoneInfo

    tz = ZoneInfo(C.TIMEZONE)
    local_start = datetime.fromisoformat(date).replace(tzinfo=tz)
    local_end = local_start + timedelta(days=1)
    params = {
        "apiKey": api_key,
        "dateFormat": "iso",
        "commenceTimeFrom": local_start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commenceTimeTo": local_end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    events, headers = _http_get(
        f"{API_BASE}/sports/{SPORT_KEY}/events",
        params=params,
    )
    if not isinstance(events, list):
        raise RuntimeError("Odds API: events response shape unexpected")
    return events, headers


def _fetch_event_odds(
    api_key: str,
    event_id: str,
    *,
    regions: tuple[str, ...] = ("us",),
    bookmakers: tuple[str, ...] = ("draftkings", "fanduel"),
) -> tuple[dict, dict]:
    params = {
        "apiKey": api_key,
        "regions": ",".join(regions),
        "markets": ",".join(GAME_MARKETS),
        "oddsFormat": "american",
        "dateFormat": "iso",
        "bookmakers": ",".join(bookmakers),
    }
    payload, headers = _http_get(
        f"{API_BASE}/sports/{SPORT_KEY}/events/{event_id}/odds",
        params=params,
    )
    if not isinstance(payload, dict):
        raise RuntimeError("Odds API: event-odds response shape unexpected")
    return payload, headers


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def estimate_cost(num_events: int) -> int:
    """3 markets × 1 region × N events = 3N credits."""
    return 3 * num_events


def load_board_games(date: str) -> list[dict[str, Any]]:
    path = Path("app/public/data/boards") / f"{date}.json"
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return []
    games = data.get("games") if isinstance(data, dict) else None
    return games if isinstance(games, list) else []


def write_artifact(
    *,
    date: str,
    payload: dict[str, Any],
    out_dir: str = os.path.join("app", "public", "data", "nba", "game-markets"),
) -> str:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{date}.json")
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, path)
    return path


def fetch_and_persist(
    *,
    date: str,
    api_key: str,
    min_remaining: int = 300,
    max_per_run: int = 75,
    bookmakers: tuple[str, ...] = ("draftkings", "fanduel"),
    regions: tuple[str, ...] = ("us",),
) -> dict[str, Any]:
    """End-to-end: probe → cost-gate → /events → per-event /odds → write.

    Returns a status dict the CLI can pretty-print. Never writes the
    artifact when the cost gate refuses the run.
    """
    games = load_board_games(date)
    if not games:
        return {
            "ok": False,
            "reason": f"no board on disk for {date}",
            "spent": 0,
        }

    # /events is free; call it first so we know exactly how many events
    # we'd hit before estimating cost.
    try:
        events, _ = _fetch_events_for_date(api_key, date)
    except Exception as e:
        return {
            "ok": False,
            "reason": f"/events call failed: {e}",
            "spent": 0,
        }

    matched = match_events_to_games(events=events, games=games)
    estimated = estimate_cost(len(matched))

    decision = check_balance(
        api_key=api_key,
        estimated_cost=estimated,
        max_per_run=max_per_run,
        min_remaining=min_remaining,
    )
    if not decision.ok:
        return {
            "ok": False,
            "reason": decision.reason,
            "spent": 0,
            "estimated": estimated,
            "matched": len(matched),
            "balanceBefore": decision.remaining,
        }

    balance_before = decision.remaining

    out_games: dict[str, dict[str, Any]] = {}
    last_remaining: int | None = balance_before
    actual_spent = 0
    failed: list[str] = []

    for game_id, ev in matched.items():
        event_id = ev.get("id")
        if not isinstance(event_id, str):
            failed.append(f"{game_id}: missing event id")
            continue
        try:
            payload, headers = _fetch_event_odds(
                api_key=api_key,
                event_id=event_id,
                regions=regions,
                bookmakers=bookmakers,
            )
        except Exception as e:
            failed.append(f"{game_id}: {e}")
            continue

        last = headers.get("x-requests-last")
        rem = headers.get("x-requests-remaining")
        try:
            if last is not None:
                actual_spent += int(last)
        except (TypeError, ValueError):
            pass
        try:
            if rem is not None:
                last_remaining = int(rem)
        except (TypeError, ValueError):
            pass

        parsed = parse_event_markets(payload, preferred_bookmakers=bookmakers)
        out_games[game_id] = {
            "gameId": game_id,
            "homeTeam": payload.get("home_team", ""),
            "awayTeam": payload.get("away_team", ""),
            "moneyline": parsed.moneyline if parsed else None,
            "spread": parsed.spread if parsed else None,
            "total": parsed.total if parsed else None,
            "bookmaker": parsed.bookmaker if parsed else None,
            "lastUpdate": payload.get("last_update"),
        }

    artifact = {
        "_disclaimer": (
            "Real moneyline / spread / total lines fetched from "
            "The Odds API. Educational only — not betting advice. "
            "Markets that the bookmaker has not posted appear as null; "
            "never fabricated."
        ),
        "sport": "NBA",
        "date": date,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bookmakers": list(bookmakers),
        "regions": list(regions),
        "markets": list(GAME_MARKETS),
        "creditsSpent": actual_spent,
        "balanceBefore": balance_before,
        "quotaRemainingAfter": last_remaining,
        "matchedEventCount": len(matched),
        "failed": failed,
        "games": out_games,
    }
    path = write_artifact(date=date, payload=artifact)

    return {
        "ok": True,
        "reason": (
            f"wrote {path} — {len(out_games)} game(s), "
            f"spent {actual_spent} credits"
        ),
        "spent": actual_spent,
        "estimated": estimated,
        "matched": len(matched),
        "balanceBefore": balance_before,
        "balanceAfter": last_remaining,
        "artifactPath": path,
        "failed": failed,
    }


# ---------------------------------------------------------------------------
# Loader (for team_projection.py)
# ---------------------------------------------------------------------------


def load_game_markets_for_odds_lines(
    date: str,
    root: str = os.path.join("app", "public", "data", "nba", "game-markets"),
) -> dict[str, Any] | None:
    """Return the dict shape `pipeline.team_projection.project_game` expects.

    The team-projection module accepts `odds_lines={gameId: {spread, moneyline, total}}`.
    Returns None when the artifact doesn't exist so callers can fall through
    to the "market line pending" path honestly.
    """
    path = Path(root) / f"{date}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return None
    games = data.get("games") if isinstance(data, dict) else None
    if not isinstance(games, dict):
        return None
    out: dict[str, dict[str, Any]] = {}
    for gid, row in games.items():
        if not isinstance(row, dict):
            continue
        per: dict[str, Any] = {}
        spread = row.get("spread")
        if isinstance(spread, dict) and isinstance(spread.get("home"), (int, float)):
            # The team-projection module reads a single float (home spread).
            per["spread"] = float(spread["home"])
        ml = row.get("moneyline")
        if (
            isinstance(ml, dict)
            and isinstance(ml.get("home"), int)
            and isinstance(ml.get("away"), int)
        ):
            per["moneyline"] = {"home": ml["home"], "away": ml["away"]}
        total = row.get("total")
        if isinstance(total, dict) and isinstance(total.get("line"), (int, float)):
            per["total"] = float(total["line"])
        if per:
            out[str(gid)] = per
    return out or None


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Fetch NBA game-level markets (h2h, spreads, totals) "
                    "for a date and persist them under app/public/data/nba/game-markets/."
    )
    p.add_argument("--date", required=True, help="YYYY-MM-DD (ET)")
    p.add_argument(
        "--min-remaining", type=int, default=300,
        help="Refuse the run if projected balance < this floor (default 300).",
    )
    p.add_argument(
        "--max-per-run", type=int, default=75,
        help="Refuse the run if cost > this cap (default 75).",
    )
    p.add_argument(
        "--bookmakers", default="draftkings,fanduel",
        help="CSV of bookmaker keys (default draftkings,fanduel).",
    )
    p.add_argument(
        "--dry-run", action="store_true",
        help="Estimate cost only; no /odds calls, no artifact written.",
    )
    args = p.parse_args(argv)

    api_key = os.environ.get("ODDS_API_KEY", "")
    if not api_key:
        print("[fetch_game_markets] STOP ODDS_API_KEY not set", file=sys.stderr)
        return 2

    bookmakers = tuple(b.strip() for b in args.bookmakers.split(",") if b.strip())

    if args.dry_run:
        games = load_board_games(args.date)
        try:
            events, _ = _fetch_events_for_date(api_key, args.date)
        except Exception as e:
            print(f"[fetch_game_markets] STOP /events call failed: {e}")
            return 1
        matched = match_events_to_games(events=events, games=games)
        estimated = estimate_cost(len(matched))
        decision = check_balance(
            api_key=api_key,
            estimated_cost=estimated,
            max_per_run=args.max_per_run,
            min_remaining=args.min_remaining,
        )
        marker = "OK " if decision.ok else "STOP"
        print(
            f"[fetch_game_markets] DRY-RUN {marker} "
            f"{len(matched)} game(s) · estimated {estimated} credits · "
            f"{decision.reason}"
        )
        return 0 if decision.ok else 1

    result = fetch_and_persist(
        date=args.date,
        api_key=api_key,
        min_remaining=args.min_remaining,
        max_per_run=args.max_per_run,
        bookmakers=bookmakers,
    )
    marker = "OK " if result["ok"] else "STOP"
    print(f"[fetch_game_markets] {marker} {result['reason']}")
    if result["ok"]:
        print(
            f"[fetch_game_markets] balance before {result.get('balanceBefore')} → "
            f"after {result.get('balanceAfter')} (spent {result.get('spent')})"
        )
        if result.get("failed"):
            print(f"[fetch_game_markets] partial failures: {result['failed']}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
