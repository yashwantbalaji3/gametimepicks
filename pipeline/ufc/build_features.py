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
    from .name_matching import build_index
    return build_index(fighters_art.get("fighters", []), name_of=lambda f: f.get("canonicalName", ""))


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


import re as _re


def _match_name(s: str) -> str:
    """Suffix-tolerant key for SCHEDULE↔ODDS matching only (display names kept).
    Drops Jr/Sr/II-IV + punctuation so 'Steve Garcia Jr.' == 'Steve Garcia'."""
    n = _norm_name(s)
    n = _re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", n)
    n = _re.sub(r"[^a-z0-9 ]", "", n)
    return _re.sub(r"\s+", " ", n).strip()


def _match_key(a: str, b: str) -> str:
    return "|".join(sorted([_match_name(a), _match_name(b)]))


def _schedule_keys(schedule: dict | None) -> set:
    keys = set()
    for f in (schedule or {}).get("fights", []):
        keys.add(_match_key(f.get("fighterA", ""), f.get("fighterB", "")))
    return keys


def build(odds: dict, fighters: dict, now: datetime | None = None,
          schedule: dict | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    idx = _fighter_index(fighters)
    fetched = odds.get("generatedAt")
    # futures heuristic: a fighter appearing in multiple bouts at the same time
    name_time = Counter()
    for b in odds.get("bouts", []):
        for fn in b.get("fighters", []):
            name_time[(_norm_name(fn), b.get("commenceTime"))] += 1
    # Card-only reconciliation: ESPN schedule is source of truth.
    card_keys = _schedule_keys(schedule) if schedule else None
    matched_keys = set()

    rows, blocked = [], []
    for b in odds.get("bouts", []):
        fs = b.get("fighters", [])
        ct = b.get("commenceTime")
        warnings = []
        if len(fs) != 2:
            blocked.append({"bout": fs, "reason": "not a two-fighter bout"}); continue
        key = _match_key(fs[0], fs[1])
        if card_keys is not None and key not in card_keys:
            blocked.append({"bout": fs, "reason": "not on the real ESPN card (futures/unmatched)"}); continue
        if not (fetched and ct and fetched < ct):
            blocked.append({"bout": fs, "reason": "odds not pregame / stale"}); continue
        from .name_matching import resolve
        fa, mta = resolve(fs[0], idx); fb, mtb = resolve(fs[1], idx)
        if mta == "ambiguous" or mtb == "ambiguous":
            blocked.append({"bout": fs, "reason": "ambiguous fighter name match"}); continue
        if not fa or not fb:
            blocked.append({"bout": fs, "reason": "fighter stats missing for one/both"}); continue
        sides = {s.get("name"): s for s in b.get("sides", [])}
        if fs[0] not in sides or fs[1] not in sides:
            blocked.append({"bout": fs, "reason": "odds side mismatch"}); continue
        if card_keys is not None:
            matched_keys.add(key)
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
    out = {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "oddsFetchedAt": fetched,
        "cardOnly": card_keys is not None,
        "boutCount": len(rows),
        "blockedCount": len(blocked),
        "blocked": blocked,
        "features": rows,
    }
    if card_keys is not None:
        out["scheduledFightCount"] = len(card_keys)
        out["matchedFightCount"] = len(matched_keys)
        out["unmatchedScheduledFights"] = sorted(card_keys - matched_keys)
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None)
    ap.add_argument("--card-only", action="store_true")
    args = ap.parse_args(argv)
    def L(p):
        try: return json.loads((DATA / p).read_text())
        except Exception: return {}
    schedule = L("schedule-latest.json") if args.card_only else None
    payload = build(L("odds-latest.json"), L("fighters-latest.json"), schedule=schedule)
    out = Path(args.out) if args.out else (DATA / ("features-card-latest.json" if args.card_only else "features-latest.json"))
    out.write_text(json.dumps(payload, indent=2) + "\n")
    extra = f" matched={payload.get('matchedFightCount')}/{payload.get('scheduledFightCount')}" if args.card_only else ""
    print(f"wrote {out} → bouts={payload['boutCount']} blocked={payload['blockedCount']}{extra}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
