"""
Phase 8.2 — sanitized results export.

Copies settled_leans + comparison_report files from pipeline/validation/
into app/public/data/results/ so the Next.js static export can read them
during build via standard data-loader paths (no cross-directory hacks).

Strips PII (none should be present) and any internal-only fields that
shouldn't ship to the browser bundle.

Usage:
  python -m pipeline.export_results
  python -m pipeline.export_results --dry-run

Run this AFTER `python -m pipeline.settle_results --date <date>`.

Outputs (created/overwritten in app/public/data/results/):
  settled_leans.jsonl                — all settled rows across every date
  comparison_report_<date>.json     — one per settled date
  available_dates.json              — manifest: { dates: [...], generatedAt }
  lifetime_summary.json             — pre-computed aggregate

The frontend reads from app/public/data/results/ which is part of the
static bundle — no fs-from-../pipeline tricks at build time.
"""
from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("gtp.export_results")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")


REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = REPO_ROOT / "pipeline" / "validation"
DEST_DIR = REPO_ROOT / "app" / "public" / "data" / "results"

# Fields kept on each settled row when shipping to the frontend.
# Anything else is stripped — defensive against future schema additions.
EXPORT_FIELDS = {
    "date",
    "gameId",
    "playerId",
    "playerName",
    "team",
    "opponent",
    "market",
    "side",
    "line",
    "bookmaker",
    "oddsOver",
    "oddsUnder",
    "modelProjection",
    "edgePct",
    "confidence",
    "finalStat",
    "result",
    "projectionError",
    "absoluteProjectionError",
    "settlementSource",
    "failureReason",
}

SAMPLE_SIZE_FLOOR = 25


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sanitize_row(row: dict) -> dict:
    return {k: v for k, v in row.items() if k in EXPORT_FIELDS}


def load_settled() -> list[dict]:
    path = SOURCE_DIR / "settled_leans.jsonl"
    if not path.exists():
        return []
    rows: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def find_comparison_reports() -> list[Path]:
    if not SOURCE_DIR.exists():
        return []
    return sorted(SOURCE_DIR.glob("comparison_report_*.json"))


def build_lifetime_summary(settled_rows: list[dict]) -> dict:
    settled = [
        r for r in settled_rows
        if r.get("result") in ("win", "loss", "push")
    ]
    wins = sum(1 for r in settled if r["result"] == "win")
    losses = sum(1 for r in settled if r["result"] == "loss")
    pushes = sum(1 for r in settled if r["result"] == "push")
    decisive = wins + losses
    hit_rate = (wins / decisive) if decisive > 0 else None
    dates = sorted({r["date"] for r in settled if r.get("date")})

    return {
        "totalDates": len(dates),
        "totalSettled": len(settled),
        "decisive": decisive,
        "wins": wins,
        "losses": losses,
        "pushes": pushes,
        "hitRate": hit_rate,
        "smallSample": decisive < SAMPLE_SIZE_FLOOR,
        "oldestDate": dates[0] if dates else None,
        "newestDate": dates[-1] if dates else None,
        "generatedAt": iso_now(),
        "_disclaimer": (
            "Hit rate excludes pushes. No ROI shown. Educational use only — "
            "not betting advice."
        ),
    }


def export(*, dry_run: bool = False) -> dict:
    if not SOURCE_DIR.exists():
        log.warning(f"source dir does not exist: {SOURCE_DIR}")
        return {
            "exportedRows": 0,
            "exportedReports": 0,
            "dates": [],
            "dryRun": dry_run,
            "note": "no source data — pipeline/validation/ is empty",
        }

    settled_rows = load_settled()
    sanitized_rows = [sanitize_row(r) for r in settled_rows]

    reports = find_comparison_reports()
    dates = sorted({r["date"] for r in sanitized_rows if r.get("date")})

    if dry_run:
        return {
            "exportedRows": len(sanitized_rows),
            "exportedReports": len(reports),
            "dates": dates,
            "dryRun": True,
        }

    DEST_DIR.mkdir(parents=True, exist_ok=True)

    # 1) settled_leans.jsonl
    settled_path = DEST_DIR / "settled_leans.jsonl"
    settled_path.write_text(
        "\n".join(json.dumps(r, sort_keys=True) for r in sanitized_rows) +
        ("\n" if sanitized_rows else "")
    )

    # 2) comparison_report_<date>.json — copy verbatim
    for src in reports:
        dest = DEST_DIR / src.name
        shutil.copy2(src, dest)

    # 3) available_dates.json — manifest
    manifest = {
        "dates": dates,
        "generatedAt": iso_now(),
    }
    (DEST_DIR / "available_dates.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True)
    )

    # 4) lifetime_summary.json — pre-computed aggregate
    summary = build_lifetime_summary(sanitized_rows)
    (DEST_DIR / "lifetime_summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True)
    )

    return {
        "exportedRows": len(sanitized_rows),
        "exportedReports": len(reports),
        "dates": dates,
        "dryRun": False,
        "destDir": str(DEST_DIR),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Export settlement data to app/public/data/results/")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    summary = export(dry_run=args.dry_run)

    print()
    print("  Sanitized export — settlement → app/public/data/results/")
    print(f"  ─────────────────────────────────────────")
    print(f"  Settled rows exported:  {summary['exportedRows']}")
    print(f"  Comparison reports:     {summary['exportedReports']}")
    print(f"  Dates covered:          {len(summary['dates'])}")
    if summary['dates']:
        print(f"    {' / '.join(summary['dates'][:6])}{'...' if len(summary['dates']) > 6 else ''}")
    if summary.get("dryRun"):
        print(f"  [dry-run — no files written]")
    elif "destDir" in summary:
        print(f"  Output:                 {summary['destDir']}")
    if summary.get("note"):
        print(f"  Note: {summary['note']}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
