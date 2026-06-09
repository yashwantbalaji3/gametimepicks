"""
build_fighter_stats — derive a normalized UFC fighter-stats artifact from the
Greco1899 UFCStats CSVs (GPL-3.0). Publishes DERIVED summary features only — never
the raw CSV rows, never picks/projections. FAIL-CLOSED: missing/malformed/stale
input → fewer fighters + warnings; readiness gate decides fighterStatsReady.

Run:
  python -m pipeline.ufc.build_fighter_stats --csv-dir tmp/ufc_csv      # local
  python -m pipeline.ufc.build_fighter_stats                            # fetch (CI)
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from .providers.ufcstats_csv import (
    SOURCE_REPO, SOURCE_LICENSE, SOURCE_ATTRIBUTION, CSV_FILES,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "fighters-latest.json"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _norm_name(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def _parse_event_date(s: str) -> str | None:
    s = (s or "").strip()
    for fmt in ("%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _height_in(s: str) -> int | None:
    m = re.match(r"(\d+)'\s*(\d+)", (s or "").strip())
    return int(m.group(1)) * 12 + int(m.group(2)) if m else None


def _reach_in(s: str) -> float | None:
    m = re.match(r"([\d.]+)", (s or "").replace('"', "").strip())
    return float(m.group(1)) if m else None


def _age(dob: str, ref: datetime) -> float | None:
    for fmt in ("%b %d, %Y", "%B %d, %Y"):
        try:
            d = datetime.strptime((dob or "").strip(), fmt)
            return round((ref - d.replace(tzinfo=timezone.utc)).days / 365.25, 1)
        except ValueError:
            continue
    return None


def _x_of_y(s: str) -> tuple[int, int]:
    m = re.match(r"\s*(\d+)\s+of\s+(\d+)", s or "")
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def _method_class(method: str) -> str:
    m = (method or "").lower()
    if "ko" in m or "tko" in m:
        return "ko_tko"
    if "sub" in m:
        return "submission"
    if "dec" in m:
        return "decision"
    return "other"


def build(data: dict[str, list[dict]]) -> dict:
    ref = _now()
    event_date = {}
    for r in data.get("ufc_event_details", []):
        d = _parse_event_date(r.get("DATE", ""))
        if d:
            event_date[_norm_name(r.get("EVENT", ""))] = d

    # physicals + names
    phys = {}
    for r in data.get("ufc_fighter_tott", []):
        nm = _norm_name(r.get("FIGHTER", ""))
        if nm:
            phys[nm] = {
                "heightInches": _height_in(r.get("HEIGHT", "")),
                "reachInches": _reach_in(r.get("REACH", "")),
                "stance": (r.get("STANCE") or "").strip() or None,
                "dob": (r.get("DOB") or "").strip() or None,
                "ageYears": _age(r.get("DOB", ""), ref),
            }
    nick = {}
    for r in data.get("ufc_fighter_details", []):
        nm = _norm_name(f"{r.get('FIRST','')} {r.get('LAST','')}")
        if nm and (r.get("NICKNAME") or "").strip():
            nick[nm] = r.get("NICKNAME").strip()

    # per-fighter record + fight log from results
    fighters: dict[str, dict] = {}

    def F(nm: str) -> dict:
        return fighters.setdefault(nm, {
            "canonicalName": None, "wins": 0, "losses": 0, "draws": 0, "nc": 0,
            "koWins": 0, "subWins": 0, "decWins": 0, "fights": [],
        })

    for r in data.get("ufc_fight_results", []):
        bout = r.get("BOUT", "")
        parts = re.split(r"\s+vs\.?\s+", bout, maxsplit=1)
        if len(parts) != 2:
            continue
        a, b = parts[0].strip(), parts[1].strip()
        na, nb = _norm_name(a), _norm_name(b)
        outcome = (r.get("OUTCOME") or "").strip().upper()
        method = r.get("METHOD", "")
        date = event_date.get(_norm_name(r.get("EVENT", "")))
        mc = _method_class(method)
        fa, fb = F(na), F(nb)
        fa["canonicalName"] = fa["canonicalName"] or a
        fb["canonicalName"] = fb["canonicalName"] or b
        # OUTCOME is first-fighter perspective: "W/L","L/W","D/D","NC"
        res_a, res_b = "?", "?"
        if outcome.startswith("W/L"): res_a, res_b = "W", "L"
        elif outcome.startswith("L/W"): res_a, res_b = "L", "W"
        elif outcome.startswith("D"): res_a = res_b = "D"
        elif "NC" in outcome: res_a = res_b = "NC"
        for f, res, opp in ((fa, res_a, b), (fb, res_b, a)):
            if res == "W":
                f["wins"] += 1
                if mc == "ko_tko": f["koWins"] += 1
                elif mc == "submission": f["subWins"] += 1
                elif mc == "decision": f["decWins"] += 1
            elif res == "L": f["losses"] += 1
            elif res == "D": f["draws"] += 1
            elif res == "NC": f["nc"] += 1
            f["fights"].append({"date": date, "result": res, "method": mc, "opponent": opp})

    # aggregate per-fight strike/TD stats
    agg: dict[str, dict] = {}
    for r in data.get("ufc_fight_stats", []):
        nm = _norm_name(r.get("FIGHTER", ""))
        if not nm:
            continue
        sl, sa = _x_of_y(r.get("SIG.STR.", ""))
        tdl, tda = _x_of_y(r.get("TD", ""))
        try:
            sub = int(r.get("SUB.ATT", "0") or 0)
        except ValueError:
            sub = 0
        a = agg.setdefault(nm, {"sigL": 0, "sigA": 0, "tdL": 0, "subAtt": 0, "rounds": 0})
        a["sigL"] += sl; a["sigA"] += sa; a["tdL"] += tdl; a["subAtt"] += sub; a["rounds"] += 1

    # derive summary features
    out_fighters = []
    latest_overall = None
    for nm, f in fighters.items():
        total = f["wins"] + f["losses"] + f["draws"] + f["nc"]
        if total == 0:
            continue
        dated = [x for x in f["fights"] if x["date"]]
        dated.sort(key=lambda x: x["date"])
        latest = dated[-1]["date"] if dated else None
        if latest and (latest_overall is None or latest > latest_overall):
            latest_overall = latest
        last5 = dated[-5:]
        recent_w = sum(1 for x in last5 if x["result"] == "W")
        recent_l = sum(1 for x in last5 if x["result"] == "L")
        finish_w = f["koWins"] + f["subWins"]
        days_since = None
        if latest:
            try:
                days_since = (ref.date() - datetime.fromisoformat(latest).date()).days
            except Exception:
                days_since = None
        st = agg.get(nm)
        rates = {}
        if st and st["rounds"] > 0:
            rates = {
                "avgSigStrLandedPerRound": round(st["sigL"] / st["rounds"], 2),
                "sigStrAccuracy": round(st["sigL"] / st["sigA"], 3) if st["sigA"] else None,
                "avgTakedownsPerRound": round(st["tdL"] / st["rounds"], 2),
                "subAttempts": st["subAtt"],
                "statRounds": st["rounds"],
            }
        p = phys.get(nm, {})
        completeness = round(sum([
            bool(p.get("heightInches")), bool(p.get("reachInches")), bool(p.get("stance")),
            bool(p.get("ageYears")), bool(rates), bool(latest),
        ]) / 6.0, 2)
        warnings = []
        if not p:
            warnings.append("no physicals")
        if not rates:
            warnings.append("no strike/TD stats")
        if not latest:
            warnings.append("no dated fights")
        out_fighters.append({
            "fighterId": nm.replace(" ", "-"),
            "canonicalName": f["canonicalName"],
            "aliases": [nick[nm]] if nm in nick else [],
            "physicals": p,
            "record": {"wins": f["wins"], "losses": f["losses"], "draws": f["draws"],
                       "nc": f["nc"], "total": total},
            "finishes": {"koWins": f["koWins"], "subWins": f["subWins"],
                         "decisionWins": f["decWins"], "finishWins": finish_w,
                         "finishRate": round(finish_w / f["wins"], 3) if f["wins"] else None},
            "recentForm": {"last5": f"{recent_w}-{recent_l}", "fightCount": len(dated)},
            "rates": rates,
            "latestFightDate": latest,
            "daysSinceLastFight": days_since,
            "dataCompleteness": completeness,
            "warnings": warnings,
        })

    out_fighters.sort(key=lambda x: x["canonicalName"] or "")
    fight_count = sum(len(f["fights"]) for f in fighters.values())
    # freshness: latest fight within ~120 days = fresh
    fresh = False
    if latest_overall:
        try:
            fresh = (ref.date() - datetime.fromisoformat(latest_overall).date()).days <= 120
        except Exception:
            fresh = False
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "provider": "greco1899_ufcstats_csv",
        "sourceRepo": SOURCE_REPO,
        "sourceLicense": SOURCE_LICENSE,
        "sourceAttribution": SOURCE_ATTRIBUTION,
        "sourceFiles": list(CSV_FILES),
        "fighterCount": len(out_fighters),
        "fightCount": fight_count,
        "latestFightDate": latest_overall,
        "freshnessStatus": "fresh" if fresh else "stale",
        "fighters": out_fighters,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-dir", default=None, help="read CSVs from dir (else fetch)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    from .providers.ufcstats_csv import read_csvs, fetch_csvs
    data = read_csvs(args.csv_dir) if args.csv_dir else fetch_csvs()
    payload = build(data)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out} → fighters={payload['fighterCount']} fights={payload['fightCount']} "
          f"latest={payload['latestFightDate']} freshness={payload['freshnessStatus']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
