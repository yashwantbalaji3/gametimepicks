"""
Daily MIXED-SPORT suggested cards. Combines parlay-eligible legs ACROSS sports (World Cup +
MLB/NBA) — each carrying REAL American odds — into cross-sport cards bucketed by combined odds
into Low/Medium/High/Longshot, targeting up to 2 per tier WITHOUT padding.

Hard rules honored: no fake odds; UFC excluded (V1 is model-only, no market odds); no pre-lineup
player props in Low; cross-sport legs come from different games (low correlation by construction);
Bank Builder stays protected (a card is only flagged bankBuilderEligible when it is a genuine
Low-tier, non-pre-lineup card whose combined odds fit the Step-3 target — we never mutate the
ladder here). Writes daily/cards/latest.json + per-date. Pure file I/O; no network.
"""
from __future__ import annotations

import argparse, json
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data"
WC = DATA / "world-cup"
MLB_NBA_LEG_CAP = 14         # strongest optimizer legs to consider (by edge), deduped
BANK_TARGET_LOW, BANK_TARGET_HIGH = 150, 220  # +174 Step-3 window


def _am_to_dec(o: float) -> float:
    return 1 + (o / 100.0 if o > 0 else 100.0 / -o)


def _dec_to_am(d: float) -> int:
    return round((d - 1) * 100) if d >= 2 else round(-100 / (d - 1))


def _tier(american: int) -> str:
    if american <= 150:
        return "Low"
    if american <= 400:
        return "Medium"
    if american <= 1000:
        return "High"
    return "Longshot"


def _wc_legs() -> list[dict]:
    """Parlay-eligible World Cup legs (team markets only for mixed cards — never pre-lineup)."""
    out = []
    try:
        for p in json.loads((WC / "projections" / "latest.json").read_text()).get("matches", []):
            if p.get("parlayEligible") and p.get("americanOdds") is not None:
                out.append({
                    "sport": "world_cup", "sportLabel": "World Cup", "gameId": p.get("matchId"),
                    "label": p.get("pickLabel"), "sublabel": f"{p['homeTeam']} vs {p['awayTeam']}",
                    "americanOdds": int(p["americanOdds"]), "prelineup": False, "regulationOnly": True,
                    "riskTier": p.get("riskTier", "Medium"),
                })
    except Exception:
        pass
    return out


def _opt_legs(date: str) -> list[dict]:
    """Top NBA/MLB optimizer legs (real odds), deduped by player+market+side, ranked by edge."""
    try:
        lp = json.loads((DATA / "parlays" / "optimizer" / f"{date}.json").read_text()).get("legPool", {})
        legs = lp.get("legs", []) or []
    except Exception:
        return []
    seen, ranked = set(), []
    for l in sorted(legs, key=lambda x: -(x.get("edgePct") or 0)):
        o = l.get("oddsForSide")
        sport = (l.get("sport") or "").lower()
        if o is None or sport not in ("mlb", "nba"):
            continue
        key = (sport, l.get("playerName"), l.get("market"), l.get("side"), l.get("line"))
        if key in seen:
            continue
        seen.add(key)
        ranked.append({
            "sport": sport, "sportLabel": sport.upper(), "gameId": l.get("gameId"),
            "label": f"{l.get('playerName')} · {l.get('marketLabel') or l.get('market')} {l.get('side','')} {l.get('line','')}".strip(),
            "sublabel": sport.upper(), "americanOdds": int(o), "prelineup": False, "regulationOnly": False,
            "edge": l.get("edgePct") or 0,
        })
        if len(ranked) >= MLB_NBA_LEG_CAP:
            break
    return ranked


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    wc, opt = _wc_legs(), _opt_legs(args.date)
    pools = {"world_cup": wc}
    for l in opt:
        pools.setdefault(l["sport"], []).append(l)
    active_sports = [s for s, ls in pools.items() if ls]

    # Cross-sport 2-leg combos (one leg per sport → different games → low correlation).
    combos = []
    sports = list(pools.keys())
    for i in range(len(sports)):
        for j in range(i + 1, len(sports)):
            for a in pools[sports[i]]:
                for b in pools[sports[j]]:
                    dec = _am_to_dec(a["americanOdds"]) * _am_to_dec(b["americanOdds"])
                    combos.append({"legs": [a, b], "dec": dec, "american": _dec_to_am(dec),
                                   "edge": (a.get("edge", 0) + b.get("edge", 0))})

    cards, reasons, used = [], [], set()
    seq = {"Low": 0, "Medium": 0, "High": 0, "Longshot": 0}
    for tier in ("Low", "Medium", "High", "Longshot"):
        pool = sorted([c for c in combos if _tier(c["american"]) == tier], key=lambda c: -c["edge"])
        placed = 0
        for c in pool:
            legs = c["legs"]
            # Low: no pre-lineup legs, no extreme underdog leg (each leg's odds reasonable).
            if tier == "Low" and (any(l["prelineup"] for l in legs) or any(l["americanOdds"] > 200 for l in legs)):
                continue
            key = frozenset((l["sport"], l["label"]) for l in legs)
            if key in used:
                continue
            used.add(key); seq[tier] += 1
            sport_labels = sorted({l["sportLabel"] for l in legs})
            bank_ok = (tier == "Low" and not any(l["prelineup"] for l in legs)
                       and BANK_TARGET_LOW <= c["american"] <= BANK_TARGET_HIGH)
            cards.append({
                "id": f"mix_{args.date}_{tier.lower()}_{seq[tier]:03d}",
                "date": args.date, "title": f"Mixed-sport {tier} card",
                "cardType": "mixed_sport", "riskTier": tier,
                "sports": sorted({l["sport"] for l in legs}), "sportLabels": sport_labels,
                "legs": [{"sport": l["sport"], "label": l["label"], "sublabel": l["sublabel"],
                          "americanOdds": l["americanOdds"]} for l in legs],
                "combinedAmericanOdds": c["american"], "defaultStake": 25,
                "isPublic": True, "bankBuilderEligible": bool(bank_ok),
                "caveats": (["Includes a 90-minute regulation soccer leg"] if any(l["regulationOnly"] for l in legs) else [])
                           + ["Legs span different sports/games (low correlation)", "Paper only — not betting advice"],
            })
            placed += 1
            if placed >= 2:
                break
        if placed < 2:
            reasons.append(f"{tier}: {placed} mixed card(s) — not enough cross-sport eligible legs in the {tier} odds range")

    payload = {
        "generatedAt": now, "date": args.date,
        "disclaimer": "Mixed-sport suggested paper cards from real, parlay-eligible legs across sports. "
                      "Educational/paper only, not betting advice.",
        "activeSports": active_sports, "poolSizes": {s: len(ls) for s, ls in pools.items()},
        "cardCount": len(cards), "byRisk": {t: sum(1 for c in cards if c["riskTier"] == t) for t in ("Low", "Medium", "High", "Longshot")},
        "cards": cards, "shortfall": reasons,
    }
    (DATA / "daily" / "cards").mkdir(parents=True, exist_ok=True)
    (DATA / "daily" / "cards" / f"{args.date}.json").write_text(json.dumps(payload, indent=2) + "\n")
    (DATA / "daily" / "cards" / "latest.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(f"[mixed-cards] sports={active_sports} pools={payload['poolSizes']} cards={len(cards)} byRisk={payload['byRisk']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
