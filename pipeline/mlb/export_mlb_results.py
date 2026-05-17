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
  - Pending games stay in `pendingGameList`. Never silently counted.
  - Lifetime summary marks `partial=True` whenever any date in the audit
    still has pending games.
  - When no settled rows exist, exports clean zeros + empty arrays.
  - Idempotent — rerunning overwrites the public files in place.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .. import config as C

VALIDATION_DIR = C.ROOT_DIR / "pipeline" / "validation"
SETTLED_LEANS_PATH = VALIDATION_DIR / "mlb_settled_leans.jsonl"
PUBLIC_DIR = C.APP_PUBLIC_DATA / "mlb" / "results"


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
    total_settled = len(rows)
    decisive_rows = [r for r in rows if r.get("outcome") in ("Win", "Loss")]
    wins = sum(1 for r in rows if r.get("outcome") == "Win")
    losses = sum(1 for r in rows if r.get("outcome") == "Loss")
    pushes = sum(1 for r in rows if r.get("outcome") == "Push")
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
