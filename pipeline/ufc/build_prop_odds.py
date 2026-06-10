"""
build_prop_odds — discover + fetch UFC PROP markets (method/totals/etc.) from The
Odds API for the REAL card, reconciled to the ESPN schedule. Discovery-first:
probes candidate market keys, records which actually return data. Never invents a
market. Card-only (futures/off-card dropped). Derived artifact only.

Run: python -m pipeline.ufc.build_prop_odds --discover    # report available markets
     python -m pipeline.ufc.build_prop_odds                # fetch available prop markets
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
OUT = DATA / "prop-odds-card-latest.json"
# Candidate The Odds API MMA market keys to probe (h2h is known-available).
CANDIDATE_MARKETS = ["h2h", "totals", "fight_result_method", "method_of_victory",
                     "fight_to_go_distance", "go_the_distance", "rounds"]



def discover(markets: list[str], now: datetime | None = None) -> dict:
    """Probe each candidate market on the next events; report availability + cost."""
    from .providers.oddsapi import fetch_events, fetch_event_odds, UfcOddsError
    ref = now or datetime.now(timezone.utc)
    result = {"generatedAt": ref.isoformat(timespec="seconds"), "marketsProbed": markets,
              "available": {}, "creditCost": 0, "warnings": []}
    try:
        events = sorted(fetch_events(), key=lambda e: e.get("commence_time") or "")[:1]
    except Exception as e:
        result["warnings"].append(f"events fetch failed: {type(e).__name__}")
        return result
    if not events:
        result["warnings"].append("no events")
        return result
    eid = events[0].get("id")
    for mk in markets:
        try:
            payload, headers = fetch_event_odds(eid, regions="us", markets=mk)
            result["creditCost"] += 1
            books = payload.get("bookmakers") or []
            has = any((m.get("key") for b in books for m in (b.get("markets") or [])))
            result["available"][mk] = {"returned": has,
                                       "marketKeysSeen": sorted({m.get("key") for b in books for m in (b.get("markets") or [])})}
            result["creditsRemaining"] = headers.get("x-requests-remaining")
        except Exception as e:
            result["available"][mk] = {"returned": False, "error": type(e).__name__}
    return result


def write_status(now: datetime | None = None) -> dict:
    """Emit the public-facing prop availability artifact. Reflects the last discovery
    probe if present; otherwise honestly reports unavailable. Never fabricates props."""
    from .providers.prop_odds_base import props_available
    ref = now or datetime.now(timezone.utc)
    disc = {}
    try:
        disc = json.loads((DATA / "prop-odds-discovery-latest.json").read_text())
    except Exception:
        pass
    avail = disc.get("available", {})
    method = bool(avail.get("fight_result_method", {}).get("returned") or avail.get("method_of_victory", {}).get("returned"))
    distance = bool(avail.get("fight_to_go_distance", {}).get("returned") or avail.get("go_the_distance", {}).get("returned"))
    rounds = bool(avail.get("rounds", {}).get("returned") or avail.get("totals", {}).get("returned"))
    connected = props_available()
    status = {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "status": "available" if (connected and (method or distance or rounds)) else "unavailable",
        "providerConnected": connected,
        "methodPropsReady": bool(connected and method),
        "distancePropsReady": bool(connected and distance),
        "roundPropsReady": bool(connected and rounds),
        "marketScope": [m for m, ok in (("method", method), ("distance", distance), ("rounds", rounds)) if ok] if connected else [],
        "reason": ("Prop-odds provider connected." if connected else
                   "No prop-odds provider connected. The Odds API MMA exposes h2h only."),
        "blocker": None if connected else "no real prop odds provider connected",
        "candidateProviders": ["OpticOdds (paid, approval required)", "SportsDataIO MMA (paid, approval required)"],
        "lastDiscoveryAt": disc.get("generatedAt"),
    }
    (DATA / "prop-odds-latest.json").write_text(json.dumps(status, indent=2) + "\n")
    return status


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--discover", action="store_true")
    ap.add_argument("--write-status", action="store_true")
    ap.add_argument("--markets", default=",".join(CANDIDATE_MARKETS))
    ap.add_argument("--out", default=str(DATA / "prop-odds-discovery-latest.json"))
    args = ap.parse_args(argv)
    if args.write_status:
        st = write_status()
        print(f"wrote prop-odds-latest.json status={st['status']} connected={st['providerConnected']}")
        return 0
    if args.discover:
        payload = discover(args.markets.split(","))
        Path(args.out).write_text(json.dumps(payload, indent=2) + "\n")
        avail = {k: v.get("returned") for k, v in payload.get("available", {}).items()}
        print(f"wrote {args.out} → available={avail} credits={payload.get('creditCost')}")
        return 0
    print("prop fetch (non-discovery) not yet wired — run --discover first")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
