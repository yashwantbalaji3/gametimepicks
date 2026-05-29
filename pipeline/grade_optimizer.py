"""Grade optimizer-built parlay snapshots against settled results.

The optimizer (`pipeline.snapshot_optimizer`) is now the primary
source for the homepage and Parlay Lab. This module persists
W/L/Push/Pending verdicts for those slips so the Results page can
honestly show users "did the suggested parlays hit?".

CLI:
    pipeline/.venv/bin/python -m pipeline.grade_optimizer --date YYYY-MM-DD
    pipeline/.venv/bin/python -m pipeline.grade_optimizer --all

Behavior:
  * Loads `app/public/data/parlays/optimizer/<date>.json` (the
    pregame optimizer snapshot). If no snapshot exists, exits 0 —
    we never fabricate history.
  * Reuses `pipeline.grade_parlays._settled_lookup_for_date` to
    build the NBA + MLB settled-row index.
  * Grades each leg by matching (playerId, market, side, line).
  * Slip-level grading mirrors `grade_parlays`:
      win   = every leg is `win`
      loss  = ≥1 leg is `loss`
      push  = ≥1 leg push, no losses, no unresolved
      pending = ≥1 leg unresolved AND no losses
  * Writes `app/public/data/parlays/optimizer-graded/<date>.json` and
    refreshes `app/public/data/parlays/optimizer-summary.json`.

Honesty rules locked:
  * Pushes excluded from the slip-level hit rate (the slip itself
    becomes a push; doesn't count toward W/L).
  * Pending slips never count as losses.
  * Hit rate is wins / (wins + losses) — pending and pushes are
    excluded from the denominator.
  * If a date has no optimizer snapshot, the summary skips it cleanly.
  * Idempotent — re-running for the same date overwrites the graded
    file in place.

Dedup note: the optimizer snapshot exposes slips inside multiple
buckets (e.g. the same conservative-MLB slip appears under
buckets.conservative.mlb AND buckets.conservative.all). We grade
unique slipIds only — counting a slip twice would inflate the
denominator.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

from .grade_parlays import _settled_lookup_for_date, _grade_leg, _grade_slip_status


OPTIMIZER_DIR = os.path.join("app", "public", "data", "parlays", "optimizer")
OPTIMIZER_GRADED_DIR = os.path.join(
    "app", "public", "data", "parlays", "optimizer-graded"
)
OPTIMIZER_SUMMARY_PATH = os.path.join(
    "app", "public", "data", "parlays", "optimizer-summary.json"
)


_PROFILES = ("conservative", "balanced", "aggressive", "star_power")
_SPORTS = ("nba", "mlb", "multi", "all")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _grade_optimizer_leg(leg: dict, lookup: dict[tuple, dict]) -> dict:
    """Optimizer legs use the same (playerId, market, side, line) key
    as legacy snapshot legs — they were normalized the same way by
    `pipeline.parlay_optimizer.normalize_lean`."""
    return _grade_leg(leg, lookup)


def grade_optimizer_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Pure function — grades every unique slip in the payload's
    buckets and returns the graded payload. Buckets retain their
    shape; each slip gets `status` + `gradedAt`."""
    date = payload.get("date")
    if not isinstance(date, str):
        raise ValueError("optimizer snapshot missing `date` field")
    lookup = _settled_lookup_for_date(date)
    now = _now_iso()

    # Dedup across buckets — a slip can live in multiple buckets
    # (e.g. conservative.mlb AND conservative.all). Grade once.
    seen: dict[str, dict[str, Any]] = {}

    def grade_slip_once(slip: dict[str, Any]) -> dict[str, Any]:
        sid = slip.get("slipId") or ""
        if sid in seen:
            return seen[sid]
        graded_legs = [_grade_optimizer_leg(leg, lookup) for leg in slip.get("legs") or []]
        slip_status = _grade_slip_status([leg["result"] for leg in graded_legs])
        graded = {
            **slip,
            "status": slip_status,
            "gradedAt": now,
            "legs": graded_legs,
        }
        seen[sid] = graded
        return graded

    new_buckets: dict[str, dict[str, list[dict[str, Any]]]] = {
        profile: {sport: [] for sport in _SPORTS}
        for profile in _PROFILES
    }
    for profile, bucket_map in (payload.get("buckets") or {}).items():
        if profile not in new_buckets:
            continue
        for sport, slips in (bucket_map or {}).items():
            if sport not in _SPORTS:
                continue
            for slip in slips or []:
                new_buckets[profile][sport].append(grade_slip_once(slip))

    # PR `feature/risk-section-results-data` (2026-05-29) — the
    # `publicRiskSections` slips (PR #152) have their own deterministic
    # slipIds and were NOT graded by the bucket loop above. Walk them
    # now and grade each one with the same per-leg lookup, sharing the
    # `seen` dedupe so a slip with matching ID still grades exactly
    # once. The result is a parallel `publicRiskSections` block in the
    # graded payload where each section/sport bucket carries graded
    # slips with `status`, and the same slips also live in
    # `uniqueSlips` so `update_summary()` can fold them into per-section
    # accumulators below.
    src_prs = payload.get("publicRiskSections") or {}
    new_prs: dict[str, dict[str, list[dict[str, Any]]]] = {}
    if isinstance(src_prs, dict):
        for section_key, by_sport in src_prs.items():
            if not isinstance(by_sport, dict):
                continue
            new_prs[section_key] = {}
            for sport_key, slips in by_sport.items():
                graded_list: list[dict[str, Any]] = []
                if isinstance(slips, list):
                    for slip in slips:
                        if isinstance(slip, dict):
                            graded_list.append(grade_slip_once(slip))
                new_prs[section_key][sport_key] = graded_list

    out_payload = {
        **payload,
        "gradedAt": now,
        "buckets": new_buckets,
        # Convenience top-level flat list of unique graded slips —
        # union of buckets + publicRiskSections (dedupe via `seen`).
        "uniqueSlips": list(seen.values()),
    }
    if new_prs:
        out_payload["publicRiskSections"] = new_prs
    return out_payload


def write_graded(date: str, payload: dict[str, Any]) -> str:
    os.makedirs(OPTIMIZER_GRADED_DIR, exist_ok=True)
    path = os.path.join(OPTIMIZER_GRADED_DIR, f"{date}.json")
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, path)
    return path


def _empty_acc() -> dict[str, Any]:
    return {"wins": 0, "losses": 0, "pushes": 0, "pending": 0, "decisive": 0, "hitRate": None}


def _accumulate(acc: dict[str, Any], status: str) -> None:
    if status == "win":
        acc["wins"] += 1
        acc["decisive"] += 1
    elif status == "loss":
        acc["losses"] += 1
        acc["decisive"] += 1
    elif status == "push":
        acc["pushes"] += 1
    elif status == "pending":
        acc["pending"] += 1


def _finalize(acc: dict[str, Any]) -> dict[str, Any]:
    if acc["decisive"] > 0:
        acc["hitRate"] = acc["wins"] / acc["decisive"]
    return acc


def update_summary() -> dict[str, Any]:
    """Recompute optimizer-summary.json by walking every graded file.

    PR `feature/risk-section-results-data` adds two extra accumulator
    blocks the UI uses for the consolidated Results tab:

      - ``byPublicSection`` — only the slips that lived under
        ``publicRiskSections`` (PR #152). These are the slips the
        Suggested mode actually showed users; the bucket pool above
        (Conservative / Balanced / Aggressive / Star Power) is an
        internal-only ranking.
      - ``bySportBucket`` — same source set, bucketed by NBA-only /
        MLB-only / Mixed / All using the sport tab the optimizer
        wrote the slip under.

    Both blocks are nested ``{date_key: row}`` shapes so the UI can
    show "May 28 by section" without re-walking the graded files."""
    summary: dict[str, Any] = {
        "_disclaimer": (
            "Optimizer-built parlay track record. Only counts slips that "
            "were saved before games started AND graded after settled. "
            "Pushes excluded from hit rate; pending slips never count as "
            "losses."
        ),
        "generatedAt": _now_iso(),
        "byDate": [],
        "lifetime": _empty_acc(),
        "byProfile": {},
        "bySport": {},
        # Per-date AND lifetime breakdowns over the publicRiskSections
        # slips only (the user-facing surface).
        "byPublicSection": {"lifetime": {}, "byDate": {}},
        "bySportBucket": {"lifetime": {}, "byDate": {}},
    }
    if not os.path.isdir(OPTIMIZER_GRADED_DIR):
        return summary

    profile_acc: dict[str, dict[str, Any]] = {}
    sport_acc: dict[str, dict[str, Any]] = {}
    date_rows: list[dict[str, Any]] = []

    section_lifetime: dict[str, dict[str, Any]] = {}
    section_by_date: dict[str, dict[str, dict[str, Any]]] = {}
    sport_bucket_lifetime: dict[str, dict[str, Any]] = {}
    sport_bucket_by_date: dict[str, dict[str, dict[str, Any]]] = {}

    for fname in sorted(os.listdir(OPTIMIZER_GRADED_DIR)):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(OPTIMIZER_GRADED_DIR, fname)
        try:
            payload = json.load(open(path, "r", encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        date = payload.get("date")
        if not isinstance(date, str):
            continue
        unique = payload.get("uniqueSlips") or []
        date_acc = _empty_acc()
        for slip in unique:
            status = slip.get("status") or "pending"
            _accumulate(date_acc, status)
            _accumulate(summary["lifetime"], status)
            profile = slip.get("profile") or slip.get("riskProfile") or "balanced"
            profile_acc.setdefault(profile, _empty_acc())
            _accumulate(profile_acc[profile], status)
            sport = slip.get("sport") or "multi"
            sport_acc.setdefault(sport, _empty_acc())
            _accumulate(sport_acc[sport], status)
        _finalize(date_acc)
        date_rows.append({"date": date, **date_acc})

        # PR `feature/risk-section-results-data` — walk the graded
        # publicRiskSections and fold each (section, sport) cell into
        # the lifetime + per-date accumulators. We only count the
        # `all` sport bucket so we never double-count a slip that
        # also lives under `nba` / `mlb` / `multi`. The sport bucket
        # accumulator uses the sport-tab key directly, capturing the
        # same dedup at source.
        prs = payload.get("publicRiskSections") or {}
        if isinstance(prs, dict):
            section_by_date.setdefault(date, {})
            sport_bucket_by_date.setdefault(date, {})
            for section_key, by_sport in prs.items():
                if not isinstance(by_sport, dict):
                    continue
                # Section accumulator — fold only the `all` tab to
                # avoid double-counting per-sport duplicates.
                all_slips = by_sport.get("all") or []
                if isinstance(all_slips, list):
                    section_lifetime.setdefault(section_key, _empty_acc())
                    section_by_date[date].setdefault(section_key, _empty_acc())
                    for s in all_slips:
                        if not isinstance(s, dict):
                            continue
                        st = s.get("status") or "pending"
                        _accumulate(section_lifetime[section_key], st)
                        _accumulate(section_by_date[date][section_key], st)
                # Sport bucket accumulator — fold each per-sport tab
                # (nba / mlb / multi) as its own bucket, skipping
                # `all` so we never double count.
                for sport_key in ("nba", "mlb", "multi"):
                    sslips = by_sport.get(sport_key) or []
                    if not isinstance(sslips, list):
                        continue
                    sport_bucket_lifetime.setdefault(sport_key, _empty_acc())
                    sport_bucket_by_date[date].setdefault(sport_key, _empty_acc())
                    for s in sslips:
                        if not isinstance(s, dict):
                            continue
                        st = s.get("status") or "pending"
                        _accumulate(sport_bucket_lifetime[sport_key], st)
                        _accumulate(sport_bucket_by_date[date][sport_key], st)

    summary["byDate"] = sorted(date_rows, key=lambda r: r["date"])
    summary["lifetime"] = _finalize(summary["lifetime"])
    summary["byProfile"] = {p: _finalize(acc) for p, acc in profile_acc.items()}
    summary["bySport"] = {s: _finalize(acc) for s, acc in sport_acc.items()}
    summary["byPublicSection"] = {
        "lifetime": {k: _finalize(v) for k, v in section_lifetime.items()},
        "byDate": {
            date: {k: _finalize(v) for k, v in by_sec.items()}
            for date, by_sec in section_by_date.items()
        },
    }
    summary["bySportBucket"] = {
        "lifetime": {k: _finalize(v) for k, v in sport_bucket_lifetime.items()},
        "byDate": {
            date: {k: _finalize(v) for k, v in by_sp.items()}
            for date, by_sp in sport_bucket_by_date.items()
        },
    }
    return summary


def write_summary(summary: dict[str, Any]) -> str:
    os.makedirs(os.path.dirname(OPTIMIZER_SUMMARY_PATH), exist_ok=True)
    tmp = f"{OPTIMIZER_SUMMARY_PATH}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    os.replace(tmp, OPTIMIZER_SUMMARY_PATH)
    return OPTIMIZER_SUMMARY_PATH


def _list_optimizer_dates() -> list[str]:
    if not os.path.isdir(OPTIMIZER_DIR):
        return []
    out: list[str] = []
    for fname in sorted(os.listdir(OPTIMIZER_DIR)):
        if fname.endswith(".json"):
            out.append(fname[:-5])
    return out


def grade_date(date: str) -> dict[str, Any] | None:
    path = os.path.join(OPTIMIZER_DIR, f"{date}.json")
    if not os.path.exists(path):
        print(f"[grade_optimizer] no optimizer snapshot for {date}; honest no-op.")
        return None
    payload = json.load(open(path, "r", encoding="utf-8"))
    if (payload.get("totalSlips") or 0) == 0:
        # Empty snapshot — write graded shell with zero slips so the
        # date is visible in the summary as "no slips this date."
        graded = {**payload, "gradedAt": _now_iso(), "uniqueSlips": []}
        write_graded(date, graded)
        print(f"[grade_optimizer] {date} · empty snapshot → empty graded file")
        return graded
    graded = grade_optimizer_payload(payload)
    write_graded(date, graded)
    # Counts for the CLI log.
    counts = _empty_acc()
    for slip in graded.get("uniqueSlips") or []:
        _accumulate(counts, slip.get("status") or "pending")
    print(
        f"[grade_optimizer] {date}: {counts['wins']}W · "
        f"{counts['losses']}L · {counts['pushes']}P · {counts['pending']} pending"
    )
    return graded


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    grp = p.add_mutually_exclusive_group(required=True)
    grp.add_argument("--date", help="YYYY-MM-DD")
    grp.add_argument("--all", action="store_true", help="grade every optimizer snapshot on disk")
    args = p.parse_args(argv)

    if args.all:
        for d in _list_optimizer_dates():
            grade_date(d)
    else:
        grade_date(args.date)

    summary = update_summary()
    write_summary(summary)
    lifetime = summary["lifetime"]
    print(
        f"[grade_optimizer] summary lifetime: {lifetime['wins']}-{lifetime['losses']} "
        f"on {lifetime['decisive']} decisive (pending={lifetime['pending']}, pushes={lifetime['pushes']})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
