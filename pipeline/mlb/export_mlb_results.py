"""Export internal MLB settlement output to the public /mlb/results bundle.

Reads:
  pipeline/validation/mlb_settled_leans.jsonl
  pipeline/validation/mlb_comparison_report_<date>.json

Writes (public — `app/public/data/mlb/results/`):
  available_dates.json            sorted list of dates with at least one
                                   settled row
  lifetime_summary.json           aggregate across every settled MLB date
                                   (decisive, W/L/P, hit rate, partial flag)
  settled_leans.jsonl             sanitized public copy of the internal
                                   jsonl (drops internal fields)
  comparison_report_<date>.json   per-date public report — copy of the
                                   internal report

Honest behavior:
  - Forecast of record (Stage 3B): the lifetime W/L/P counts each lean ONCE.
    A postponed game's leans are re-issued on the next board and both copies
    are graded against the one make-up game (gamePk 824785, 2026-09-22/23).
    Which rows are of record is decided by the ONE JS rule
    (app/src/lib/results/mlb-leans-of-record.mjs, via
    app/scripts/results/mlb-leans-of-record-ids.mjs) — the same selection
    graded-picks.json counts — never by a second Python dedupe. The raw and
    public settled_leans.jsonl keep every row; lifetime_summary.json discloses
    what it left out (`notOfRecord`). If the rule cannot be run the export
    fails closed rather than publish a record the guard would reject.
  - Pending games stay in `pendingGameList`. Never silently counted.
  - Lifetime summary marks `partial=True` whenever any date in the audit
    still has pending games.
  - When no settled rows exist, exports clean zeros + empty arrays.
  - Idempotent — rerunning overwrites the public files in place.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from .. import config as C

VALIDATION_DIR = C.ROOT_DIR / "pipeline" / "validation"
SETTLED_LEANS_PATH = VALIDATION_DIR / "mlb_settled_leans.jsonl"
PUBLIC_DIR = C.APP_PUBLIC_DATA / "mlb" / "results"
# The one forecast-of-record rule (JS). Read-only CLI; prints the row ids of record.
OF_RECORD_CLI = C.ROOT_DIR / "app" / "scripts" / "results" / "mlb-leans-of-record-ids.mjs"
GAME_GRADER_NAME = "game-predictions-graded.jsonl"  # StatsAPI first pitch per gamePk (canonical start)


# Fields stripped from the public jsonl. Keep nothing operationally sensitive.
PUBLIC_LEAN_KEEP = {
    "id",
    "date",
    "gamePk",
    "playerId",
    "playerName",
    "playerTeamAbbr",
    "opponentAbbr",
    "playerRole",
    "marketKey",
    "marketLabel",
    "line",
    "lean",
    "confidence",
    "projection",
    "edgePct",
    "actual",
    "outcome",
}


def _load_settled_leans() -> list[dict]:
    if not SETTLED_LEANS_PATH.exists():
        return []
    rows: list[dict] = []
    for line in SETTLED_LEANS_PATH.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except Exception:
            continue
    return rows


def _load_comparison_reports() -> dict[str, dict]:
    reports: dict[str, dict] = {}
    if not VALIDATION_DIR.exists():
        return reports
    for path in sorted(VALIDATION_DIR.glob("mlb_comparison_report_*.json")):
        try:
            report = json.loads(path.read_text())
            date = report.get("date")
            if date:
                reports[date] = report
        except Exception:
            continue
    return reports


def _of_record(rows: list[dict]) -> tuple[list[dict], dict]:
    """Rows of record + the disclosure, from the JS rule. Raises when it cannot be applied (fail closed)."""
    if not rows:
        return [], {"superseded": 0, "late": 0, "conflictRows": 0, "unkeyed": 0}
    ids = [r.get("id") for r in rows]
    if any(not isinstance(i, str) or not i for i in ids):
        raise RuntimeError("forecast of record: a settled lean has no id — it cannot be matched to the rule's output")
    if len(set(ids)) != len(ids):
        raise RuntimeError("forecast of record: duplicate settled-lean ids — rows cannot be matched one-to-one")
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("forecast of record: `node` is not on PATH — refusing to publish an uncorrected lifetime record")
    cmd = [node, str(OF_RECORD_CLI), "--leans", str(SETTLED_LEANS_PATH), "--games", str(PUBLIC_DIR / GAME_GRADER_NAME)]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"forecast of record: {OF_RECORD_CLI.name} failed: {proc.stderr.strip()}")
    sel = json.loads(proc.stdout)
    record_ids = set(sel["recordIds"])
    not_ids = set(sel["notOfRecordIds"])
    if sel.get("sourceRows") != len(rows) or record_ids | not_ids != set(ids) or record_ids & not_ids:
        raise RuntimeError("forecast of record: the rule's output does not cover exactly the rows read here")
    ex = sel.get("excluded") or {}
    disclosure = {
        "rule": "forecast-of-record: one lean per game · player · market (the last board before the game's canonical start); earlier-board copies of a re-issued lean stay in settled_leans.jsonl and are not counted",
        "superseded": ex.get("superseded", 0),
        "late": ex.get("late", 0),
        "conflictRows": ex.get("conflictRows", 0),
        "unkeyed": ex.get("unkeyed", 0),
    }
    return [r for r in rows if r["id"] in record_ids], disclosure


def export() -> dict:
    """Run the export. Returns the lifetime summary dict."""
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    rows = _load_settled_leans()
    reports = _load_comparison_reports()
    dates = sorted({r["date"] for r in rows if r.get("date")})

    # ---------- available_dates.json ----------
    available = {
        "sport": "MLB",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dates": dates,
    }
    (PUBLIC_DIR / "available_dates.json").write_text(
        json.dumps(available, indent=2)
    )

    # ---------- settled_leans.jsonl (public) ----------
    public_jsonl = PUBLIC_DIR / "settled_leans.jsonl"
    with public_jsonl.open("w") as f:
        for r in rows:
            sanitized = {k: r[k] for k in PUBLIC_LEAN_KEEP if k in r}
            f.write(json.dumps(sanitized) + "\n")

    # ---------- comparison_report_<date>.json (public mirror) ----------
    for date, report in reports.items():
        (PUBLIC_DIR / f"comparison_report_{date}.json").write_text(
            json.dumps(report, indent=2)
        )

    # ---------- lifetime_summary.json ----------
    # Forecast of record only (Stage 3B): the JS rule says which rows count.
    record, not_of_record = _of_record(rows)
    total_settled = len(record)
    decisive_rows = [r for r in record if r.get("outcome") in ("Win", "Loss")]
    wins = sum(1 for r in record if r.get("outcome") == "Win")
    losses = sum(1 for r in record if r.get("outcome") == "Loss")
    pushes = sum(1 for r in record if r.get("outcome") == "Push")
    hit_rate = (wins / len(decisive_rows)) if decisive_rows else None

    # Aggregate partial flag — if ANY date in the report set is partial,
    # lifetime is partial.
    partial_dates = [d for d, r in reports.items() if r.get("partial")]
    any_partial = bool(partial_dates)
    pending_games_total = sum(
        len(r.get("pendingGameList") or []) for r in reports.values()
    )

    summary = {
        "sport": "MLB",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalDates": len(dates),
        "totalSettled": total_settled,
        "decisive": len(decisive_rows),
        "wins": wins,
        "losses": losses,
        "pushes": pushes,
        "hitRate": round(hit_rate, 4) if hit_rate is not None else None,
        "smallSample": len(decisive_rows) < 25,
        "partial": any_partial,
        "pendingDates": partial_dates,
        "pendingGamesTotal": pending_games_total,
        "oldestDate": dates[0] if dates else None,
        "newestDate": dates[-1] if dates else None,
        "notOfRecord": not_of_record,
    }
    (PUBLIC_DIR / "lifetime_summary.json").write_text(json.dumps(summary, indent=2))

    print(
        f"[export] {total_settled} settled rows across {len(dates)} date(s) · "
        f"decisive={len(decisive_rows)} hit_rate={summary['hitRate']} "
        f"partial={any_partial} pending_games={pending_games_total}"
    )
    try:
        display = PUBLIC_DIR.relative_to(C.ROOT_DIR)
    except ValueError:
        # Tests patch PUBLIC_DIR to a tmp directory outside the repo; keep
        # the absolute path for clarity in that case.
        display = PUBLIC_DIR
    print(f"[export] wrote {display}/")
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export MLB Results bundle.")
    _ = parser.parse_args(argv)
    export()
    return 0


if __name__ == "__main__":
    sys.exit(main())
