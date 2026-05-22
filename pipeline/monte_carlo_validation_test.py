"""Tests for pipeline.monte_carlo_validation.

Locks the contract: validation joins only same-date rows, pending
is never counted as a loss, missing shadow files don't crash, and
no fake hit rate is reported when zero settled rows joined.

Run: python -m pipeline.monte_carlo_validation_test
"""
from __future__ import annotations

import sys
import tempfile
import os
import json

from . import monte_carlo_validation as MV


GREEN = "\033[0;32m"; RED = "\033[0;31m"; BLUE = "\033[0;34m"; RESET = "\033[0m"


class Suite:
    def __init__(self): self.passed = 0; self.failed = 0
    def ok(self, c, n):
        if c: self.passed += 1; print(f"  {GREEN}✓{RESET} {n}")
        else: self.failed += 1; print(f"  {RED}✗{RESET} {n}")
    def eq(self, a, b, n):
        if a == b: self.passed += 1; print(f"  {GREEN}✓{RESET} {n}")
        else: self.failed += 1; print(f"  {RED}✗{RESET} {n}\n    expected {b!r}, got {a!r}")


def _shadow_entry(playerId, market, side, line, rec):
    return {
        "sport": "nba", "playerId": playerId, "playerName": f"P{playerId}",
        "market": market, "side": side, "line": line,
        "production_projection": 10.0,
        "production_confidence": "High",
        "mc": {"confidence_recommendation": rec, "prob_over": 0.6, "volatility": 0.2},
    }


def _setup_artifacts(
    tmp: str,
    shadow_by_date: dict,
    nba_settled: list[dict] | None = None,
):
    audit_dir = os.path.join(tmp, "app", "public", "data", "audit")
    os.makedirs(audit_dir, exist_ok=True)
    for date, entries in shadow_by_date.items():
        with open(os.path.join(audit_dir, f"monte_carlo_shadow_{date}.json"), "w") as f:
            json.dump({"date": date, "entries": entries}, f)
    if nba_settled is not None:
        d = os.path.join(tmp, "app", "public", "data", "results")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "settled_leans.jsonl"), "w") as f:
            for row in nba_settled:
                f.write(json.dumps(row) + "\n")


def test_pending_when_no_settled(s: Suite):
    print(f"\n  {BLUE}─── no settled data → status pending ───{RESET}")
    with tempfile.TemporaryDirectory() as tmp:
        _setup_artifacts(tmp, {"2099-01-01": [_shadow_entry(1, "REB", "Over", 4.5, "Strong")]})
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            report = MV.validate()
        finally:
            os.chdir(cwd)
    s.eq(report["validationStatus"], "pending", "status pending")
    s.eq(report["leansJoined"], 0, "0 leans joined")
    # No decisive count, no fake hit rate.
    by_rec = report["byRecommendation"]
    if "Strong" in by_rec:
        s.eq(by_rec["Strong"].get("hitRate"), None,
             "no hit rate when no decisive joined")


def test_joins_only_same_date(s: Suite):
    print(f"\n  {BLUE}─── lookup is per-date (no leak across dates) ───{RESET}")
    with tempfile.TemporaryDirectory() as tmp:
        _setup_artifacts(
            tmp,
            {"2099-01-01": [_shadow_entry(1, "REB", "Over", 4.5, "Strong")]},
            nba_settled=[
                # Settled row for the SAME (player, market, side, line)
                # but a DIFFERENT date — should NOT join.
                {"playerId": 1, "market": "REB", "side": "Over", "line": 4.5,
                 "result": "win", "finalStat": 7, "date": "2099-01-02"},
            ],
        )
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            report = MV.validate()
        finally:
            os.chdir(cwd)
    s.eq(report["leansJoined"], 0, "different-date row does not join")
    s.eq(report["validationStatus"], "pending", "still pending")


def test_settled_win_classifies_correctly(s: Suite):
    print(f"\n  {BLUE}─── settled win → Strong bucket wins+1 ───{RESET}")
    with tempfile.TemporaryDirectory() as tmp:
        _setup_artifacts(
            tmp,
            {"2099-01-01": [_shadow_entry(1, "REB", "Over", 4.5, "Strong")]},
            nba_settled=[{
                "playerId": 1, "market": "REB", "side": "Over", "line": 4.5,
                "result": "win", "finalStat": 7, "date": "2099-01-01",
            }],
        )
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            report = MV.validate()
        finally:
            os.chdir(cwd)
    strong = report["byRecommendation"]["Strong"]
    s.eq(strong["wins"], 1, "Strong wins+1")
    s.eq(strong["losses"], 0, "no losses")
    s.eq(strong["decisive"], 1, "decisive=1")
    s.ok(abs((strong.get("hitRate") or 0) - 1.0) < 1e-9,
         f"hit rate 1.0 (got {strong.get('hitRate')})")


def test_push_excluded_from_decisive(s: Suite):
    print(f"\n  {BLUE}─── push → bucket pushes+1, excluded from decisive ───{RESET}")
    with tempfile.TemporaryDirectory() as tmp:
        _setup_artifacts(
            tmp,
            {"2099-01-01": [_shadow_entry(1, "REB", "Over", 4.5, "Watch")]},
            nba_settled=[{
                "playerId": 1, "market": "REB", "side": "Over", "line": 4.5,
                "result": "push", "finalStat": 4.5, "date": "2099-01-01",
            }],
        )
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            report = MV.validate()
        finally:
            os.chdir(cwd)
    watch = report["byRecommendation"]["Watch"]
    s.eq(watch["pushes"], 1, "1 push")
    s.eq(watch["decisive"], 0, "decisive stays 0")
    s.eq(watch.get("hitRate"), None, "no hit rate from 0 decisive")


def test_missing_shadow_dir_safe(s: Suite):
    print(f"\n  {BLUE}─── missing shadow dir → empty report, no crash ───{RESET}")
    with tempfile.TemporaryDirectory() as tmp:
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            report = MV.validate()
        finally:
            os.chdir(cwd)
    s.eq(report["leansTotal"], 0, "0 leans")
    s.eq(report["validationStatus"], "pending", "pending when no data")


def main():
    s = Suite()
    for t in (
        test_pending_when_no_settled,
        test_joins_only_same_date,
        test_settled_win_classifies_correctly,
        test_push_excluded_from_decisive,
        test_missing_shadow_dir_safe,
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
