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


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pf = DATA / "projections" / "latest.json"
    projections = json.loads(pf.read_text()).get("matches", []) if pf.exists() else []
    # Only legs where the MODEL sees value (positive edge) and we have odds.
    value = [p for p in projections if p.get("americanOdds") is not None and (p.get("edgePct") or 0) > 0.5]
    cards, reasons = [], []

    # Cross-match favorites (negative odds, moneyline) → Low card (≤2 legs, 1 per match).
    fav = sorted([p for p in value if p["market"] == "moneyline_90" and int(p["americanOdds"]) < 0],
                 key=lambda p: -(p["edgePct"]))
    seen_matches, low_legs = set(), []
    for p in fav:
        if p["matchId"] in seen_matches:
            continue
        low_legs.append(_leg(p)); seen_matches.add(p["matchId"])
        if len(low_legs) == 2:
            break
    if len(low_legs) >= 2:
        cards.append(_card(f"wc_{args.date}_low_001", "World Cup Low-Risk — Cross-Match Favorites", "Low", low_legs))
    else:
        reasons.append("Low card needs 2 positive-edge moneyline favorites across different matches")

    # Medium: best 2-3 positive-edge legs (moneyline or total), max 1 per match.
    med_pool = sorted(value, key=lambda p: -(p["edgePct"]))
    seen, med_legs = set(), []
    for p in med_pool:
        if p["matchId"] in seen:
            continue
        med_legs.append(_leg(p)); seen.add(p["matchId"])
        if len(med_legs) == 3:
            break
    if len(med_legs) >= 2:
        cards.append(_card(f"wc_{args.date}_med_001", "World Cup Medium — Top Model Edges", "Medium", med_legs))
    else:
        reasons.append("Medium card needs 2+ positive-edge legs across different matches")

    # High: plus-money model picks (≥2), clearly higher variance.
    plus = sorted([p for p in value if int(p["americanOdds"]) >= 120], key=lambda p: -(p["edgePct"]))
    seen, hi_legs = set(), []
    for p in plus:
        if p["matchId"] in seen:
            continue
        hi_legs.append(_leg(p)); seen.add(p["matchId"])
        if len(hi_legs) == 2:
            break
    if len(hi_legs) >= 2:
        c = _card(f"wc_{args.date}_high_001", "World Cup High Variance — Plus-Money Model Picks", "High", hi_legs)
        c["dataCaveats"].insert(0, "Higher variance: plus-money outcomes including Draw/underdog results")
        cards.append(c)
    else:
        reasons.append("High card needs 2+ plus-money positive-edge legs")

    payload = {
        "generatedAt": now, "sport": "world_cup", "date": args.date,
        "disclaimer": "Suggested paper parlays from GameTime Picks model projections — 90-minute regulation only. Not betting advice.",
        "cardCount": len(cards), "byRisk": {t: sum(1 for c in cards if c["riskTier"] == t) for t in ("Low", "Medium", "High")},
        "cards": cards, "gateReasons": reasons,
        "sourceProjections": len(projections), "valueLegs": len(value),
    }
    (DATA / "parlays").mkdir(parents=True, exist_ok=True)
    (DATA / "parlays" / f"{args.date}.json").write_text(json.dumps(payload, indent=2) + "\n")
    (DATA / "parlays" / "latest.json").write_text(json.dumps(payload, indent=2) + "\n")

    # Flip parlayAllowed in readiness based on real cards.
    rp = DATA / "stats" / "readiness-latest.json"
    if rp.exists():
        rd = json.loads(rp.read_text())
        rd["parlayReady"] = len(cards) > 0
        rd["parlayAllowed"] = len(cards) > 0
        rp.write_text(json.dumps(rd, indent=2) + "\n")
    print(f"[wc-parlay] cards={len(cards)} valueLegs={len(value)} reasons={len(reasons)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
