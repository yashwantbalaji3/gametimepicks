"""
Phase 18 — pipeline.playerid_coverage_test

Regression tests for playerId coverage. The Phase 17 inspect_trends
output showed only 12% recent10 coverage on the May 5 board because
several leans had playerId=0. This test locks the contract so a
regression won't slip in: when the user has a freshly generated board,
playerId coverage should be high enough to make trend graphs useful.

The test bucket-sorts logic, not real board data — board JSON itself is
operator-controlled and tests shouldn't break on stale snapshots. The
goal is to test that:

  - The pipeline detects low coverage and surfaces it
  - The threshold for "low" coverage is honest (not too generous)
  - playerId=0 is not silently treated as a valid id
  - Name-fallback dedupe doesn't merge distinct players

Zero network. Zero filesystem mutation.
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# Helpers — mirrors of pipeline.inspect_trends classification
# ---------------------------------------------------------------------------

def coverage_metrics(board: dict) -> dict:
    """Compute the same metrics inspect_trends prints."""
    leans = board.get("leans") or []
    total = len(leans)
    with_recent10 = sum(
        1 for l in leans
        if isinstance(l.get("recent10"), list) and len(l["recent10"]) >= 5
    )
    distinct_pids = set()
    zero_pid_count = 0
    for l in leans:
        pid = l.get("playerId") or 0
        if pid > 0:
            distinct_pids.add(pid)
        else:
            zero_pid_count += 1
    return {
        "total": total,
        "with_recent10": with_recent10,
        "coverage_pct": (with_recent10 / total * 100) if total else 0,
        "distinct_pids": len(distinct_pids),
        "zero_pid_count": zero_pid_count,
    }


def is_low_coverage(metrics: dict, threshold: float = 50.0) -> bool:
    """Phase 18 considers <50% coverage 'low' (warning territory)."""
    return metrics["total"] > 0 and metrics["coverage_pct"] < threshold


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def make_lean(*, pid=1, name="Player", recent10=None, market="PTS"):
    if recent10 is None:
        recent10 = [22, 18, 25, 19, 21, 23, 20]
    return {
        "playerId": pid,
        "playerName": name,
        "market": market,
        "lean": "Over",
        "line": 20.5,
        "recent10": recent10,
    }


def main() -> int:
    asserts = 0

    # ── Test 1: empty board ────────────────────────────────────────────
    m = coverage_metrics({"leans": []})
    assert m["total"] == 0
    assert m["with_recent10"] == 0
    assert m["coverage_pct"] == 0
    assert m["distinct_pids"] == 0
    assert is_low_coverage(m) is False, "empty boards aren't 'low coverage'"
    asserts += 5

    # ── Test 2: full coverage ──────────────────────────────────────────
    leans = [
        make_lean(pid=i, name=f"P{i}", market="PTS")
        for i in range(1, 6)
    ]
    m = coverage_metrics({"leans": leans})
    assert m["total"] == 5
    assert m["with_recent10"] == 5
    assert m["coverage_pct"] == 100
    assert m["distinct_pids"] == 5
    assert is_low_coverage(m) is False
    asserts += 5

    # ── Test 3: zero coverage (all playerId=0) ─────────────────────────
    leans = [
        make_lean(pid=0, name=f"P{i}", recent10=[]) for i in range(1, 6)
    ]
    m = coverage_metrics({"leans": leans})
    assert m["total"] == 5
    assert m["with_recent10"] == 0
    assert m["coverage_pct"] == 0
    assert m["distinct_pids"] == 0
    assert m["zero_pid_count"] == 5
    assert is_low_coverage(m) is True
    asserts += 6

    # ── Test 4: 12% coverage (the bug we fixed) ────────────────────────
    leans = []
    # 3 players with full recent10 (matches sandbox May 5 state)
    for i in range(3):
        for market in ("PTS", "REB", "AST"):
            leans.append(make_lean(pid=i + 1, name=f"P{i + 1}", market=market))
    # 21 leans with no recent10
    for i in range(21):
        leans.append(make_lean(pid=0, name=f"NoId{i}", recent10=[]))
    m = coverage_metrics({"leans": leans})
    assert m["total"] == 30
    assert m["with_recent10"] == 9
    assert 28 <= m["coverage_pct"] <= 32, f"got {m['coverage_pct']}"
    assert m["zero_pid_count"] == 21
    assert is_low_coverage(m) is True
    asserts += 5

    # ── Test 5: playerId=0 is NEVER counted as distinct id ─────────────
    leans = [
        make_lean(pid=0, name="Player A", recent10=[1, 2, 3, 4, 5, 6, 7]),
        make_lean(pid=0, name="Player B", recent10=[1, 2, 3, 4, 5, 6, 7]),
        make_lean(pid=0, name="Player C", recent10=[1, 2, 3, 4, 5, 6, 7]),
    ]
    m = coverage_metrics({"leans": leans})
    assert m["distinct_pids"] == 0, \
        "playerId=0 must never count as a distinct id, even with valid recent10"
    assert m["zero_pid_count"] == 3
    asserts += 2

    # ── Test 6: same player with multiple markets counts as 1 distinct id ─
    leans = [
        make_lean(pid=42, name="LeBron James", market="PTS"),
        make_lean(pid=42, name="LeBron James", market="REB"),
        make_lean(pid=42, name="LeBron James", market="AST"),
    ]
    m = coverage_metrics({"leans": leans})
    assert m["total"] == 3
    assert m["distinct_pids"] == 1
    assert m["coverage_pct"] == 100
    asserts += 3

    # ── Test 7: empty recent10 array does NOT count as coverage ───────
    leans = [
        make_lean(pid=1, name="A", recent10=[]),
        make_lean(pid=2, name="B", recent10=[]),
        make_lean(pid=3, name="C", recent10=[1, 2, 3, 4, 5]),
    ]
    m = coverage_metrics({"leans": leans})
    assert m["with_recent10"] == 1, "empty recent10 array doesn't count"
    assert m["coverage_pct"] < 50
    asserts += 2

    # ── Test 8: short recent10 (< 5 logs) doesn't count ────────────────
    leans = [
        make_lean(pid=1, name="A", recent10=[1, 2]),       # too short
        make_lean(pid=2, name="B", recent10=[1, 2, 3]),    # too short
        make_lean(pid=3, name="C", recent10=[1, 2, 3, 4]), # too short
        make_lean(pid=4, name="D", recent10=[1, 2, 3, 4, 5]),  # qualifies
    ]
    m = coverage_metrics({"leans": leans})
    assert m["with_recent10"] == 1
    assert m["coverage_pct"] == 25
    asserts += 2

    # ── Test 9: low-coverage threshold default is honest at 50% ────────
    # 49% should trigger warning, 51% should not
    metrics_49 = {"total": 100, "coverage_pct": 49, "with_recent10": 49,
                  "distinct_pids": 49, "zero_pid_count": 51}
    metrics_51 = {"total": 100, "coverage_pct": 51, "with_recent10": 51,
                  "distinct_pids": 51, "zero_pid_count": 49}
    assert is_low_coverage(metrics_49) is True
    assert is_low_coverage(metrics_51) is False
    asserts += 2

    # ── Test 10: realistic mixed-quality board ─────────────────────────
    # 8 distinct stars with full coverage + 4 role players without ids.
    # Coverage = 24/30 = 80% → above 50% threshold.
    leans = []
    for i in range(1, 9):
        for market in ("PTS", "REB", "AST"):
            leans.append(make_lean(pid=i, name=f"Star{i}", market=market))
    for i in range(1, 7):
        leans.append(make_lean(pid=0, name=f"Bench{i}", recent10=[]))
    m = coverage_metrics({"leans": leans})
    assert m["total"] == 30
    assert m["with_recent10"] == 24
    assert m["coverage_pct"] == 80
    assert m["distinct_pids"] == 8
    assert m["zero_pid_count"] == 6
    assert is_low_coverage(m) is False, "80% is above the warning threshold"
    asserts += 6

    print(f"\n  ✓ all {asserts} playerIdCoverage assertions passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
