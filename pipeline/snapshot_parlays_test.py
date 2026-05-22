"""Tests for pipeline.snapshot_parlays.

Pure-function tests over fixture leans — never reads real boards from
disk and never writes to the real snapshot directory.

Run: python -m pipeline.snapshot_parlays_test
"""
from __future__ import annotations

import sys

from . import snapshot_parlays as SP


GREEN = "\033[0;32m"; RED = "\033[0;31m"; BLUE = "\033[0;34m"; RESET = "\033[0m"


class Suite:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def ok(self, cond, name):
        if cond:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")

    def eq(self, a, b, name):
        if a == b:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected {b!r}, got {a!r}")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _fixture_leans() -> list[dict]:
    """Hand-built leans covering multiple players, markets, games, and
    confidence levels. Matches the in-browser builder's expected shape."""
    return [
        # Game A — three High-confidence Over leans
        {"gameId": "G1", "playerId": 101, "playerName": "Player A1", "team": "AAA", "opponent": "BBB",
         "market": "PTS", "lean": "Over", "line": 20.5, "edgePct": 12, "confidence": "High",
         "recent10": [1, 2, 3, 4, 5, 6], "playerId_": True, "oddsOver": -110, "oddsUnder": -110,
         "bookmaker": "draftkings", "projection": 23.5, "tipoff": "8:00 PM ET"},
        {"gameId": "G1", "playerId": 102, "playerName": "Player A2", "team": "AAA", "opponent": "BBB",
         "market": "REB", "lean": "Over", "line": 6.5, "edgePct": 9, "confidence": "High",
         "recent10": [1, 2, 3, 4, 5, 6], "oddsOver": -120, "oddsUnder": 100,
         "bookmaker": "draftkings", "projection": 8.1},
        {"gameId": "G1", "playerId": 103, "playerName": "Player A3", "team": "AAA", "opponent": "BBB",
         "market": "AST", "lean": "Under", "line": 4.5, "edgePct": 8, "confidence": "High",
         "recent10": [1, 2, 3, 4, 5, 6], "oddsOver": 110, "oddsUnder": -130,
         "bookmaker": "draftkings", "projection": 3.4},
        # Game B — High + Medium so conservative profile (max 1 leg per game)
        # can build a multi-game slip.
        {"gameId": "G2", "playerId": 200, "playerName": "Player B0", "team": "CCC", "opponent": "DDD",
         "market": "PTS", "lean": "Over", "line": 22.5, "edgePct": 10, "confidence": "High",
         "recent10": [1, 2, 3, 4, 5, 6], "oddsOver": -115, "oddsUnder": -105,
         "bookmaker": "draftkings", "projection": 24.7},
        {"gameId": "G2", "playerId": 201, "playerName": "Player B1", "team": "CCC", "opponent": "DDD",
         "market": "PTS", "lean": "Over", "line": 18.5, "edgePct": 7, "confidence": "Medium",
         "recent10": [1, 2, 3, 4, 5], "oddsOver": -105, "oddsUnder": -115,
         "bookmaker": "fanduel", "projection": 20.0},
        # Anomaly-flagged lean (should be excluded from conservative + balanced)
        {"gameId": "G2", "playerId": 202, "playerName": "Player B2", "team": "CCC", "opponent": "DDD",
         "market": "REB", "lean": "Over", "line": 4.5, "edgePct": 28, "confidence": "Low",
         "recent10": [1, 2, 3], "oddsOver": -110, "oddsUnder": -110,
         "bookmaker": "fanduel", "projection": 7.8,
         "riskFlags": ["suspicious_edge"]},
        # No-Play (should be excluded by every profile)
        {"gameId": "G2", "playerId": 203, "playerName": "Player B3", "team": "CCC", "opponent": "DDD",
         "market": "PTS", "lean": "Pass", "line": 22.5, "edgePct": 0, "confidence": "High",
         "recent10": [1, 2, 3, 4, 5, 6]},
        # Duplicate (same player+market on a different bookmaker) — dedupe
        {"gameId": "G1", "playerId": 101, "playerName": "Player A1", "team": "AAA", "opponent": "BBB",
         "market": "PTS", "lean": "Over", "line": 20.5, "edgePct": 11, "confidence": "High",
         "recent10": [1, 2, 3, 4, 5, 6], "oddsOver": -108, "oddsUnder": -112,
         "bookmaker": "fanduel", "projection": 23.5},
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_conservative_filters_to_high_only(s: Suite):
    print(f"\n  {BLUE}─── conservative includes only High-confidence legs ───{RESET}")
    cands = SP._build_candidates(
        _fixture_leans(), risk_profile="conservative", num_candidates=3,
    )
    s.ok(len(cands) > 0, "conservative produces at least one candidate")
    for slip in cands:
        for leg in slip:
            s.eq(leg["confidence"], "High",
                 f"conservative leg {leg['playerName']} is High")


def test_balanced_allows_medium(s: Suite):
    print(f"\n  {BLUE}─── balanced allows High+Medium legs ───{RESET}")
    cands = SP._build_candidates(
        _fixture_leans(), risk_profile="balanced", num_candidates=3,
    )
    s.ok(len(cands) > 0, "balanced produces at least one candidate")
    confidences = {leg["confidence"] for slip in cands for leg in slip}
    s.ok(confidences.issubset({"High", "Medium"}),
         "balanced legs are subset of {High, Medium}")


def test_aggressive_allows_anomaly_legs(s: Suite):
    print(f"\n  {BLUE}─── aggressive allows up to 1 anomaly leg ───{RESET}")
    leans = _fixture_leans()
    cands = SP._build_candidates(
        leans, risk_profile="aggressive", num_candidates=3,
    )
    has_any_anomaly = any(
        SP._is_anomaly(leg) for slip in cands for leg in slip
    )
    s.ok(len(cands) > 0, "aggressive produces at least one candidate")
    s.ok(has_any_anomaly,
         "aggressive includes the suspicious_edge lean")


def test_dedupe_player_market(s: Suite):
    print(f"\n  {BLUE}─── duplicate player+market collapses to one leg ───{RESET}")
    cands = SP._build_candidates(
        _fixture_leans(), risk_profile="conservative", num_candidates=3,
    )
    for slip in cands:
        keys = [(l["playerId"], l["market"]) for l in slip]
        s.eq(len(keys), len(set(keys)),
             "no duplicate (playerId, market) inside one slip")


def test_pass_leans_never_included(s: Suite):
    print(f"\n  {BLUE}─── No-Play leans never included as legs ───{RESET}")
    for profile in ("conservative", "balanced", "aggressive"):
        cands = SP._build_candidates(
            _fixture_leans(), risk_profile=profile, num_candidates=3,
        )
        for slip in cands:
            for leg in slip:
                s.eq(leg["lean"] in ("Over", "Under"), True,
                     f"{profile} leg is Over/Under, not Pass")


def test_snapshot_payload_shape(s: Suite):
    print(f"\n  {BLUE}─── build_snapshot payload shape + invariants ───{RESET}")
    # Build over an empty pool — should produce a clean empty payload
    payload = SP.build_snapshot("2026-05-21", now_iso="2026-05-21T20:00:00+00:00")
    s.ok("slips" in payload, "payload has slips array")
    s.ok("date" in payload, "payload has date")
    s.eq(payload.get("date"), "2026-05-21", "date is preserved")
    s.ok("generatedAt" in payload, "payload has generatedAt")
    s.ok(isinstance(payload.get("profilesGenerated"), list),
         "profilesGenerated is a list")
    # No snapshot field promises a result before grading
    for slip in payload.get("slips", []):
        s.eq(slip.get("status"), "pending",
             f"slip {slip.get('slipId')} status starts at pending")
        for leg in slip.get("legs", []):
            s.ok("result" not in leg,
                 "raw snapshot leg never carries a `result` field")


def test_stable_slip_ids_are_deterministic(s: Suite):
    print(f"\n  {BLUE}─── _stable_slip_id is deterministic for same input ───{RESET}")
    picked = _fixture_leans()[:2]
    id1 = SP._stable_slip_id("2026-05-21", "conservative", picked)
    id2 = SP._stable_slip_id("2026-05-21", "conservative", picked)
    s.eq(id1, id2, "same date + profile + legs → same slipId")
    id_diff_date = SP._stable_slip_id("2026-05-22", "conservative", picked)
    s.ok(id_diff_date != id1, "different date → different slipId")


def main():
    s = Suite()
    for t in (
        test_conservative_filters_to_high_only,
        test_balanced_allows_medium,
        test_aggressive_allows_anomaly_legs,
        test_dedupe_player_market,
        test_pass_leans_never_included,
        test_snapshot_payload_shape,
        test_stable_slip_ids_are_deterministic,
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
