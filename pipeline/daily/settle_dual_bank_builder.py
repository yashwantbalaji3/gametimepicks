"""
settle_dual_bank_builder — officially settle a Dual Bank Builder run's current step from
OFFICIAL sources only, in place on the dual-lanes artifact. Never touches completed Run #1.

Grading:
  - World Cup double_chance / draw_no_bet / moneyline: API-Football final fixture (regulation 90).
  - MLB batter_hits / strikeouts: official MLB Stats API box score (hits/strikeouts); a player
    with NO batting appearance (DNP) is VOID.
A 2-leg lane WINS only if every non-void leg won; a void leg is removed (a single remains). Any
lost leg ⇒ the lane is lost. No fabrication — results come from the live official endpoints.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app" / "public" / "data"
BB = DATA / "bank-builder"
AF_BASE = "https://v3.football.api-sports.io"
LEAGUE = int(os.environ.get("WC_API_FOOTBALL_LEAGUE", "1"))
SEASON = int(os.environ.get("WC_API_FOOTBALL_SEASON", "2026"))


def http(url: str, headers: dict | None = None) -> object:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def mlb_index() -> dict[tuple[str, str], dict]:
    """(playerName, marketKey) -> {gamePk, playerId} from the slate's MLB board."""
    out = {}
    try:
        leans = json.loads((DATA / "mlb" / "boards" / "2026-06-15.json").read_text()).get("leans", [])
    except Exception:
        return out
    for l in leans:
        if l.get("playerName") and l.get("marketKey"):
            out.setdefault((l["playerName"], l["marketKey"]), {"gamePk": l.get("gamePk"), "playerId": l.get("playerId")})
    return out


def af_fixtures(date: str, key: str) -> list[dict]:
    q = urllib.parse.urlencode({"league": LEAGUE, "season": SEASON, "date": date})
    return http(f"{AF_BASE}/fixtures?{q}", {"x-apisports-key": key}).get("response", [])


def settle_wc(pick: str, lane_date: str, key: str) -> tuple[str, str]:
    """Grade a WC double-chance/DNB/ML pick from the official final fixture. Returns (result, final)."""
    # the named (non-Draw) teams in the pick, e.g. "Iran or Draw" -> ["Iran"]
    teams = [t.strip() for t in re.split(r"\bor\b", pick) if t.strip() and t.strip().lower() != "draw"]
    has_draw = "draw" in pick.lower()
    # search fixtures on the lane date + the next UTC day (late kickoffs)
    fixtures = []
    for d in (lane_date, (datetime.fromisoformat(lane_date) + timedelta(days=1)).strftime("%Y-%m-%d")):
        fixtures += af_fixtures(d, key)
    for f in fixtures:
        h, a = f["teams"]["home"], f["teams"]["away"]
        names = {h["name"], a["name"]}
        if any(any(t.lower() in n.lower() or n.lower() in t.lower() for n in names) for t in teams):
            if f["fixture"]["status"]["short"] != "FT":
                return ("pending", f"{h['name']} vs {a['name']} not final ({f['fixture']['status']['short']})")
            gh, ga = f["goals"]["home"], f["goals"]["away"]
            final = f"{h['name']} {gh}-{ga} {a['name']} (FT)"
            # which outcome covers the pick?
            home_named = any(t.lower() in h["name"].lower() or h["name"].lower() in t.lower() for t in teams)
            away_named = any(t.lower() in a["name"].lower() or a["name"].lower() in t.lower() for t in teams)
            draw = gh == ga
            home_win, away_win = gh > ga, ga > gh
            won = (draw and has_draw) or (home_named and home_win) or (away_named and away_win)
            return ("won" if won else "lost", final)
    return ("needs_review", "fixture not found in official feed")


def settle_mlb(pick: str, market: str, idx: dict) -> tuple[str, str]:
    """Grade an MLB hits/strikeouts pick from the official box score. DNP -> void."""
    m = re.search(r"^(.*?)\s+(Over|Under)\s+([\d.]+)", pick)
    if not m:
        return ("needs_review", "could not parse pick")
    player, side, line = m.group(1).strip(), m.group(2), float(m.group(3))
    ref = idx.get((player, market))
    if not ref or not ref.get("gamePk") or not ref.get("playerId"):
        return ("needs_review", "no gamePk/playerId for player")
    gpk, pid = ref["gamePk"], ref["playerId"]
    feed = http(f"https://statsapi.mlb.com/api/v1.1/game/{gpk}/feed/live")
    state = feed["gameData"]["status"]["abstractGameState"]
    if state != "Final":
        return ("pending", f"game not final ({state})")
    stat_key = "strikeOuts" if market == "pitcher_strikeouts" else "hits"
    box = feed["liveData"]["boxscore"]["teams"]
    val = None
    for sd in ("home", "away"):
        p = box[sd]["players"].get(f"ID{pid}")
        if p:
            bt = p.get("stats", {}).get("batting", {})
            if not bt or bt.get("atBats") is None and bt.get("hits") is None and market != "pitcher_strikeouts":
                return ("void", f"{player} DNP (no batting appearance)")
            val = (p.get("stats", {}).get("pitching", {}) if market == "pitcher_strikeouts" else bt).get(stat_key)
    if val is None:
        return ("void", f"{player} DNP / not in box score")
    won = (val > line) if side == "Over" else (val < line)
    return ("won" if won else "lost", f"{player} {val} {stat_key} ({side} {line}) — official box score gamePk {gpk}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Officially settle a Dual Bank Builder step.")
    ap.add_argument("--date", required=True, help="slate date YYYY-MM-DD")
    args = ap.parse_args(argv)
    akey = os.environ.get("API_FOOTBALL_KEY", "").strip()
    f = BB / "dual-lanes-latest.json"
    doc = json.loads(f.read_text())
    idx = mlb_index()
    lanes_survived = 0
    for lane in doc.get("lanes", []):
        results = []
        for leg in lane.get("legs", []):
            if leg.get("sport") == "world_cup":
                res, final = settle_wc(leg["pick"], doc.get("date", args.date), akey)
            else:
                res, final = settle_mlb(leg["pick"], leg.get("market", "batter_hits"), idx)
            leg["result"] = res
            leg["final"] = final
            results.append(res)
        decisive = [r for r in results if r in ("won", "lost")]
        if decisive and all(r == "won" for r in decisive):
            lane["status"], lane["return"], lane["profit"] = "won", round(lane["stake"] * lane["combinedDecimal"], 2), None
            lanes_survived += 1
        else:
            lane["status"], lane["return"], lane["profit"] = "lost", 0, -lane["stake"]
        lane["settledAt"] = datetime.now(timezone.utc).isoformat()
    doc["status"] = "settled"
    doc["runStatus"] = "closed"
    doc["settledAt"] = datetime.now(timezone.utc).isoformat()
    doc["lanesSurvived"] = lanes_survived
    doc["overallResult"] = f"{lanes_survived}/{len(doc.get('lanes', []))} lanes survived"
    doc["advancedToStep"] = doc.get("step", 1) + 1 if lanes_survived else None
    for name in (f"dual-lanes-{args.date}.json", "dual-lanes-latest.json"):
        (BB / name).write_text(json.dumps(doc, indent=2) + "\n")
    print(f"[dual-settle] {doc['overallResult']} · run {doc['runStatus']}")
    for lane in doc["lanes"]:
        print(f"  Lane {lane['lane']}: {lane['status'].upper()}")
        for leg in lane["legs"]:
            print(f"    {leg['result'].upper():6} {leg['pick']} — {leg['final']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
