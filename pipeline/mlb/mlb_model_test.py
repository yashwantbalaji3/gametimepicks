"""Tests for the MLB projection + grade model.

Specifically locks in:
  - R5 anomaly threshold tightened from 25pp → 20pp (after May 16 audit)
  - contextTag derivation from grade() output matches NBA's honest scheme
  - grade returns insufficient_data shape with contextTag=None when sigma
    is invalid (no projection)

The audit reasoning is in SESSION_PROGRESS_PROJECTION_MODEL_UPGRADE.md.
"""
from __future__ import annotations

from pipeline.mlb import mlb_model


GREEN = "\033[0;32m"
RED = "\033[0;31m"
RESET = "\033[0m"


def assert_eq(actual, expected, label: str) -> None:
    ok = actual == expected
    mark = "✓" if ok else "✗"
    color = GREEN if ok else RED
    print(f"  {color}{mark}{RESET} {label}")
    if not ok:
        print(f"      expected: {expected!r}")
        print(f"      actual:   {actual!r}")
        raise AssertionError(label)


def assert_ge(actual, threshold, label: str) -> None:
    ok = actual >= threshold
    mark = "✓" if ok else "✗"
    color = GREEN if ok else RED
    print(f"  {color}{mark}{RESET} {label}")
    if not ok:
        print(f"      expected >= {threshold!r}")
        print(f"      actual:      {actual!r}")
        raise AssertionError(label)


def main() -> None:
    print("\n─── R5 anomaly threshold (MLB) — tightened to 20pp ───")
    assert_eq(
        mlb_model.R5_ANOMALY_THRESHOLD_PP,
        20.0,
        "module constant == 20.0",
    )

    # Build an artificial grade scenario at exactly 20pp edge — R5 should
    # trip (Low + r5_model_anomaly flag).
    # P(over) at line 0.5 with proj 2 and sigma 1 ≈ 0.933 → edge_over ≈
    # (0.933 - 0.5) * 100 = 43pp; that's too high. We need to dial.
    # Easier: bypass the math by calling grade with implied=0.5 and pick
    # a projection that yields ~20pp edge.
    # P(over) needed: 0.5 + 0.20 = 0.70 → z ≈ -0.524 → (line - proj)/σ ≈ -0.524
    # Pick line = 1.0, sigma = 1.0 → proj = 1.524 (approx)
    r = mlb_model.grade(
        projection=1.525,
        line=1.0,
        sigma=1.0,
        implied_over=0.50,
        implied_under=0.50,
    )
    assert_ge(r["edgePct"], 19.0, "constructed edge close to 20pp")
    assert_eq(r["confidence"], "Low", "R5 trips → Low at ~20pp edge")
    assert_eq(
        "r5_model_anomaly" in r["riskFlags"],
        True,
        "r5_model_anomaly flag set",
    )
    assert_eq(
        r.get("contextTag"),
        "model-anomaly",
        "contextTag = model-anomaly when R5 trips",
    )

    print("\n─── below R5 threshold: no anomaly flag ───")
    # ~15pp edge — should NOT trip the new 20pp cap.
    r2 = mlb_model.grade(
        projection=1.34,
        line=1.0,
        sigma=1.0,
        implied_over=0.50,
        implied_under=0.50,
        samples=10,
    )
    assert_eq(
        r2["edgePct"] < mlb_model.R5_ANOMALY_THRESHOLD_PP,
        True,
        "edge below 20pp threshold",
    )
    assert_eq(
        "r5_model_anomaly" not in r2["riskFlags"],
        True,
        "no r5_model_anomaly flag below threshold",
    )

    print("\n─── contextTag — recent-form-backed for High + 10 samples ───")
    # High confidence requires edge >= 5pp. Pick a setup with ~8pp edge.
    r3 = mlb_model.grade(
        projection=1.20,
        line=1.0,
        sigma=1.0,
        implied_over=0.50,
        implied_under=0.50,
        samples=10,
    )
    assert_eq(r3["confidence"], "High", "edge ~8pp → High confidence")
    assert_eq(
        r3.get("contextTag"),
        "recent-form-backed",
        "contextTag = recent-form-backed for High + 10 samples",
    )

    print("\n─── contextTag — sample-watch for 5-7 samples ───")
    r4 = mlb_model.grade(
        projection=1.20,
        line=1.0,
        sigma=1.0,
        implied_over=0.50,
        implied_under=0.50,
        samples=6,
    )
    assert_eq(
        r4.get("contextTag"),
        "sample-watch",
        "contextTag = sample-watch for 6 samples (between 5 and 7)",
    )

    print("\n─── grade insufficient_data path keeps contextTag=None ───")
    r5 = mlb_model.grade(
        projection=None,
        line=1.0,
        sigma=0.0,
        implied_over=0.50,
        implied_under=0.50,
    )
    assert_eq(r5["confidence"], "insufficient_data", "insufficient_data tier")
    assert_eq(r5.get("contextTag"), None, "no contextTag when no projection")

    print("\n─── recent_games_for_market: per-game modal metadata ───")
    logs = [
        {"date": "2026-05-31", "opponentAbbr": "SD", "isHome": False,
         "stat": {"hits": 2, "runs": 1, "rbi": 0, "totalBases": 3, "atBats": 4, "plateAppearances": 4}},
        {"date": "2026-06-01", "opponentAbbr": "SD", "isHome": False,
         "stat": {"hits": 0, "runs": 0, "rbi": 0, "totalBases": 0, "atBats": 3, "plateAppearances": 3}},
        {"date": "2026-06-03", "opponentAbbr": "HOU", "isHome": True,
         "stat": {"hits": 2, "runs": 0, "rbi": 1, "totalBases": 2, "atBats": 4, "plateAppearances": 4}},
        # no-date row must be DROPPED (never fabricate a date)
        {"date": None, "opponentAbbr": "X", "isHome": True,
         "stat": {"hits": 1, "atBats": 2, "plateAppearances": 2}},
        # did-not-appear row (0 PA/AB) must be DROPPED for batter markets
        {"date": "2026-06-04", "opponentAbbr": "LAD", "isHome": False,
         "stat": {"hits": 0, "atBats": 0, "plateAppearances": 0}},
    ]
    hits = mlb_model.recent_games_for_market(logs, "batter_hits")
    assert_eq(len(hits), 3, "recentGames(hits) drops no-date and DNP rows")
    assert_eq([g["date"] for g in hits], ["2026-05-31", "2026-06-01", "2026-06-03"], "recentGames dates oldest->newest")
    assert_eq([g["opponent"] for g in hits], ["SD", "SD", "HOU"], "recentGames opponents present")
    assert_eq([g["isHome"] for g in hits], [False, False, True], "recentGames isHome present")
    assert_eq([g["value"] for g in hits], [2.0, 0.0, 2.0], "recentGames(hits) per-game value")
    hrr = mlb_model.recent_games_for_market(logs, "batter_hits_runs_rbis")
    assert_eq([g["value"] for g in hrr], [3.0, 0.0, 3.0], "recentGames(hrr) = hits+runs+rbi per game")
    tb = mlb_model.recent_games_for_market(logs, "batter_total_bases")
    assert_eq([g["value"] for g in tb], [3.0, 0.0, 2.0], "recentGames(total bases) per game")
    plogs = [
        {"date": "2026-05-20", "opponentAbbr": "NYY", "isHome": True, "stat": {"strikeOuts": 6}},
        {"date": "2026-05-26", "opponentAbbr": "BOS", "isHome": False, "stat": {"strikeOuts": 4}},
    ]
    pk = mlb_model.recent_games_for_market(plogs, "pitcher_strikeouts")
    assert_eq([g["value"] for g in pk], [6, 4], "recentGames(strikeouts) per game")
    many = [{"date": f"2026-05-{d:02d}", "opponentAbbr": "SD", "isHome": True,
             "stat": {"hits": 1, "atBats": 4, "plateAppearances": 4}} for d in range(1, 15)]
    capped = mlb_model.recent_games_for_market(many, "batter_hits", last_n=10)
    assert_eq(len(capped), 10, "recentGames respects last_n cap")
    assert_eq(capped[-1]["date"], "2026-05-14", "recentGames keeps the NEWEST when capping")

    print(f"\n{GREEN}✓ all mlb_model assertions passed{RESET}\n")


if __name__ == "__main__":
    main()
