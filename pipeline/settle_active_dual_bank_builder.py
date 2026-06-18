"""
Settle the active engine-namespace Dual Bank Builder from OFFICIAL sources only.

Reproducible: it re-fetches the official results (MLB Stats API box scores; ESPN FIFA World Cup
scoreboard final scores) and grades each leg — never hardcoded, never fabricated. Writes results back
into the NON-protected artifact at app/public/data/methodology/launch/dual-bank-builder-active.json.
It NEVER touches protected public/data/bank-builder/* files.

Settlement rules:
- WC double-chance "X or Draw": WON if team X wins OR the match is a draw in regulation (FT); else LOST.
- MLB strikeouts Over L: WON if K > L; Under L: WON if K < L; VOID if the pitcher has no pitching line
  (did not appear). PENDING if the game/match is not Final.
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "app" / "public" / "data" / "methodology" / "launch" / "dual-bank-builder-active.json"


def _get(url: str):
    with urllib.request.urlopen(url, timeout=25) as r:
        return json.load(r)


def _norm(s: str) -> str:
    return "".join(c for c in (s or "").lower() if c.isalpha())


# ── Pure grading rules (unit-tested) ─────────────────────────────────────────────────────────────
def grade_over_under(ks: int, side: str, line: float):
    """Over L wins if K > L; Under L wins if K < L. Returns 'won' | 'lost' | None (unknown side)."""
    s = (side or "").lower()
    if s == "over":
        return "won" if ks > line else "lost"
    if s == "under":
        return "won" if ks < line else "lost"
    return None


def grade_double_chance(team_score: int, opp_score: int) -> str:
    """'X or Draw' wins if X wins OR the match is drawn in regulation."""
    return "won" if team_score >= opp_score else "lost"


# ── World Cup (ESPN FIFA World Cup scoreboard, official FT scores) ────────────────────────────────
def _wc_events(date_yyyymmdd: str):
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates={date_yyyymmdd}"
    try:
        return _get(url).get("events", [])
    except Exception:
        return []


def settle_wc_double_chance(team_label: str, dates):
    """team_label like 'Colombia or Draw' → grade from the match's FT score."""
    team = team_label.split(" or ")[0].strip()
    tnorm = _norm(team)
    for date in dates:
        for e in _wc_events(date):
            comp = (e.get("competitions") or [{}])[0]
            cs = comp.get("competitors") or []
            if len(cs) != 2:
                continue
            names = [_norm(c.get("team", {}).get("displayName", "")) for c in cs]
            if not any(tnorm in n or n in tnorm for n in names):
                continue
            status = comp.get("status", {}).get("type", {}).get("state")  # 'post' when final
            scores = [int(c.get("score") or 0) for c in cs]
            disp = [c.get("team", {}).get("displayName") for c in cs]
            ft = comp.get("status", {}).get("type", {}).get("description")
            if status != "post":
                return {"result": "pending", "official": f"{disp[0]} {scores[0]}–{scores[1]} {disp[1]} ({ft})", "source": "espn_fifa_world"}
            # which competitor is our team
            idx = 0 if (tnorm in names[0] or names[0] in tnorm) else 1
            other = 1 - idx
            return {
                "result": grade_double_chance(scores[idx], scores[other]),
                "official": f"{disp[0]} {scores[0]}–{scores[1]} {disp[1]} FT",
                "source": "espn_fifa_world",
            }
    return {"result": "needs_review", "official": "no official FT fixture found for team", "source": "espn_fifa_world"}


# ── MLB (MLB Stats API box scores, official) ─────────────────────────────────────────────────────
def _mlb_games(date: str):
    url = f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date}"
    d = _get(url)
    return (d.get("dates") or [{}])[0].get("games", []) if d.get("dates") else []


def _mlb_pitcher_ks(date: str, name: str):
    """Find the game where the pitcher ACTUALLY pitched (a doubleheader roster appearance with no
    pitching line is not where they pitched). Prefer a game with a real pitching line."""
    nnorm = _norm(name)
    rostered = None  # seen on a roster but no pitching line (fallback → void)
    for g in _mlb_games(date):
        final = g.get("status", {}).get("abstractGameState") == "Final"
        pk = g["gamePk"]
        try:
            box = _get(f"https://statsapi.mlb.com/api/v1/game/{pk}/boxscore")
        except Exception:
            continue
        for side in ("home", "away"):
            for _, p in box["teams"][side]["players"].items():
                if _norm(p["person"]["fullName"]) == nnorm:
                    ps = p.get("stats", {}).get("pitching", {})
                    if ps and ps.get("strikeOuts") is not None:
                        return {"final": final, "ks": ps.get("strikeOuts"), "ip": ps.get("inningsPitched"), "gamePk": pk}
                    rostered = {"final": final, "ks": None, "ip": None, "gamePk": pk, "no_pitching_line": True}
    return rostered


def settle_mlb_strikeouts(participant: str, side: str, line: float, date: str):
    info = _mlb_pitcher_ks(date, participant)
    if info is None:
        return {"result": "needs_review", "official": "pitcher not found in official box scores", "source": "mlb_stats_api"}
    if not info["final"]:
        return {"result": "pending", "official": "game not Final", "source": "mlb_stats_api"}
    if info.get("ks") is None:  # no pitching line → did not appear
        return {"result": "void", "official": "did not pitch (no plate-appearance/pitching line) — no-action", "source": "mlb_stats_api"}
    ks = int(info["ks"])
    graded = grade_over_under(ks, side, line)
    return {
        "result": graded if graded is not None else "needs_review",
        "official": f"{ks} K ({info['ip']} IP)",
        "source": "mlb_stats_api",
    }


def settle_leg(leg, slate_date, wc_dates):
    market = (leg.get("marketType") or "").lower()
    if leg.get("sport") == "WORLD_CUP" and "double_chance" in market:
        return settle_wc_double_chance(leg.get("participantName") or leg.get("label", "").split(" double_chance")[0], wc_dates)
    if leg.get("sport") == "MLB" and "strikeout" in market:
        # participant name = the leg's participant; pull from label if needed
        part = leg.get("participantName") or leg.get("label", "").split(" Strikeouts")[0]
        return settle_mlb_strikeouts(part, leg.get("side"), float(leg.get("line")), slate_date)
    return {"result": "needs_review", "official": f"no settlement rule for {leg.get('sport')} {market}", "source": "none"}


def lane_result(legs):
    results = [l["settlement"]["result"] for l in legs]
    if any(r == "lost" for r in results):
        return "lost"
    if all(r == "won" for r in results):
        return "won"
    # void legs drop; if all remaining won → won; if all void → push
    nonvoid = [r for r in results if r not in ("void",)]
    if nonvoid and all(r == "won" for r in nonvoid):
        return "won"
    if results and all(r == "void" for r in results):
        return "push"
    return "pending"


def main():
    doc = json.loads(ARTIFACT.read_text())
    run = doc["run"]
    slate_date = run["date"]                     # e.g. 2026-06-17
    wc_dates = [slate_date.replace("-", ""), (slate_date[:8] + str(int(slate_date[8:]) + 1).zfill(2)).replace("-", "")]
    now = datetime.now(timezone.utc).isoformat()

    for lane_key in ("laneA", "laneB"):
        lane = run.get(lane_key)
        if not lane:
            continue
        for leg in lane["legs"]:
            leg["settlement"] = settle_leg(leg, slate_date, wc_dates)
        lr = lane_result(lane["legs"])
        lane["result"] = lr
        lane["advanced"] = lr == "won"
        lane["settledLegs"] = sum(1 for l in lane["legs"] if l["settlement"]["result"] in ("won", "lost", "void"))

    run["settlement"] = {
        "settledAt": now,
        "sources": ["mlb_stats_api", "espn_fifa_world"],
        "laneA": {"result": run["laneA"]["result"], "advanced": run["laneA"]["advanced"]} if run.get("laneA") else None,
        "laneB": {"result": run["laneB"]["result"], "advanced": run["laneB"]["advanced"]} if run.get("laneB") else None,
        "note": "Official sources only. 90-minute WC result (not advancement). DNP/no-PA voids. Protected ladder history untouched.",
    }
    run["status"] = "settled"
    doc["meta"]["settledAt"] = now

    ARTIFACT.write_text(json.dumps(doc, indent=2) + "\n")
    print("Settled active dual bank builder:")
    for lk in ("laneA", "laneB"):
        l = run.get(lk)
        if l:
            print(f"  {lk}: {l['result'].upper()} (advanced={l['advanced']})")
            for leg in l["legs"]:
                print(f"    - {leg['label']}: {leg['settlement']['result'].upper()} · {leg['settlement']['official']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
