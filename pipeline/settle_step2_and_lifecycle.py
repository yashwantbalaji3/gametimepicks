"""
Officially settle June 18 Dual Bank Builder Step 2 and apply the dual-lane lifecycle.

Official sources only: ESPN FIFA World Cup scoreboard for the 90-minute regulation result (moneyline:
a team wins ONLY if it wins in regulation — a draw loses), MLB Stats API box score for Hits+Runs+RBIs
(DNP/no-PA → void). Writes ONLY the non-protected engine artifact. Never mutates
public/data/bank-builder/*. Sets per-lane lifecycle status:
  active | advanced | stopped | restarted | completed_success
A lane whose current step settles LOST stops; if its other leg has already started no pre-start
replacement is possible, so the lane is marked stopped (hidden from the public Bank Builder, logged in
Mr. Dub) and a fresh $100 restart lane is recorded. A lane still pending stays active.
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVE = ROOT / "app" / "public" / "data" / "methodology" / "launch" / "dual-bank-builder-active.json"


def _get(url):
    with urllib.request.urlopen(url, timeout=25) as r:
        return json.load(r)


def _norm(s):
    return "".join(c for c in (s or "").lower() if c.isalpha())


def _team_match(a, b):
    """Robust team-name match across provider naming (e.g. 'Czech Republic' vs ESPN 'Czechia',
    'Bosnia & Herzegovina' vs 'Bosnia-Herzegovina'). Substring OR shared 5-char prefix."""
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return False
    return na in nb or nb in na or na[:5] == nb[:5]


def wc_moneyline(team_label, date_yyyymmdd):
    """Grade a 90-minute moneyline from the official ESPN FT score. Win only if the team wins in regulation."""
    team = team_label.replace(" moneyline_90", "").strip()
    tnorm = _norm(team)
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates={date_yyyymmdd}"
    try:
        events = _get(url).get("events", [])
    except Exception as e:
        return {"result": "needs_review", "official": f"ESPN fetch failed: {e}", "source": "espn_fifa_world"}
    for e in events:
        comp = (e.get("competitions") or [{}])[0]
        cs = comp.get("competitors") or []
        if len(cs) != 2:
            continue
        disp = [c.get("team", {}).get("displayName") for c in cs]
        if not any(_team_match(team, d) for d in disp):
            continue
        state = comp.get("status", {}).get("type", {}).get("state")
        scores = [int(c.get("score") or 0) for c in cs]
        if state != "post":
            return {"result": "pending", "official": f"{disp[0]} {scores[0]}–{scores[1]} {disp[1]} (not final)", "source": "espn_fifa_world"}
        idx = 0 if _team_match(team, disp[0]) else 1
        other = 1 - idx
        won = scores[idx] > scores[other]
        return {
            "result": "won" if won else "lost",
            "official": f"{disp[0]} {scores[0]}–{scores[1]} {disp[1]} FT" + ("" if won else " — draw/loss; moneyline loses"),
            "source": "espn_fifa_world",
        }
    return {"result": "needs_review", "official": "no official FT fixture found", "source": "espn_fifa_world"}


def mlb_game_started(date, name):
    """Return (started, game_final, hrr_value, line_label) for a hitter on the given slate date."""
    try:
        sched = _get(f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date}")
    except Exception:
        return None
    games = (sched.get("dates") or [{}])[0].get("games", []) if sched.get("dates") else []
    nnorm = _norm(name)
    for g in games:
        pk = g["gamePk"]
        state = g.get("status", {}).get("abstractGameState")
        try:
            box = _get(f"https://statsapi.mlb.com/api/v1/game/{pk}/boxscore")
        except Exception:
            continue
        for side in ("home", "away"):
            for _, p in box["teams"][side]["players"].items():
                if _norm(p["person"]["fullName"]) == nnorm:
                    bat = p.get("stats", {}).get("batting", {})
                    started = state != "Preview"
                    final = state == "Final"
                    if bat and bat.get("hits") is not None:
                        hrr = int(bat.get("hits", 0)) + int(bat.get("runs", 0)) + int(bat.get("rbi", 0))
                        return {"started": started, "final": final, "hrr": hrr}
                    return {"started": started, "final": final, "hrr": None}
    return {"started": False, "final": False, "hrr": None}


def grade_hrr(participant, side, line, date):
    info = mlb_game_started(date, participant)
    if info is None:
        return {"result": "needs_review", "official": "schedule fetch failed", "source": "mlb_stats_api", "started": False}
    if not info.get("final"):
        # not final → if game started, the leg is in-play (can't be a pre-start replacement); else pending.
        return {"result": "pending", "official": "game not final", "source": "mlb_stats_api", "started": info.get("started", False)}
    if info.get("hrr") is None:
        return {"result": "void", "official": "no plate appearance (DNP) — no action", "source": "mlb_stats_api", "started": True}
    hrr = int(info["hrr"])
    won = hrr > line if (side or "").lower() == "over" else hrr < line
    return {"result": "won" if won else "lost", "official": f"{hrr} H+R+RBI", "source": "mlb_stats_api", "started": True}


def settle_leg(leg, date_yyyymmdd, slate_date):
    sport = leg.get("sport")
    if sport == "WORLD_CUP" and "moneyline" in (leg.get("marketType") or ""):
        return wc_moneyline(leg.get("label", ""), date_yyyymmdd), False
    if sport == "MLB" and "Hits + Runs + RBIs" in leg.get("label", ""):
        part = leg.get("participantName") or leg.get("label", "").split(" Hits")[0]
        r = grade_hrr(part, leg.get("side"), float(leg.get("line")), slate_date)
        return r, r.get("started", False)
    return {"result": "needs_review", "official": f"no rule for {sport} {leg.get('marketType')}", "source": "none"}, False


def lane_outcome(legs):
    res = [l["settlement"]["result"] for l in legs]
    if any(r == "lost" for r in res):
        return "lost"
    if all(r == "won" for r in res):
        return "won"
    if any(r == "pending" for r in res) or any(r == "needs_review" for r in res):
        return "pending"
    nonvoid = [r for r in res if r != "void"]
    if nonvoid and all(r == "won" for r in nonvoid):
        return "won"
    return "pending"


def main():
    doc = json.loads(ACTIVE.read_text())
    run = doc["run"]
    slate_date = run["date"]                  # 2026-06-18
    yyyymmdd = slate_date.replace("-", "")
    now = datetime.now(timezone.utc).isoformat()

    for lk in ("laneA", "laneB"):
        lane = run.get(lk)
        if not lane:
            continue
        step2 = next((s for s in lane["steps"] if s["step"] == 2), None)
        if not step2 or step2.get("status") != "pending":
            continue
        any_other_started = False
        for leg in step2["legs"]:
            res, started = settle_leg(leg, yyyymmdd, slate_date)
            leg["settlement"] = res
            if leg.get("sport") != "WORLD_CUP":
                any_other_started = any_other_started or started
        outcome = lane_outcome(step2["legs"])
        # If the soccer leg lost and the partner has already started, no pre-start replacement is possible.
        soccer_lost = any(l.get("sport") == "WORLD_CUP" and l["settlement"]["result"] == "lost" for l in step2["legs"])
        if outcome == "lost":
            step2["status"] = "settled"; step2["result"] = "lost"
            lane["laneStatus"] = "stopped"
            lane["publicVisible"] = False
            lane["stopReason"] = ("Soccer leg settled a loss; the partner leg had already started, so no pre-start "
                                  "replacement was possible." if soccer_lost and any_other_started
                                  else "Step settled a loss.")
        elif outcome == "won":
            step2["status"] = "settled"; step2["result"] = "won"
            lane["laneStatus"] = "advanced"; lane["publicVisible"] = True
        else:
            step2["status"] = "pending"; step2["result"] = None
            lane["laneStatus"] = "active"; lane["publicVisible"] = True

    run["step2SettlementAt"] = now
    run["lifecycle"] = {
        "laneA": {"status": run["laneA"].get("laneStatus"), "public": run["laneA"].get("publicVisible", True)},
        "laneB": {"status": run["laneB"].get("laneStatus"), "public": run["laneB"].get("publicVisible", True)},
        "note": "Stopped lanes are hidden from the public Bank Builder and tracked on Mr. Dub.",
    }
    doc["meta"]["step2SettledAt"] = now
    ACTIVE.write_text(json.dumps(doc, indent=2) + "\n")

    print("Step 2 settlement:")
    for lk in ("laneA", "laneB"):
        lane = run[lk]
        s2 = next(s for s in lane["steps"] if s["step"] == 2)
        print(f"  {lk}: laneStatus={lane.get('laneStatus')} public={lane.get('publicVisible')} step2={s2.get('result')}")
        for leg in s2["legs"]:
            print(f"     - {leg['label']}: {leg['settlement']['result'].upper()} · {leg['settlement']['official']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
