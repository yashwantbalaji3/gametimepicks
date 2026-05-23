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
    normalization layer. Includes enough hits + strikeouts leans
    to satisfy the post-2026-05-23 tighter per-profile rules:
    conservative needs 2 hits legs across 2 games; balanced needs 3
    legs with ≤1 high-variance market; aggressive needs 4-5."""
    return [
        # MLB game M1 — pitcher strikeouts (high variance) + batter hits.
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
        # Extra batter_hits leans across different MLB games so
        # conservative (2 legs, 1 per game, hits-only) and balanced
        # (3 legs) have enough pool.
        {"gameId": "M2", "playerId": 912, "playerName": "Batter Golf",
         "playerTeamAbbr": "CCC", "opponentAbbr": "DDD",
         "marketKey": "batter_hits", "marketLabel": "Hits",
         "lean": "Over", "line": 0.5, "edgePct": 10, "confidence": "High",
         "recentSeries": [1, 2, 1, 1, 1], "oddsOver": -150, "oddsUnder": 130,
         "bookmaker": "draftkings", "projection": 1.4,
         "commenceTime": "2026-05-22T23:00:00Z"},
        {"gameId": "M3", "playerId": 920, "playerName": "Batter Hotel",
         "playerTeamAbbr": "EEE", "opponentAbbr": "FFF",
         "marketKey": "batter_hits", "marketLabel": "Hits",
         "lean": "Over", "line": 0.5, "edgePct": 8, "confidence": "High",
         "recentSeries": [1, 1, 1, 0, 1], "oddsOver": -140, "oddsUnder": 120,
         "bookmaker": "fanduel", "projection": 1.2,
         "commenceTime": "2026-05-22T23:30:00Z"},
        {"gameId": "M4", "playerId": 930, "playerName": "Batter India",
         "playerTeamAbbr": "GGG", "opponentAbbr": "HHH",
         "marketKey": "batter_hits", "marketLabel": "Hits",
         "lean": "Over", "line": 0.5, "edgePct": 7, "confidence": "High",
         "recentSeries": [1, 0, 1, 1, 1], "oddsOver": -135, "oddsUnder": 115,
         "bookmaker": "draftkings", "projection": 1.15,
         "commenceTime": "2026-05-22T23:30:00Z"},
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
    s.eq(len(leans), 7, "7 MLB leans loaded (fixture grew with new market gates)")
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


def test_profile_leg_counts(s: Suite):
    print(f"\n  {BLUE}─── per-profile leg counts (2 / 3 / 4-5) ───{RESET}")
    # User asked: conservative=2 legs exactly, balanced=3, aggressive=4-5.
    # Locked here so a regression doesn't quietly loosen them.
    leans = _fixture_leans()
    cons = SP._build_candidates(leans, risk_profile="conservative", num_candidates=3)
    bal = SP._build_candidates(leans, risk_profile="balanced", num_candidates=3)
    # The aggressive fixture isn't deep enough to satisfy minLegs=4
    # so we extend it with a few extra eligible names — this test
    # just confirms the leg-count constraints themselves, not pool depth.
    extra_aggressive = leans + [
        {"gameId": f"GX{i}", "playerId": 500 + i, "playerName": f"Extra {i}",
         "team": "EEE", "opponent": "FFF",
         "market": "PTS", "lean": "Over", "line": 10 + i, "edgePct": 5 + i,
         "confidence": "High",
         "recent10": [1, 2, 3, 4, 5, 6],
         "oddsOver": -110, "oddsUnder": -110, "bookmaker": "draftkings"}
        for i in range(4)
    ]
    agg = SP._build_candidates(extra_aggressive, risk_profile="aggressive", num_candidates=3)
    for slip in cons:
        s.eq(len(slip), 2, "conservative slip has exactly 2 legs")
    for slip in bal:
        s.eq(len(slip), 3, "balanced slip has exactly 3 legs")
    for slip in agg:
        s.ok(4 <= len(slip) <= 5,
             f"aggressive slip leg count in [4, 5] (got {len(slip)})")


def test_mlb_top_player_boost_contract(s: Suite):
    print(f"\n  {BLUE}─── MLB top-player boost ranks recognizable hitters higher ───{RESET}")
    from . import mlb_top_players as TP
    # Sanity: known star is on the whitelist.
    s.ok(TP.is_top_player("Aaron Judge"), "Aaron Judge is a top player")
    s.ok(TP.is_top_player("aaron judge"), "case-insensitive match")
    s.ok(TP.is_top_player("Ronald Acuña Jr."), "accent normalized inside full name")
    s.ok(not TP.is_top_player("Andruw Monasterio"), "depth player NOT on whitelist")
    s.ok(not TP.is_top_player(None), "None is not a top player")

    # Boost contract: at comparable edge, top wins; at meaningfully
    # stronger non-top edge, non-top still wins.
    top_lean = {
        "_sport": "mlb",
        "playerName": "Aaron Judge",
        "confidence": "High",
        "edgePct": 5.0,
        "playerId": 1, "lean": "Over", "line": 0.5, "market": "batter_hits",
        "recent10": [1, 1, 0, 1, 1, 2],
    }
    non_top_close_lean = {
        **top_lean,
        "playerName": "Andruw Monasterio",
        "edgePct": 6.0,
    }
    non_top_strong_lean = {
        **top_lean,
        "playerName": "Andruw Monasterio",
        "edgePct": 12.0,
    }
    s_top = SP._leg_score(top_lean)
    s_close = SP._leg_score(non_top_close_lean)
    s_strong = SP._leg_score(non_top_strong_lean)
    s.ok(s_top > s_close,
         f"top at +5pp beats non-top at +6pp ({s_top:.3f} > {s_close:.3f})")
    s.ok(s_strong > s_top,
         f"non-top at +12pp still beats top at +5pp ({s_strong:.3f} > {s_top:.3f})")


def test_top_player_boost_only_for_mlb(s: Suite):
    print(f"\n  {BLUE}─── top-player boost is MLB-only ───{RESET}")
    # NBA lean for a hypothetical name on the MLB whitelist: no
    # boost should apply because _sport is nba. (Names rarely
    # collide in practice; this guards against future collisions.)
    lean_mlb = {
        "_sport": "mlb", "playerName": "Juan Soto", "confidence": "High",
        "edgePct": 5.0, "playerId": 1, "lean": "Over", "line": 0.5,
        "market": "batter_hits", "recent10": [1, 1, 0, 1, 1, 2],
    }
    lean_nba = {**lean_mlb, "_sport": "nba", "market": "PTS"}
    s_mlb = SP._leg_score(lean_mlb)
    s_nba = SP._leg_score(lean_nba)
    s.ok(s_mlb > s_nba,
         f"MLB top-player boost applies ({s_mlb:.3f} > {s_nba:.3f})")


def test_conservative_mlb_hits_only(s: Suite):
    print(f"\n  {BLUE}─── conservative MLB slips contain only batter_hits ───{RESET}")
    import tempfile, os, json as J
    mlb = _fixture_mlb_leans()
    with tempfile.TemporaryDirectory() as tmp:
        d = os.path.join(tmp, "app", "public", "data", "mlb", "boards")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "2099-01-01.json"), "w") as f:
            J.dump({"date": "2099-01-01", "leans": mlb}, f)
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            leans = SP.load_mlb_leans("2099-01-01")
        finally:
            os.chdir(cwd)
    cands = SP._build_candidates(leans, risk_profile="conservative", num_candidates=5)
    s.ok(len(cands) > 0, "conservative MLB pool produces ≥ 1 candidate")
    for slip in cands:
        for leg in slip:
            s.eq(leg.get("market"), "batter_hits",
                 f"conservative MLB leg is batter_hits (got {leg.get('market')})")


def test_balanced_mlb_caps_high_variance_legs(s: Suite):
    print(f"\n  {BLUE}─── balanced MLB caps high-variance legs at 1 ───{RESET}")
    import tempfile, os, json as J
    mlb = _fixture_mlb_leans()
    with tempfile.TemporaryDirectory() as tmp:
        d = os.path.join(tmp, "app", "public", "data", "mlb", "boards")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "2099-01-01.json"), "w") as f:
            J.dump({"date": "2099-01-01", "leans": mlb}, f)
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            leans = SP.load_mlb_leans("2099-01-01")
        finally:
            os.chdir(cwd)
    cands = SP._build_candidates(leans, risk_profile="balanced", num_candidates=5)
    s.ok(len(cands) > 0, "balanced MLB pool produces ≥ 1 candidate")
    for slip in cands:
        hv_count = sum(
            1 for leg in slip
            if leg.get("market") in SP.MLB_HIGH_VARIANCE_MARKETS
        )
        s.ok(hv_count <= 1,
             f"balanced slip has ≤ 1 high-variance MLB leg (got {hv_count})")


def test_aggressive_mlb_allows_multiple_markets(s: Suite):
    print(f"\n  {BLUE}─── aggressive MLB allows total_bases + strikeouts ───{RESET}")
    # The aggressive profile permits all four MLB markets and caps
    # high-variance legs at 3 (so a 5-leg slip can carry up to 3
    # strikeouts/total_bases legs).
    import tempfile, os, json as J
    mlb = _fixture_mlb_leans()
    with tempfile.TemporaryDirectory() as tmp:
        d = os.path.join(tmp, "app", "public", "data", "mlb", "boards")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "2099-01-01.json"), "w") as f:
            J.dump({"date": "2099-01-01", "leans": mlb}, f)
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            leans = SP.load_mlb_leans("2099-01-01")
        finally:
            os.chdir(cwd)
    cands = SP._build_candidates(leans, risk_profile="aggressive", num_candidates=5)
    markets_seen: set[str] = set()
    for slip in cands:
        for leg in slip:
            m = leg.get("market")
            if m:
                markets_seen.add(m)
    # Confirms multiple markets eligible (at least hits should be in
    # there; strikeouts/total_bases depend on aggressive picking them).
    s.ok("batter_hits" in markets_seen, "aggressive includes batter_hits")
    # And that the high-variance cap is respected.
    for slip in cands:
        hv_count = sum(
            1 for leg in slip
            if leg.get("market") in SP.MLB_HIGH_VARIANCE_MARKETS
        )
        s.ok(hv_count <= 3,
             f"aggressive slip has ≤ 3 high-variance MLB legs (got {hv_count})")


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
        test_profile_leg_counts,
        test_mlb_top_player_boost_contract,
        test_top_player_boost_only_for_mlb,
        test_conservative_mlb_hits_only,
        test_balanced_mlb_caps_high_variance_legs,
        test_aggressive_mlb_allows_multiple_markets,
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
