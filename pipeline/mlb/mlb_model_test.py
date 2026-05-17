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

    print(f"\n{GREEN}✓ all mlb_model assertions passed{RESET}\n")


if __name__ == "__main__":
    main()
