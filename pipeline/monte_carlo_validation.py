"""Monte Carlo shadow validation — settled-outcome harness.

The shadow runner (`pipeline.monte_carlo_shadow`) writes per-lean
MC recommendations on every slate. THIS module joins those
recommendations to settled rows from `settled_leans.jsonl` (NBA +
MLB) so we can ask the right question:

  "Of the picks the Monte Carlo classified `Strong`, what hit rate
   did they actually produce on settled outcomes?"

That is the ONLY honest path from shadow mode to a production
scoring change. We don't tune thresholds before this validation
sees real data.

CLI:

    # Validate every shadow file on disk against settled rows
    pipeline/.venv/bin/python -m pipeline.monte_carlo_validation

    # Validate a single date's shadow + that date's settled rows
    pipeline/.venv/bin/python -m pipeline.monte_carlo_validation --date 2026-05-21

Behavior:
  * Reads `app/public/data/audit/monte_carlo_shadow_<date>.json`
    files (one per date that the shadow runner has been against).
  * For each MC entry, looks up the matching settled row by
    (playerId, market, side, line, date). Missing → pending.
  * Produces per-recommendation hit-rate breakdowns (Strong /
    Watch / High-variance / Avoid). Pending picks excluded from
    decisive count.
  * Optional `--write-report` writes a JSON audit file to
    `app/public/data/audit/monte_carlo_validation_<latest>.json`.

Honest framing:
  * If no settled date intersects with shadow output, the validator
    REFUSES to claim performance — it prints "pending validation"
    and exits 0.
  * We never count pending as loss.
  * Pushes excluded from the hit-rate denominator.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any


NBA_SETTLED = os.path.join("app", "public", "data", "results", "settled_leans.jsonl")
MLB_SETTLED = os.path.join(
    "app", "public", "data", "mlb", "results", "settled_leans.jsonl"
)
AUDIT_DIR = os.path.join("app", "public", "data", "audit")


_MLB_OUTCOME_TO_RESULT = {
    "Win": "win", "Loss": "loss", "Push": "push",
    "win": "win", "loss": "loss", "push": "push",
}


def _settled_index() -> dict[tuple, dict]:
    """Index every NBA + MLB settled row by
    (playerId, market, side, line, date). MLB rows normalized."""
    out: dict[tuple, dict] = {}
    if os.path.exists(NBA_SETTLED):
        with open(NBA_SETTLED, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try: r = json.loads(line)
                except json.JSONDecodeError: continue
                key = (
                    r.get("playerId"), r.get("market"),
                    r.get("side"), r.get("line"), r.get("date"),
                )
                out.setdefault(key, r)
    if os.path.exists(MLB_SETTLED):
        with open(MLB_SETTLED, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try: r = json.loads(line)
                except json.JSONDecodeError: continue
                outcome = r.get("outcome")
                result = (
                    _MLB_OUTCOME_TO_RESULT.get(outcome)
                    if isinstance(outcome, str)
                    else r.get("result")
                )
                key = (
                    r.get("playerId"), r.get("marketKey"),
                    r.get("lean"), r.get("line"), r.get("date"),
                )
                out.setdefault(key, {
                    **r,
                    "market": r.get("marketKey"),
                    "side": r.get("lean"),
                    "result": result,
                    "finalStat": r.get("actual"),
                })
    return out


def _shadow_files() -> list[str]:
    if not os.path.isdir(AUDIT_DIR):
        return []
    return sorted(
        os.path.join(AUDIT_DIR, f)
        for f in os.listdir(AUDIT_DIR)
        if f.startswith("monte_carlo_shadow_") and f.endswith(".json")
    )


def validate(
    *,
    only_date: str | None = None,
) -> dict[str, Any]:
    """Pure function — returns a report dict. Does not write to disk."""
    settled = _settled_index()
    files = _shadow_files()
    if only_date:
        files = [
            f for f in files
            if os.path.basename(f) == f"monte_carlo_shadow_{only_date}.json"
        ]

    per_rec: dict[str, dict[str, int]] = {}

    def _bump(rec: str, kind: str) -> None:
        bucket = per_rec.setdefault(
            rec, {"wins": 0, "losses": 0, "pushes": 0, "pending": 0}
        )
        bucket[kind] += 1

    dates_checked: list[str] = []
    leans_joined = 0
    leans_total = 0

    for path in files:
        try:
            payload = json.load(open(path, "r", encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        date = payload.get("date")
        if not isinstance(date, str):
            continue
        dates_checked.append(date)
        for entry in payload.get("entries") or []:
            leans_total += 1
            rec = (entry.get("mc") or {}).get("confidence_recommendation") or "Unknown"
            key = (
                entry.get("playerId"),
                entry.get("market"),
                entry.get("side"),
                entry.get("line"),
                date,
            )
            row = settled.get(key)
            if not row:
                _bump(rec, "pending")
                continue
            leans_joined += 1
            r = row.get("result")
            if r == "win": _bump(rec, "wins")
            elif r == "loss": _bump(rec, "losses")
            elif r == "push": _bump(rec, "pushes")
            else: _bump(rec, "pending")

    def _finalize(b: dict[str, int]) -> dict[str, Any]:
        decisive = b["wins"] + b["losses"]
        return {
            **b,
            "decisive": decisive,
            "hitRate": (b["wins"] / decisive) if decisive > 0 else None,
        }

    by_rec = {k: _finalize(v) for k, v in per_rec.items()}

    # Aggregate when we have ≥ 1 decisive row anywhere.
    any_decisive = any(b["decisive"] > 0 for b in by_rec.values())

    return {
        "_disclaimer": (
            "Monte Carlo shadow validation. NOT consumed by production. "
            "Compares MC recommendations against settled outcomes only. "
            "Pushes excluded from hit rate; pending picks never count as "
            "losses."
        ),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "datesChecked": dates_checked,
        "leansTotal": leans_total,
        "leansJoined": leans_joined,
        "validationStatus": "ready" if any_decisive else "pending",
        "byRecommendation": by_rec,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=(
            "Validate Monte Carlo shadow recommendations against "
            "settled outcomes. Read-only; safe to run any time."
        )
    )
    p.add_argument("--date", default=None,
                   help="Restrict to one shadow date (YYYY-MM-DD).")
    p.add_argument("--write-report", action="store_true",
                   help="Write the report JSON to app/public/data/audit/.")
    args = p.parse_args(argv)

    report = validate(only_date=args.date)
    print(f"validation status: {report['validationStatus']}")
    print(f"dates checked: {report['datesChecked']}")
    print(f"leans total / joined: {report['leansTotal']} / {report['leansJoined']}")
    if report["validationStatus"] == "pending":
        print(
            "  (no settled rows joined; MC validation remains pending. "
            "We refuse to claim hit-rate without real settled data.)"
        )
    else:
        print("byRecommendation:")
        for rec, stats in report["byRecommendation"].items():
            hr = stats.get("hitRate")
            hr_str = f"{hr*100:.1f}%" if hr is not None else "—"
            print(
                f"  {rec:<15s}  {stats['wins']}W·{stats['losses']}L·"
                f"{stats['pushes']}P · {stats['pending']} pending · {hr_str}"
            )

    if args.write_report:
        os.makedirs(AUDIT_DIR, exist_ok=True)
        latest = max(report["datesChecked"]) if report["datesChecked"] else "unknown"
        out = os.path.join(AUDIT_DIR, f"monte_carlo_validation_{latest}.json")
        tmp = f"{out}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        os.replace(tmp, out)
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
