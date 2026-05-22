"""Tests for pipeline.snapshot_curated.

Pure-function tests against handcrafted lean fixtures + temp boards.
Never reads real production data; never writes to the real
snapshots directory.

Run: python -m pipeline.snapshot_curated_test
"""
from __future__ import annotations

import sys
import tempfile
import os
import json

from . import snapshot_curated as SC


GREEN = "\033[0;32m"; RED = "\033[0;31m"; BLUE = "\033[0;34m"; RESET = "\033[0m"


class Suite:
    def __init__(self): self.passed = 0; self.failed = 0
    def ok(self, c, n):
        if c: self.passed += 1; print(f"  {GREEN}✓{RESET} {n}")
        else: self.failed += 1; print(f"  {RED}✗{RESET} {n}")
    def eq(self, a, b, n):
        if a == b: self.passed += 1; print(f"  {GREEN}✓{RESET} {n}")
        else: self.failed += 1; print(f"  {RED}✗{RESET} {n}\n    expected {b!r}, got {a!r}")


def _build(tmp: str, *, nba_leans: list[dict] | None = None, mlb_leans: list[dict] | None = None) -> dict:
    """Write fixture boards into a temp dir + build snapshot from there."""
    date = "2099-01-01"
    if nba_leans is not None:
        nba_dir = os.path.join(tmp, "app", "public", "data", "boards")
        os.makedirs(nba_dir, exist_ok=True)
        with open(os.path.join(nba_dir, f"{date}.json"), "w") as f:
            json.dump({"date": date, "leans": nba_leans}, f)
    if mlb_leans is not None:
        mlb_dir = os.path.join(tmp, "app", "public", "data", "mlb", "boards")
        os.makedirs(mlb_dir, exist_ok=True)
        with open(os.path.join(mlb_dir, f"{date}.json"), "w") as f:
            json.dump({"date": date, "leans": mlb_leans}, f)
    cwd = os.getcwd()
    try:
        os.chdir(tmp)
        return SC.build_snapshot(date)
    finally:
        os.chdir(cwd)


def test_no_leans_returns_empty(s: Suite):
    print(f"\n  {BLUE}─── empty board → empty picks (no fabrication) ───{RESET}")
    with tempfile.TemporaryDirectory() as tmp:
        payload = _build(tmp, nba_leans=[], mlb_leans=[])
    s.eq(payload["picksCount"], 0, "no picks produced")
    s.eq(payload["picks"], [], "picks array empty")


def test_excludes_pass_no_play_insufficient_data(s: Suite):
    print(f"\n  {BLUE}─── Pass / No Play / insufficient_data never pass ───{RESET}")
    leans = [
        {"gameId": "G1", "playerId": 1, "playerName": "Pass Player",
         "team": "AAA", "opponent": "BBB",
         "market": "REB", "lean": "Pass", "line": 5.5, "edgePct": 10,
         "confidence": "High", "recent10": [1,2,3,4,5,6]},
        {"gameId": "G1", "playerId": 2, "playerName": "Insufficient",
         "team": "AAA", "opponent": "BBB",
         "market": "REB", "lean": "Over", "line": 5.5, "edgePct": 8,
         "confidence": "insufficient_data", "recent10": []},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        payload = _build(tmp, nba_leans=leans)
    s.eq(payload["picksCount"], 0, "neither leans pass the filter")


def test_anomaly_extreme_edge_excluded(s: Suite):
    print(f"\n  {BLUE}─── extreme-edge (>25pp NBA / >20pp MLB) excluded ───{RESET}")
    leans = [
        {"gameId": "G1", "playerId": 10, "playerName": "Anomaly Edge",
         "team": "AAA", "opponent": "BBB",
         "market": "REB", "lean": "Over", "line": 4.5, "edgePct": 30,
         "confidence": "High", "recent10": [1,2,3,4,5,6]},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        payload = _build(tmp, nba_leans=leans)
    s.eq(payload["picksCount"], 0, "30pp NBA edge excluded as anomaly")


def test_market_floor_respected(s: Suite):
    print(f"\n  {BLUE}─── NBA REB has lower floor than NBA PTS ───{RESET}")
    # NBA REB floor is 3pp, PTS floor is 5pp. A 4pp PTS edge fails;
    # a 4pp REB edge passes.
    leans = [
        {"gameId": "G1", "playerId": 1, "playerName": "REB Player",
         "team": "AAA", "opponent": "BBB",
         "market": "REB", "lean": "Over", "line": 4.5, "edgePct": 4,
         "confidence": "High", "recent10": [1,2,3,4,5,6]},
        {"gameId": "G1", "playerId": 2, "playerName": "PTS Player",
         "team": "AAA", "opponent": "BBB",
         "market": "PTS", "lean": "Over", "line": 20.5, "edgePct": 4,
         "confidence": "High", "recent10": [1,2,3,4,5,6]},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        payload = _build(tmp, nba_leans=leans)
    names = [p["playerName"] for p in payload["picks"]]
    s.ok("REB Player" in names, "REB pick passes 4pp edge")
    s.ok("PTS Player" not in names, "PTS pick fails 4pp edge (floor is 5pp)")


def test_max_per_sport_caps_pool(s: Suite):
    print(f"\n  {BLUE}─── max_per_sport caps the picks per sport ───{RESET}")
    # Generate 5 NBA REB candidates, all eligible. Cap to 3 per sport.
    leans = [
        {"gameId": "G1", "playerId": 100 + i, "playerName": f"P{i}",
         "team": "AAA", "opponent": "BBB",
         "market": "REB", "lean": "Over", "line": 4.5, "edgePct": 8 + i,
         "confidence": "High", "recent10": [1,2,3,4,5,6]}
        for i in range(5)
    ]
    with tempfile.TemporaryDirectory() as tmp:
        payload = _build(tmp, nba_leans=leans)
    nba_count = sum(1 for p in payload["picks"] if p["sport"] == "nba")
    s.eq(nba_count, 3, "NBA capped to 3")


def test_pick_id_is_stable(s: Suite):
    print(f"\n  {BLUE}─── pickId deterministic across reruns ───{RESET}")
    leans = [
        {"gameId": "G1", "playerId": 1, "playerName": "P1",
         "team": "AAA", "opponent": "BBB",
         "market": "REB", "lean": "Over", "line": 4.5, "edgePct": 9,
         "confidence": "High", "recent10": [1,2,3,4,5,6]},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        p1 = _build(tmp, nba_leans=leans)
    with tempfile.TemporaryDirectory() as tmp:
        p2 = _build(tmp, nba_leans=leans)
    s.eq(p1["picks"][0]["pickId"], p2["picks"][0]["pickId"],
         "same inputs → identical pickId")


def test_pending_status_only(s: Suite):
    print(f"\n  {BLUE}─── every raw pick starts at pending, no result ───{RESET}")
    leans = [
        {"gameId": "G1", "playerId": 1, "playerName": "P1",
         "team": "AAA", "opponent": "BBB",
         "market": "REB", "lean": "Over", "line": 4.5, "edgePct": 9,
         "confidence": "High", "recent10": [1,2,3,4,5,6]},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        payload = _build(tmp, nba_leans=leans)
    for p in payload["picks"]:
        s.eq(p.get("status"), "pending", "status is pending")
        s.ok("result" not in p, "no result field on raw snapshot pick")


def main():
    s = Suite()
    for t in (
        test_no_leans_returns_empty,
        test_excludes_pass_no_play_insufficient_data,
        test_anomaly_extreme_edge_excluded,
        test_market_floor_respected,
        test_max_per_sport_caps_pool,
        test_pick_id_is_stable,
        test_pending_status_only,
    ):
        t(s)
    print(
        f"\n{GREEN if s.failed == 0 else RED}"
        f"{'✓' if s.failed == 0 else '✗'} "
        f"{s.passed} assertions passed, {s.failed} failed{RESET}"
    )
    return 0 if s.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
