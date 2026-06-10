"""
probe_nba_markets — credit-bounded OddsAPI availability probe for NBA markets.

Lists basketball_nba events (FREE), picks the target slate's game(s), then probes each
candidate market with ONE /events/{id}/odds call per market (1 credit each, region=us).
Reports which markets actually return data, book + player coverage, and credits used.
Never fabricates — a market is "available" only if the live API returns it. Writes a
machine-readable JSON + a human audit doc. No board/model changes.

Run (needs ODDS_API_KEY): python -m pipeline.probe_nba_markets --date 2026-06-10
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .providers.odds_api_provider import _http_get, API_BASE, SPORT_KEY
from . import config as C

REPO = Path(__file__).resolve().parents[1]
OUT_JSON = REPO / "app" / "public" / "data" / "nba" / "market-probe-latest.json"
DOC = REPO / "docs" / "audits" / "nba-oddsapi-market-coverage-2026-06-10-latest.md"

GAME_MARKETS = ["h2h", "spreads", "totals"]
PLAYER_MARKETS = [
    "player_points", "player_rebounds", "player_assists", "player_threes",
    "player_blocks", "player_steals", "player_turnovers",
    "player_points_rebounds_assists",
]


def _key() -> str:
    import os
    k = os.getenv("ODDS_API_KEY") or getattr(C, "ODDS_API_KEY", "") or ""
    if not k:
        raise SystemExit("ODDS_API_KEY not set")
    return k


def _probe_market(event_id: str, market: str, key: str) -> dict:
    url = f"{API_BASE}/sports/{SPORT_KEY}/events/{event_id}/odds"
    params = {"apiKey": key, "regions": "us", "markets": market, "oddsFormat": "american"}
    try:
        data, headers = _http_get(url, params)
    except Exception as e:
        return {"market": market, "available": False, "error": type(e).__name__,
                "books": 0, "players": 0, "remaining": None}
    books = data.get("bookmakers") or [] if isinstance(data, dict) else []
    market_keys, players = set(), set()
    for b in books:
        for m in (b.get("markets") or []):
            if m.get("key") == market:
                market_keys.add(market)
                for o in (m.get("outcomes") or []):
                    nm = o.get("description") or o.get("name")
                    if nm:
                        players.add(nm)
    return {"market": market, "available": market in market_keys,
            "books": sum(1 for b in books if any(m.get("key") == market for m in (b.get("markets") or []))),
            "players": len(players), "remaining": headers.get("x-requests-remaining"),
            "used": headers.get("x-requests-used")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="2026-06-10")
    ap.add_argument("--game", default="", help="substring to match (e.g. 'Knicks')")
    args = ap.parse_args(argv)
    key = _key()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    events, headers = _http_get(f"{API_BASE}/sports/{SPORT_KEY}/events",
                                {"apiKey": key, "dateFormat": "iso"})
    start_remaining = headers.get("x-requests-remaining")
    events = events if isinstance(events, list) else []
    # match the target date (ET ~ commence within the date window) or game substring
    targets = [e for e in events if (e.get("commence_time") or "")[:10] in (args.date, _next(args.date))]
    if args.game:
        targets = [e for e in events if args.game.lower() in json.dumps(e).lower()] or targets
    if not targets:
        targets = events[:1]
    probes = []
    target_info = []
    for e in targets[:1]:  # bound to one event (Game 4)
        eid = e.get("id")
        target_info.append({"id": eid, "home": e.get("home_team"), "away": e.get("away_team"),
                            "commence": e.get("commence_time")})
        for mkt in GAME_MARKETS + PLAYER_MARKETS:
            probes.append(_probe_market(eid, mkt, key))

    end_remaining = next((p["remaining"] for p in reversed(probes) if p.get("remaining")), None)
    credits_used = None
    try:
        credits_used = int(start_remaining) - int(end_remaining)
    except Exception:
        pass
    payload = {"generatedAt": now, "sport": "nba", "date": args.date,
               "events": target_info,
               "available": [p["market"] for p in probes if p["available"]],
               "unavailable": [p["market"] for p in probes if not p["available"]],
               "probes": probes, "startRemaining": start_remaining,
               "endRemaining": end_remaining, "creditsUsed": credits_used}
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2) + "\n")

    lines = [f"# NBA OddsAPI Market Coverage — {args.date}", "",
             f"_Probed {now} via credit-bounded `/events/{{id}}/odds` (region=us, 1 event)._", ""]
    if target_info:
        t = target_info[0]
        lines.append(f"**Game:** {t['away']} @ {t['home']} ({t['commence']})\n")
    lines += ["| Market | Available | Books | Players |", "|---|---|---|---|"]
    for p in probes:
        lines.append(f"| {p['market']} | {'✅' if p['available'] else '❌'} | {p['books']} | {p['players']} |")
    lines += ["", f"**Available:** {', '.join(payload['available']) or 'none'}",
              f"**Unavailable:** {', '.join(payload['unavailable']) or 'none'}",
              f"**Credits used:** {credits_used} (remaining {end_remaining}).", ""]
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text("\n".join(lines) + "\n")
    print(json.dumps({"available": payload["available"], "creditsUsed": credits_used,
                      "event": target_info}, indent=2))
    return 0


def _next(d: str) -> str:
    from datetime import date, timedelta
    y, m, dd = (int(x) for x in d.split("-"))
    return (date(y, m, dd) + timedelta(days=1)).isoformat()


if __name__ == "__main__":
    raise SystemExit(main())
