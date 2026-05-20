"""Tests for pipeline.model_audit.

Pure unit tests against synthesised in-memory rows. No filesystem reads.
Every assertion exercises a real downstream consumer of the audit
artifact:

  * sample-size weight thresholds match the UI's helper
  * win/loss buckets are exact (pushes excluded)
  * projection-error stats are tolerant to missing fields
  * edge bands fall on the published cutoffs
  * edge quartiles split data evenly (n//4)
  * per-game dispersion floors at 15 decisive picks
  * weak/strong cohort surfacing requires the 5pp deviation
  * cross-sport aggregation sums NBA + MLB

Run:  python -m pipeline.model_audit_test
"""
from __future__ import annotations

import sys

from . import model_audit as MA


GREEN = "\033[0;32m"
RED = "\033[0;31m"
BLUE = "\033[0;34m"
RESET = "\033[0m"


class Suite:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.failures: list[str] = []

    def assert_eq(self, actual, expected, name):
        if actual == expected:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(
                f"{name}: expected {expected!r}, got {actual!r}"
            )
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected: {expected!r}")
            print(f"    got:      {actual!r}")

    def assert_true(self, cond, name):
        if cond:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: condition was false")
            print(f"  {RED}✗{RESET} {name}")

    def assert_close(self, actual, expected, tol, name):
        if actual is None:
            self.failed += 1
            self.failures.append(f"{name}: got None")
            print(f"  {RED}✗{RESET} {name} (got None)")
            return
        if abs(actual - expected) <= tol:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(
                f"{name}: expected {expected} ± {tol}, got {actual}"
            )
            print(f"  {RED}✗{RESET} {name}")


# ─────────────────────────────────────────────────────────────────────
# Synthesised row helpers
# ─────────────────────────────────────────────────────────────────────


def _nba_row(
    *,
    date: str = "2026-05-19",
    game_id: str = "g1",
    market: str = "PTS",
    side: str = "Over",
    line: float = 20.0,
    confidence: str = "High",
    edge: float = 7.5,
    bookmaker: str = "fanduel",
    proj: float | None = 22.0,
    actual: float | None = 25.0,
    result: str = "win",
) -> dict:
    return {
        "date": date,
        "gameId": game_id,
        "market": market,
        "side": side,
        "line": line,
        "confidence": confidence,
        "edgePct": edge,
        "bookmaker": bookmaker,
        "modelProjection": proj,
        "finalStat": actual,
        "absoluteProjectionError": (
            abs(actual - proj) if proj is not None and actual is not None else None
        ),
        "projectionError": (
            (actual - proj) if proj is not None and actual is not None else None
        ),
        "result": result,
    }


def _mlb_row(
    *,
    date: str = "2026-05-18",
    game_pk: str = "g1",
    market: str = "batter_hits",
    side: str = "Over",
    line: float = 0.5,
    confidence: str = "High",
    edge: float = 10.0,
    proj: float | None = 1.2,
    actual: float | None = 2.0,
    outcome: str = "Win",
) -> dict:
    return {
        "date": date,
        "gamePk": game_pk,
        "marketKey": market,
        "lean": side,
        "line": line,
        "confidence": confidence,
        "edgePct": edge,
        "projection": proj,
        "actual": actual,
        "outcome": outcome,
    }


# ─────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────


def test_weight_for(s: Suite) -> None:
    print(f"\n  {BLUE}─── weight thresholds match the UI helper ───{RESET}")
    s.assert_eq(MA._weight_for(0), "small-sample", "0 → small-sample")
    s.assert_eq(MA._weight_for(59), "small-sample", "59 → small-sample")
    s.assert_eq(MA._weight_for(60), "lean", "60 → lean (boundary)")
    s.assert_eq(MA._weight_for(199), "lean", "199 → lean")
    s.assert_eq(MA._weight_for(200), "signal", "200 → signal (boundary)")
    s.assert_eq(MA._weight_for(10_000), "signal", "10k → signal")


def test_normalise_nba_filters_non_decisive(s: Suite) -> None:
    print(f"\n  {BLUE}─── NBA normalisation drops non-decisive rows ───{RESET}")
    rows = [
        _nba_row(result="win"),
        _nba_row(result="loss"),
        _nba_row(result="push"),
        _nba_row(result="stats_unavailable"),
        _nba_row(result="invalid"),
    ]
    out = MA._normalise_nba(rows)
    s.assert_eq(len(out), 2, "only win + loss survive")
    s.assert_eq(sum(1 for r in out if r["is_win"]), 1, "1 win row")
    s.assert_eq(sum(1 for r in out if not r["is_win"]), 1, "1 loss row")


def test_normalise_mlb_filters_outcome(s: Suite) -> None:
    print(f"\n  {BLUE}─── MLB normalisation drops Push / Pending ───{RESET}")
    rows = [
        _mlb_row(outcome="Win"),
        _mlb_row(outcome="Loss"),
        _mlb_row(outcome="Push"),
        _mlb_row(outcome="Pending"),
    ]
    out = MA._normalise_mlb(rows)
    s.assert_eq(len(out), 2, "Win + Loss survive")
    wins = sum(1 for r in out if r["is_win"])
    s.assert_eq(wins, 1, "exactly 1 win")


def test_normalise_mlb_computes_err(s: Suite) -> None:
    print(f"\n  {BLUE}─── MLB normalisation derives abs/signed err ───{RESET}")
    row = _mlb_row(proj=1.2, actual=2.0)
    out = MA._normalise_mlb([row])
    s.assert_eq(len(out), 1, "single row")
    s.assert_close(out[0]["abs_err"], 0.8, 1e-9, "abs_err = |2.0 - 1.2|")
    s.assert_close(out[0]["signed_err"], 0.8, 1e-9, "signed_err = actual - proj")

    # missing projection → both errors None, row still kept
    row_missing = _mlb_row(proj=None, actual=2.0)
    out2 = MA._normalise_mlb([row_missing])
    s.assert_eq(out2[0]["abs_err"], None, "missing proj → abs_err None")
    s.assert_eq(out2[0]["signed_err"], None, "missing proj → signed_err None")


def test_bucket_by_counts(s: Suite) -> None:
    print(f"\n  {BLUE}─── bucket_by counts wins + losses per key ───{RESET}")
    rows = MA._normalise_nba(
        [
            _nba_row(side="Over", result="win"),
            _nba_row(side="Over", result="win"),
            _nba_row(side="Over", result="loss"),
            _nba_row(side="Under", result="win"),
            _nba_row(side="Under", result="loss"),
            _nba_row(side="Under", result="loss"),
        ]
    )
    buckets = MA._bucket_by(rows, "side")
    by_label = {b.label: b for b in buckets}
    s.assert_eq(by_label["Over"].wins, 2, "Over wins")
    s.assert_eq(by_label["Over"].losses, 1, "Over losses")
    s.assert_eq(by_label["Under"].wins, 1, "Under wins")
    s.assert_eq(by_label["Under"].losses, 2, "Under losses")
    s.assert_close(by_label["Over"].hit_rate, 2 / 3, 1e-9, "Over hit rate = 2/3")


def test_market_stats(s: Suite) -> None:
    print(f"\n  {BLUE}─── market stats include err mean / stdev / bias ───{RESET}")
    rows = MA._normalise_nba(
        [
            _nba_row(market="PTS", proj=20, actual=22, result="win"),  # +2
            _nba_row(market="PTS", proj=20, actual=18, result="loss"),  # -2
            _nba_row(market="PTS", proj=20, actual=25, result="win"),  # +5
            _nba_row(market="REB", proj=8, actual=7, result="loss"),
        ]
    )
    stats = MA._market_stats(rows)
    by_label = {m.label: m for m in stats}
    s.assert_eq(by_label["PTS"].wins, 2, "PTS wins")
    s.assert_eq(by_label["PTS"].losses, 1, "PTS losses")
    s.assert_close(
        by_label["PTS"].avg_abs_err, (2 + 2 + 5) / 3, 1e-9, "PTS avg |err|"
    )
    s.assert_close(
        by_label["PTS"].bias, (2 - 2 + 5) / 3, 1e-9, "PTS bias = mean signed err"
    )
    s.assert_true(
        by_label["PTS"].stdev_err is not None and by_label["PTS"].stdev_err >= 0,
        "PTS stdev present",
    )


def test_edge_band_cutoffs(s: Suite) -> None:
    print(f"\n  {BLUE}─── edge bands hit the published cutoffs ───{RESET}")
    s.assert_eq(MA._edge_band(0.0), "0–5pp", "0 → 0-5pp")
    s.assert_eq(MA._edge_band(4.9), "0–5pp", "4.9 → 0-5pp")
    s.assert_eq(MA._edge_band(5.0), "5–10pp", "5.0 → 5-10pp (boundary)")
    s.assert_eq(MA._edge_band(9.99), "5–10pp", "9.99 → 5-10pp")
    s.assert_eq(MA._edge_band(15.0), "15–25pp", "15.0 → 15-25pp")
    s.assert_eq(MA._edge_band(24.99), "15–25pp", "24.99 → 15-25pp")
    s.assert_eq(MA._edge_band(25.0), "25pp+", "25.0 → 25pp+")
    s.assert_eq(MA._edge_band(-12.0), "10–15pp", "negative |edge| uses abs")
    s.assert_eq(MA._edge_band(None), None, "None edge → None band")
    s.assert_eq(MA._edge_band(float("nan")), None, "NaN edge → None band")


def test_edge_quartile_split(s: Suite) -> None:
    print(f"\n  {BLUE}─── edge quartiles split data into 4 equal bins ───{RESET}")
    rows = MA._normalise_nba(
        [_nba_row(edge=i, result="win" if i % 2 == 0 else "loss") for i in range(20)]
    )
    quartiles = MA._by_edge_quartile(rows)
    s.assert_eq(len(quartiles), 4, "4 quartiles emitted")
    s.assert_eq(sum(q["decisive"] for q in quartiles), 20, "covers every row once")
    # smallest 5 indices are 0..4 → lowest quartile
    s.assert_close(quartiles[0]["lo"], 0.0, 1e-9, "Q1 lo = 0.0")
    s.assert_close(quartiles[0]["hi"], 4.0, 1e-9, "Q1 hi = 4.0")
    s.assert_close(quartiles[3]["hi"], 19.0, 1e-9, "Q4 hi = max edge")


def test_edge_quartile_skipped_when_tiny(s: Suite) -> None:
    print(f"\n  {BLUE}─── edge quartiles skipped under noise floor ───{RESET}")
    rows = MA._normalise_nba([_nba_row(edge=1.0)])
    s.assert_eq(MA._by_edge_quartile(rows), [], "empty under threshold")


def test_per_game_dispersion_excludes_tiny_games(s: Suite) -> None:
    print(f"\n  {BLUE}─── per-game dispersion floors at 15 decisive picks ───{RESET}")
    big = [
        _nba_row(game_id="big", result="win" if i < 10 else "loss")
        for i in range(20)
    ]
    tiny = [_nba_row(game_id="tiny", result="win") for _ in range(5)]
    rows = MA._normalise_nba(big + tiny)
    d = MA._per_game_dispersion(rows)
    s.assert_eq(d["nGames"], 1, "tiny game excluded; 1 big game survives")
    s.assert_close(d["minHit"], 0.5, 1e-9, "big game hit = 10/20")


def test_weak_strong_cohorts_require_min_decisive(s: Suite) -> None:
    print(f"\n  {BLUE}─── weak/strong cohorts require ≥30 decisive + 5pp gap ───{RESET}")
    market_side = [
        # 28 decisive — too small
        {"market": "PTS", "side": "Over", "wins": 5, "losses": 23, "decisive": 28, "hitRate": 5 / 28},
        # 50 decisive, 40% — qualifies as weak
        {"market": "AST", "side": "Over", "wins": 20, "losses": 30, "decisive": 50, "hitRate": 0.4},
        # 100 decisive, 50% — within 5pp of coin flip, excluded
        {"market": "REB", "side": "Under", "wins": 50, "losses": 50, "decisive": 100, "hitRate": 0.5},
        # 60 decisive, 65% — qualifies as strong
        {"market": "REB", "side": "Over", "wins": 39, "losses": 21, "decisive": 60, "hitRate": 0.65},
    ]
    weak, strong = MA._weak_strong_cohorts(market_side, [])
    s.assert_eq(len(weak), 1, "exactly 1 weak cohort surfaced")
    s.assert_eq(weak[0]["name"], "AST Over", "AST Over weakest")
    s.assert_eq(len(strong), 1, "exactly 1 strong cohort surfaced")
    s.assert_eq(strong[0]["name"], "REB Over", "REB Over strongest")


def test_build_audit_integration(s: Suite) -> None:
    print(f"\n  {BLUE}─── full build_audit integration ───{RESET}")
    nba_rows = [
        _nba_row(date="2026-05-15", market="PTS", side="Over", edge=8.0, result="win"),
        _nba_row(date="2026-05-15", market="PTS", side="Over", edge=8.0, result="loss"),
        _nba_row(date="2026-05-19", market="REB", side="Under", edge=12.0, result="win"),
        _nba_row(date="2026-05-19", market="AST", side="Over", edge=22.0, result="loss"),
        # push must be ignored
        _nba_row(date="2026-05-19", market="AST", side="Over", edge=5.0, result="push"),
    ]
    mlb_rows = [
        _mlb_row(date="2026-05-18", market="batter_hits", outcome="Win"),
        _mlb_row(date="2026-05-18", market="batter_hits", outcome="Loss"),
        _mlb_row(date="2026-05-16", market="pitcher_strikeouts", outcome="Win"),
    ]
    payload = MA.build_audit(nba_rows, mlb_rows, generated_at="2026-05-20T00:00:00")
    s.assert_eq(payload["generatedAt"], "2026-05-20T00:00:00", "generatedAt frozen")
    nba = payload["sports"]["nba"]
    mlb = payload["sports"]["mlb"]
    cross = payload["sports"]["cross"]

    s.assert_eq(nba["sport"], "nba", "nba sport field")
    s.assert_eq(nba["sampleSize"]["decisive"], 4, "nba decisive count excludes push")
    s.assert_eq(nba["sampleSize"]["dates"], 2, "nba two unique dates")
    s.assert_eq(nba["sampleSize"]["newestDate"], "2026-05-19", "nba newest date")
    s.assert_eq(nba["lifetime"]["wins"], 2, "nba lifetime wins")
    s.assert_eq(nba["lifetime"]["losses"], 2, "nba lifetime losses")
    s.assert_close(nba["lifetime"]["hitRate"], 0.5, 1e-9, "nba lifetime 50%")
    s.assert_true(
        all(d["gameContext"] is not None for d in nba["byDate"]),
        "nba byDate carries gameContext on each row",
    )
    s.assert_true(
        nba["byDate"][0]["gameContext"]["isPlayoff"],
        "nba May dates flagged as playoff",
    )
    s.assert_true(
        not mlb["byDate"][0]["gameContext"]["isPlayoff"],
        "mlb May dates not flagged as playoff",
    )

    s.assert_eq(mlb["lifetime"]["wins"], 2, "mlb lifetime wins")
    s.assert_eq(mlb["lifetime"]["losses"], 1, "mlb lifetime losses")
    s.assert_close(mlb["lifetime"]["hitRate"], 2 / 3, 1e-9, "mlb lifetime 66.7%")

    s.assert_eq(cross["decisive"], 7, "cross sum decisive (4 + 3)")
    s.assert_eq(cross["wins"], 4, "cross sum wins (2 + 2)")
    s.assert_eq(cross["losses"], 3, "cross sum losses (2 + 1)")
    s.assert_eq(cross["newestDate"], "2026-05-19", "cross newest across sports")


def test_atomic_write_creates_dir(s: Suite) -> None:
    print(f"\n  {BLUE}─── atomic write creates the target directory ───{RESET}")
    import json
    import os
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "deep", "nested", "audit.json")
        MA._atomic_write_json(out, {"hello": "world"})
        s.assert_true(os.path.exists(out), "file exists")
        with open(out) as f:
            data = json.load(f)
        s.assert_eq(data, {"hello": "world"}, "payload round-trips")


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────


def main() -> int:
    s = Suite()
    tests = [
        test_weight_for,
        test_normalise_nba_filters_non_decisive,
        test_normalise_mlb_filters_outcome,
        test_normalise_mlb_computes_err,
        test_bucket_by_counts,
        test_market_stats,
        test_edge_band_cutoffs,
        test_edge_quartile_split,
        test_edge_quartile_skipped_when_tiny,
        test_per_game_dispersion_excludes_tiny_games,
        test_weak_strong_cohorts_require_min_decisive,
        test_build_audit_integration,
        test_atomic_write_creates_dir,
    ]
    for t in tests:
        t(s)
    print(
        f"\n{GREEN if s.failed == 0 else RED}"
        f"{'✓' if s.failed == 0 else '✗'} "
        f"{s.passed} assertions passed, {s.failed} failed{RESET}"
    )
    return 0 if s.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
