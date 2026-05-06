"""
Phase 7B-4 — Rebuild slate.json from existing per-day board files.

Use case: the pipeline was last run with `--days 1` to save credits, leaving
slate.json with a single entry, but per-day board JSONs from earlier runs
exist for other dates. The /board UI's date tabs are driven by slate.days,
so the user can't see those other dates without rebuilding the slate.

This utility:
  1. Reads every app/public/data/boards/*.json on disk
  2. Reconstructs the SlateDay entry for each one
  3. Writes a fresh app/public/data/slate.json + meta.json updates if needed
  4. Costs ZERO Odds API credits — never touches any network

Usage:
    python -m pipeline.rebuild_slate
    python -m pipeline.rebuild_slate --primary 2026-05-05
    python -m pipeline.rebuild_slate --dry-run

Exit codes:
    0 = slate.json rebuilt successfully (or no-op)
    1 = boards directory missing or unreadable
    2 = unexpected error
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date as date_cls, datetime, timezone
from pathlib import Path


GREEN = "\033[0;32m"
RED = "\033[0;31m"
YELLOW = "\033[0;33m"
BLUE = "\033[0;34m"
DIM = "\033[2m"
RESET = "\033[0m"


def _ok(msg: str) -> None:
    print(f"  {GREEN}✓{RESET} {msg}")


def _info(msg: str) -> None:
    print(f"  {BLUE}·{RESET} {msg}")


def _err(msg: str) -> None:
    print(f"  {RED}✗{RESET} {msg}", file=sys.stderr)


def _warn(msg: str) -> None:
    print(f"  {YELLOW}!{RESET} {msg}")


def _day_label(target: str, today: str) -> str:
    """Mirror the orchestrator's day_label logic for consistency."""
    try:
        t = date_cls.fromisoformat(target)
        n = date_cls.fromisoformat(today)
        delta = (t - n).days
        if delta == 0:
            return "Today"
        if delta == 1:
            return "Tomorrow"
        if delta == -1:
            return "Yesterday"
        return t.strftime("%a %b %-d")
    except Exception:
        return target


def _derive_slate_day(board_path: Path, today: str, primary: str) -> dict:
    """Build a SlateDay-shaped dict from a per-day board file."""
    data = json.loads(board_path.read_text())
    target_date = data.get("generatedFor") or board_path.stem

    # Count high-confidence leans (defensive; old files may not have it)
    leans = data.get("leans") or []
    high_conf = sum(1 for l in leans if l.get("confidence") == "High")

    # propsAvailable = does this day actually have model leans on real props?
    has_real_props = any(
        not l.get("isDemo", False)
        and l.get("confidence") in ("High", "Medium", "Low")
        for l in leans
    )

    return {
        "date": target_date,
        "dayLabel": _day_label(target_date, today),
        "isAvailable": True,
        "gameCount": len(data.get("games") or []),
        "leanCount": len(leans),
        "highConfidenceCount": high_conf,
        "propsAvailable": has_real_props,
        "isPrimary": target_date == primary,
        # Phase 7B-4.1 — SlateDay requires non-null scheduleSource and
        # dataMode on the TS side. Apply the same safe sentinels the
        # frontend uses when synthesizing fallback days.
        "scheduleSource": data.get("scheduleSource") or "unknown",
        "oddsSource": data.get("oddsSource"),
        "oddsProviderStatus": data.get("oddsProviderStatus"),
        "isDemo": bool(data.get("isDemo", False)),
        "dataMode": data.get("dataMode") or "ScheduleUnavailable",
        "failureReason": data.get("failureReason")
            or data.get("scheduleFailureReason"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Rebuild slate.json from existing per-day board files (0 API credits).",
    )
    parser.add_argument(
        "--primary",
        help="Date (YYYY-MM-DD) to mark as primary. Default: today, or the "
             "earliest date on disk that's >= today.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be written without modifying slate.json.",
    )
    args = parser.parse_args(argv)

    try:
        from . import config as C
    except Exception as e:
        _err(f"Could not import pipeline.config: {e}")
        return 2

    data_dir: Path = C.DATA_OUT
    boards_dir = data_dir / "boards"
    slate_path = data_dir / "slate.json"

    if not boards_dir.exists():
        _err(f"boards/ directory not found: {boards_dir}")
        _info("Run the pipeline at least once before using this tool.")
        return 1

    files = sorted(boards_dir.glob("*.json"))
    if not files:
        _err(f"No per-day board files found in {boards_dir}")
        return 1

    # Determine "today" using the same TZ as the pipeline
    try:
        from zoneinfo import ZoneInfo
        today = datetime.now(ZoneInfo(C.TIMEZONE)).date().isoformat()
    except Exception:
        today = date_cls.today().isoformat()

    # Determine primary date — explicit arg, else the earliest disk date >= today,
    # else the earliest disk date.
    disk_dates = sorted(f.stem for f in files)
    if args.primary:
        primary = args.primary
    else:
        future_or_today = [d for d in disk_dates if d >= today]
        primary = future_or_today[0] if future_or_today else disk_dates[0]

    print()
    print(f"  {BLUE}═══ rebuild_slate (Phase 7B-4) ═══{RESET}")
    _info(f"data dir:      {data_dir}")
    _info(f"today (TZ):    {today}")
    _info(f"primary:       {primary}")
    _info(f"per-day files: {len(files)}")
    print()

    # Build slate days
    days: list[dict] = []
    for f in files:
        try:
            day = _derive_slate_day(f, today, primary)
            days.append(day)
        except Exception as e:
            _warn(f"could not parse {f.name}: {e}")

    days.sort(key=lambda d: d["date"])

    # Read existing slate to preserve generation timestamp + news fields
    existing: dict = {}
    if slate_path.exists():
        try:
            existing = json.loads(slate_path.read_text())
        except Exception:
            existing = {}

    new_slate = {
        "generatedAt": existing.get("generatedAt") or datetime.now(timezone.utc).isoformat(),
        "rebuiltAt": datetime.now(timezone.utc).isoformat(),
        "primaryDate": primary,
        "slateDays": len(days),
        "days": days,
        "newsSignalsActive": existing.get("newsSignalsActive", 0),
        "newsSignalsConfigured": existing.get("newsSignalsConfigured", False),
        "dataMode": existing.get("dataMode"),
        "isDemo": all(d.get("isDemo", False) for d in days) if days else False,
    }

    # Show summary
    print(f"  {BLUE}═══ Resulting slate ═══{RESET}")
    for d in days:
        marker = " [PRIMARY]" if d["isPrimary"] else ""
        print(
            f"    {d['date']} {d['dayLabel']:14s} "
            f"mode={str(d.get('dataMode')):32s} "
            f"games={d['gameCount']:2d} leans={d['leanCount']:3d}{marker}"
        )
    print()

    if args.dry_run:
        _info("--dry-run: slate.json NOT written")
        return 0

    slate_path.write_text(json.dumps(new_slate, indent=2))
    _ok(f"wrote {slate_path} ({len(days)} day(s))")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
