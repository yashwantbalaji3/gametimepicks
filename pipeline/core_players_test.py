"""
Phase 17 — pipeline.core_players_test

Regression tests for the top-N core players per team filter. Mirrors the
rules in `app/src/lib/core-players.ts`:

  - Primary ranking: sum of modelProjection across markets
  - Fallback: edgePct × confidence weight
  - Tertiary: distinct market count
  - Tiebreak: stable key sort
  - Empty team field → all leans bucket into a single team
  - Honest absence: if a team has < N qualifying players, return what's there

Zero network. Pure logic.
"""
from __future__ import annotations
import re


def player_key(lean: dict) -> str:
    pid = lean.get("playerId", 0) or 0
    if pid > 0:
        return f"pid:{pid}"
    name = (lean.get("playerName") or "").lower()
    name = re.sub(r"[^a-z0-9]+", "_", name).strip("_")
    return f"name:{name or 'unknown'}"


def conf_weight(c) -> float:
    return {"High": 1.0, "Medium": 0.6, "Low": 0.3}.get(c, 0.1)


def top_core_keys(leans: list[dict], n: int = 3) -> set[str]:
    """Mirror of topCorePlayerKeysPerTeam()."""
    if n <= 0 or not leans:
        return set()

    scores_by_team = {}  # team -> { player_key -> score_dict }
    for lean in leans:
        if lean.get("lean") not in ("Over", "Under"):
            continue
        team = (lean.get("team") or "").strip()
        pk = player_key(lean)
        if team not in scores_by_team:
            scores_by_team[team] = {}
        if pk not in scores_by_team[team]:
            scores_by_team[team][pk] = {
                "key": pk,
                "team": team,
                "projection_sum": 0.0,
                "edge_weight": 0.0,
                "market_count": 0,
            }
        s = scores_by_team[team][pk]
        proj = float(lean.get("modelProjection") or lean.get("projection") or 0)
        if proj > 0:
            s["projection_sum"] += proj
        edge = float(lean.get("edgePct") or 0)
        if edge > 0:
            s["edge_weight"] += edge * conf_weight(lean.get("confidence"))
        s["market_count"] += 1

    core_keys = set()
    for team_map in scores_by_team.values():
        ranked = sorted(
            team_map.values(),
            key=lambda s: (
                -s["projection_sum"],
                -s["edge_weight"],
                -s["market_count"],
                s["key"],
            ),
        )
        for s in ranked[:n]:
            core_keys.add(s["key"])
    return core_keys


def lean(*, name="P", pid=1, market="PTS", side="Over", line=20.0,
         edge=4.0, conf="High", team="TEAM", proj=22.0):
    return {
        "playerId": pid, "playerName": name, "market": market, "lean": side,
        "line": line, "edgePct": edge, "confidence": conf, "team": team,
        "modelProjection": proj,
    }


def main() -> int:
    asserts = 0

    # ── Test 1: empty input → empty set ─────────────────────────────────
    assert top_core_keys([]) == set()
    assert top_core_keys([], n=3) == set()
    asserts += 2

    # ── Test 2: n=0 returns empty ───────────────────────────────────────
    assert top_core_keys([lean()], n=0) == set()
    asserts += 1

    # ── Test 3: single team, 5 players, top 3 by projection ─────────────
    leans = [
        lean(pid=1, name="Star A",  team="LAL", market="PTS", proj=30),
        lean(pid=2, name="Star B",  team="LAL", market="PTS", proj=25),
        lean(pid=3, name="Star C",  team="LAL", market="PTS", proj=20),
        lean(pid=4, name="Bench D", team="LAL", market="PTS", proj=8),
        lean(pid=5, name="Bench E", team="LAL", market="PTS", proj=5),
    ]
    keys = top_core_keys(leans, n=3)
    assert keys == {"pid:1", "pid:2", "pid:3"}, f"got {keys}"
    assert "pid:4" not in keys
    assert "pid:5" not in keys
    asserts += 3

    # ── Test 4: full-coverage player beats single-market high projection ─
    # Player A has 3 markets (10+10+10=30 sum)
    # Player B has 1 market with proj 25
    # A should win because total projection sum is higher
    leans = [
        lean(pid=1, name="A", team="LAL", market="PTS", proj=10),
        lean(pid=1, name="A", team="LAL", market="REB", proj=10),
        lean(pid=1, name="A", team="LAL", market="AST", proj=10),
        lean(pid=2, name="B", team="LAL", market="PTS", proj=25),
        lean(pid=3, name="C", team="LAL", market="PTS", proj=8),
    ]
    keys = top_core_keys(leans, n=2)
    assert "pid:1" in keys, f"A (full coverage, sum=30) should be top"
    assert "pid:2" in keys, f"B (single market, proj=25) should be 2nd"
    assert "pid:3" not in keys
    asserts += 3

    # ── Test 5: per-team ranking (top 3 from EACH team) ─────────────────
    leans = []
    for t, score in [("LAL", 30), ("LAL", 25), ("LAL", 20), ("LAL", 8),
                     ("DEN", 28), ("DEN", 22), ("DEN", 18), ("DEN", 6)]:
        leans.append(lean(pid=len(leans) + 1, name=f"P{len(leans)}",
                          team=t, market="PTS", proj=score))
    keys = top_core_keys(leans, n=3)
    # Top 3 of each team = 6 keys total
    assert len(keys) == 6, f"expected 6 keys, got {len(keys)}: {keys}"
    # Specific check: LAL top 3 = pid:1,2,3 / DEN top 3 = pid:5,6,7
    assert "pid:1" in keys and "pid:2" in keys and "pid:3" in keys
    assert "pid:5" in keys and "pid:6" in keys and "pid:7" in keys
    # Bench excluded
    assert "pid:4" not in keys
    assert "pid:8" not in keys
    asserts += 5

    # ── Test 6: zero projections → fallback to edge × confidence ────────
    leans = [
        lean(pid=1, name="A", team="LAL", proj=0, edge=10, conf="High"),
        lean(pid=2, name="B", team="LAL", proj=0, edge=8,  conf="Medium"),
        lean(pid=3, name="C", team="LAL", proj=0, edge=4,  conf="Low"),
        lean(pid=4, name="D", team="LAL", proj=0, edge=2,  conf="Low"),
    ]
    keys = top_core_keys(leans, n=2)
    # A has 10*1.0 = 10, B has 8*0.6 = 4.8, C has 4*0.3 = 1.2, D has 2*0.3 = 0.6
    assert "pid:1" in keys and "pid:2" in keys, f"got {keys}"
    assert "pid:3" not in keys
    asserts += 2

    # ── Test 7: missing team → bucket as single team ────────────────────
    leans = [
        lean(pid=1, name="A", team="", proj=30),
        lean(pid=2, name="B", team="", proj=25),
        lean(pid=3, name="C", team="", proj=20),
        lean(pid=4, name="D", team="", proj=8),
    ]
    keys = top_core_keys(leans, n=3)
    assert keys == {"pid:1", "pid:2", "pid:3"}, f"got {keys}"
    asserts += 1

    # ── Test 8: fewer qualifiers than N returns all ─────────────────────
    leans = [
        lean(pid=1, name="A", team="LAL", proj=30),
        lean(pid=2, name="B", team="LAL", proj=25),
    ]
    keys = top_core_keys(leans, n=5)
    assert keys == {"pid:1", "pid:2"}
    asserts += 1

    # ── Test 9: No-Play leans excluded from ranking ─────────────────────
    leans = [
        {"playerId": 1, "playerName": "A", "team": "LAL", "lean": "No Play",
         "modelProjection": 30, "edgePct": 0, "confidence": "Low",
         "market": "PTS"},
        lean(pid=2, name="B", team="LAL", proj=25),
        lean(pid=3, name="C", team="LAL", proj=20),
        lean(pid=4, name="D", team="LAL", proj=15),
    ]
    keys = top_core_keys(leans, n=3)
    assert "pid:1" not in keys, "No Play should be excluded"
    assert keys == {"pid:2", "pid:3", "pid:4"}
    asserts += 2

    # ── Test 10: deterministic — same input → same output ──────────────
    leans = [
        lean(pid=1, name="A", team="LAL", proj=20),
        lean(pid=2, name="B", team="LAL", proj=20),  # tie!
        lean(pid=3, name="C", team="LAL", proj=20),  # tie!
        lean(pid=4, name="D", team="LAL", proj=15),
    ]
    keys1 = top_core_keys(leans, n=2)
    keys2 = top_core_keys(leans, n=2)
    assert keys1 == keys2, "Top-N must be deterministic on ties"
    asserts += 1

    # ── Test 11: realistic NBA scenario — 2 teams, 8 players each ──────
    teams = ["LAL", "DEN"]
    proj_set = [28, 24, 19, 15, 12, 8, 6, 4]
    leans = []
    for t in teams:
        for i, p in enumerate(proj_set):
            for m in ["PTS", "REB", "AST"]:
                leans.append(lean(
                    pid=teams.index(t) * 100 + i + 1,
                    name=f"{t}_P{i + 1}",
                    team=t,
                    market=m,
                    proj=p / 3,  # split projection across markets
                ))
    keys = top_core_keys(leans, n=3)
    assert len(keys) == 6, f"top 3 per team × 2 teams = 6 keys, got {len(keys)}"
    # Top 3 LAL = pid:1,2,3
    for i in (1, 2, 3):
        assert f"pid:{i}" in keys, f"pid:{i} (LAL star) missing"
    # Top 3 DEN = pid:101,102,103
    for i in (101, 102, 103):
        assert f"pid:{i}" in keys, f"pid:{i} (DEN star) missing"
    # Bench excluded
    for i in (4, 5, 6, 7, 8, 104, 105, 106):
        assert f"pid:{i}" not in keys, f"bench pid:{i} should be excluded"
    asserts += 1 + 6 + 8

    # ── Test 12: missing playerId falls back to name-based key ─────────
    leans = [
        lean(pid=0, name="LeBron James", team="LAL", proj=30),
        lean(pid=0, name="Anthony Davis", team="LAL", proj=25),
        lean(pid=0, name="Austin Reaves", team="LAL", proj=20),
        lean(pid=0, name="Bench Guy", team="LAL", proj=8),
    ]
    keys = top_core_keys(leans, n=3)
    assert "name:lebron_james" in keys
    assert "name:anthony_davis" in keys
    assert "name:austin_reaves" in keys
    assert "name:bench_guy" not in keys
    asserts += 4

    print(f"\n  ✓ all {asserts} corePlayers assertions passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
