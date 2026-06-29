"""
build_round_of_32_board — an INFORMATIONAL Round-of-32 model-pick board covering EVERY upcoming R32
fixture through a horizon date (default July 3 ET), independent of the daily active betting window.

This is NOT the Bank Builder / Moonshot pool — it never feeds the ladder. It is a broad prediction board:
real teams + kickoffs from The Odds API events list, and per-game de-vigged model picks (moneyline /
totals / BTTS / double-chance / draw-no-bet) for every game where the books have posted odds. Games with
no odds yet are included as status "odds_pending" with NO picks. Started/finished games are flagged
"started" so the UI never shows them as live/bettable.

INTEGRITY: no fabricated teams/odds/probabilities. Every pick is a de-vig of a real posted price; a game
with no posted odds shows no pick. Reuses the exact de-vig helpers from build_odds_only_projections.
"""
from __future__ import annotations
import argparse, json, os, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from build_odds_only_projections import (
    a2imp, a2d, devig_two, event_odds, pick_anchor_book, market_of,
    team_codes, schedule_ids, http_json, API_BASE, SPORT_KEY, ET,
)

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app" / "public" / "data" / "world-cup"


def confidence_for(fav_prob: float) -> str:
    if fav_prob >= 0.65: return "Strong"
    if fav_prob >= 0.55: return "Solid"
    if fav_prob >= 0.50: return "Lean"
    return "Coin-flip"


def slugify(s: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in s.lower()).strip("-").replace("--", "-")


def all_events(api_key: str) -> tuple[list[dict], str | None]:
    body, rem = http_json(f"{API_BASE}/sports/{SPORT_KEY}/events?apiKey={api_key}")
    return (body if isinstance(body, list) else []), rem


def build_row(ev: dict, now: datetime.datetime, codes: dict, slate_label: str, fetch: bool, api_key: str) -> dict:
    home, away = ev.get("home_team"), ev.get("away_team")
    ko = datetime.datetime.fromisoformat(ev["commence_time"].replace("Z", "+00:00"))
    et = ko.astimezone(ET)
    started = ko <= now
    base = {
        "eventId": ev["id"], "home": home, "away": away,
        "kickoffUtc": ev["commence_time"], "kickoffEt": et.strftime("%a %b %-d · %-I:%M %p ET"),
        "matchDate": et.strftime("%Y-%m-%d"),
        "homeCode": codes.get(home), "awayCode": codes.get(away),
        "gameSlug": f"{slugify(home or '')}-vs-{slugify(away or '')}-{slate_label}",
    }
    if started:
        return {**base, "status": "started", "picks": None,
                "note": "Kicked off — see Track Record once settled. Not a live bettable card."}
    # Only fetch odds for games we are willing to spend a credit on; cached games are free.
    cache = ROOT / "pipeline" / "cache" / f"wc_evodds_{ev['id']}.json"
    if not cache.exists() and not fetch:
        return {**base, "status": "odds_pending", "picks": None,
                "note": "Real odds not posted/fetched yet — included as upcoming, no model pick shown."}
    try:
        books = event_odds(api_key, ev["id"]).get("bookmakers", [])
    except Exception as e:
        return {**base, "status": "odds_pending", "picks": None, "note": f"Odds fetch unavailable ({type(e).__name__})."}
    book = pick_anchor_book(books)
    if not book or not home or not away:
        return {**base, "status": "odds_pending", "picks": None, "note": "No book is pricing this game yet."}

    picks: dict = {"bookmaker": book.get("key")}
    # 3-way moneyline (90') de-vig
    h2h = market_of(book, "h2h")
    fav_prob = 0.0
    if h2h:
        price = {o["name"]: o["price"] for o in h2h["outcomes"]}
        if home in price and away in price and "Draw" in price:
            raw = {k: a2imp(price[k]) for k in (home, "Draw", away)}
            s = sum(raw.values()) or 1.0
            dv = {k: raw[k] / s for k in raw}
            fav = home if dv[home] >= dv[away] else away
            fav_prob = dv[fav]
            picks["moneyline"] = {"pick": fav, "side": "home" if fav == home else "away",
                                  "americanOdds": int(price[fav]), "modelProbability": round(fav_prob, 4),
                                  "home": round(dv[home], 4), "draw": round(dv["Draw"], 4), "away": round(dv[away], 4)}
    # totals 2.5
    tot = market_of(book, "totals")
    if tot:
        lines: dict = {}
        for o in tot["outcomes"]:
            lines.setdefault(o.get("point"), {})[o["name"]] = o["price"]
        pt = 2.5 if 2.5 in lines else (min(lines, key=lambda x: abs((x or 99) - 2.5)) if lines else None)
        if pt is not None and "Over" in lines[pt] and "Under" in lines[pt]:
            po, pu = devig_two(a2imp(lines[pt]["Over"]), a2imp(lines[pt]["Under"]))
            pick = "Over" if po >= pu else "Under"
            picks["total"] = {"pick": f"{pick} {pt}", "line": pt, "americanOdds": int(lines[pt][pick]),
                              "modelProbability": round(max(po, pu), 4)}
    # BTTS
    btts = market_of(book, "btts")
    if btts:
        price = {o["name"]: o["price"] for o in btts["outcomes"]}
        if "Yes" in price and "No" in price:
            py, pn = devig_two(a2imp(price["Yes"]), a2imp(price["No"]))
            pick = "Yes" if py >= pn else "No"
            picks["btts"] = {"pick": f"BTTS {pick}", "americanOdds": int(price[pick]), "modelProbability": round(max(py, pn), 4)}
    # double chance (real book price) + DNB — for the "safer" market reads
    dc = market_of(book, "double_chance")
    if dc:
        for o in dc["outcomes"]:
            nm = o["name"].lower()
            if home and away and ((home.lower() in nm and "draw" in nm) or (away.lower() in nm and "draw" in nm)):
                side_team = home if home.lower() in nm else away
                # keep the favourite's "or draw" cover
                if picks.get("moneyline") and side_team == picks["moneyline"]["pick"]:
                    picks["doubleChance"] = {"pick": f"{side_team} or Draw", "americanOdds": int(o["price"]),
                                             "modelProbability": round((picks["moneyline"]["home"] if side_team == home else picks["moneyline"]["away"]) + picks["moneyline"]["draw"], 4)}
    dnb = market_of(book, "draw_no_bet")
    if dnb:
        price = {o["name"]: o["price"] for o in dnb["outcomes"]}
        if home in price and away in price and picks.get("moneyline"):
            fav = picks["moneyline"]["pick"]
            if fav in price:
                ph, pa = devig_two(a2imp(price[home]), a2imp(price[away]))
                picks["drawNoBet"] = {"pick": f"{fav} (DNB)", "americanOdds": int(price[fav]),
                                      "modelProbability": round(ph if fav == home else pa, 4)}

    # Best SAFER market = highest model-probability pick (lead-protecting); never an anchor, just a read.
    cands = [(k, v) for k, v in picks.items() if isinstance(v, dict) and "modelProbability" in v]
    safer = max(cands, key=lambda kv: kv[1]["modelProbability"], default=None)
    # Best VALUE market = highest-probability pick whose price is payable (between -200 and +300, not juiced).
    value_pool = [kv for kv in cands if -200 <= kv[1].get("americanOdds", -9999) <= 300]
    value = max(value_pool, key=lambda kv: kv[1]["modelProbability"], default=None)
    if safer: picks["saferMarket"] = {"market": safer[0], **{k: safer[1][k] for k in ("pick", "americanOdds", "modelProbability") if k in safer[1]}}
    if value: picks["valueMarket"] = {"market": value[0], **{k: value[1][k] for k in ("pick", "americanOdds", "modelProbability") if k in value[1]}}

    return {**base, "status": "live_odds", "confidence": confidence_for(fav_prob), "picks": picks,
            "note": None}


def build(horizon: str, slate_label: str, fetch_future: bool) -> dict:
    api_key = os.environ.get("ODDS_API_KEY", "").strip()
    if not api_key:
        return {"error": "no_odds_key"}
    codes = team_codes()
    events, rem = all_events(api_key)
    print(f"[r32] {len(events)} events listed · credits remaining {rem}")
    now = datetime.datetime.now(datetime.timezone.utc)
    horizon_date = datetime.date.fromisoformat(horizon)
    rows = []
    for ev in sorted(events, key=lambda e: e["commence_time"]):
        et = datetime.datetime.fromisoformat(ev["commence_time"].replace("Z", "+00:00")).astimezone(ET)
        if et.date() > horizon_date:
            continue
        rows.append(build_row(ev, now, codes, slate_label, fetch_future, api_key))
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
    return {
        "generatedAt": now.isoformat(), "sport": "world_cup", "stage": "Round of 32",
        "horizonEt": horizon, "slateLabel": slate_label,
        "disclaimer": "Paper-only, educational. Informational Round-of-32 model-pick board — de-vigged from "
                      "real posted odds (The Odds API). Not betting advice; not the Bank Builder ladder. "
                      "90-minute markets only; advancement is a de-vig proxy, not an outright market.",
        "gameCount": len(rows), "byStatus": by_status, "games": rows,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Round of 32 informational model-pick board.")
    ap.add_argument("--horizon", default="2026-07-03", help="last ET date to include (YYYY-MM-DD)")
    ap.add_argument("--slate-label", default="2026-06-28", help="slate label used in game slugs (active-window date)")
    ap.add_argument("--fetch-future", action="store_true", help="fetch odds for not-yet-cached games (spends credits)")
    args = ap.parse_args(argv)
    out = build(args.horizon, args.slate_label, args.fetch_future)
    if out.get("error"):
        print("[r32] STOP", out["error"]); return 2
    (DATA / "round-of-32").mkdir(parents=True, exist_ok=True)
    (DATA / "round-of-32" / "board.json").write_text(json.dumps(out, indent=2) + "\n")
    (DATA / "round-of-32" / "board-latest.json").write_text(json.dumps(out, indent=2) + "\n")
    print(f"[r32] board: {out['gameCount']} games {out['byStatus']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
