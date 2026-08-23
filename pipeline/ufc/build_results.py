"""
build_results — derive UFC fight RESULTS from the Greco1899 UFCStats CSVs
(GPL-3.0). Final fights only; never grades pending fights; handles
draw/no-contest safely. Derived artifact only — no raw CSVs, no picks.

Run: python -m pipeline.ufc.build_results --csv-dir tmp/ufc_csv
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

from .build_fighter_stats import _parse_event_date, _norm_name, _method_class
from .providers.ufcstats_csv import (
    SOURCE_REPO, SOURCE_LICENSE, SOURCE_ATTRIBUTION,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "results-latest.json"
DEFAULT_WINDOW_DAYS = 1100  # ~3 years — compact + plenty of final bouts


def _bout_key(a: str, b: str) -> str:
    return "|".join(sorted([_norm_name(a), _norm_name(b)]))


def build(data: dict[str, list[dict]], since_days: int = DEFAULT_WINDOW_DAYS, now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    cutoff = (ref.date() - timedelta(days=since_days)).isoformat()
    event_date = {}
    for r in data.get("ufc_event_details", []):
        d = _parse_event_date(r.get("DATE", ""))
        if d:
            event_date[_norm_name(r.get("EVENT", ""))] = d

    results = []
    counts = {"final": 0, "no_contest": 0, "draw": 0, "unknown": 0}
    latest = None
    for r in data.get("ufc_fight_results", []):
        bout = r.get("BOUT", "")
        parts = re.split(r"\s+vs\.?\s+", bout, maxsplit=1)
        if len(parts) != 2:
            continue
        a, b = parts[0].strip(), parts[1].strip()
        date = event_date.get(_norm_name(r.get("EVENT", "")))
        if not date or date < cutoff:
            continue
        outcome = (r.get("OUTCOME") or "").strip().upper()
        if outcome.startswith("W/L"):
            status, winner, loser = "final", a, b
        elif outcome.startswith("L/W"):
            status, winner, loser = "final", b, a
        elif outcome.startswith("D"):
            status, winner, loser = "draw", None, None
        elif "NC" in outcome:
            status, winner, loser = "no_contest", None, None
        else:
            status, winner, loser = "unknown", None, None
        counts[status if status in counts else "unknown"] = counts.get(status if status in counts else "unknown", 0) + 1
        if date and (latest is None or date > latest):
            latest = date
        try:
            rnd = int(r.get("ROUND") or 0) or None
        except ValueError:
            rnd = None
        results.append({
            "boutId": f"{date}:{_bout_key(a, b)}",
            "eventName": (r.get("EVENT") or "").strip(),
            "eventDate": date,
            "fighterA": a, "fighterB": b,
            "winner": winner, "loser": loser,
            "resultStatus": status,
            "method": _method_class(r.get("METHOD", "")),
            "round": rnd,
            "time": (r.get("TIME") or "").strip() or None,
            "weightClass": (r.get("WEIGHTCLASS") or "").strip() or None,
            "source": "greco1899_ufcstats_csv",
            "warnings": [] if status != "unknown" else ["unparsed outcome"],
        })

    results.sort(key=lambda x: x["eventDate"], reverse=True)

    # A 120-DAY BAR CANNOT SEE A STALLED SOURCE.
    #
    # `fresh` meant "the newest event is within 120 days" — seventeen weeks, for a promotion that
    # runs a card most weekends. A corpus four months behind reported "fresh", and so did one that
    # had simply missed last night's card. On 2026-08-23 this artifact said fresh while its newest
    # event was 2026-08-15 and ten bouts fought the previous night were waiting to be graded
    # against it.
    #
    # The lag is now reported as a NUMBER, which is the thing a caller actually needs, and the
    # status is a three-way read against how often this sport produces events. Nothing downstream is
    # forced to accept this bar: `latestEventLagDays` lets a consumer that knows when OUR last card
    # was fought — which this pipeline does not — draw its own conclusion.
    lag_days = (ref.date() - datetime.fromisoformat(latest).date()).days if latest else None
    if lag_days is None:
        status = "unknown"          # no events at all: not the same as stale, and not fresh either
    elif lag_days <= 10:
        status = "fresh"            # a card most weekends, plus slack for the scrape's own cadence
    elif lag_days <= 30:
        status = "lagging"
    else:
        status = "stale"
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "provider": "greco1899_ufcstats_csv",
        "sourceRepo": SOURCE_REPO, "sourceLicense": SOURCE_LICENSE,
        "sourceAttribution": SOURCE_ATTRIBUTION,
        "windowDays": since_days,
        "eventCount": len({r["eventName"] for r in results}),
        "boutCount": len(results),
        "finalBoutCount": counts["final"],
        "noContestCount": counts["no_contest"],
        "drawCount": counts["draw"],
        "latestEventDate": latest,
        "latestEventLagDays": lag_days,
        "freshnessStatus": status,
        "results": results,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-dir", default=None)
    ap.add_argument("--since-days", type=int, default=DEFAULT_WINDOW_DAYS)
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    from .providers.ufcstats_csv import read_csvs, fetch_csvs
    data = read_csvs(args.csv_dir) if args.csv_dir else fetch_csvs()
    payload = build(data, since_days=args.since_days)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out} → bouts={payload['boutCount']} final={payload['finalBoutCount']} "
          f"latest={payload['latestEventDate']} freshness={payload['freshnessStatus']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
