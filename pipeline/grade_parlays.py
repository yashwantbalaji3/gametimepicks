"""Grade persisted parlay candidate slips against settled results.

CLI:

    pipeline/.venv/bin/python -m pipeline.grade_parlays --date YYYY-MM-DD

Behavior:
  * Loads `app/public/data/parlays/snapshots/<date>.json` (the
    pregame snapshot). If no snapshot exists, exits 0 — we never
    fabricate history.
  * Loads settled rows for the date from
    `app/public/data/results/settled_leans.jsonl`.
  * Grades each leg by matching (playerId, market, side, line). If no
    matching settled row exists, the leg is marked `unresolved` —
    the slip becomes `pending` until later.
  * Slip-level grading:
      win   = every leg is `win`
      loss  = ≥1 leg is `loss`
      push  = at least one push, no losses, no unresolved
      pending = ≥1 leg `unresolved` AND zero losses
      void  = data integrity error (missing fields, malformed input)
  * Writes `app/public/data/parlays/graded/<date>.json` and updates
    `app/public/data/parlays/summary.json`.

Honesty rules:
  * Pushes excluded from the slip-level hit rate (the slip itself
    becomes a push; doesn't count toward W/L).
  * Pending slips (any unresolved leg) never count as losses.
  * If a date has no snapshot, the summary skips it cleanly.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

from .snapshot_parlays import SNAPSHOT_DIR, SUMMARY_PATH


GRADED_DIR = os.path.join("app", "public", "data", "parlays", "graded")
SETTLED_PATH = os.path.join("app", "public", "data", "results", "settled_leans.jsonl")
MLB_SETTLED_PATH = os.path.join(
    "app", "public", "data", "mlb", "results", "settled_leans.jsonl"
)


# MLB settled rows use a different schema than NBA. Map them onto the
# NBA-compatible shape so the lookup index can serve both sports with
# the same (playerId, market, side, line) key.
_MLB_OUTCOME_TO_RESULT = {
    "Win": "win",
    "Loss": "loss",
    "Push": "push",
    "win": "win",
    "loss": "loss",
    "push": "push",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _settled_lookup_for_date(date: str) -> dict[tuple, dict]:
    """Index settled NBA + MLB rows by (playerId, market, side, line)
    for fast lookup. Multiple bookmakers may share the same key; the
    index collapses those into the first row encountered (their final
    stat is identical so the result matches).

    MLB rows live in a separate JSONL file and use `outcome`/`lean`/
    `marketKey` instead of `result`/`side`/`market`. We normalize at
    read time so the snapshot legs (which already carry the
    NBA-compatible field names per the snapshot writer) find their
    settled rows cleanly."""
    out: dict[tuple, dict] = {}

    # NBA settled rows — native shape.
    if os.path.exists(SETTLED_PATH):
        with open(SETTLED_PATH, "r", encoding="utf-8") as f:
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

    # MLB settled rows — normalize to NBA-compatible fields.
    if os.path.exists(MLB_SETTLED_PATH):
        with open(MLB_SETTLED_PATH, "r", encoding="utf-8") as f:
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
                # Snapshot MLB legs store `market` = `marketKey`
                # ("pitcher_strikeouts" etc.), `side` = `lean`
                # (Over/Under). Lookup key must match exactly.
                key = (
                    r.get("playerId"),
                    r.get("marketKey"),
                    r.get("lean"),
                    r.get("line"),
                )
                # Carry over the normalized fields the grader reads.
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


def _grade_leg(leg: dict, lookup: dict[tuple, dict]) -> dict:
    """Return the leg dict augmented with `result` + `finalStat`. Never
    mutates the input."""
    key = (
        leg.get("playerId"),
        leg.get("market"),
        leg.get("side"),
        leg.get("line"),
    )
    row = lookup.get(key)
    if not row:
        return {**leg, "result": "unresolved", "finalStat": None}
    return {
        **leg,
        "result": row.get("result") or "unresolved",
        "finalStat": row.get("finalStat"),
        "settlementSource": row.get("settlementSource"),
    }


def _grade_slip_status(leg_results: list[str]) -> str:
    if any(r == "loss" for r in leg_results):
        return "loss"
    if any(r == "unresolved" for r in leg_results):
        return "pending"
    if any(r == "push" for r in leg_results):
        # Any push with no losses + no unresolved → push the whole slip
        return "push"
    if all(r == "win" for r in leg_results):
        return "win"
    return "pending"


def grade_snapshot_payload(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Pure function — grades the snapshot and returns the graded payload.
    Callers test against this directly."""
    date = snapshot.get("date")
    if not isinstance(date, str):
        raise ValueError("snapshot missing `date` field")
    lookup = _settled_lookup_for_date(date)
    graded_slips: list[dict[str, Any]] = []
    for slip in snapshot.get("slips") or []:
        graded_legs = [_grade_leg(leg, lookup) for leg in slip.get("legs") or []]
        slip_status = _grade_slip_status([leg["result"] for leg in graded_legs])
        graded_slips.append({
            **slip,
            "status": slip_status,
            "gradedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "legs": graded_legs,
        })
    return {
        **snapshot,
        "gradedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "slipsCount": len(graded_slips),
        "slips": graded_slips,
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
    """Recompute summary.json by walking every graded file."""
    summary = {
        "_disclaimer": (
            "Parlay-slip lifetime track record. Only counts slips that "
            "were snapshot before games started AND graded after settled. "
            "Pushes excluded from the hit rate; pending slips never count "
            "as losses."
        ),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "byDate": [],
        "lifetime": {"wins": 0, "losses": 0, "pushes": 0, "pending": 0, "decisive": 0, "hitRate": None},
        "byProfile": {},
    }
    if not os.path.isdir(GRADED_DIR):
        return summary

    profile_acc: dict[str, dict[str, int]] = {}
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
        for slip in payload.get("slips") or []:
            status = slip.get("status")
            profile = slip.get("riskProfile") or "unknown"
            profile_acc.setdefault(
                profile, {"wins": 0, "losses": 0, "pushes": 0, "pending": 0}
            )
            if status == "win":
                day["wins"] += 1
                profile_acc[profile]["wins"] += 1
                summary["lifetime"]["wins"] += 1
            elif status == "loss":
                day["losses"] += 1
                profile_acc[profile]["losses"] += 1
                summary["lifetime"]["losses"] += 1
            elif status == "push":
                day["pushes"] += 1
                profile_acc[profile]["pushes"] += 1
                summary["lifetime"]["pushes"] += 1
            else:  # pending or void
                day["pending"] += 1
                profile_acc[profile]["pending"] += 1
                summary["lifetime"]["pending"] += 1
        summary["byDate"].append(day)

    life = summary["lifetime"]
    decisive = life["wins"] + life["losses"]
    life["decisive"] = decisive
    life["hitRate"] = (life["wins"] / decisive) if decisive > 0 else None
    summary["byProfile"] = {
        profile: {
            **counts,
            "decisive": counts["wins"] + counts["losses"],
            "hitRate": (
                counts["wins"] / (counts["wins"] + counts["losses"])
                if (counts["wins"] + counts["losses"]) > 0
                else None
            ),
        }
        for profile, counts in profile_acc.items()
    }
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
        description="Grade persisted parlay snapshots against settled results."
    )
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    args = p.parse_args(argv)

    snapshot_path = os.path.join(SNAPSHOT_DIR, f"{args.date}.json")
    if not os.path.exists(snapshot_path):
        print(
            f"[grade_parlays] no snapshot for {args.date}; honest no-op "
            "(we never invent historical slips)."
        )
        # Still recompute summary so any earlier graded dates remain
        # reflected.
        write_summary(update_summary())
        return 0
    snapshot = json.load(open(snapshot_path, "r", encoding="utf-8"))
    graded = grade_snapshot_payload(snapshot)
    path = write_graded(args.date, graded)
    summary_path = write_summary(update_summary())
    counts = {
        "win": sum(1 for s in graded["slips"] if s["status"] == "win"),
        "loss": sum(1 for s in graded["slips"] if s["status"] == "loss"),
        "push": sum(1 for s in graded["slips"] if s["status"] == "push"),
        "pending": sum(1 for s in graded["slips"] if s["status"] == "pending"),
    }
    print(
        f"[grade_parlays] {args.date}: {counts['win']}W · {counts['loss']}L · "
        f"{counts['push']}P · {counts['pending']} pending → {path}"
    )
    print(f"[grade_parlays] summary updated → {summary_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
