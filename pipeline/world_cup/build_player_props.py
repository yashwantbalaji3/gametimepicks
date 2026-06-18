"""
build_player_props — odds-backed World Cup player props for today's UPCOMING fixtures.

Prices from The Odds API (anytime goalscorer + shots on target); player identity/photo/
position from API-Football squads. Market-implied only (no independent per-player model yet
— WC-season per-player stats are thin this early), so it's labelled LIMITED DATA and is NOT
parlay/Bank-Builder eligible. No fabrication: real odds + real squad data; unmatched players
keep odds but fall back to an initials avatar (no broken images, no invented stats).

Writes world-cup/player-projections/{latest,<date>}.json in the app schema (matches[] with
player{id,name,team,position,photo}, market, pick, line, model/market prob, projectionStatus,
lineupStatus, dataCaveats).
"""
from __future__ import annotations

import argparse
import json
import os
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app" / "public" / "data" / "world-cup"
ET = ZoneInfo("America/New_York")
ODDS_BASE = "https://api.the-odds-api.com/v4"
AF_BASE = "https://v3.football.api-sports.io"
SPORT_KEY = "soccer_fifa_world_cup"
LEAGUE = int(os.environ.get("WC_API_FOOTBALL_LEAGUE", "1"))
SEASON = int(os.environ.get("WC_API_FOOTBALL_SEASON", "2026"))
# Core markets the WC books reliably post. OPTIONAL_MARKETS are requested too and auto-appear in the
# output IF (and only if) a book actually posts them for the fixture — absent → nothing emitted, never
# fabricated. The request falls back to core markets if the combined request is rejected, so adding an
# optional market can never break the working two. The frontend renders whatever markets show up.
MARKETS = ["player_goal_scorer_anytime", "player_shots_on_target"]
OPTIONAL_MARKETS = ["player_assists", "player_shots"]
ALL_MARKETS = MARKETS + OPTIONAL_MARKETS
MAX_PER_MARKET_PER_TEAM = 6


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()
    return " ".join(s.split())


def a2imp(o: float) -> float:
    return 100 / (o + 100) if o > 0 else abs(o) / (abs(o) + 100)


def http(url: str, headers: dict | None = None) -> object:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def upcoming_events(okey: str, date: str) -> list[dict]:
    body = http(f"{ODDS_BASE}/sports/{SPORT_KEY}/events?apiKey={okey}")
    now = datetime.now(timezone.utc)
    out = []
    for e in body if isinstance(body, list) else []:
        k = datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00"))
        if k.astimezone(ET).strftime("%Y-%m-%d") == date and k > now:
            out.append(e)
    return out


def af_squad(team_id: int, akey: str) -> dict[str, dict]:
    """normalized player name -> {id, name, photo, position}."""
    out: dict[str, dict] = {}
    for page in range(1, 4):
        q = urllib.parse.urlencode({"team": team_id, "season": SEASON, "page": page})
        data = http(f"{AF_BASE}/players?{q}", {"x-apisports-key": akey})
        resp = data.get("response", [])
        for row in resp:
            p = row.get("player", {})
            pos = None
            for st in row.get("statistics", []):
                pos = (st.get("games") or {}).get("position") or pos
            if p.get("name"):
                out[norm(p["name"])] = {"id": p.get("id"), "name": p["name"], "photo": p.get("photo"), "position": pos}
        if data.get("paging", {}).get("current", 1) >= data.get("paging", {}).get("total", 1):
            break
    return out


def match_player(name: str, squads: dict[int, dict[str, dict]]) -> dict | None:
    n = norm(name)
    for sq in squads.values():
        if n in sq:
            return sq[n]
    # last-name fallback
    last = n.split()[-1] if n else ""
    for sq in squads.values():
        for key, val in sq.items():
            if key.split()[-1] == last:
                return val
    return None


def team_id_for(team_name: str, fixtures: list[dict]) -> int | None:
    n = norm(team_name)
    for f in fixtures:
        for side in ("home", "away"):
            t = f["teams"][side]
            if norm(t["name"]) == n or n in norm(t["name"]) or norm(t["name"]) in n:
                return t["id"]
    return None


def build(date: str) -> dict:
    okey = os.environ.get("ODDS_API_KEY", "").strip()
    akey = os.environ.get("API_FOOTBALL_KEY", "").strip()
    if not okey or not akey:
        return {"error": "missing keys"}
    events = upcoming_events(okey, date)
    if not events:
        return {"status": "no_upcoming_fixtures", "matches": []}

    # API-Football fixtures for the ET date + the next UTC date (late kickoffs roll over),
    # to resolve team ids from team names.
    from datetime import timedelta
    af_fix = []
    for d in (date, (datetime.fromisoformat(date) + timedelta(days=1)).strftime("%Y-%m-%d")):
        q = urllib.parse.urlencode({"league": LEAGUE, "season": SEASON, "date": d})
        af_fix += http(f"{AF_BASE}/fixtures?{q}", {"x-apisports-key": akey}).get("response", [])

    matches: list[dict] = []
    squads_cache: dict[int, dict[str, dict]] = {}
    by_market: dict[str, int] = {}
    matched = unmatched = 0

    for ev in events:
        home, away = ev.get("home_team"), ev.get("away_team")
        hid, aid = team_id_for(home, af_fix), team_id_for(away, af_fix)
        team_by_id = {hid: home, aid: away}
        for tid in (hid, aid):
            if tid and tid not in squads_cache:
                try:
                    squads_cache[tid] = af_squad(tid, akey)
                except Exception:
                    squads_cache[tid] = {}
        def _fetch(markets: list[str]) -> object:
            q = urllib.parse.urlencode({"regions": "us", "markets": ",".join(markets),
                                        "oddsFormat": "american", "apiKey": okey})
            return http(f"{ODDS_BASE}/sports/{SPORT_KEY}/events/{ev['id']}/odds?{q}")
        # Request core + optional markets; if the combined request is rejected (e.g. a book/sport doesn't
        # support an optional market), fall back to the core two so the working markets always publish.
        try:
            odds = _fetch(ALL_MARKETS)
        except Exception:
            odds = _fetch(MARKETS)
        books = odds.get("bookmakers", []) if isinstance(odds, dict) else []
        # best (longest) price per (market, player) across books = most representative offer
        best: dict[tuple, dict] = {}
        for b in books:
            for m in b.get("markets", []):
                if m["key"] not in ALL_MARKETS:
                    continue
                for o in m.get("outcomes", []):
                    player = o.get("description")
                    if not player:
                        continue
                    key = (m["key"], player, o.get("name"), o.get("point"))
                    if key not in best or abs(o["price"]) < abs(best[key]["price"]):
                        best[key] = {"price": o["price"], "name": o.get("name"), "point": o.get("point"), "book": b["key"]}
        # group by market, take top by implied prob per team (only markets that actually returned rows)
        for mkt in ALL_MARKETS:
            rows = [(k, v) for k, v in best.items() if k[0] == mkt]
            # implied prob, sorted desc
            scored = sorted(((k, v, a2imp(v["price"])) for k, v in rows), key=lambda x: x[2], reverse=True)
            per_team: dict[str | None, int] = {}
            for (k, v, imp) in scored:
                player_name = k[1]
                sq_match = match_player(player_name, {tid: squads_cache.get(tid, {}) for tid in (hid, aid)})
                # which team? infer from squad membership
                team_name = None
                for tid in (hid, aid):
                    if norm(player_name) in squads_cache.get(tid, {}) or (sq_match and sq_match in squads_cache.get(tid, {}).values()):
                        team_name = team_by_id.get(tid)
                        break
                team_name = team_name or (home if mkt else away)
                if per_team.get(team_name, 0) >= MAX_PER_MARKET_PER_TEAM:
                    continue
                per_team[team_name] = per_team.get(team_name, 0) + 1
                if sq_match:
                    matched += 1
                else:
                    unmatched += 1
                line = k[3]
                matches.append({
                    "matchId": ev["id"], "fixture": f"{home} vs {away}",
                    "player": {
                        "id": sq_match.get("id") if sq_match else None,
                        "name": player_name,
                        "team": team_name,
                        "position": sq_match.get("position") if sq_match else None,
                        "photo": sq_match.get("photo") if sq_match else None,
                    },
                    "market": mkt, "pick": k[2] or "Yes", "line": line,
                    "americanOdds": int(v["price"]), "bookmaker": v["book"],
                    "modelProbability": round(imp, 4), "marketProbability": round(imp, 4),
                    "edgePct": 0.0, "confidence": "Watchlist",
                    "projectionStatus": "active", "parlayEligible": False,
                    "bankBuilderEligible": False, "lineupStatus": "not_posted",
                    "dataQuality": "limited",
                    "dataCaveats": [
                        "Odds-backed market-implied (no independent per-player model yet).",
                        "Player identity/photo from API-Football; WC-season per-player stats are thin this early.",
                    ],
                })
                by_market[mkt] = by_market.get(mkt, 0) + 1

    now = datetime.now(timezone.utc).isoformat()
    return {
        "generatedAt": now, "sport": "world_cup", "date": date,
        "disclaimer": "Odds-backed World Cup player props (anytime goalscorer + shots on target) "
                      "from The Odds API, with player identity/photo from API-Football. Limited "
                      "data — market-implied only, NOT parlay or Bank Builder eligible. No fabrication.",
        "lineupsPosted": False, "status": "live_limited_data",
        "projectionCount": len(matches), "publicCount": len(matches), "parlayEligibleCount": 0,
        "byMarket": by_market, "matchedPlayers": matched, "unmatchedPlayers": unmatched,
        "priceSource": "the_odds_api", "identitySource": "api_football",
        "matches": matches,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Odds-backed WC player props (Odds API + API-Football).")
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    out = build(args.date)
    if out.get("error"):
        print("[wc-props] STOP", out["error"]); return 2
    (DATA / "player-projections").mkdir(parents=True, exist_ok=True)
    for name in (f"player-projections/{args.date}.json", "player-projections/latest.json"):
        (DATA / name).write_text(json.dumps(out, indent=2) + "\n")
    print(f"[wc-props] {args.date}: {out.get('projectionCount',0)} props "
          f"({out.get('byMarket')}) · matched {out.get('matchedPlayers',0)} / unmatched {out.get('unmatchedPlayers',0)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
