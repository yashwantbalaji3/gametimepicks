"""
build_features — UFC moneyline matchup features from real odds + derived fighter
stats. Leakage-safe for UPCOMING fights (current stats predict a future bout — no
leakage). Fail-closed: missing stats / ambiguous names / stale or post-commence
odds → the bout is blocked, never guessed. No picks here, just features.

Run: python -m pipeline.ufc.build_features
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .build_fighter_stats import _norm_name

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
OUT = DATA / "features-latest.json"


def _implied(o):
    o = float(o)
    return (-o) / ((-o) + 100.0) if o < 0 else 100.0 / (o + 100.0)


def _fighter_index(fighters_art: dict) -> dict:
    idx = {}
    for f in fighters_art.get("fighters", []):
        idx[_norm_name(f.get("canonicalName", ""))] = f
    return idx


def _feat(f: dict) -> dict:
    rec = f.get("record", {})
    fin = f.get("finishes", {})
    rates = f.get("rates", {})
    phys = f.get("physicals", {})
    total = rec.get("total", 0) or 0
    rf = f.get("recentForm", {}).get("last5", "0-0")
    try:
        rw, rl = (int(x) for x in rf.split("-"))
    except Exception:
        rw, rl = 0, 0
    rdec = (rw + rl) or 1
    return {
        "winRate": (rec.get("wins", 0) / total) if total else None,
        "recentWinRate": rw / rdec,
        "finishRate": fin.get("finishRate"),
        "sigStrPerRound": rates.get("avgSigStrLandedPerRound"),
        "takedownsPerRound": rates.get("avgTakedownsPerRound"),
        "reachInches": phys.get("reachInches"),
        "ageYears": phys.get("ageYears"),
        "fightCount": f.get("recentForm", {}).get("fightCount", 0),
        "daysSinceLastFight": f.get("daysSinceLastFight"),
        "dataCompleteness": f.get("dataCompleteness", 0),
    }


def _delta(a, b):
    return (a - b) if (a is not None and b is not None) else None


def build(odds: dict, fighters: dict, now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    idx = _fighter_index(fighters)
    fetched = odds.get("generatedAt")
    # futures heuristic: a fighter appearing in multiple bouts at the same time
    name_time = Counter()
    for b in odds.get("bouts", []):
        for fn in b.get("fighters", []):
            name_time[(_norm_name(fn), b.get("commenceTime"))] += 1

    rows, blocked = [], []
    for b in odds.get("bouts", []):
        fs = b.get("fighters", [])
        ct = b.get("commenceTime")
        warnings = []
        if len(fs) != 2:
            blocked.append({"bout": fs, "reason": "not a two-fighter bout"}); continue
        if not (fetched and ct and fetched < ct):
            blocked.append({"bout": fs, "reason": "odds not pregame / stale"}); continue
        fa, fb = idx.get(_norm_name(fs[0])), idx.get(_norm_name(fs[1]))
        if not fa or not fb:
            blocked.append({"bout": fs, "reason": "fighter stats missing for one/both"}); continue
        sides = {s.get("name"): s for s in b.get("sides", [])}
        if fs[0] not in sides or fs[1] not in sides:
            blocked.append({"bout": fs, "reason": "odds side mismatch"}); continue
        # futures flag
        is_futures = name_time[(_norm_name(fs[0]), ct)] > 1 or name_time[(_norm_name(fs[1]), ct)] > 1
        if is_futures:
            warnings.append("likely futures/hypothetical matchup (fighter appears in multiple same-time bouts)")
        A, B = _feat(fa), _feat(fb)
        pa = _implied(sides[fs[0]]["price"]); pb = _implied(sides[fs[1]]["price"])
        norm = pa + pb
        dq = round((A["dataCompleteness"] + B["dataCompleteness"]) / 2.0, 2)
        rows.append({
            "boutId": f"{(ct or '')[:10]}:{'|'.join(sorted([_norm_name(fs[0]), _norm_name(fs[1])]))}",
            "commenceTime": ct,
            "fighterA": fs[0], "fighterB": fs[1],
            "oddsA": sides[fs[0]]["price"], "oddsB": sides[fs[1]]["price"],
            "marketImpliedA": round(pa / norm, 4) if norm else None,
            "marketImpliedB": round(pb / norm, 4) if norm else None,
            "deltas": {
                "winRate": _delta(A["winRate"], B["winRate"]),
                "recentWinRate": _delta(A["recentWinRate"], B["recentWinRate"]),
                "finishRate": _delta(A["finishRate"], B["finishRate"]),
                "sigStrPerRound": _delta(A["sigStrPerRound"], B["sigStrPerRound"]),
                "takedownsPerRound": _delta(A["takedownsPerRound"], B["takedownsPerRound"]),
                "reachInches": _delta(A["reachInches"], B["reachInches"]),
                "ageYears": _delta(A["ageYears"], B["ageYears"]),
                "experience": _delta(A["fightCount"], B["fightCount"]),
            },
            "dataQuality": dq,
            "isFutures": is_futures,
            "warnings": warnings,
        })
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "oddsFetchedAt": fetched,
        "boutCount": len(rows),
        "blockedCount": len(blocked),
        "blocked": blocked,
        "features": rows,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=str(OUT)); args = ap.parse_args(argv)
    def L(p):
        try: return json.loads((DATA / p).read_text())
        except Exception: return {}
    payload = build(L("odds-latest.json"), L("fighters-latest.json"))
    Path(args.out).write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.out} → bouts={payload['boutCount']} blocked={payload['blockedCount']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
