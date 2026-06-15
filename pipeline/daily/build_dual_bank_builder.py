"""
build_dual_bank_builder — launch TWO parallel Bank Builder lanes (Lane A / Lane B) from
the strongest ELIGIBLE, UPCOMING, odds-backed legs across today's slate (WC + MLB).

Each lane = a 2-leg paper parlay, $100 stake, targeting ~$200 return (combined ≈ +100).
Lane A = lower-variance / highest model-probability pair. Lane B = a differentiated,
slightly-higher-return pair sharing no leg or game with Lane A.

INTEGRITY: legs are real and odds-backed; only events with commence_time in the future
(not started/settled) are eligible; no fabrication. Writes a NEW artifact
(bank-builder/dual-lanes-{latest,<date>}.json) — the COMPLETED first run is never touched.
Fails closed (status: insufficient) if fewer than 4 eligible legs or no valid pair.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app" / "public" / "data"
BB = DATA / "bank-builder"

TARGET_LO, TARGET_HI = 1.80, 2.45  # combined decimal window (~+80 .. +145)
MIN_MODEL_PROB = 0.60


def a2d(o: float) -> float:
    return 1 + (o / 100 if o > 0 else 100 / abs(o))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def is_future(iso: str | None, now: datetime) -> bool:
    if not iso:
        return False
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")) > now
    except Exception:
        return False


def mlb_safe_market(market: str | None, side: str, line) -> bool:
    """Bank Builder MLB lower-variance market gate (owner feedback: avoid high-variance
    legs like Over 1.5 hits). Allow only lower-variance markets:
      - batter_hits: Over ONLY at the 0.5 line (1+ hit); Under any line.
      - pitcher_strikeouts: either side (graded off a stable distribution).
      - batter_total_bases / batter_hits_runs_rbis: Under only (Over is volatile).
    Everything else is excluded from the Dual Bank Builder."""
    if market == "batter_hits":
        return (line is not None and line <= 0.5) if side == "Over" else True
    if market == "pitcher_strikeouts":
        return True
    if market in ("batter_total_bases", "batter_hits_runs_rbis"):
        return side == "Under"
    return False


def mlb_legs(now: datetime) -> list[dict]:
    p = DATA / "mlb" / "boards" / "2026-06-15.json"
    try:
        leans = json.loads(p.read_text()).get("leans", [])
    except Exception:
        return []
    out = []
    for l in leans:
        if l.get("confidence") != "High" or not is_future(l.get("commenceTime"), now):
            continue
        side = l.get("lean")
        if side not in ("Over", "Under"):
            continue
        if not mlb_safe_market(l.get("marketKey"), side, l.get("line")):
            continue
        odds = l.get("oddsOver") if side == "Over" else l.get("oddsUnder")
        prob = l.get("modelProbOver") if side == "Over" else l.get("modelProbUnder")
        if not isinstance(odds, (int, float)) or odds == 0 or not isinstance(prob, (int, float)):
            continue
        if prob < MIN_MODEL_PROB:
            continue
        out.append({
            "sport": "mlb", "sportLabel": "MLB",
            "gameId": str(l.get("gameId")),
            "gameLabel": f"{l.get('awayTeamAbbr')} @ {l.get('homeTeamAbbr')}",
            "market": l.get("marketKey"), "marketLabel": l.get("marketLabel"),
            "pick": f"{l.get('playerName')} {side} {l.get('line')}",
            "playerName": l.get("playerName"), "team": l.get("playerTeamAbbr"),
            "americanOdds": int(odds), "decimal": a2d(odds), "modelProbability": round(prob, 4),
            "confidence": "High", "commenceTime": l.get("commenceTime"),
            "dataQuality": "A", "edgePct": l.get("edgePct"),
        })
    return out


def wc_legs(now: datetime) -> list[dict]:
    p = DATA / "world-cup" / "projections" / "latest.json"
    try:
        matches = json.loads(p.read_text()).get("matches", [])
    except Exception:
        return []
    out = []
    for m in matches:
        if not m.get("parlayEligible") or not is_future(m.get("kickoffUtc"), now):
            continue
        odds = m.get("americanOdds")
        prob = m.get("modelProbability")
        if not isinstance(odds, (int, float)) or odds == 0 or not isinstance(prob, (int, float)):
            continue
        if prob < MIN_MODEL_PROB:
            continue
        form = None
        if m.get("homeForm") or m.get("awayForm"):
            hf = (m.get("homeForm") or {}).get("formString")
            af = (m.get("awayForm") or {}).get("formString")
            form = f"{m['homeTeam']} {hf or '—'} · {m['awayTeam']} {af or '—'}"
        out.append({
            "sport": "world_cup", "sportLabel": "World Cup",
            "gameId": str(m.get("matchId")),
            "gameLabel": f"{m.get('homeTeam')} vs {m.get('awayTeam')}",
            "market": m.get("market"), "marketLabel": m.get("market"),
            "pick": m.get("pickLabel"),
            "homeCode": m.get("homeCode"), "awayCode": m.get("awayCode"),
            "recentForm": form, "group": m.get("group"),
            "americanOdds": int(odds), "decimal": a2d(odds), "modelProbability": round(prob, 4),
            "confidence": m.get("confidence"), "commenceTime": m.get("kickoffUtc"),
            "dataQuality": m.get("dataQuality", "B"), "edgePct": m.get("edgePct"),
        })
    return out


def best_pair(pool: list[dict], lo: float, hi: float, exclude_games: set[str],
              exclude_keys: set[str], prefer_cross_sport: bool) -> tuple[dict, dict] | None:
    """Highest combined model-probability 2-leg pair (different games) with combined
    decimal in [lo, hi], skipping excluded games/legs."""
    cand = [l for l in pool if l["gameId"] not in exclude_games
            and f"{l['gameId']}|{l['pick']}" not in exclude_keys]
    cand.sort(key=lambda l: l["modelProbability"], reverse=True)
    best = None
    best_score = -1.0
    for i in range(len(cand)):
        for j in range(i + 1, len(cand)):
            a, b = cand[i], cand[j]
            if a["gameId"] == b["gameId"]:
                continue
            dec = a["decimal"] * b["decimal"]
            if dec < lo or dec > hi:
                continue
            cross = a["sport"] != b["sport"]
            # score: joint model prob + nudges for cross-sport diversification and
            # preferred lower-variance markets (soccer double chance heavily preferred).
            score = (a["modelProbability"] * b["modelProbability"]) \
                + (0.05 if cross and prefer_cross_sport else 0) \
                + market_pref(a) + market_pref(b)
            if score > best_score:
                best_score, best = score, (a, b)
    return best


def market_pref(leg: dict) -> float:
    """Selection bonus for lower-variance, owner-preferred markets."""
    m = leg.get("market")
    if m == "double_chance":
        return 0.06  # soccer double chance — preferred heavily
    if m == "draw_no_bet":
        return 0.03
    if m == "batter_hits" and "Over 0.5" in (leg.get("pick") or ""):
        return 0.03  # 1+ hit — the steadiest MLB prop
    return 0.0


def make_lane(lane: str, name: str, thesis: str, legs: tuple[dict, dict], why: str) -> dict:
    dec = legs[0]["decimal"] * legs[1]["decimal"]
    american = round((dec - 1) * 100) if dec >= 2 else -round(100 / (dec - 1))
    joint = round(legs[0]["modelProbability"] * legs[1]["modelProbability"], 4)
    tier = "Lower risk" if dec <= 2.1 else "Balanced"
    return {
        "lane": lane, "name": name, "thesis": thesis, "riskTier": tier,
        "stake": 100, "combinedDecimal": round(dec, 3), "combinedAmericanOdds": american,
        "projectedReturn": round(100 * dec, 2), "projectedProfit": round(100 * (dec - 1), 2),
        "combinedModelProbability": joint, "status": "pending",
        "legs": list(legs), "whyThisLane": why,
        "dataQuality": "A" if all(l["dataQuality"] == "A" for l in legs) else "B",
        "startTimes": [l["commenceTime"] for l in legs],
        "settlementSource": "official box score (MLB Stats API) / official final score (API-Football), regulation 90",
    }


def build(date: str) -> dict:
    now = now_utc()
    pool = mlb_legs(now) + wc_legs(now)
    diag = {"eligibleLegs": len(pool), "mlb": len([l for l in pool if l["sport"] == "mlb"]),
            "world_cup": len([l for l in pool if l["sport"] == "world_cup"])}
    if len(pool) < 4:
        return {"status": "insufficient", "reason": f"only {len(pool)} eligible upcoming odds-backed legs (<4)",
                "diagnostics": diag, "date": date}

    # Lane A — lower variance, ~$190-210: highest joint model prob + preferred markets.
    a = best_pair(pool, 1.88, 2.12, set(), set(), prefer_cross_sport=True)
    if not a:
        a = best_pair(pool, 1.78, 2.25, set(), set(), prefer_cross_sport=True)
    if not a:
        return {"status": "insufficient", "reason": "no valid Lane A pair in the target return window",
                "diagnostics": diag, "date": date}
    used_games = {a[0]["gameId"], a[1]["gameId"]}
    used_keys = {f"{a[0]['gameId']}|{a[0]['pick']}", f"{a[1]['gameId']}|{a[1]['pick']}"}

    # Lane B — differentiated, slightly higher return ~$200-240; shares no game with Lane A.
    b = best_pair(pool, 2.00, 2.40, used_games, used_keys, prefer_cross_sport=True)
    if not b:
        b = best_pair(pool, 1.90, 2.45, used_games, used_keys, prefer_cross_sport=True)
    if not b:
        return {"status": "insufficient", "reason": "could not form a distinct Lane B (no shared game with A)",
                "diagnostics": diag, "date": date}

    laneA = make_lane("A", "Lane A", "Lower-variance / highest model-probability pair", a,
                      "The two highest model-probability eligible legs that combine near a "
                      "+100 return, from different games — the steadier lane.")
    laneB = make_lane("B", "Lane B", "Differentiated / slightly higher return", b,
                      "A separate two-leg pair (no shared game with Lane A) at a longer combined "
                      "price — a differentiated, higher-variance thesis.")
    return {
        "generatedAt": now.isoformat(), "date": date, "status": "pending",
        "type": "dual_bank_builder", "runStatus": "active", "runNumber": 2, "startDate": date,
        "name": "Dual Bank Builder", "step": 1, "stakePerLane": 100, "stepTarget": 200,
        "disclaimer": "Paper-only, educational. Two parallel paper ladders launched June 15 from "
                      "real, odds-backed, UPCOMING legs. The bankroll only changes after official "
                      "settlement. The completed first run ($100 → $10,376.17) is unchanged.",
        "lanes": [laneA, laneB], "diagnostics": diag,
        "priceSource": "the_odds_api", "statSource": "api_football",
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Launch Dual Bank Builder lanes from today's eligible legs.")
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    out = build(args.date)
    BB.mkdir(parents=True, exist_ok=True)
    for name in (f"dual-lanes-{args.date}.json", "dual-lanes-latest.json"):
        (BB / name).write_text(json.dumps(out, indent=2) + "\n")
    if out.get("status") == "pending":
        for i, ln in enumerate(out["lanes"]):
            legs = " + ".join(f"{l['pick']} ({l['americanOdds']:+d})" for l in ln["legs"])
            print(f"  Lane {ln['lane']}: {legs} = {ln['combinedAmericanOdds']:+d} "
                  f"(${ln['projectedReturn']}) · joint model {round(ln['combinedModelProbability']*100)}%")
    else:
        print(f"  STATUS {out['status']}: {out.get('reason')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
