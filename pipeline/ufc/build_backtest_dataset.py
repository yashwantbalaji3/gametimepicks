"""
build_backtest_dataset — assemble a LEAKAGE-SAFE UFC moneyline backtest dataset
from real pregame odds snapshots + final results. No synthetic/unlicensed odds.
Only: final fights + odds snapshots fetched strictly BEFORE commence time + the
LAST pregame snapshot per bout. Pending/unknown/void excluded with reasons.

Join contract (rematch-safe, same as grade_moneylines.py): odds snapshots join
results ONLY on the date-qualified boutId derived from commenceTime[:10]; a bare
fighter-pair match on a different date is excluded (date_mismatched_pair), never
joined — rematch pairs share the pair key, sometimes with opposite winners.

Run: python -m pipeline.ufc.build_backtest_dataset
"""
from __future__ import annotations

import argparse
import glob
import json
from datetime import datetime, timezone
from pathlib import Path

from .build_fighter_stats import _norm_name
from .grade_moneylines import _bout_id, _bout_key

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
SNAP_DIR = DATA / "odds-snapshots"
OUT = DATA / "backtest-dataset-latest.json"
ACCEPTED_ODDS_SOURCES = {"the_odds_api_mma", "mma_mixed_martial_arts"}  # licensed/clean only


def _implied(odds: float) -> float:
    o = float(odds)
    return (-o) / ((-o) + 100.0) if o < 0 else 100.0 / (o + 100.0)


def build(snap_dir: Path = SNAP_DIR, results_path: Path = DATA / "results-latest.json",
          now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    try:
        results = json.loads(results_path.read_text())
    except Exception:
        results = {"results": []}
    # Index final results by date-qualified boutId ONLY (rematch-safe). Rows
    # without a boutId have no identity and can never join (fail closed);
    # pair→dates distinguishes "no result" from "result on a DIFFERENT date".
    by_id: dict[str, list[dict]] = {}
    pair_dates: dict[str, list[str]] = {}
    for r in results.get("results", []):
        if r.get("resultStatus") != "final" or not r.get("boutId"):
            continue
        by_id.setdefault(r["boutId"], []).append(r)
        pair = _bout_key(r.get("fighterA", ""), r.get("fighterB", ""))
        d = r.get("eventDate")
        if d and d not in pair_dates.setdefault(pair, []):
            pair_dates[pair].append(d)

    # last pregame snapshot per bout
    best: dict[str, dict] = {}
    excluded = {"post_commence": 0, "no_result": 0, "non_final": 0, "ambiguous": 0,
                "unlicensed": 0, "date_mismatched_pair": 0}
    snaps = sorted(glob.glob(str(snap_dir / "odds-*.json"))) if snap_dir.exists() else []
    for sp in snaps:
        try:
            snap = json.loads(Path(sp).read_text())
        except Exception:
            continue
        if snap.get("sportKey") not in ACCEPTED_ODDS_SOURCES:
            excluded["unlicensed"] += 1
            continue
        fetched = snap.get("generatedAt")
        for bout in snap.get("bouts", []):
            ct = bout.get("commenceTime")
            if not (fetched and ct and fetched < ct):
                excluded["post_commence"] += 1
                continue
            fs = bout.get("fighters", [])
            if len(fs) != 2:
                excluded["ambiguous"] += 1
                continue
            k = _bout_id(ct, fs[0], fs[1])
            if k is None:  # malformed commenceTime → no date-qualified identity
                excluded["ambiguous"] += 1
                continue
            # keep the LAST pregame snapshot (closest to commence)
            if k not in best or fetched > best[k]["fetchedAt"]:
                best[k] = {"bout": bout, "fetchedAt": fetched, "commenceTime": ct}

    rows = []
    for k, info in best.items():
        matches = by_id.get(k, [])
        if len(matches) > 1:
            excluded["ambiguous"] += 1
            continue
        if not matches:
            date, _, pair = k.partition(":")
            if any(d != date for d in pair_dates.get(pair, [])):
                # pair exists on OTHER dates only — rematch-unsafe join refused
                excluded["date_mismatched_pair"] += 1
            else:
                excluded["no_result"] += 1
            continue
        res = matches[0]
        winner, loser = res.get("winner"), res.get("loser")
        if not winner or not loser:
            excluded["non_final"] += 1
            continue
        for side in info["bout"].get("sides", []):
            name = side.get("name")
            if _norm_name(name) == _norm_name(winner):
                result = "win"
            elif _norm_name(name) == _norm_name(loser):
                result = "loss"
            else:
                excluded["ambiguous"] += 1
                continue
            price = side.get("price")
            rows.append({
                "boutId": res.get("boutId"),
                "eventName": res.get("eventName"),
                "eventDate": res.get("eventDate"),
                "fighter": name,
                "opponent": loser if result == "win" else winner,
                "result": result,
                "winner": winner,
                "market": "h2h",
                "oddsPrice": price,
                "impliedProbability": round(_implied(price), 4) if isinstance(price, (int, float)) else None,
                "oddsSource": info["bout"].get("bookmaker"),
                "oddsFetchedAt": info["fetchedAt"],
                "oddsWasPregame": True,
                "leakageCheck": "ok_pregame",
            })

    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "sourceOddsSnapshots": len(snaps),
        "sourceResults": str(results_path.name),
        "rowCount": len(rows),
        "eventCount": len({r["eventName"] for r in rows}),
        "excluded": excluded,
        "leakageFailures": 0,  # post-commence odds are excluded, not failed
        "backtestReadyCandidate": len(rows) >= 1,
        "insufficiencyReason": None if rows else
            "no completed fights with a clean pregame OddsAPI snapshot yet "
            "(forward snapshot logging just started; accumulate over upcoming cards)",
        "rows": rows,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    payload = build()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out} → rows={payload['rowCount']} snapshots={payload['sourceOddsSnapshots']} "
          f"excluded={payload['excluded']} candidate={payload['backtestReadyCandidate']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
