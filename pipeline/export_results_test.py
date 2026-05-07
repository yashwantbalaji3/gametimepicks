"""
Phase 8.2 — deterministic tests for pipeline.export_results.

Zero network. Zero file writes outside a temp scratch dir. Verifies:

  - sanitize_row keeps only EXPORT_FIELDS, drops anything else
  - load_settled handles missing file, empty file, malformed lines
  - build_lifetime_summary aggregates correctly:
      * hit rate excludes pushes from denominator
      * decisive count = wins + losses
      * smallSample fires when decisive < 25
      * oldestDate / newestDate computed from settled rows
      * empty input → empty summary, no crashes
  - export() with dry-run does NOT write
  - export() actually writes 4 files: settled_leans.jsonl,
    comparison_report_*.json (copied), available_dates.json,
    lifetime_summary.json
  - Re-running overwrites cleanly
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

GREEN = "\033[0;32m"
RED = "\033[0;31m"
DIM = "\033[2m"
BLUE = "\033[0;34m"
GOLD = "\033[0;33m"
RESET = "\033[0m"

from . import export_results as ER


class Suite:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.failures: list[str] = []

    def assert_eq(self, actual, expected, name):
        if actual == expected:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: expected {expected!r}, got {actual!r}")
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected: {expected!r}")
            print(f"    got:      {actual!r}")

    def assert_in(self, key, container, name):
        if key in container:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}: {key!r} not in container")

    def assert_close(self, actual, expected, tol, name):
        if actual is None and expected is None:
            ok = True
        elif actual is None or expected is None:
            ok = False
        else:
            ok = abs(float(actual) - float(expected)) <= tol
        if ok:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}: {actual!r} ≉ {expected!r}")

    def assert_true(self, cond, name):
        if cond:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_sanitize_row(s: Suite):
    print(f"\n  {BLUE}─── sanitize_row strips non-EXPORT fields ───{RESET}")
    raw = {
        "date": "2026-05-05",
        "playerName": "P",
        "result": "win",
        "absoluteProjectionError": 2.5,
        "internalDebugTrace": "should-not-ship",
        "_priorGeneratedAt": "should-not-ship",
        "anotherInternalThing": [1, 2, 3],
    }
    out = ER.sanitize_row(raw)
    s.assert_in("date", out, "kept: date")
    s.assert_in("playerName", out, "kept: playerName")
    s.assert_in("result", out, "kept: result")
    s.assert_in("absoluteProjectionError", out, "kept: absoluteProjectionError")
    s.assert_eq("internalDebugTrace" in out, False, "stripped: internalDebugTrace")
    s.assert_eq("_priorGeneratedAt" in out, False, "stripped: _priorGeneratedAt")
    s.assert_eq("anotherInternalThing" in out, False, "stripped: anotherInternalThing")


def test_lifetime_summary_basic(s: Suite):
    print(f"\n  {BLUE}─── lifetime_summary aggregation ───{RESET}")
    rows = [
        # 6 wins on 05-05
        *[{"date": "2026-05-05", "result": "win"} for _ in range(6)],
        # 3 losses on 05-05
        *[{"date": "2026-05-05", "result": "loss"} for _ in range(3)],
        # 2 pushes on 05-06
        *[{"date": "2026-05-06", "result": "push"} for _ in range(2)],
        # 1 stats_unavailable (excluded)
        {"date": "2026-05-06", "result": "stats_unavailable"},
        # 1 invalid (excluded)
        {"date": "2026-05-06", "result": "invalid"},
    ]
    summary = ER.build_lifetime_summary(rows)
    s.assert_eq(summary["totalSettled"], 11, "11 rows are W/L/P (excluded 2)")
    s.assert_eq(summary["wins"], 6, "wins=6")
    s.assert_eq(summary["losses"], 3, "losses=3")
    s.assert_eq(summary["pushes"], 2, "pushes=2")
    s.assert_eq(summary["decisive"], 9, "decisive excludes pushes")
    s.assert_close(summary["hitRate"], 6 / 9, 0.0001, "hit rate = 6/9")
    s.assert_eq(summary["totalDates"], 2, "2 unique dates")
    s.assert_eq(summary["oldestDate"], "2026-05-05", "oldest date")
    s.assert_eq(summary["newestDate"], "2026-05-06", "newest date")
    s.assert_true(summary["smallSample"], "smallSample=True (9 < 25)")


def test_lifetime_summary_empty(s: Suite):
    print(f"\n  {BLUE}─── lifetime_summary on empty input ───{RESET}")
    summary = ER.build_lifetime_summary([])
    s.assert_eq(summary["totalSettled"], 0, "no rows → totalSettled=0")
    s.assert_eq(summary["hitRate"], None, "no decisive → hitRate=None (not 0%)")
    s.assert_eq(summary["oldestDate"], None, "no dates → oldestDate=None")
    s.assert_eq(summary["newestDate"], None, "no dates → newestDate=None")
    s.assert_true(summary["smallSample"], "0 decisive → smallSample=True")


def test_lifetime_summary_big_sample(s: Suite):
    print(f"\n  {BLUE}─── smallSample turns OFF at 25+ decisive ───{RESET}")
    big = [{"date": "d", "result": "win"} for _ in range(30)]
    s.assert_eq(
        ER.build_lifetime_summary(big)["smallSample"],
        False,
        "30 wins → smallSample=False",
    )


def test_load_settled_missing_file(s: Suite, tmp: Path):
    print(f"\n  {BLUE}─── load_settled — missing file → [] ───{RESET}")
    ER.SOURCE_DIR = tmp / "validation"
    ER.SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    s.assert_eq(ER.load_settled(), [], "missing settled_leans.jsonl → []")


def test_load_settled_malformed_lines(s: Suite, tmp: Path):
    print(f"\n  {BLUE}─── load_settled — malformed lines skipped ───{RESET}")
    ER.SOURCE_DIR = tmp / "validation2"
    ER.SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    p = ER.SOURCE_DIR / "settled_leans.jsonl"
    p.write_text(
        '\n'  # blank
        '   \n'  # whitespace
        '{"date":"d","result":"win"}\n'
        'this is not json\n'
        '{"date":"d","result":"loss"}\n'
        '{}\n'  # empty obj — kept
    )
    rows = ER.load_settled()
    s.assert_eq(len(rows), 3, "3 valid JSON rows kept (1 empty obj + 2 normal)")


def test_export_dry_run_no_write(s: Suite, tmp: Path):
    print(f"\n  {BLUE}─── export(dry_run=True) writes nothing ───{RESET}")
    ER.SOURCE_DIR = tmp / "v"
    ER.DEST_DIR = tmp / "out"
    ER.SOURCE_DIR.mkdir(parents=True)
    (ER.SOURCE_DIR / "settled_leans.jsonl").write_text(
        '{"date":"d","result":"win","playerName":"P","internalDebug":"x"}\n'
    )
    s.assert_eq(ER.export(dry_run=True)["exportedRows"], 1, "dry-run reports 1 row")
    s.assert_eq(ER.DEST_DIR.exists(), False, "dest dir not created in dry-run")


def test_export_actually_writes(s: Suite, tmp: Path):
    print(f"\n  {BLUE}─── export() writes 4 files ───{RESET}")
    ER.SOURCE_DIR = tmp / "v2"
    ER.DEST_DIR = tmp / "out2"
    ER.SOURCE_DIR.mkdir(parents=True)
    (ER.SOURCE_DIR / "settled_leans.jsonl").write_text(
        '\n'.join([
            json.dumps({
                "date": "2026-05-05", "result": "win", "playerName": "A",
                "market": "PTS", "side": "Over", "internalDebug": "x",
            }),
            json.dumps({
                "date": "2026-05-05", "result": "loss", "playerName": "B",
                "market": "REB", "side": "Under", "internalDebug": "y",
            }),
        ])
    )
    (ER.SOURCE_DIR / "comparison_report_2026-05-05.json").write_text(
        '{"date":"2026-05-05","totalSettled":2}'
    )

    res = ER.export()
    s.assert_eq(res["exportedRows"], 2, "2 rows exported")
    s.assert_eq(res["exportedReports"], 1, "1 comparison_report copied")

    # Verify output files
    s.assert_true((ER.DEST_DIR / "settled_leans.jsonl").exists(), "settled_leans.jsonl written")
    s.assert_true((ER.DEST_DIR / "comparison_report_2026-05-05.json").exists(),
                  "comparison_report copied")
    s.assert_true((ER.DEST_DIR / "available_dates.json").exists(), "available_dates.json written")
    s.assert_true((ER.DEST_DIR / "lifetime_summary.json").exists(), "lifetime_summary.json written")

    # Sanitization end-to-end: internalDebug must be gone
    out_lines = [
        json.loads(l) for l in (ER.DEST_DIR / "settled_leans.jsonl").read_text().splitlines() if l.strip()
    ]
    s.assert_eq(any("internalDebug" in r for r in out_lines), False,
                "internalDebug stripped end-to-end")

    # Manifest
    manifest = json.loads((ER.DEST_DIR / "available_dates.json").read_text())
    s.assert_eq(manifest["dates"], ["2026-05-05"], "manifest lists 2026-05-05")

    # Lifetime summary
    summary = json.loads((ER.DEST_DIR / "lifetime_summary.json").read_text())
    s.assert_eq(summary["totalSettled"], 2, "summary totalSettled=2")
    s.assert_close(summary["hitRate"], 0.5, 0.001, "summary hitRate=0.5")


def test_export_idempotent(s: Suite, tmp: Path):
    print(f"\n  {BLUE}─── export is idempotent (re-run overwrites cleanly) ───{RESET}")
    ER.SOURCE_DIR = tmp / "v3"
    ER.DEST_DIR = tmp / "out3"
    ER.SOURCE_DIR.mkdir(parents=True)
    (ER.SOURCE_DIR / "settled_leans.jsonl").write_text(
        '{"date":"d","result":"win","playerName":"A"}\n'
    )
    ER.export()
    n1 = (ER.DEST_DIR / "settled_leans.jsonl").read_text().count("\n")
    ER.export()
    n2 = (ER.DEST_DIR / "settled_leans.jsonl").read_text().count("\n")
    s.assert_eq(n1, n2, "second export same row count (no append)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    print()
    print(f"  {GOLD}Phase 8.2 — export_results tests{RESET}")
    print(f"  {DIM}zero network · zero file writes outside temp scratch{RESET}")

    s = Suite()
    test_sanitize_row(s)
    test_lifetime_summary_basic(s)
    test_lifetime_summary_empty(s)
    test_lifetime_summary_big_sample(s)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        orig_src, orig_dest = ER.SOURCE_DIR, ER.DEST_DIR
        try:
            test_load_settled_missing_file(s, tmp)
            test_load_settled_malformed_lines(s, tmp)
            test_export_dry_run_no_write(s, tmp)
            test_export_actually_writes(s, tmp)
            test_export_idempotent(s, tmp)
        finally:
            ER.SOURCE_DIR, ER.DEST_DIR = orig_src, orig_dest

    print()
    if s.failed == 0:
        print(f"  {GREEN}✓ all {s.passed} export assertions passed{RESET}\n")
        return 0
    print(f"  {RED}✗ {s.failed} of {s.passed + s.failed} export assertions FAILED{RESET}")
    for f in s.failures[:10]:
        print(f"  {RED}  {f}{RESET}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
