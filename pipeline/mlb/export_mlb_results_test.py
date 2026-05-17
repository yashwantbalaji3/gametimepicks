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
                    json.dumps({"id": "a", "date": "2026-05-16", "outcome": "Win"}),
                    json.dumps({"id": "b", "date": "2026-05-16", "outcome": "Win"}),
                    json.dumps({"id": "c", "date": "2026-05-16", "outcome": "Loss"}),
                    json.dumps({"id": "d", "date": "2026-05-16", "outcome": "Push"}),
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
            json.dumps({"id": "a", "date": "2026-05-16", "outcome": "Win"}) + "\n"
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


def main() -> int:
    print("\n=== pipeline.mlb.export_mlb_results tests ===")
    test_export_empty()
    test_export_with_rows_and_partial_flag()
    test_export_idempotent_overwrites()
    test_public_jsonl_strips_internal_fields()
    print("\n\033[0;32m✓ all export_mlb_results assertions passed\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
