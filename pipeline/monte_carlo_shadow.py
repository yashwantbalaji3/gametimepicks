"""Monte Carlo shadow-mode runner over today's projections.

Reads the current NBA + MLB board files, runs `monte_carlo_props` on
every lean that has enough recent samples, and writes the report to
`app/public/data/audit/monte_carlo_shadow_<date>.json`.

CRITICAL: this is an AUDIT artifact only.

  * The output is NOT consumed by the production scoring pipeline.
  * No projections are mutated.
  * No confidence tiers are mutated.
  * The UI does NOT read this file.
  * It exists so the next methodology pass can compare Monte Carlo
    recommendations against settled outcomes before promoting any
    MC-derived rule into production.

Run:

    pipeline/.venv/bin/python -m pipeline.monte_carlo_shadow \\
        --date 2026-05-22

The report contains, per lean: simulated mean/std/probability,
volatility, and the MC confidence recommendation. The CLI prints
a one-line summary; the JSON file is the audit trail.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from datetime import datetime, timezone

from .monte_carlo_props import MonteCarloInput, simulate


NBA_BOARD = os.path.join("app", "public", "data", "boards")
MLB_BOARD = os.path.join("app", "public", "data", "mlb", "boards")
SHADOW_DIR = os.path.join("app", "public", "data", "audit")


def _load_json(path: str) -> dict | None:
    if not os.path.exists(path):
        return None
    try:
        return json.load(open(path, "r", encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _nba_lean_to_mc(lean: dict) -> MonteCarloInput | None:
    line = lean.get("line")
    series = lean.get("recent10") or []
    if not isinstance(line, (int, float)):
        return None
    if not isinstance(series, list) or len(series) < 3:
        return None
    return MonteCarloInput(
        recent_series=[float(v) for v in series if isinstance(v, (int, float))],
        line=float(line),
        season_mean=None,  # NBA board doesn't expose a season-mean field
        point_projection=lean.get("projection"),
    )


def _mlb_lean_to_mc(lean: dict) -> MonteCarloInput | None:
    line = lean.get("line")
    series = lean.get("recentSeries") or []
    if not isinstance(line, (int, float)):
        return None
    if not isinstance(series, list) or len(series) < 3:
        return None
    return MonteCarloInput(
        recent_series=[float(v) for v in series if isinstance(v, (int, float))],
        line=float(line),
        season_mean=None,
        point_projection=lean.get("projection"),
    )


def run_shadow(date: str) -> dict:
    nba_board = _load_json(os.path.join(NBA_BOARD, f"{date}.json")) or {}
    mlb_board = _load_json(os.path.join(MLB_BOARD, f"{date}.json")) or {}

    entries: list[dict] = []

    for lean in nba_board.get("leans") or []:
        if lean.get("lean") not in ("Over", "Under"):
            continue
        mc_input = _nba_lean_to_mc(lean)
        if not mc_input:
            continue
        result = simulate(mc_input, num_simulations=4000, seed=1337)
        if result.status != "ok":
            continue
        entries.append({
            "sport": "nba",
            "playerId": lean.get("playerId"),
            "playerName": lean.get("playerName"),
            "market": lean.get("market"),
            "side": lean.get("lean"),
            "line": lean.get("line"),
            "production_projection": lean.get("projection"),
            "production_confidence": lean.get("confidence"),
            "mc": {k: v for k, v in asdict(result).items() if k != "status"},
        })

    for lean in mlb_board.get("leans") or []:
        if lean.get("lean") not in ("Over", "Under"):
            continue
        mc_input = _mlb_lean_to_mc(lean)
        if not mc_input:
            continue
        result = simulate(mc_input, num_simulations=4000, seed=1337)
        if result.status != "ok":
            continue
        entries.append({
            "sport": "mlb",
            "playerId": lean.get("playerId"),
            "playerName": lean.get("playerName"),
            "market": lean.get("marketKey"),
            "marketLabel": lean.get("marketLabel"),
            "side": lean.get("lean"),
            "line": lean.get("line"),
            "production_projection": lean.get("projection"),
            "production_confidence": lean.get("confidence"),
            "mc": {k: v for k, v in asdict(result).items() if k != "status"},
        })

    # Summary stats — useful for the CLI banner.
    by_rec: dict[str, int] = {}
    for e in entries:
        rec = e["mc"].get("confidence_recommendation") or "Unknown"
        by_rec[rec] = by_rec.get(rec, 0) + 1

    return {
        "_disclaimer": (
            "Monte Carlo shadow-mode audit. NOT consumed by production "
            "scoring or UI. Use this file to compare MC recommendations "
            "against settled outcomes before promoting any MC-derived "
            "rule into the live confidence labeling."
        ),
        "date": date,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "leansScored": len(entries),
        "byRecommendation": by_rec,
        "entries": entries,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=(
            "Run Monte Carlo on today's NBA + MLB projections and "
            "write a SHADOW-mode audit JSON. Does not change "
            "production scoring or labels."
        )
    )
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.add_argument(
        "--out",
        default=None,
        help=(
            "Override output path. Defaults to "
            "app/public/data/audit/monte_carlo_shadow_<date>.json"
        ),
    )
    args = p.parse_args(argv)
    payload = run_shadow(args.date)
    out = args.out or os.path.join(
        SHADOW_DIR, f"monte_carlo_shadow_{args.date}.json"
    )
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = f"{out}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, out)
    print(
        f"[monte_carlo_shadow] wrote {out} · "
        f"{payload['leansScored']} leans scored · "
        f"breakdown {payload['byRecommendation']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
