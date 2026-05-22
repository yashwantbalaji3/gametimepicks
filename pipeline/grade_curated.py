"""Grade persisted curated projection snapshots against settled results.

CLI:

    pipeline/.venv/bin/python -m pipeline.grade_curated --date YYYY-MM-DD

Behavior mirrors `pipeline.grade_parlays`:

  * Loads `app/public/data/curated/snapshots/<date>.json` (the
    pregame snapshot). If no snapshot exists, exits 0 — we never
    fabricate history.
  * Loads NBA + MLB settled rows for the date. Normalizes MLB rows
    (outcome/lean/marketKey/actual → result/side/market/finalStat)
    onto the NBA-compatible shape so one lookup table serves both.
  * Grades each pick by matching (playerId, market, side, line).
    Missing rows mark the pick `unresolved` → snapshot status stays
    `pending`.
  * Writes `app/public/data/curated/graded/<date>.json` and
    refreshes `app/public/data/curated/summary.json`.

Honesty rules locked:
  * Pending picks never count as losses.
  * Pushes excluded from the curated hit rate.
  * No snapshot → honest no-op (and summary is still recomputed so
    earlier graded dates remain reflected).
  * No fake performance — every number on `summary.json` traces
    back to a real settled row joined by exact key.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any


SNAPSHOT_DIR = os.path.join("app", "public", "data", "curated", "snapshots")
GRADED_DIR = os.path.join("app", "public", "data", "curated", "graded")
SUMMARY_PATH = os.path.join("app", "public", "data", "curated", "summary.json")
NBA_SETTLED = os.path.join("app", "public", "data", "results", "settled_leans.jsonl")
MLB_SETTLED = os.path.join(
    "app", "public", "data", "mlb", "results", "settled_leans.jsonl"
)


_MLB_OUTCOME_TO_RESULT = {
    "Win": "win",
    "Loss": "loss",
    "Push": "push",
    "win": "win",
    "loss": "loss",
    "push": "push",
}


def _settled_lookup_for_date(date: str) -> dict[tuple, dict]:
    """Index NBA + MLB settled rows by (playerId, market, side, line).

    Snapshot picks store `market` as the raw key the sport's settlement
    file uses (NBA uses "PTS"/"REB"/"AST"; MLB uses
    `pitcher_strikeouts`/`batter_hits`/…). MLB settled rows use
    `outcome`/`lean`/`marketKey`/`actual` — we normalize so the join
    serves both with one key tuple.
    """
    out: dict[tuple, dict] = {}

    if os.path.exists(NBA_SETTLED):
        with open(NBA_SETTLED, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if r.get("date") != date:
                    continue
                key = (
                    r.get("playerId"),
                    r.get("market"),
                    r.get("side"),
                    r.get("line"),
                )
                out.setdefault(key, r)

    if os.path.exists(MLB_SETTLED):
        with open(MLB_SETTLED, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if r.get("date") != date:
                    continue
                outcome = r.get("outcome")
                result = (
                    _MLB_OUTCOME_TO_RESULT.get(outcome)
                    if isinstance(outcome, str)
                    else r.get("result")
                )
                key = (
                    r.get("playerId"),
                    r.get("marketKey"),
                    r.get("lean"),
                    r.get("line"),
                )
                normalized = {
                    **r,
                    "market": r.get("marketKey"),
                    "side": r.get("lean"),
                    "result": result,
                    "finalStat": r.get("actual"),
                    "settlementSource": r.get("settlementSource") or "mlb_stats_api",
                }
                out.setdefault(key, normalized)

    return out


def _grade_pick(pick: dict, lookup: dict[tuple, dict]) -> dict:
    """Augment a curated pick with `result` + `finalStat`. Never
    mutates the input."""
    key = (
        pick.get("playerId"),
        pick.get("market"),
        pick.get("side"),
        pick.get("line"),
    )
    row = lookup.get(key)
    if not row:
        return {**pick, "status": "pending", "result": "unresolved", "finalStat": None}
    result = row.get("result")
    status = (
        "win" if result == "win"
        else "loss" if result == "loss"
        else "push" if result == "push"
        else "pending"
    )
    return {
        **pick,
        "status": status,
        "result": result or "unresolved",
        "finalStat": row.get("finalStat"),
        "settlementSource": row.get("settlementSource"),
    }


def grade_snapshot_payload(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Pure function — grades a curated snapshot and returns the
    graded payload. Tested directly."""
    date = snapshot.get("date")
    if not isinstance(date, str):
        raise ValueError("snapshot missing `date` field")
    lookup = _settled_lookup_for_date(date)
    graded = [_grade_pick(p, lookup) for p in snapshot.get("picks") or []]
    return {
        **snapshot,
        "gradedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "picksCount": len(graded),
        "picks": graded,
    }


def write_graded(date: str, payload: dict[str, Any]) -> str:
    os.makedirs(GRADED_DIR, exist_ok=True)
    path = os.path.join(GRADED_DIR, f"{date}.json")
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, path)
    return path


def update_summary() -> dict[str, Any]:
    """Recompute summary.json by walking every graded curated file.

    Pushes excluded from the hit-rate denominator; pending picks
    never count as losses. Per-sport, per-reason-tag, and per-health
    breakdowns are surfaced so future UI can show "calibration
    watch" performance separately from "strong market" performance.
    """
    summary = {
        "_disclaimer": (
            "Curated-pick lifetime track record. Only counts picks "
            "that were snapshot before games started AND graded after "
            "settled. Pushes excluded from the hit rate; pending picks "
            "never count as losses."
        ),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "byDate": [],
        "lifetime": {
            "wins": 0, "losses": 0, "pushes": 0, "pending": 0,
            "decisive": 0, "hitRate": None,
        },
        "bySport": {},
        "byReason": {},
        "byHealth": {},
    }
    if not os.path.isdir(GRADED_DIR):
        return summary

    sport_acc: dict[str, dict[str, int]] = {}
    reason_acc: dict[str, dict[str, int]] = {}
    health_acc: dict[str, dict[str, int]] = {}

    def _bump(table: dict[str, dict[str, int]], key: str, kind: str) -> None:
        bucket = table.setdefault(
            key, {"wins": 0, "losses": 0, "pushes": 0, "pending": 0}
        )
        bucket[kind] += 1

    for fname in sorted(os.listdir(GRADED_DIR)):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(GRADED_DIR, fname)
        try:
            payload = json.load(open(path, "r", encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        date = payload.get("date")
        if not isinstance(date, str):
            continue
        day = {"date": date, "wins": 0, "losses": 0, "pushes": 0, "pending": 0}
        for pick in payload.get("picks") or []:
            status = pick.get("status")
            sport = pick.get("sport") or "unknown"
            reason = pick.get("reasonTag") or "unknown"
            health = pick.get("health") or "unknown"
            if status == "win":
                day["wins"] += 1
                summary["lifetime"]["wins"] += 1
                _bump(sport_acc, sport, "wins")
                _bump(reason_acc, reason, "wins")
                _bump(health_acc, health, "wins")
            elif status == "loss":
                day["losses"] += 1
                summary["lifetime"]["losses"] += 1
                _bump(sport_acc, sport, "losses")
                _bump(reason_acc, reason, "losses")
                _bump(health_acc, health, "losses")
            elif status == "push":
                day["pushes"] += 1
                summary["lifetime"]["pushes"] += 1
                _bump(sport_acc, sport, "pushes")
                _bump(reason_acc, reason, "pushes")
                _bump(health_acc, health, "pushes")
            else:
                day["pending"] += 1
                summary["lifetime"]["pending"] += 1
                _bump(sport_acc, sport, "pending")
                _bump(reason_acc, reason, "pending")
                _bump(health_acc, health, "pending")
        summary["byDate"].append(day)

    life = summary["lifetime"]
    decisive = life["wins"] + life["losses"]
    life["decisive"] = decisive
    life["hitRate"] = (life["wins"] / decisive) if decisive > 0 else None

    def _finish(table: dict[str, dict[str, int]]) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for k, v in table.items():
            d = v["wins"] + v["losses"]
            out[k] = {
                **v,
                "decisive": d,
                "hitRate": (v["wins"] / d) if d > 0 else None,
            }
        return out

    summary["bySport"] = _finish(sport_acc)
    summary["byReason"] = _finish(reason_acc)
    summary["byHealth"] = _finish(health_acc)
    return summary


def write_summary(summary: dict[str, Any]) -> str:
    os.makedirs(os.path.dirname(SUMMARY_PATH), exist_ok=True)
    tmp = f"{SUMMARY_PATH}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    os.replace(tmp, SUMMARY_PATH)
    return SUMMARY_PATH


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Grade persisted curated-pick snapshots against settled results."
    )
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    args = p.parse_args(argv)

    snapshot_path = os.path.join(SNAPSHOT_DIR, f"{args.date}.json")
    if not os.path.exists(snapshot_path):
        print(
            f"[grade_curated] no snapshot for {args.date}; honest no-op "
            "(we never invent historical picks)."
        )
        write_summary(update_summary())
        return 0
    snapshot = json.load(open(snapshot_path, "r", encoding="utf-8"))
    graded = grade_snapshot_payload(snapshot)
    path = write_graded(args.date, graded)
    summary_path = write_summary(update_summary())
    counts = {
        "win": sum(1 for p in graded["picks"] if p["status"] == "win"),
        "loss": sum(1 for p in graded["picks"] if p["status"] == "loss"),
        "push": sum(1 for p in graded["picks"] if p["status"] == "push"),
        "pending": sum(1 for p in graded["picks"] if p["status"] == "pending"),
    }
    print(
        f"[grade_curated] {args.date}: {counts['win']}W · {counts['loss']}L · "
        f"{counts['push']}P · {counts['pending']} pending → {path}"
    )
    print(f"[grade_curated] summary updated → {summary_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
