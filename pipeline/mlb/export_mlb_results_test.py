"""Focused tests for pipeline.mlb.export_mlb_results.

Sets up a temp validation dir and runs the export to confirm shape +
idempotence. No network.

Run:
    python3 -m pipeline.mlb.export_mlb_results_test
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest import mock

from . import export_mlb_results as exp


def _ok(msg: str) -> None:
    print(f"  \033[0;32m✓\033[0m {msg}")


def _fail(msg: str) -> None:
    print(f"  \033[0;31m✗\033[0m {msg}", file=sys.stderr)
    raise AssertionError(msg)


def assert_eq(a, b, label: str) -> None:
    if a == b:
        _ok(f"{label} = {a!r}")
    else:
        _fail(f"{label}: expected {b!r}, got {a!r}")


def setup_temp(tmp: Path) -> tuple[Path, Path, Path]:
    """Return (validation_dir, settled_path, public_dir) inside tmp."""
    val = tmp / "validation"
    pub = tmp / "public"
    val.mkdir(parents=True)
    pub.mkdir(parents=True)
    settled = val / "mlb_settled_leans.jsonl"
    return val, settled, pub


def _lean(id_: str, player: int, outcome: str, date: str = "2026-05-16", game: int = 900001, line: float = 0.5) -> dict:
    """A settled lean with its question identity (game · player · market) — every real ledger row carries one."""
    return {"id": id_, "date": date, "gamePk": game, "playerId": player, "marketKey": "batter_hits",
            "line": line, "lean": "Over", "outcome": outcome}


def _run(val: Path, settled: Path, pub: Path) -> dict:
    with mock.patch.object(exp, "VALIDATION_DIR", val), \
         mock.patch.object(exp, "SETTLED_LEANS_PATH", settled), \
         mock.patch.object(exp, "PUBLIC_DIR", pub):
        return exp.export()


def test_export_empty():
    print("\n─── empty settlement → clean zeros ───")
    import tempfile

    with tempfile.TemporaryDirectory() as tdir:
        tdir_path = Path(tdir)
        val, settled, pub = setup_temp(tdir_path)
        with mock.patch.object(exp, "VALIDATION_DIR", val), \
             mock.patch.object(exp, "SETTLED_LEANS_PATH", settled), \
             mock.patch.object(exp, "PUBLIC_DIR", pub):
            summary = exp.export()
        assert_eq(summary["totalSettled"], 0, "no rows")
        assert_eq(summary["hitRate"], None, "no hit rate")
        assert_eq(summary["partial"], False, "no dates → no partial")
        avail = json.loads((pub / "available_dates.json").read_text())
        assert_eq(avail["dates"], [], "available dates empty")
        # settled_leans.jsonl exists but empty
        assert (pub / "settled_leans.jsonl").exists(), "jsonl file written"
        assert (pub / "settled_leans.jsonl").read_text() == "", "jsonl is empty"
        _ok("empty export wrote stub files")


def test_export_with_rows_and_partial_flag():
    print("\n─── rows present + partial flag from report ───")
    import tempfile

    with tempfile.TemporaryDirectory() as tdir:
        tdir_path = Path(tdir)
        val, settled, pub = setup_temp(tdir_path)
        settled.write_text(
            "\n".join(
                [
                    json.dumps(_lean("a", 1, "Win")),
                    json.dumps(_lean("b", 2, "Win")),
                    json.dumps(_lean("c", 3, "Loss")),
                    json.dumps(_lean("d", 4, "Push")),
                ]
            )
            + "\n"
        )
        (val / "mlb_comparison_report_2026-05-16.json").write_text(
            json.dumps(
                {
                    "date": "2026-05-16",
                    "partial": True,
                    "pendingGameList": [{"gamePk": 999, "matchup": "X @ Y"}],
                }
            )
        )
        with mock.patch.object(exp, "VALIDATION_DIR", val), \
             mock.patch.object(exp, "SETTLED_LEANS_PATH", settled), \
             mock.patch.object(exp, "PUBLIC_DIR", pub):
            summary = exp.export()
        assert_eq(summary["totalSettled"], 4, "4 rows")
        assert_eq(summary["decisive"], 3, "3 decisive (push excluded)")
        assert_eq(summary["wins"], 2, "wins")
        assert_eq(summary["losses"], 1, "losses")
        assert_eq(summary["pushes"], 1, "pushes")
        assert_eq(summary["hitRate"], round(2 / 3, 4), "hit rate 2/3")
        assert_eq(summary["partial"], True, "partial because pending exists")
        assert_eq(summary["pendingDates"], ["2026-05-16"], "pending dates listed")
        assert_eq(summary["pendingGamesTotal"], 1, "1 pending game")
        avail = json.loads((pub / "available_dates.json").read_text())
        assert_eq(avail["dates"], ["2026-05-16"], "dates carry through")
        assert (pub / "comparison_report_2026-05-16.json").exists(), "per-date report mirrored"


def test_export_idempotent_overwrites():
    print("\n─── rerunning export overwrites, doesn't double-count ───")
    import tempfile

    with tempfile.TemporaryDirectory() as tdir:
        tdir_path = Path(tdir)
        val, settled, pub = setup_temp(tdir_path)
        settled.write_text(
            json.dumps(_lean("a", 1, "Win")) + "\n"
        )
        with mock.patch.object(exp, "VALIDATION_DIR", val), \
             mock.patch.object(exp, "SETTLED_LEANS_PATH", settled), \
             mock.patch.object(exp, "PUBLIC_DIR", pub):
            exp.export()
            first = (pub / "lifetime_summary.json").read_text()
            exp.export()
            second = (pub / "lifetime_summary.json").read_text()
        # generatedAt timestamps differ; compare totalSettled
        a = json.loads(first)
        b = json.loads(second)
        assert_eq(a["totalSettled"], 1, "first run total")
        assert_eq(b["totalSettled"], 1, "second run total (no doubling)")
        # Public jsonl has same row count
        rows = [
            line for line in (pub / "settled_leans.jsonl").read_text().splitlines() if line
        ]
        assert_eq(len(rows), 1, "public jsonl single row after rerun")


def test_public_jsonl_strips_internal_fields():
    print("\n─── public jsonl strips internal fields ───")
    import tempfile

    with tempfile.TemporaryDirectory() as tdir:
        tdir_path = Path(tdir)
        val, settled, pub = setup_temp(tdir_path)
        settled.write_text(
            json.dumps(
                {
                    "id": "a",
                    "date": "2026-05-16",
                    "outcome": "Win",
                    "settledAt": "internal",
                    "matchMethod": "id",
                    "modelProbOver": 0.6,
                    "playerName": "Test",
                    "gamePk": 900001,
                    "playerId": 1,
                    "marketKey": "batter_hits",
                    "line": 1.5,
                    "lean": "Over",
                    "actual": 2,
                }
            )
            + "\n"
        )
        with mock.patch.object(exp, "VALIDATION_DIR", val), \
             mock.patch.object(exp, "SETTLED_LEANS_PATH", settled), \
             mock.patch.object(exp, "PUBLIC_DIR", pub):
            exp.export()
        public_row = json.loads(
            (pub / "settled_leans.jsonl").read_text().splitlines()[0]
        )
        # Kept
        assert "playerName" in public_row, "kept playerName"
        assert "actual" in public_row, "kept actual"
        # Stripped
        assert "settledAt" not in public_row, "stripped settledAt"
        assert "matchMethod" not in public_row, "stripped matchMethod"
        assert "modelProbOver" not in public_row, "stripped modelProbOver"
        _ok("internal-only fields not exposed publicly")


FIXTURE_824785 = (Path(__file__).resolve().parents[2] / "app" / "src" / "lib" / "results" / "__fixtures__"
                  / "mlb-leans-of-record" / "postponed-824785.json")


def test_postponed_824785_counts_once():
    print("\n─── Stage 3B: postponed 824785 re-issued leans count once (same rule as graded-picks) ───")
    import tempfile

    fx = json.loads(FIXTURE_824785.read_text())
    e = fx["expect"]
    with tempfile.TemporaryDirectory() as tdir:
        val, settled, pub = setup_temp(Path(tdir))
        settled.write_text("\n".join(json.dumps(r) for r in fx["leans"]) + "\n")
        (pub / exp.GAME_GRADER_NAME).write_text("\n".join(json.dumps(g) for g in fx["gameGrader"]) + "\n")
        summary = _run(val, settled, pub)
        assert_eq(summary["wins"], e["record"]["win"], "wins of record")
        assert_eq(summary["losses"], e["record"]["loss"], "losses of record")
        assert_eq(summary["decisive"], e["record"]["win"] + e["record"]["loss"], "decisive of record")
        assert_eq(summary["totalSettled"], e["record"]["rows"], "rows of record")
        assert_eq(summary["notOfRecord"]["superseded"], e["superseded"]["rows"], "superseded disclosed")
        assert_eq(e["naive"]["win"] - summary["wins"], e["superseded"]["win"], "wins removed = earlier-board copies")
        # raw rows preserved: the public jsonl still carries every row
        public = [line for line in (pub / "settled_leans.jsonl").read_text().splitlines() if line]
        assert_eq(len(public), e["rows"], "public settled_leans keeps every raw row")


def test_unkeyed_row_excluded_never_a_loss():
    print("\n─── Stage 3B: a row without game/player identity is excluded and disclosed (Q5) ───")
    import tempfile

    with tempfile.TemporaryDirectory() as tdir:
        val, settled, pub = setup_temp(Path(tdir))
        nokey = {k: v for k, v in _lean("z", 9, "Loss").items() if k != "playerId"}
        settled.write_text(json.dumps(_lean("a", 1, "Win")) + "\n" + json.dumps(nokey) + "\n")
        summary = _run(val, settled, pub)
        assert_eq(summary["losses"], 0, "unkeyed loss is not counted")
        assert_eq(summary["notOfRecord"]["unkeyed"], 1, "unkeyed disclosed")


def test_fails_closed_without_the_rule():
    print("\n─── Stage 3B: no node → no uncorrected lifetime record (fail closed) ───")
    import tempfile

    with tempfile.TemporaryDirectory() as tdir:
        val, settled, pub = setup_temp(Path(tdir))
        settled.write_text(json.dumps(_lean("a", 1, "Win")) + "\n")
        with mock.patch.object(exp.shutil, "which", return_value=None):
            try:
                _run(val, settled, pub)
            except RuntimeError:
                _ok("export refused")
            else:
                _fail("export published a lifetime record without the forecast-of-record rule")
        assert not (pub / "lifetime_summary.json").exists(), "no lifetime summary written"


def main() -> int:
    print("\n=== pipeline.mlb.export_mlb_results tests ===")
    test_export_empty()
    test_export_with_rows_and_partial_flag()
    test_export_idempotent_overwrites()
    test_public_jsonl_strips_internal_fields()
    test_postponed_824785_counts_once()
    test_unkeyed_row_excluded_never_a_loss()
    test_fails_closed_without_the_rule()
    print("\n\033[0;32m✓ all export_mlb_results assertions passed\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
