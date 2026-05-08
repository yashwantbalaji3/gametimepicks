#!/usr/bin/env python3
"""
Print public data freshness from app/public/data/meta.json.

Used by .github/workflows/auto-refresh.yml so the workflow does not need
fragile inline Python inside YAML run blocks.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path


META_PATH = Path("app/public/data/meta.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--label",
        default="state",
        help="Label to print in the heading, e.g. pre or post.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    label = args.label.strip() or "state"

    print(f"── {label.capitalize()}-refresh state ─────────────────────────────")

    if not META_PATH.exists():
        print("  app/public/data/meta.json missing")
        return 0

    try:
        meta = json.loads(META_PATH.read_text())
    except Exception as exc:
        print(f"  failed to read meta.json: {exc}")
        return 0

    last = meta.get("lastPipelineRun", "")
    primary = meta.get("primaryDate", "(missing)")
    mode = meta.get("dataMode")

    print(f"  meta.lastPipelineRun: {last}")
    print(f"  meta.primaryDate:     {primary}")
    print(f"  meta.dataMode:        {mode}")

    if last:
        try:
            last_dt = dt.datetime.fromisoformat(str(last).replace("Z", "+00:00"))
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=dt.timezone.utc)
            hours = (dt.datetime.now(dt.timezone.utc) - last_dt).total_seconds() / 3600
            print(f"  hours since refresh:  {hours:.1f}h")
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
