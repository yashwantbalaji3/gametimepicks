"""
settle_player_props — officially grade World Cup player props (anytime goalscorer + shots on
target) from API-Football per-player fixture statistics, matched by the player's API-Football id
(the props were built from API-Football squads, so the id is exact — no name guessing).

Grading (90-minute + stoppage, as the books grade these):
  - player_goal_scorer_anytime (pick "Yes")  → won if the player scored ≥1 goal, else lost.
  - player_shots_on_target (Over/Under line)  → from the player's shots-on-target stat.
  - a player with NO stat row (did not feature) → VOID (DNP), never a loss.
  - if the official per-player stat is unavailable for a fixture → needs_review (never invented).
"""
from __future__ import annotations

import argparse
import json
import os
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
PP = ROOT / "app" / "public" / "data" / "world-cup" / "player-projections"
AF = "https://v3.football.api-sports.io"
LEAGUE = int(os.environ.get("WC_API_FOOTBALL_LEAGUE", "1"))
SEASON = int(os.environ.get("WC_API_FOOTBALL_SEASON", "2026"))


def http(url: str, key: str) -> dict:
    req = urllib.request.Request(url, headers={"x-apisports-key": key})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def fixture_ids(date: str, key: str) -> dict[str, int]:
    """{'home vs away' (lower): apiFootballFixtureId} for the slate date + the next UTC day."""
    out: dict[str, int] = {}
    for d in (date, (datetime.fromisoformat(date) + timedelta(days=1)).strftime("%Y-%m-%d")):
        q = urllib.parse.urlencode({"league": LEAGUE, "season": SEASON, "date": d})
        for f in http(f"{AF}/fixtures?{q}", key).get("response", []):
            h, a = f["teams"]["home"]["name"], f["teams"]["away"]["name"]
            out[f"{h} vs {a}".lower()] = f["fixture"]["id"]
    return out


def player_stats(fixture_id: int, key: str) -> dict[int, dict]:
    """{playerId: {goals, shots_on, played}} from /fixtures/players."""
    out: dict[int, dict] = {}
    for team in http(f"{AF}/fixtures/players?fixture={fixture_id}", key).get("response", []):
        for pr in team.get("players", []):
            st = (pr.get("statistics") or [{}])[0]
            mins = ((st.get("games") or {}).get("minutes"))
            out[pr["player"]["id"]] = {
                "goals": ((st.get("goals") or {}).get("total")) or 0,
                "shots_on": ((st.get("shots") or {}).get("on")) or 0,
                "played": mins is not None,
            }
    return out


def norm_fixture(name: str) -> str:
    return (name or "").strip().lower()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Officially settle World Cup player props.")
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    key = os.environ.get("API_FOOTBALL_KEY", "").strip()
    if not key:
        print("[wc-props-settle] STOP API_FOOTBALL_KEY not set"); return 2

    doc = json.loads((PP / f"{args.date}.json").read_text())
    fids = fixture_ids(args.date, key)

    # map each prop's fixture name → fixture id → per-player stats (fetched once per fixture)
    stats_cache: dict[int, dict] = {}
    counts = {"won": 0, "lost": 0, "void": 0, "needs_review": 0}
    for p in doc.get("matches", []):
        fx = norm_fixture(p.get("fixture"))
        fid = None
        for k, v in fids.items():
            kt = k.split(" vs ")
            pt = fx.split(" vs ")
            if len(kt) == 2 and len(pt) == 2 and kt[0].strip() in pt[0] or (len(pt) == 2 and pt[0] in k):
                fid = v; break
        # exact-ish match fallback
        if fid is None:
            fid = fids.get(fx)
        if fid is None:
            p["result"] = "needs_review"; p["final"] = "fixture not found"; counts["needs_review"] += 1; continue
        if fid not in stats_cache:
            try:
                stats_cache[fid] = player_stats(fid, key)
            except Exception as e:
                stats_cache[fid] = {}
        stats = stats_cache[fid]
        pid = (p.get("player") or {}).get("id")
        srow = stats.get(pid)
        if not srow or not srow.get("played"):
            p["result"] = "void"; p["final"] = f"{(p.get('player') or {}).get('name')} did not feature (DNP)"
            counts["void"] += 1; continue
        if p["market"] == "player_goal_scorer_anytime":
            won = srow["goals"] >= 1
            p["result"] = "won" if won else "lost"
            p["final"] = f"{p['player']['name']} {srow['goals']} goal(s) — official"
        elif p["market"] == "player_shots_on_target":
            line = p.get("line")
            side = p.get("pick")
            v = srow["shots_on"]
            if not isinstance(line, (int, float)) or side not in ("Over", "Under"):
                p["result"] = "needs_review"; p["final"] = "missing line/side"; counts["needs_review"] += 1; continue
            won = (v > line) if side == "Over" else (v < line)
            p["result"] = "won" if won else "lost"
            p["final"] = f"{p['player']['name']} {v} shots on target ({side} {line}) — official"
        else:
            p["result"] = "needs_review"; p["final"] = "unsupported market"; counts["needs_review"] += 1; continue
        counts[p["result"]] = counts.get(p["result"], 0) + 1

    doc["settledAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    doc["settlementSource"] = "official: api_football /fixtures/players + /fixtures/events (matched by player id)"
    doc["settlementCounts"] = counts
    for name in (f"{args.date}.json", "latest.json"):
        (PP / name).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"[wc-props-settle] {args.date}: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
