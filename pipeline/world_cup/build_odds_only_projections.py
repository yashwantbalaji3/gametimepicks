"""
build_odds_only_projections — LIMITED-DATA, odds-only World Cup projections + cards.

WHY: API-Football (`API_FOOTBALL_KEY`) is the rich stats/lineups/team-strength
layer and is NOT configured. But The Odds API (`ODDS_API_KEY`, already used for
MLB) DOES carry `soccer_fifa_world_cup` h2h (3-way) + totals. So we can still
publish HONEST, market-implied World Cup projections — clearly labelled
`dataQuality: limited` (no stat/lineup/xG model) — instead of failing soccer
fully closed.

WHAT it produces (app schema, dated to --date in ET):
  - world-cup/projections/latest.json + /<date>.json : moneyline_90 (3-way de-vig)
    + totals_2_5 where the market has a 2.5 line. modelProbability == de-vigged
    market probability (edge ~0; we make NO independent stat claim).
  - world-cup/parlays/latest.json + /<date>.json : suggested cards from
    parlay-eligible favorite legs, by risk tier. Honest counts — never padded.

INTEGRITY: no fabricated stats/lineups/xG/player props; flags by real ISO code
(teams.json), no fabricated logos; only odds-backed legs; no card without ≥2
real legs; confidence capped because there is no stat layer.
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app" / "public" / "data" / "world-cup"
CACHE = ROOT / "pipeline" / "cache"
ET = ZoneInfo("America/New_York")
API_BASE = "https://api.the-odds-api.com/v4"
SPORT_KEY = "soccer_fifa_world_cup"
MODEL_VERSION = "wc-odds-only-v1"

# Strong-favorite floor for parlay eligibility (no stat layer ⇒ conservative).
PARLAY_PROB_FLOOR = 0.55


def american_to_decimal(o: float) -> float:
    return 1 + (o / 100 if o > 0 else 100 / abs(o))


def american_to_implied(o: float) -> float:
    return 100 / (o + 100) if o > 0 else abs(o) / (abs(o) + 100)


def schedule_ids(date: str) -> dict[tuple[str, str], int]:
    """(home, away) -> numeric schedule matchId, so WC ids stay consistent with
    the rest of the app (schedule/games/game-detail all key on the schedule id)."""
    try:
        sched = json.loads((DATA / "schedule.json").read_text()).get("matches", [])
    except Exception:
        return {}
    out: dict[tuple[str, str], int] = {}
    for m in sched:
        if m.get("date") == date and m.get("home") and m.get("away") and m.get("id") is not None:
            out[(m["home"].strip().lower(), m["away"].strip().lower())] = int(m["id"])
    return out


def team_codes() -> dict[str, str]:
    raw = json.loads((DATA / "teams.json").read_text())
    teams = raw if isinstance(raw, list) else raw.get("teams", [])
    codes = {t["name"]: t["code"] for t in teams if t.get("name") and t.get("code")}
    # alias safety net for alternate Odds-API spellings
    aliases = {"Cabo Verde": "Cape Verde", "Korea Republic": "South Korea",
               "IR Iran": "Iran", "USA": "United States", "KSA": "Saudi Arabia"}
    for a, real in aliases.items():
        if real in codes:
            codes[a] = codes[real]
    return codes


def fetch_odds(api_key: str, date: str) -> list[dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache = CACHE / f"wc_odds_{date}.json"
    if cache.exists():
        print(f"[wc-odds] using cache {cache.name}")
        return json.loads(cache.read_text())
    url = (f"{API_BASE}/sports/{SPORT_KEY}/odds?regions=us&markets=h2h,totals"
           f"&oddsFormat=american&apiKey={api_key}")
    with urllib.request.urlopen(url, timeout=30) as r:
        rem = r.headers.get("x-requests-remaining")
        body = json.loads(r.read().decode())
    print(f"[wc-odds] fetched {len(body)} events · credits remaining {rem}")
    cache.write_text(json.dumps(body, indent=2))
    return body


def et_date(commence_utc: str) -> str:
    dt = datetime.fromisoformat(commence_utc.replace("Z", "+00:00")).astimezone(ET)
    return dt.strftime("%Y-%m-%d")


def devig_three_way(prices: dict[str, float]) -> dict[str, float]:
    raw = {k: american_to_implied(v) for k, v in prices.items()}
    s = sum(raw.values()) or 1.0
    return {k: v / s for k, v in raw.items()}


def risk_tier_for(american: int) -> str:
    if american <= -150:
        return "Low"
    if american <= 130:
        return "Medium"
    if american <= 400:
        return "High"
    return "Longshot"


def build(date: str) -> dict:
    api_key = os.environ.get("ODDS_API_KEY", "").strip()
    if not api_key:
        print("[wc-odds] STOP ODDS_API_KEY not set")
        return {"error": "no_odds_key"}
    codes = team_codes()
    sched = schedule_ids(date)
    events = fetch_odds(api_key, date)
    matches: list[dict] = []
    for ev in events:
        if et_date(ev.get("commence_time", "")) != date:
            continue
        home, away = ev.get("home_team"), ev.get("away_team")
        books = ev.get("bookmakers", [])
        if not books or not home or not away:
            continue
        book = books[0]
        bk_key = book.get("key")
        h2h = next((m for m in book.get("markets", []) if m.get("key") == "h2h"), None)
        if not h2h:
            continue
        price = {o["name"]: o["price"] for o in h2h.get("outcomes", [])}
        if home not in price or away not in price or "Draw" not in price:
            continue
        dv = devig_three_way({"home": price[home], "draw": price["Draw"], "away": price[away]})
        # market favorite
        side = max(dv, key=dv.get)
        label = {"home": home, "draw": "Draw", "away": away}[side]
        pick_american = int(price[{"home": home, "draw": "Draw", "away": away}[side]])
        pick_prob = dv[side]
        outcomes = [
            {"label": home, "side": "home", "modelProbability": round(dv["home"], 4),
             "marketProbability": round(dv["home"], 4), "americanOdds": int(price[home])},
            {"label": "Draw", "side": "draw", "modelProbability": round(dv["draw"], 4),
             "marketProbability": round(dv["draw"], 4), "americanOdds": int(price["Draw"])},
            {"label": away, "side": "away", "modelProbability": round(dv["away"], 4),
             "marketProbability": round(dv["away"], 4), "americanOdds": int(price[away])},
        ]
        eligible = side != "draw" and pick_prob >= PARLAY_PROB_FLOOR
        slug = f"{home}_{away}".lower().replace(" ", "")
        # Prefer the numeric schedule matchId (consistent app-wide); fall back to
        # the Odds API event id only if the fixture isn't in the schedule.
        match_id = sched.get((home.strip().lower(), away.strip().lower()), ev.get("id"))
        matches.append({
            "sport": "world_cup", "date": date, "matchId": match_id,
            "homeTeam": home, "awayTeam": away, "kickoffUtc": ev.get("commence_time"),
            "homeCode": codes.get(home), "awayCode": codes.get(away),
            "homeLogo": None, "awayLogo": None, "regulationOnly": True,
            "sampleSizeWarning": True, "opponentStrengthCoverage": 0,
            "provider": "odds_api", "oddsProvider": "odds_api", "modelVersion": MODEL_VERSION,
            "dataQuality": "limited",
            "id": f"wc_{date}_{slug}_ml", "market": "moneyline_90",
            "pick": side, "pickLabel": label, "line": None, "americanOdds": pick_american,
            "bookmaker": bk_key, "modelProbability": round(pick_prob, 4),
            "marketProbability": round(pick_prob, 4), "edgePct": 0.0,
            "outcomes": outcomes,
            "confidence": "Lean" if pick_prob >= 0.62 else "Watchlist",
            "projectionStatus": "active", "public": True,
            "parlayEligible": eligible, "bankBuilderEligible": False,
            "statusReason": None, "settlementSupport": "regulation_90",
            "riskTier": risk_tier_for(pick_american),
            "factors": [], "caveats": [
                "Odds-only: no API-Football stat/lineup layer. Market-implied (de-vigged "
                "3-way), so model edge is ~0 — this is a market view, not a stat model.",
            ],
            "notes": [
                "Limited-data World Cup projection from The Odds API "
                "(soccer_fifa_world_cup). Confidence capped — no team/player stat model.",
            ],
        })

    now = datetime.now(timezone.utc).isoformat()
    elig = [m for m in matches if m["parlayEligible"]]
    proj = {
        "generatedAt": now, "sport": "world_cup", "date": date,
        "modelVersion": MODEL_VERSION, "provider": "odds_api", "oddsProvider": "odds_api",
        "strengthSource": "none", "dataQuality": "limited",
        "disclaimer": "Paper-only, educational. Limited-data: odds-backed market-implied "
                      "projections from The Odds API; no API-Football stat/lineup/xG layer.",
        "methodology": "3-way de-vig of sportsbook moneyline (home/draw/away). No independent "
                       "stat model, so confidence is capped and model edge is ~0.",
        "matchCount": len(matches), "projectionCount": len(matches),
        "publicCount": len(matches), "parlayEligibleCount": len(elig),
        "public": True, "opponentStrengthCoverage": 0,
        "statusCounts": {"active": len(matches)}, "matches": matches,
    }
    cards = build_cards(date, elig)
    return {"projections": proj, "parlays": cards}


def build_cards(date: str, elig: list[dict]) -> dict:
    """Suggested cards from parlay-eligible favorite ML legs. Honest counts only."""
    def leg(m: dict) -> dict:
        return {
            "matchId": m["matchId"], "match": f"{m['homeTeam']} vs {m['awayTeam']}",
            "market": "moneyline_90", "pick": m["pickLabel"], "americanOdds": m["americanOdds"],
            "modelProbability": m["modelProbability"], "marketProbability": m["marketProbability"],
            "edgePct": 0.0, "confidence": m["confidence"], "regulationOnly": True,
            "homeCode": m["homeCode"], "awayCode": m["awayCode"],
        }

    favs = sorted(elig, key=lambda m: m["modelProbability"], reverse=True)
    cards: list[dict] = []

    def make(card_id: str, tier: str, title: str, legs_src: list[dict], why: str):
        if len(legs_src) < 2:
            return
        legs = [leg(m) for m in legs_src]
        dec = 1.0
        for m in legs_src:
            dec *= american_to_decimal(m["americanOdds"])
        american = round((dec - 1) * 100) if dec >= 2 else -round(100 / (dec - 1))
        hit = 1.0
        for m in legs_src:
            hit *= m["modelProbability"]
        cards.append({
            "id": card_id, "sport": "world_cup", "riskTier": tier, "title": title,
            "legs": legs, "legCount": len(legs),
            "combinedAmericanOdds": american, "combinedDecimal": round(dec, 3),
            "defaultStake": 10, "projectedReturn": round(10 * dec, 2),
            "estimatedHitProbability": round(hit, 4), "regulationOnly": True,
            "whyThisCard": why, "correlationNotes": "Legs are different matches — no same-game correlation.",
            "dataCaveats": [
                "Limited soccer data: odds-backed market-implied (de-vigged 3-way).",
                "No API-Football stat/lineup layer — confidence is capped.",
            ],
            "combinedTotalEdgePct": 0.0, "single": False, "dataQuality": "limited",
        })

    if len(favs) >= 2:
        make(f"wc_{date}_low_001", "Low", "World Cup lower-risk card", favs[:2],
             "The two strongest market favorites today, different matches.")
    if len(favs) >= 3:
        make(f"wc_{date}_bal_001", "Medium", "World Cup balanced card", favs[:3],
             "Three market favorites across different matches — higher combined odds, more variance.")
    if len(favs) >= 4:
        make(f"wc_{date}_high_001", "High", "World Cup high-risk card", favs[:4],
             "Four-leg favorite stack — every leg must hold; meaningfully higher variance.")

    by_risk = {"Low": 0, "Medium": 0, "High": 0, "Longshot": 0}
    for c in cards:
        by_risk[c["riskTier"]] = by_risk.get(c["riskTier"], 0) + 1
    gate = []
    if len(favs) < 2:
        gate.append("not enough odds-backed World Cup favorite legs for a card")
    gate.append("Longshot tier omitted: no plus-money eligible WC leg today (favorites only).")
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(), "sport": "world_cup", "date": date,
        "disclaimer": "Paper-only, educational. Limited-data odds-backed cards (no stat layer).",
        "cardCount": len(cards), "byRisk": by_risk, "cards": cards,
        "gateReasons": gate, "sourceProjections": len(elig), "valueLegs": [],
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Odds-only World Cup projections + cards (limited data).")
    ap.add_argument("--date", required=True, help="ET slate date YYYY-MM-DD")
    args = ap.parse_args(argv)
    out = build(args.date)
    if out.get("error"):
        return 2
    (DATA / "projections").mkdir(parents=True, exist_ok=True)
    (DATA / "parlays").mkdir(parents=True, exist_ok=True)
    for name, doc in (("projections", out["projections"]), ("parlays", out["parlays"])):
        (DATA / name / f"{args.date}.json").write_text(json.dumps(doc, indent=2) + "\n")
        (DATA / name / "latest.json").write_text(json.dumps(doc, indent=2) + "\n")
    p, c = out["projections"], out["parlays"]
    print(f"[wc-odds] {args.date}: {p['matchCount']} matches, {p['parlayEligibleCount']} "
          f"parlay-eligible, {c['cardCount']} cards {c['byRisk']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
