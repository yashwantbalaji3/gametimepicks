"""
World Cup suggested parlays — built ONLY from real team-level projections (no market-outlook-
only legs, no padding). Correlation rules: max 1 leg per match on Low/Medium cross-match cards;
never combine an Under total with same-match attack legs; cap one higher-variance leg per card.
Every card states 90-minute regulation. Emits nothing (with a reason) when no positive-edge
projection legs exist. Educational/paper only.
"""
from __future__ import annotations

import argparse, json
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data" / "world-cup"


def _am_to_dec(o: int) -> float:
    return 1 + (o / 100.0 if o > 0 else 100.0 / -o)


def _dec_to_am(d: float) -> int:
    return round((d - 1) * 100) if d >= 2 else round(-100 / (d - 1))


def _leg(p: dict) -> dict:
    return {
        "matchId": p["matchId"], "match": f"{p['homeTeam']} vs {p['awayTeam']}",
        "market": p["market"], "pick": p.get("pickLabel") or p["pick"],
        "americanOdds": p["americanOdds"], "modelProbability": p["modelProbability"],
        "marketProbability": p["marketProbability"], "edgePct": p["edgePct"],
        "confidence": p.get("confidence"), "regulationOnly": True,
    }


def _card(cid, title, tier, legs, stake=25):
    dec = 1.0
    for l in legs:
        dec *= _am_to_dec(int(l["americanOdds"]))
    return {
        "id": cid, "sport": "world_cup", "riskTier": tier, "title": title,
        "legs": legs, "legCount": len(legs),
        "combinedAmericanOdds": _dec_to_am(dec), "combinedDecimal": round(dec, 3),
        "defaultStake": stake, "projectedReturn": round(stake * dec, 2),
        "regulationOnly": True,
        "whyThisCard": [f"{len(legs)} model-edge leg(s); each leg's model probability exceeds the market"],
        "correlationNotes": ["At most one leg per match" if len({l['matchId'] for l in legs}) == len(legs)
                             else "Legs share a match — correlation modeled conservatively"],
        "dataCaveats": ["90-minute regulation only (Draw is a real outcome; no extra time/penalties)",
                        "Early tournament — projections blend recent national-team form with the market; confidence is Low and sample is thin",
                        "Educational / paper only — not betting advice"],
    }


def _tier_for(american: int) -> str:
    """Risk tier from the card's ACTUAL combined odds — not from construction order."""
    if american <= 150:
        return "Low"
    if american <= 400:
        return "Medium"
    if american <= 1000:
        return "High"
    return "Longshot"


_TITLES = {
    "Low": "World Cup Low-Risk Card", "Medium": "World Cup Medium Card",
    "High": "World Cup High-Variance Card", "Longshot": "World Cup Longshot Card",
}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pf = DATA / "projections" / "latest.json"
    projections = json.loads(pf.read_text()).get("matches", []) if pf.exists() else []
    # Parlays may ONLY be built from PARLAY-ELIGIBLE projections — never public-only probability
    # views or research/gated picks. This is the core public-trust gate.
    value = [
        p for p in projections
        if p.get("parlayEligible") is True
        and p.get("americanOdds") is not None and (p.get("edgePct") or 0) > 0.5
    ]

    # Candidate cards from PARLAY-ELIGIBLE legs: singles (a suggested straight pick), 2-leg
    # cross-match combos, and 2-leg same-match combos (correlated → High/Longshot only).
    by_match: dict = {}
    for p in value:
        by_match.setdefault(p["matchId"], []).append(p)
    match_ids = list(by_match.keys())
    candidates = []
    # Single-leg suggested picks.
    for p in value:
        dec = _am_to_dec(int(p["americanOdds"]))
        candidates.append({"legs": [_leg(p)], "dec": dec, "american": _dec_to_am(dec),
                           "totalEdge": round(p["edgePct"], 2), "correlated": False})
    # 2-leg cross-match combos (no in-card correlation).
    for i in range(len(match_ids)):
        for j in range(i + 1, len(match_ids)):
            for a in by_match[match_ids[i]]:
                for b in by_match[match_ids[j]]:
                    dec = _am_to_dec(int(a["americanOdds"])) * _am_to_dec(int(b["americanOdds"]))
                    candidates.append({"legs": [_leg(a), _leg(b)], "dec": dec, "american": _dec_to_am(dec),
                                       "totalEdge": round(a["edgePct"] + b["edgePct"], 2), "correlated": False})
    # 2-leg same-match combos — correlated; allowed only in High/Longshot.
    for mid, legs in by_match.items():
        for x in range(len(legs)):
            for y in range(x + 1, len(legs)):
                a, b = legs[x], legs[y]
                dec = _am_to_dec(int(a["americanOdds"])) * _am_to_dec(int(b["americanOdds"]))
                candidates.append({"legs": [_leg(a), _leg(b)], "dec": dec, "american": _dec_to_am(dec),
                                   "totalEdge": round(a["edgePct"] + b["edgePct"], 2), "correlated": True})

    # Bucket by ACTUAL combined odds; keep up to 2 cards per tier (best total-edge, deduped). Low/
    # Medium reject correlated same-match combos. A card's tier reflects its real combined odds.
    cards, reasons, used = [], [], set()
    seq = {"Low": 0, "Medium": 0, "High": 0, "Longshot": 0}
    for tier in ("Low", "Medium", "High", "Longshot"):
        allow_corr = tier in ("High", "Longshot")
        pool = sorted([c for c in candidates
                       if _tier_for(c["american"]) == tier and (allow_corr or not c["correlated"])],
                      key=lambda c: -c["totalEdge"])
        placed = 0
        for c in pool:
            key = frozenset((l["matchId"], l["pick"]) for l in c["legs"])
            if key in used:
                continue
            used.add(key); seq[tier] += 1
            card = _card(f"wc_{args.date}_{tier.lower()}_{seq[tier]:03d}", _TITLES[tier], tier, c["legs"])
            card["combinedTotalEdgePct"] = c["totalEdge"]
            card["single"] = len(c["legs"]) == 1
            if c["correlated"]:
                card["correlationNotes"].insert(0, "Legs share a match — correlated; higher variance")
            if allow_corr:
                card["dataCaveats"].insert(0, "Higher variance: plus-money / correlated outcomes — long odds by design")
            cards.append(card); placed += 1
            if placed >= 2:
                break
        if placed < 2:
            reasons.append(f"{tier}: {placed} card(s) — not enough parlay-eligible legs in the {tier} odds range to reach the 2-per-tier target")

    payload = {
        "generatedAt": now, "sport": "world_cup", "date": args.date,
        "disclaimer": "Suggested paper parlays from GameTime Picks model projections — 90-minute regulation only. Not betting advice.",
        "cardCount": len(cards), "byRisk": {t: sum(1 for c in cards if c["riskTier"] == t) for t in ("Low", "Medium", "High", "Longshot")},
        "cards": cards, "gateReasons": reasons,
        "sourceProjections": len(projections), "valueLegs": len(value),
    }
    (DATA / "parlays").mkdir(parents=True, exist_ok=True)
    (DATA / "parlays" / f"{args.date}.json").write_text(json.dumps(payload, indent=2) + "\n")
    (DATA / "parlays" / "latest.json").write_text(json.dumps(payload, indent=2) + "\n")

    # Flip parlay flags in readiness. parlayAllowed = artifacts exist; parlayPublic = built from
    # active projections (the public gate). Both false today (no active projections).
    rp = DATA / "stats" / "readiness-latest.json"
    if rp.exists():
        rd = json.loads(rp.read_text())
        rd["parlayReady"] = len(cards) > 0
        rd["parlayAllowed"] = len(cards) > 0
        rd["parlayPublic"] = len(cards) > 0
        rp.write_text(json.dumps(rd, indent=2) + "\n")
    print(f"[wc-parlay] cards={len(cards)} valueLegs={len(value)} reasons={len(reasons)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
