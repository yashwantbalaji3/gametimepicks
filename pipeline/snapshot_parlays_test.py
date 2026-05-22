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


def _fixture_mlb_leans() -> list[dict]:
    """Hand-built MLB leans matching the raw board shape (marketKey /
    playerTeamAbbr / etc.) so we can exercise `load_mlb_leans`'s
    normalization layer."""
    return [
        # MLB game M1 — three High-confidence MLB legs.
        {"gameId": "M1", "playerId": 901, "playerName": "Pitcher Alpha",
         "playerTeamAbbr": "AAA", "opponentAbbr": "BBB",
         "marketKey": "pitcher_strikeouts", "marketLabel": "Strikeouts",
         "lean": "Over", "line": 5.5, "edgePct": 11, "confidence": "High",
         "recentSeries": [5, 6, 7, 5, 6, 8], "oddsOver": -115, "oddsUnder": -105,
         "bookmaker": "draftkings", "projection": 6.5,
         "commenceTime": "2026-05-22T22:00:00Z"},
        {"gameId": "M1", "playerId": 902, "playerName": "Batter Bravo",
         "playerTeamAbbr": "AAA", "opponentAbbr": "BBB",
         "marketKey": "batter_hits", "marketLabel": "Hits",
         "lean": "Under", "line": 1.5, "edgePct": 9, "confidence": "High",
         "recentSeries": [1, 1, 0, 1, 1], "oddsOver": -120, "oddsUnder": 100,
         "bookmaker": "draftkings", "projection": 0.9,
         "commenceTime": "2026-05-22T22:00:00Z"},
        # MLB game M2.
        {"gameId": "M2", "playerId": 910, "playerName": "Pitcher Echo",
         "playerTeamAbbr": "CCC", "opponentAbbr": "DDD",
         "marketKey": "pitcher_strikeouts", "marketLabel": "Strikeouts",
         "lean": "Over", "line": 4.5, "edgePct": 6, "confidence": "Medium",
         "recentSeries": [4, 5, 6, 3, 5], "oddsOver": -110, "oddsUnder": -110,
         "bookmaker": "fanduel", "projection": 5.2,
         "commenceTime": "2026-05-22T23:00:00Z"},
        # insufficient_data — must be excluded by every profile (no
        # confidence tier in PROFILE_RULES["confidence"] admits it).
        {"gameId": "M2", "playerId": 911, "playerName": "Pitcher Foxtrot",
         "playerTeamAbbr": "CCC", "opponentAbbr": "DDD",
         "marketKey": "pitcher_strikeouts", "marketLabel": "Strikeouts",
         "lean": "Pass", "line": 4.5, "edgePct": 0,
         "confidence": "insufficient_data",
         "recentSeries": [], "oddsOver": -110, "oddsUnder": -110,
         "bookmaker": "draftkings", "projection": None},
    ]


def test_mlb_lean_normalization(s: Suite):
    print(f"\n  {BLUE}─── MLB raw board lean → NBA-compatible shape ───{RESET}")
    import tempfile, os, json as J
    mlb = _fixture_mlb_leans()
    # Write fixture to a temp MLB board file and point load_mlb_leans
    # at it via the project root override.
    with tempfile.TemporaryDirectory() as tmp:
        boards_dir = os.path.join(tmp, "app", "public", "data", "mlb", "boards")
        os.makedirs(boards_dir, exist_ok=True)
        with open(os.path.join(boards_dir, "2099-01-01.json"), "w") as f:
            J.dump({"date": "2099-01-01", "leans": mlb}, f)
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            leans = SP.load_mlb_leans("2099-01-01")
        finally:
            os.chdir(cwd)
    s.eq(len(leans), 4, "4 MLB leans loaded")
    first = leans[0]
    s.eq(first.get("market"), "pitcher_strikeouts",
         "MLB marketKey → market field")
    s.eq(first.get("team"), "AAA", "MLB playerTeamAbbr → team")
    s.eq(first.get("opponent"), "BBB", "MLB opponentAbbr → opponent")
    s.eq(first.get("recent10"), [5, 6, 7, 5, 6, 8],
         "MLB recentSeries → recent10")
    s.eq(first.get("_sport"), "mlb", "MLB lean carries _sport=mlb tag")
    # insufficient_data row should still be present (filter happens
    # at builder time, not load time).
    confs = {l.get("confidence") for l in leans}
    s.ok("insufficient_data" in confs,
         "load preserves all rows; filtering deferred to builder")


def test_mlb_candidates_exclude_insufficient_data_and_pass(s: Suite):
    print(f"\n  {BLUE}─── MLB candidates skip insufficient_data + Pass ───{RESET}")
    import tempfile, os, json as J
    mlb = _fixture_mlb_leans()
    with tempfile.TemporaryDirectory() as tmp:
        boards_dir = os.path.join(tmp, "app", "public", "data", "mlb", "boards")
        os.makedirs(boards_dir, exist_ok=True)
        with open(os.path.join(boards_dir, "2099-01-01.json"), "w") as f:
            J.dump({"date": "2099-01-01", "leans": mlb}, f)
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            leans = SP.load_mlb_leans("2099-01-01")
        finally:
            os.chdir(cwd)
    cands = SP._build_candidates(leans, risk_profile="balanced", num_candidates=3)
    for slip in cands:
        for leg in slip:
            s.eq(leg.get("lean") in ("Over", "Under"), True,
                 f"MLB leg {leg.get('playerName')} is Over/Under, not Pass")
            s.ok(leg.get("confidence") in ("High", "Medium"),
                 f"MLB balanced leg {leg.get('playerName')} confidence is "
                 f"High/Medium (got {leg.get('confidence')})")


def test_build_snapshot_multi_sport(s: Suite):
    print(f"\n  {BLUE}─── build_snapshot emits NBA + MLB + multi slips ───{RESET}")
    import tempfile, os, json as J
    mlb = _fixture_mlb_leans()
    nba = _fixture_leans()
    with tempfile.TemporaryDirectory() as tmp:
        nba_dir = os.path.join(tmp, "app", "public", "data", "boards")
        mlb_dir = os.path.join(tmp, "app", "public", "data", "mlb", "boards")
        os.makedirs(nba_dir, exist_ok=True)
        os.makedirs(mlb_dir, exist_ok=True)
        with open(os.path.join(nba_dir, "2099-01-01.json"), "w") as f:
            J.dump({"date": "2099-01-01", "leans": nba}, f)
        with open(os.path.join(mlb_dir, "2099-01-01.json"), "w") as f:
            J.dump({"date": "2099-01-01", "leans": mlb}, f)
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            payload = SP.build_snapshot("2099-01-01")
        finally:
            os.chdir(cwd)
    s.eq(payload["sportsIncluded"], ["nba", "mlb"],
         "sportsIncluded reflects both pools")
    sports = {slip["sport"] for slip in payload["slips"]}
    s.ok("nba" in sports, "snapshot includes at least one NBA slip")
    s.ok("mlb" in sports, "snapshot includes at least one MLB slip")
    # Multi-sport slips are aggressive-only.
    multi_slips = [s for s in payload["slips"] if s["sport"] == "multi"]
    for slip in multi_slips:
        s.eq(slip["riskProfile"], "aggressive",
             "multi-sport slips are aggressive-only")
        sports_in_legs = {leg["sport"] for leg in slip["legs"]}
        s.ok("nba" in sports_in_legs and "mlb" in sports_in_legs,
             "multi slip has at least one NBA + one MLB leg")
    # Every leg knows its sport.
    for slip in payload["slips"]:
        for leg in slip["legs"]:
            s.ok(leg.get("sport") in ("nba", "mlb"),
                 f"every leg carries sport tag (got {leg.get('sport')})")
    # MLB-only snapshot (no NBA board) still works honestly.
    with tempfile.TemporaryDirectory() as tmp:
        mlb_dir = os.path.join(tmp, "app", "public", "data", "mlb", "boards")
        os.makedirs(mlb_dir, exist_ok=True)
        with open(os.path.join(mlb_dir, "2099-01-02.json"), "w") as f:
            J.dump({"date": "2099-01-02", "leans": mlb}, f)
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            mlb_only = SP.build_snapshot("2099-01-02")
        finally:
            os.chdir(cwd)
    s.eq(mlb_only["sportsIncluded"], ["mlb"],
         "MLB-only date reports sportsIncluded=['mlb']")
    s.ok(
        all(slip["sport"] == "mlb" for slip in mlb_only["slips"]),
        "MLB-only date emits zero NBA / multi slips",
    )


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
        test_mlb_lean_normalization,
        test_mlb_candidates_exclude_insufficient_data_and_pass,
        test_build_snapshot_multi_sport,
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
