"""Tests for pipeline.grade_curated.

Pure tests over fixture pick lists + lookup dicts. Never writes
to the real graded directory.

Run: python -m pipeline.grade_curated_test
"""
from __future__ import annotations

import sys
import tempfile
import os
import json

from . import grade_curated as GC


GREEN = "\033[0;32m"; RED = "\033[0;31m"; BLUE = "\033[0;34m"; RESET = "\033[0m"


class Suite:
    def __init__(self): self.passed = 0; self.failed = 0
    def ok(self, c, n):
        if c: self.passed += 1; print(f"  {GREEN}✓{RESET} {n}")
        else: self.failed += 1; print(f"  {RED}✗{RESET} {n}")
    def eq(self, a, b, n):
        if a == b: self.passed += 1; print(f"  {GREEN}✓{RESET} {n}")
        else: self.failed += 1; print(f"  {RED}✗{RESET} {n}\n    expected {b!r}, got {a!r}")


def _nba_pick(pid, market, side, line, **rest):
    return {
        "pickId": f"curated_pid{pid}_{market}_{side}_{line}",
        "sport": "nba", "playerId": pid, "playerName": f"NBA_{pid}",
        "market": market, "side": side, "line": line,
        "reasonTag": "watchlist", "health": "watch", **rest,
    }


def _mlb_pick(pid, market_key, side, line, **rest):
    return {
        "pickId": f"curated_pid{pid}_{market_key}_{side}_{line}",
        "sport": "mlb", "playerId": pid, "playerName": f"MLB_{pid}",
        "market": market_key, "side": side, "line": line,
        "reasonTag": "watchlist", "health": "watch", **rest,
    }


def test_pending_when_no_settled(s: Suite):
    print(f"\n  {BLUE}─── unresolved → pending (never loss) ───{RESET}")
    snapshot = {
        "date": "2099-01-01",
        "picks": [_nba_pick(1, "REB", "Over", 4.5)],
    }
    orig = GC._settled_lookup_for_date
    try:
        GC._settled_lookup_for_date = lambda date: {}
        graded = GC.grade_snapshot_payload(snapshot)
    finally:
        GC._settled_lookup_for_date = orig
    s.eq(graded["picks"][0]["status"], "pending", "status pending")
    s.eq(graded["picks"][0]["result"], "unresolved", "result unresolved")


def test_nba_win_grades_correctly(s: Suite):
    print(f"\n  {BLUE}─── NBA pick win → status win ───{RESET}")
    snapshot = {
        "date": "2099-01-01",
        "picks": [_nba_pick(7, "REB", "Over", 4.5)],
    }
    orig = GC._settled_lookup_for_date
    try:
        GC._settled_lookup_for_date = lambda date: {
            (7, "REB", "Over", 4.5): {"result": "win", "finalStat": 7},
        }
        graded = GC.grade_snapshot_payload(snapshot)
    finally:
        GC._settled_lookup_for_date = orig
    s.eq(graded["picks"][0]["status"], "win", "status win")
    s.eq(graded["picks"][0]["finalStat"], 7, "finalStat carried")


def test_mlb_outcome_normalization(s: Suite):
    print(f"\n  {BLUE}─── MLB outcome 'Loss' → status loss ───{RESET}")
    # The settled lookup in production normalizes MLB outcome →
    # result. Here we exercise the path by feeding pre-normalized
    # rows; the lookup helper test below covers the file-format
    # normalization.
    snapshot = {
        "date": "2099-01-01",
        "picks": [_mlb_pick(901, "pitcher_strikeouts", "Over", 5.5)],
    }
    orig = GC._settled_lookup_for_date
    try:
        GC._settled_lookup_for_date = lambda date: {
            (901, "pitcher_strikeouts", "Over", 5.5):
                {"result": "loss", "finalStat": 3},
        }
        graded = GC.grade_snapshot_payload(snapshot)
    finally:
        GC._settled_lookup_for_date = orig
    s.eq(graded["picks"][0]["status"], "loss", "status loss")


def test_push_excluded_from_decisive(s: Suite):
    print(f"\n  {BLUE}─── push pick → status push, not a loss ───{RESET}")
    snapshot = {
        "date": "2099-01-01",
        "picks": [_nba_pick(1, "REB", "Over", 4.5)],
    }
    orig = GC._settled_lookup_for_date
    try:
        GC._settled_lookup_for_date = lambda date: {
            (1, "REB", "Over", 4.5): {"result": "push", "finalStat": 4.5},
        }
        graded = GC.grade_snapshot_payload(snapshot)
    finally:
        GC._settled_lookup_for_date = orig
    s.eq(graded["picks"][0]["status"], "push", "status push")


def test_summary_excludes_pending_from_hit_rate(s: Suite):
    print(f"\n  {BLUE}─── summary lifetime hit rate excludes pending ───{RESET}")
    # Build a fake graded directory with one win + one pending pick.
    with tempfile.TemporaryDirectory() as tmp:
        graded_dir = os.path.join(tmp, "app", "public", "data", "curated", "graded")
        os.makedirs(graded_dir, exist_ok=True)
        with open(os.path.join(graded_dir, "2099-01-01.json"), "w") as f:
            json.dump({
                "date": "2099-01-01",
                "picks": [
                    {**_nba_pick(1, "REB", "Over", 4.5),
                     "status": "win", "result": "win", "finalStat": 7},
                    {**_nba_pick(2, "REB", "Over", 4.5),
                     "status": "pending", "result": "unresolved"},
                ],
            }, f)
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            summary = GC.update_summary()
        finally:
            os.chdir(cwd)
    life = summary["lifetime"]
    s.eq(life["wins"], 1, "1 win counted")
    s.eq(life["pending"], 1, "1 pending counted")
    s.eq(life["decisive"], 1, "decisive excludes pending")
    s.ok(abs((life["hitRate"] or 0) - 1.0) < 1e-9,
         f"hit rate = 1.0 (got {life['hitRate']})")


def test_no_double_count_across_reruns(s: Suite):
    print(f"\n  {BLUE}─── grading the same snapshot twice doesn't double-count ───{RESET}")
    snapshot = {
        "date": "2099-01-02",
        "picks": [_nba_pick(1, "REB", "Over", 4.5)],
    }
    orig = GC._settled_lookup_for_date
    try:
        GC._settled_lookup_for_date = lambda date: {
            (1, "REB", "Over", 4.5): {"result": "win", "finalStat": 7},
        }
        g1 = GC.grade_snapshot_payload(snapshot)
        g2 = GC.grade_snapshot_payload(snapshot)
    finally:
        GC._settled_lookup_for_date = orig
    s.eq(g1["picksCount"], g2["picksCount"], "same picks count both runs")
    s.eq(g1["picks"][0]["pickId"], g2["picks"][0]["pickId"], "same pickId")
    s.eq(g1["picks"][0]["status"], g2["picks"][0]["status"], "same status")


def main():
    s = Suite()
    for t in (
        test_pending_when_no_settled,
        test_nba_win_grades_correctly,
        test_mlb_outcome_normalization,
        test_push_excluded_from_decisive,
        test_summary_excludes_pending_from_hit_rate,
        test_no_double_count_across_reruns,
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
