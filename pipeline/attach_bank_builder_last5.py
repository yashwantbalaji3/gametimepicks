"""
Attach REAL last-5 game-by-game prop history to each MLB leg of the active Dual Bank Builder ladder.

Pulls official MLB Stats API game logs (never fabricated): for a Hits+Runs+RBIs prop it sums
hits+runs+rbi per game; for a Strikeouts prop it reads strikeOuts per pitching appearance. Only games
BEFORE the leg's slate date are used (pre-event recent form, no leakage). Each MLB leg gets:

  leg["last5"] = {
    "stat": "hrr" | "strikeouts", "line": <float>, "side": "over"|"under",
    "games": [{"date","opp","value","hit"} ...up to 5, most recent first],
    "hitRate": {"hits": n, "total": m, "pct": p}, "source": "mlb_stats_api"
  }
  (or {"unavailable": true, "reason": ...} when official logs are missing — never invented.)

Writes ONLY the non-protected engine artifact. Never touches public/data/bank-builder/*.
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVE = ROOT / "app" / "public" / "data" / "methodology" / "launch" / "dual-bank-builder-active.json"
BOARDS = ROOT / "app" / "public" / "data" / "mlb" / "boards"
SEASON = 2026


def _get(url):
    with urllib.request.urlopen(url, timeout=25) as r:
        return json.load(r)


def _player_id(slate_date: str, name: str):
    """Resolve the official MLB playerId from the board for the leg's slate date."""
    board = BOARDS / f"{slate_date}.json"
    if not board.exists():
        return None
    d = json.loads(board.read_text())
    for l in d.get("leans", []):
        if l.get("playerName") == name and l.get("playerId"):
            return int(l["playerId"])
    return None


def _stat_type(label: str):
    if "Strikeouts" in label:
        return "strikeouts", "pitching"
    if "Hits + Runs + RBIs" in label or "Hits+Runs+RBIs" in label:
        return "hrr", "hitting"
    return None, None


def _game_value(stat: dict, kind: str):
    if kind == "strikeouts":
        v = stat.get("strikeOuts")
        return int(v) if v is not None else None
    # hrr
    h, r, rbi = stat.get("hits"), stat.get("runs"), stat.get("rbi")
    if h is None or r is None or rbi is None:
        return None
    return int(h) + int(r) + int(rbi)


def _last5(player_id: int, group: str, kind: str, slate_date: str):
    url = f"https://statsapi.mlb.com/api/v1/people/{player_id}/stats?stats=gameLog&group={group}&season={SEASON}"
    try:
        data = _get(url)
    except Exception as e:
        return None, f"game log fetch failed: {e}"
    splits = (data.get("stats") or [{}])[0].get("splits", []) if data.get("stats") else []
    games = []
    for sp in splits:
        gd = sp.get("date")
        if not gd or gd >= slate_date:  # strictly before the slate date (pre-event form)
            continue
        val = _game_value(sp.get("stat", {}), kind)
        if val is None:
            continue
        opp = (sp.get("opponent") or {}).get("abbreviation") or (sp.get("opponent") or {}).get("name") or "?"
        games.append({"date": gd, "opp": opp, "value": val})
    if not games:
        return None, "no official game logs before the slate date"
    games.sort(key=lambda g: g["date"], reverse=True)
    return games[:5], None


def grade(value: int, side: str, line: float) -> bool:
    s = (side or "").lower()
    return value > line if s == "over" else value < line if s == "under" else False


def attach(leg: dict) -> None:
    if leg.get("sport") != "MLB":
        return
    kind, group = _stat_type(leg.get("label", ""))
    if not kind:
        return
    line = leg.get("line")
    side = leg.get("side")
    if line is None or side is None:
        leg["last5"] = {"unavailable": True, "reason": "leg has no line/side"}
        return
    name = leg.get("participantName") or leg.get("label", "").split(" Strikeouts")[0].split(" Hits")[0]
    slate = leg.get("_slateDate")
    pid = _player_id(slate, name)
    if not pid:
        leg["last5"] = {"unavailable": True, "reason": f"no official playerId for {name} on {slate}", "source": "mlb_stats_api"}
        return
    games, err = _last5(pid, group, kind, slate)
    if err:
        leg["last5"] = {"unavailable": True, "reason": err, "source": "mlb_stats_api"}
        return
    for g in games:
        g["hit"] = grade(g["value"], side, float(line))
    hits = sum(1 for g in games if g["hit"])
    leg["last5"] = {
        "stat": kind, "line": float(line), "side": side,
        "games": games,
        "hitRate": {"hits": hits, "total": len(games), "pct": round(hits / len(games) * 100)},
        "source": "mlb_stats_api",
    }


def main():
    doc = json.loads(ACTIVE.read_text())
    run = doc["run"]
    count = 0
    for lk in ("laneA", "laneB"):
        lane = run.get(lk)
        if not lane:
            continue
        for step in lane.get("steps", []):
            for leg in step.get("legs", []):
                if leg.get("sport") == "MLB":
                    leg["_slateDate"] = step.get("slateDate") or run.get("date")
                    attach(leg)
                    leg.pop("_slateDate", None)
                    l5 = leg.get("last5", {})
                    if l5.get("unavailable"):
                        print(f"  {lk} S{step['step']} {leg['label']}: last5 UNAVAILABLE — {l5.get('reason')}")
                    else:
                        vals = ", ".join(str(g["value"]) for g in l5["games"])
                        print(f"  {lk} S{step['step']} {leg['label']}: [{vals}] → {l5['hitRate']['hits']}/{l5['hitRate']['total']} ({l5['hitRate']['pct']}%)")
                    count += 1
    ACTIVE.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"\n  Attached last-5 to {count} MLB legs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
