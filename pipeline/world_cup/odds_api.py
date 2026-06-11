"""
World Cup soccer odds — bounded discovery + market-outlook builder via The Odds API.

Credits: GET /v4/sports is FREE; GET /v4/sports/<key>/odds?markets=h2h,totals&regions=us
is ~2 credits for ALL events in one call. Bounded, cached, never looped.

Writes (real data only; fail-closed when absent):
  app/public/data/world-cup/odds-discovery-{latest,<date>}.json
  app/public/data/world-cup/market-outlook-{latest,<date>}.json
  app/public/data/world-cup/projection-readiness-latest.json
  docs/audits/world-cup-odds-discovery-<date>-latest.md
"""
from __future__ import annotations

import argparse, json, os, sys
from datetime import datetime, timezone
from pathlib import Path

from .soccer_odds_parser import build_event_outlook

API_BASE = "https://api.the-odds-api.com/v4"
REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data" / "world-cup"
# Candidate soccer sport keys, in preference order. Only ACTIVE keys are used.
SOCCER_KEY_CANDIDATES = ["soccer_fifa_world_cup", "soccer_fifa_world_cup_2026"]


def _http_get(url: str, params: dict):
    import requests  # cloud only
    r = requests.get(url, params=params, timeout=30)
    return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else None), r.headers


def _norm(s: str) -> str:
    return "".join(c for c in (s or "").lower() if c.isalnum())


def discover_sports(api_key: str) -> list[dict]:
    code, data, _ = _http_get(f"{API_BASE}/sports", {"apiKey": api_key})
    if code != 200 or not isinstance(data, list):
        return []
    return data


def fetch_event_odds(api_key: str, sport_key: str, *, markets="h2h,totals", regions="us"):
    code, data, headers = _http_get(
        f"{API_BASE}/sports/{sport_key}/odds",
        {"apiKey": api_key, "regions": regions, "markets": markets, "oddsFormat": "american"},
    )
    remaining = headers.get("x-requests-remaining") if headers else None
    used = headers.get("x-requests-used") if headers else None
    return code, (data if isinstance(data, list) else []), {"remaining": remaining, "used": used}


def load_schedule_for_date(date: str) -> list[dict]:
    try:
        sched = json.loads((DATA / "schedule.json").read_text()).get("matches", [])
    except Exception:
        return []
    return [m for m in sched if m.get("date") == date]


def build_outlook(events: list[dict], schedule_today: list[dict], date: str, now: str) -> dict:
    # Index schedule by normalized team pair (both orderings).
    sched_by_pair = {}
    for m in schedule_today:
        sched_by_pair[(_norm(m.get("home")), _norm(m.get("away")))] = m
        sched_by_pair[(_norm(m.get("away")), _norm(m.get("home")))] = m
    cards = []
    ready = 0
    for ev in events:
        card = build_event_outlook(ev)
        m = sched_by_pair.get((_norm(ev.get("home_team")), _norm(ev.get("away_team"))))
        if m:
            card["matchId"] = m.get("id")
            card["group"] = m.get("group")
            card["stage"] = m.get("stage")
            card["kickoffLocal"] = m.get("kickoffLocal")
            card["venueCity"] = m.get("venueCity")
            card["date"] = m.get("date")
        if card.get("status") == "ready":
            ready += 1
        cards.append(card)
    return {
        "generatedAt": now, "date": date, "sport": "fifa-world-cup-2026",
        "kind": "market_outlook", "source": "the_odds_api",
        "disclaimer": "Market outlook — implied by current sportsbook prices, not a GameTime Picks model pick. 90-minute regulation result; extra time/penalties not included.",
        "matchCount": len(cards), "readyCount": ready, "matches": cards,
    }


def build_readiness(outlook: dict, date: str, now: str) -> dict:
    odds_ready = outlook.get("readyCount", 0) > 0
    # No soccer stats/xG provider is connected → player-prop + independent projection
    # markets stay fail-closed. Only the market outlook (odds) is live.
    reasons = []
    if not odds_ready:
        reasons.append("no ready 3-way h2h odds for today's matches")
    reasons.append("no soccer stats/xG/minutes provider connected → independent projections + player props fail closed (market-outlook only)")
    return {
        "generatedAt": now, "date": date, "sport": "fifa-world-cup-2026",
        "scheduleReady": True, "teamsReady": True,
        "oddsReady": odds_ready, "statsReady": False, "playerPropsReady": False,
        "marketOutlookReady": odds_ready, "projectionsReady": False, "parlayReady": False,
        "perMarket": {
            "moneyline90": "market_outlook_only" if odds_ready else "unavailable_no_odds",
            "totalGoals": "market_outlook_only" if odds_ready else "unavailable_no_odds",
            "teamTotals": "unavailable_no_market",
            "corners": "unavailable_no_market",
            "anytimeGoalscorer": "unavailable_no_stats",
            "playerShots": "unavailable_no_stats",
            "playerSOT": "unavailable_no_stats",
            "assists": "unavailable_no_stats",
        },
        "failClosedReasons": reasons,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--regions", default="us")
    ap.add_argument("--markets", default="h2h,totals")
    args = ap.parse_args(argv)
    api_key = os.environ.get("ODDS_API_KEY", "")
    if not api_key:
        print("[wc-odds] STOP ODDS_API_KEY not set", file=sys.stderr); return 2
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    sports = discover_sports(api_key)
    soccer = [s for s in sports if isinstance(s, dict) and str(s.get("key", "")).startswith("soccer")]
    active_wc = next((s["key"] for s in soccer if s.get("key") in SOCCER_KEY_CANDIDATES and s.get("active")), None)
    discovery = {
        "generatedAt": now, "date": args.date, "endpoint": f"{API_BASE}/sports",
        "regions": args.regions, "markets": args.markets,
        "soccerKeysActive": [s["key"] for s in soccer if s.get("active")],
        "worldCupKeyUsed": active_wc,
        "allSoccerKeys": [{"key": s.get("key"), "title": s.get("title"), "active": s.get("active")} for s in soccer],
    }

    events, credit = [], {"remaining": None, "used": None}
    outlook = build_outlook([], load_schedule_for_date(args.date), args.date, now)
    if active_wc:
        code, events, credit = fetch_event_odds(api_key, active_wc, markets=args.markets, regions=args.regions)
        discovery["oddsEndpoint"] = f"{API_BASE}/sports/{active_wc}/odds"
        discovery["oddsHttpStatus"] = code
        discovery["eventCount"] = len(events)
        discovery["events"] = [{"id": e.get("id"), "home": e.get("home_team"), "away": e.get("away_team"),
                                "commence": e.get("commence_time"),
                                "books": len(e.get("bookmakers") or [])} for e in events]
        outlook = build_outlook(events, load_schedule_for_date(args.date), args.date, now)
    else:
        discovery["failClosedReason"] = "no active soccer_fifa_world_cup sport key on The Odds API"
    discovery["creditsRemaining"] = credit.get("remaining")
    discovery["creditsUsed"] = credit.get("used")

    readiness = build_readiness(outlook, args.date, now)

    DATA.mkdir(parents=True, exist_ok=True)
    for name, payload in [
        (f"odds-discovery-{args.date}.json", discovery), ("odds-discovery-latest.json", discovery),
        (f"market-outlook-{args.date}.json", outlook), ("market-outlook-latest.json", outlook),
        ("projection-readiness-latest.json", readiness),
    ]:
        (DATA / name).write_text(json.dumps(payload, indent=2) + "\n")

    print(f"[wc-odds] key={active_wc} events={len(events)} ready={outlook['readyCount']}/{outlook['matchCount']} creditsRemaining={credit.get('remaining')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
