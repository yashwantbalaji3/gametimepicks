"""
grade_moneylines — grade UFC h2h (moneyline) odds against final results.
Moneyline ONLY. Pending/unknown are NEVER counted as losses. No-contest/cancelled
→ void; draw → push (two-way moneyline convention). No picks, no parlays.

Join contract (rematch-safe): a result may decide a grade ONLY via its
date-qualified boutId ("<date>:<sorted-pair>", written by build_results.py); the
odds side derives the SAME id from commenceTime[:10] (as build_features.py /
build_schedule.py already do). A bare fighter-pair match on a different date
NEVER decides — 10 rematch pairs share the pair key, 6 with different winners
(Pereira/Ankalaev, Grasso/Shevchenko, ...). Missing or ambiguous boutId fails
closed to pending with an explicit warning.

Run: python -m pipeline.ufc.grade_moneylines
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .build_fighter_stats import _norm_name

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
OUT = DATA / "graded-moneylines-latest.json"


def _bout_key(a: str, b: str) -> str:
    return "|".join(sorted([_norm_name(a), _norm_name(b)]))


def _bout_id(commence_time: str | None, a: str, b: str) -> str | None:
    """Date-qualified bout identity — the SAME derivation build_features.py and
    build_schedule.py use, and the id build_results.py writes on every result
    row. None when no date can be derived (fail closed, never pair-only)."""
    date = (commence_time or "")[:10]
    return f"{date}:{_bout_key(a, b)}" if len(date) == 10 else None


def _results_index(results: dict) -> tuple[dict[str, list[dict]], dict[str, list[str]]]:
    """Index results by date-qualified boutId. Rows without a boutId are dropped
    (no identity → can never decide a grade). pair→dates lets the grader WARN
    when a bare pair exists on other dates instead of silently picking a row."""
    by_id: dict[str, list[dict]] = {}
    pair_dates: dict[str, list[str]] = {}
    for r in results.get("results", []):
        if not r.get("boutId"):
            continue
        by_id.setdefault(r["boutId"], []).append(r)
        pair = _bout_key(r.get("fighterA", ""), r.get("fighterB", ""))
        d = r.get("eventDate")
        if d and d not in pair_dates.setdefault(pair, []):
            pair_dates[pair].append(d)
    return by_id, pair_dates


def _match_result(fighters: list, commence_time: str | None,
                  by_id: dict[str, list[dict]],
                  pair_dates: dict[str, list[str]]) -> tuple[dict | None, list[str]]:
    """Rematch-safe join: ONLY an exact date-qualified boutId match decides a
    grade. Missing date, ambiguous id, or pair-on-other-dates → (None, warnings)
    — NEVER pick a row by fighter pair alone."""
    bid = _bout_id(commence_time, fighters[0], fighters[1])
    if bid is None:
        return None, ["no commenceTime — cannot derive date-qualified boutId (fail closed to pending)"]
    rows = by_id.get(bid, [])
    if len(rows) == 1:
        return rows[0], []
    if len(rows) > 1:
        return None, [f"ambiguous boutId {bid}: {len(rows)} result rows (fail closed to pending)"]
    other = sorted(d for d in pair_dates.get(_bout_key(fighters[0], fighters[1]), []) if d != bid[:10])
    if other:
        return None, [f"fighter pair has results on other dates {other}; "
                      "date-less pair join refused (rematch-unsafe)"]
    return None, []


def grade(odds: dict, results: dict, now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    by_id, pair_dates = _results_index(results)

    graded = []
    tally = {"win": 0, "loss": 0, "push": 0, "void": 0, "pending": 0, "unknown": 0}
    for bout in odds.get("bouts", []):
        fighters = bout.get("fighters", [])
        if len(fighters) != 2:
            continue
        ct = bout.get("commenceTime")
        res, join_warnings = _match_result(fighters, ct, by_id, pair_dates)
        for side in bout.get("sides", []):
            name = side.get("name")
            g = "pending"
            reason = join_warnings[0] if join_warnings else "no final result for this bout"
            winner = loser = None
            if res:
                status = res.get("resultStatus")
                winner, loser = res.get("winner"), res.get("loser")
                if status == "final" and winner and loser:
                    if _norm_name(name) == _norm_name(winner):
                        g, reason = "win", "fighter is the winner"
                    elif _norm_name(name) == _norm_name(loser):
                        g, reason = "loss", "fighter is the loser"
                    else:
                        g, reason = "unknown", "name did not match either fighter"
                elif status == "no_contest":
                    g, reason = "void", "no contest"
                elif status == "draw":
                    g, reason = "push", "draw (two-way moneyline)"
                else:
                    g, reason = "unknown", f"result status {status}"
            tally[g] += 1
            graded.append({
                "boutId": _bout_id(ct, fighters[0], fighters[1]),
                "eventDate": (res or {}).get("eventDate") or ct,
                "fighter": name,
                "opponent": next((f for f in fighters if _norm_name(f) != _norm_name(name)), None),
                "market": "h2h",
                "price": side.get("price"),
                "impliedProbability": side.get("impliedProbability"),
                "resultStatus": (res or {}).get("resultStatus", "pending"),
                "grade": g, "gradeReason": reason, "winner": winner,
                "sourceOddsFetchedAt": odds.get("generatedAt"),
                "sourceResultFetchedAt": results.get("generatedAt"),
                "warnings": join_warnings + ([reason] if g == "unknown" else []),
            })
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "market": "h2h",
        "gradedCount": len(graded),
        "tally": tally,
        "note": "Moneyline grading only. Pending/unknown never counted as losses. "
                "Results join on date-qualified boutId ONLY (rematch-safe); "
                "current odds are future fights → pending until final.",
        "graded": graded,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--odds", default=str(DATA / "odds-latest.json"))
    ap.add_argument("--results", default=str(DATA / "results-latest.json"))
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)

    def _load(p):
        try:
            return json.loads(Path(p).read_text())
        except Exception:
            return {}
    payload = grade(_load(args.odds), _load(args.results))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out} → graded={payload['gradedCount']} tally={payload['tally']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
