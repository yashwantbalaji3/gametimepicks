"""
enrich_dual_legs — attach rich per-leg context (player id for portraits, recent-5 games,
"why" reason bullets, model prediction, team recent form) to the ALREADY-LAUNCHED Dual
Bank Builder lanes, WITHOUT re-selecting any leg.

This is deliberately separate from build_dual_bank_builder: once a lane is launched, its
legs are locked (they were valid pregame at launch and are now pending settlement). This
step only ADDS display/insight fields to the existing legs by joining them back to the MLB
board (recentGames + reasonBullets) and the WC projections (team form + outcomes). No
fabrication; if a source can't be matched the leg keeps what it had.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app" / "public" / "data"
BB = DATA / "bank-builder"


def mlb_index() -> dict[tuple[str, str], dict]:
    try:
        leans = json.loads((DATA / "mlb" / "boards" / "2026-06-15.json").read_text()).get("leans", [])
    except Exception:
        return {}
    idx = {}
    for l in leans:
        if l.get("playerName") and l.get("marketKey"):
            idx[(l["playerName"], l["marketKey"])] = l
    return idx


def wc_index() -> dict[tuple[str, str], dict]:
    try:
        matches = json.loads((DATA / "world-cup" / "projections" / "latest.json").read_text()).get("matches", [])
    except Exception:
        return {}
    return {(str(m.get("matchId")), m.get("market")): m for m in matches}


def enrich_leg(leg: dict, mlb: dict, wc: dict) -> dict:
    if leg.get("sport") == "mlb":
        src = mlb.get((leg.get("playerName"), leg.get("market")))
        if src:
            side = leg.get("side") or ("Over" if "Over" in (leg.get("pick") or "") else "Under")
            prob = leg.get("modelProbability") or 0
            ml = (src.get("marketLabel") or "prop").lower()
            line = src.get("line")
            leg["playerId"] = src.get("playerId")
            leg["opponent"] = src.get("opponentAbbr")
            leg["line"] = line
            leg["side"] = side
            leg["marketLabel"] = src.get("marketLabel")
            leg["recentGames"] = (src.get("recentGames") or [])[-5:]
            leg["reasonBullets"] = src.get("reasonBullets") or []
            leg["modelPredict"] = (f"{prob*100:.0f}% to clear {line} {ml}" if side == "Over"
                                   else f"{prob*100:.0f}% to stay under {line} {ml}")
    elif leg.get("sport") == "world_cup":
        src = wc.get((str(leg.get("gameId")), leg.get("market")))
        if src:
            prob = leg.get("modelProbability") or 0
            leg["homeTeam"] = src.get("homeTeam")
            leg["awayTeam"] = src.get("awayTeam")
            leg["homeForm"] = src.get("homeForm")
            leg["awayForm"] = src.get("awayForm")
            leg["outcomes"] = src.get("outcomes") or []
            leg["group"] = src.get("group")
            leg["modelPredict"] = f"{prob*100:.0f}% — {leg.get('pick')}"
    return leg


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Enrich launched Dual Bank Builder legs (no re-selection).")
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    f = BB / "dual-lanes-latest.json"
    doc = json.loads(f.read_text())
    mlb, wc = mlb_index(), wc_index()
    n = 0
    for lane in doc.get("lanes", []):
        for leg in lane.get("legs", []):
            before = json.dumps(leg, sort_keys=True)
            enrich_leg(leg, mlb, wc)
            if json.dumps(leg, sort_keys=True) != before:
                n += 1
    doc["legsEnriched"] = n
    for name in (f"dual-lanes-{args.date}.json", "dual-lanes-latest.json"):
        (BB / name).write_text(json.dumps(doc, indent=2) + "\n")
    print(f"[dual-enrich] enriched {n} legs in place (selection unchanged).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
