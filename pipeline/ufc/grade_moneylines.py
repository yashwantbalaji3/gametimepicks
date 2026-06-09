"""
grade_moneylines — grade UFC h2h (moneyline) odds against final results.
Moneyline ONLY. Pending/unknown are NEVER counted as losses. No-contest/cancelled
→ void; draw → push (two-way moneyline convention). No picks, no parlays.

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


def grade(odds: dict, results: dict, now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    by_key = {}
    for r in results.get("results", []):
        by_key[_bout_key(r.get("fighterA", ""), r.get("fighterB", ""))] = r

    graded = []
    tally = {"win": 0, "loss": 0, "push": 0, "void": 0, "pending": 0, "unknown": 0}
    for bout in odds.get("bouts", []):
        fighters = bout.get("fighters", [])
        if len(fighters) != 2:
            continue
        res = by_key.get(_bout_key(fighters[0], fighters[1]))
        for side in bout.get("sides", []):
            name = side.get("name")
            g, reason = "pending", "no final result for this bout"
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
                "boutId": (res or {}).get("boutId"),
                "eventDate": (res or {}).get("eventDate") or bout.get("commenceTime"),
                "fighter": name,
                "opponent": next((f for f in fighters if _norm_name(f) != _norm_name(name)), None),
                "market": "h2h",
                "price": side.get("price"),
                "impliedProbability": side.get("impliedProbability"),
                "resultStatus": (res or {}).get("resultStatus", "pending"),
                "grade": g, "gradeReason": reason, "winner": winner,
                "sourceOddsFetchedAt": odds.get("generatedAt"),
                "sourceResultFetchedAt": results.get("generatedAt"),
                "warnings": [] if g != "unknown" else [reason],
            })
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "market": "h2h",
        "gradedCount": len(graded),
        "tally": tally,
        "note": "Moneyline grading only. Pending/unknown never counted as losses. "
                "Current odds are future fights → pending until final.",
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
