"""Tiny smoke test for pipeline.calibration_report.

Locks the contract that:
  * The normalizer maps NBA and MLB schemas onto the same internal keys.
  * The filter respects market / confidence / edge floor flags.
  * `_aggregate` correctly excludes pushes from the denominator and
    never reports a hit rate without at least one decisive row.

Pure unit tests against handcrafted dicts — no I/O. Run with:

    pipeline/.venv/bin/python -m pipeline.calibration_report_test
"""
from __future__ import annotations

import sys

from pipeline.calibration_report import (
    _aggregate,
    _normalize_row,
    _row_passes,
)


GREEN = "\033[0;32m"
RESET = "\033[0m"


def _ok(label: str) -> None:
    print(f"  {GREEN}✓{RESET} {label}")


def test_normalize_mlb_row_maps_to_internal_keys() -> None:
    raw = {
        "outcome": "Win",
        "lean": "Over",
        "marketKey": "pitcher_strikeouts",
        "marketLabel": "Strikeouts",
        "confidence": "High",
        "edgePct": 12.3,
    }
    norm = _normalize_row(raw, "mlb")
    assert norm["result"] == "win", norm
    assert norm["side"] == "Over", norm
    assert norm["market"] == "Strikeouts", norm
    assert norm["sport"] == "mlb", norm
    _ok("MLB outcome/lean/marketKey → result/side/market")


def test_normalize_nba_row_is_idempotent() -> None:
    raw = {
        "result": "loss",
        "side": "Under",
        "market": "PTS",
        "confidence": "Medium",
        "edgePct": -3.5,
    }
    norm = _normalize_row(raw, "nba")
    # Re-running should not mutate the result key away.
    again = _normalize_row(norm, "nba")
    assert again["result"] == "loss", again
    assert again["side"] == "Under", again
    assert again["market"] == "PTS", again
    _ok("NBA row pass-through is idempotent")


def test_aggregate_excludes_pushes_from_denominator() -> None:
    rows = [
        {"result": "win"},
        {"result": "win"},
        {"result": "loss"},
        {"result": "push"},
        {"result": "push"},
    ]
    agg = _aggregate(rows)
    assert agg["wins"] == 2 and agg["losses"] == 1 and agg["pushes"] == 2, agg
    assert agg["decisive"] == 3, agg
    assert agg["hitRate"] is not None
    assert abs(agg["hitRate"] - 2 / 3) < 1e-9, agg
    _ok("pushes excluded from decisive denominator")


def test_aggregate_no_decisive_returns_none_hitrate() -> None:
    rows = [{"result": "push"}, {"result": "push"}]
    agg = _aggregate(rows)
    assert agg["decisive"] == 0, agg
    assert agg["hitRate"] is None, agg
    _ok("no-decisive aggregate reports None hit rate, not 0")


def test_row_passes_min_edge_floor() -> None:
    row = {"edgePct": 3.0, "confidence": "High", "market": "PTS", "side": "Over"}
    assert _row_passes(
        row,
        min_edge_pp=2.5,
        confidence_filter=None,
        market_filter=None,
        side_filter=None,
        exclude_anomalies=False,
    )
    assert not _row_passes(
        row,
        min_edge_pp=5.0,
        confidence_filter=None,
        market_filter=None,
        side_filter=None,
        exclude_anomalies=False,
    )
    _ok("min_edge_pp gate respects |edge|")


def test_row_passes_confidence_filter() -> None:
    row = {"edgePct": 10, "confidence": "Low", "market": "PTS", "side": "Over"}
    assert _row_passes(
        row,
        min_edge_pp=None,
        confidence_filter={"High", "Medium"},
        market_filter=None,
        side_filter=None,
        exclude_anomalies=False,
    ) is False
    assert _row_passes(
        row,
        min_edge_pp=None,
        confidence_filter={"Low"},
        market_filter=None,
        side_filter=None,
        exclude_anomalies=False,
    )
    _ok("confidence filter keeps only matching tiers")


def test_row_passes_anomaly_exclusion_uses_sport_cap() -> None:
    nba_row = {
        "edgePct": 27.0,
        "confidence": "Low",
        "market": "PTS",
        "side": "Over",
        "sport": "nba",
    }
    mlb_row = {
        "edgePct": 22.0,
        "confidence": "Low",
        "market": "Strikeouts",
        "side": "Over",
        "sport": "mlb",
    }
    # NBA cap = 25pp; 27pp should be excluded as anomaly-like.
    assert not _row_passes(
        nba_row,
        min_edge_pp=None,
        confidence_filter=None,
        market_filter=None,
        side_filter=None,
        exclude_anomalies=True,
    )
    # MLB cap = 20pp; 22pp also excluded.
    assert not _row_passes(
        mlb_row,
        min_edge_pp=None,
        confidence_filter=None,
        market_filter=None,
        side_filter=None,
        exclude_anomalies=True,
    )
    _ok("anomaly exclusion uses sport-specific cap (25 NBA / 20 MLB)")


def run_all() -> int:
    print(f"\033[0;34m─── calibration_report tests ───{RESET}")
    test_normalize_mlb_row_maps_to_internal_keys()
    test_normalize_nba_row_is_idempotent()
    test_aggregate_excludes_pushes_from_denominator()
    test_aggregate_no_decisive_returns_none_hitrate()
    test_row_passes_min_edge_floor()
    test_row_passes_confidence_filter()
    test_row_passes_anomaly_exclusion_uses_sport_cap()
    print(f"\n{GREEN}✓ 7 tests passed, 0 failed{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(run_all())
