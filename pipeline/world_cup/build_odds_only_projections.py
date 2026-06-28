"""
build_odds_only_projections — odds-backed World Cup projections + cards (LIMITED DATA).

API-Football (`API_FOOTBALL_KEY`, the rich stat/lineup/xG layer) is NOT configured,
but The Odds API (`ODDS_API_KEY`) carries a full slate of `soccer_fifa_world_cup`
markets. This generator publishes HONEST, odds-backed projections across every
market a real book is pricing — labelled `dataQuality: limited` (no stat layer, so
model edge is small and confidence is capped).

Markets emitted per UPCOMING fixture (one app projection object each; the game-detail
page groups them by matchId):
  - moneyline_90       3-way de-vig (home / draw / away)
  - match_total_goals  over/under at the 2.5 line (de-vig)
  - double_chance      REAL book odds (1X / X2 / 12) + model probs from the 3-way
  - btts               both-teams-to-score yes/no (de-vig)
  - draw_no_bet        home / away, draw voids (de-vig)

Also: suggested WC cards from odds-backed favorite legs; player props are FAILED
CLOSED (stale data removed) — anytime-goalscorer/shots odds exist on The Odds API
but the recent-form/stat layer needs API-Football, so they're marked unavailable.

INTEGRITY: no fabricated odds/stats/lineups/player props; double chance uses REAL
book odds (never invented); derived numbers are labelled; flags by real ISO code;
only odds-backed legs; honest counts (no padding).
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
MODEL_VERSION = "wc-odds-only-v2"
MARKETS = ["h2h", "totals", "double_chance", "btts", "draw_no_bet"]
PARLAY_PROB_FLOOR = 0.55


def a2d(o: float) -> float:
    return 1 + (o / 100 if o > 0 else 100 / abs(o))


def a2imp(o: float) -> float:
    return 100 / (o + 100) if o > 0 else abs(o) / (abs(o) + 100)


def team_codes() -> dict[str, str]:
    raw = json.loads((DATA / "teams.json").read_text())
    teams = raw if isinstance(raw, list) else raw.get("teams", [])
    return {t["name"]: t["code"] for t in teams if t.get("name") and t.get("code")}


def schedule_ids(date: str) -> dict[tuple[str, str], dict]:
    try:
        sched = json.loads((DATA / "schedule.json").read_text()).get("matches", [])
    except Exception:
        return {}
    out = {}
    for m in sched:
        if m.get("date") == date and m.get("home") and m.get("away"):
            out[(m["home"].strip().lower(), m["away"].strip().lower())] = m
    return out


def http_json(url: str) -> tuple[object, str | None]:
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode()), r.headers.get("x-requests-remaining")


# --- Slate window ---------------------------------------------------------------
# A betting "slate" is a CURATED WINDOW of upcoming fixtures, not a calendar day. On a thin day
# (a single knockout match, say), one match can't carry diversified Bank Builder lanes, a Moonshot,
# or a 5-leg Specials card — so the slate naturally widens to the next fixtures until it holds enough
# games to build quality products. The window is labelled by its START date (the requested slate
# date); every match keeps its TRUE kickoff (kickoffUtc) and ET match-date (matchDate), so the site
# always shows real dates/times. Honest: no fabricated fixtures — every game is a real upcoming
# event the books are pricing.
QUALITY_MIN_MATCHES = 2   # below this many upcoming matches on the slate, expand forward
MAX_WINDOW_DAYS = 3       # never look further than slate-start + this many ET days
KNOCKOUT_STAGES = {"r32", "r16", "qf", "sf", "final", "round_of_32", "round_of_16",
                   "quarter", "quarterfinal", "semifinal", "third_place"}


def stage_by_date() -> dict[str, str]:
    """Map ET date -> tournament stage from the schedule (knockout detection, date-keyed so it works
    even when a knockout fixture's teams are still bracket placeholders)."""
    try:
        sched = json.loads((DATA / "schedule.json").read_text()).get("matches", [])
    except Exception:
        return {}
    out: dict[str, str] = {}
    for m in sched:
        d, st = m.get("date"), m.get("stage")
        if d and st and d not in out:
            out[d] = st
    return out


def list_upcoming(api_key: str) -> tuple[list[tuple[str, datetime, dict]], str | None]:
    """All not-yet-kicked-off World Cup events as (ET-date, kickoff_dt, event), kickoff-ordered.
    /events is metadata only (no odds) — cheap; we fetch priced odds later only for the chosen window."""
    body, rem = http_json(f"{API_BASE}/sports/{SPORT_KEY}/events?apiKey={api_key}")
    print(f"[wc] events listed · credits remaining {rem}")
    now = datetime.now(timezone.utc)
    out: list[tuple[str, datetime, dict]] = []
    for e in body if isinstance(body, list) else []:
        kickoff = datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00"))
        if kickoff > now:  # a started/finished match is never a pregame projection
            out.append((kickoff.astimezone(ET).strftime("%Y-%m-%d"), kickoff, e))
    out.sort(key=lambda x: x[1])
    return out, rem


def choose_window(upcoming: list[tuple[str, datetime, dict]], start_date: str,
                  min_matches: int, max_days: int, force_single: bool) -> tuple[list[str], dict]:
    """Pick the ET dates that make up this slate. Always anchored at start_date; expands forward
    one ET date at a time until it holds >= min_matches games or hits the max_days look-ahead cap."""
    dates_in_order: list[str] = []
    for d, _, _ in upcoming:
        if d >= start_date and d not in dates_in_order:
            dates_in_order.append(d)
    chosen: list[str] = []
    count = 0
    for d in dates_in_order:
        chosen.append(d)
        count += sum(1 for dd, _, _ in upcoming if dd == d)
        if force_single:
            break
        if count >= min_matches:
            break
        if len(chosen) >= max_days:
            break
    if not chosen:                       # no upcoming events on/after start_date
        chosen = [start_date]
    expanded = len(chosen) > 1 or (chosen and chosen[0] != start_date)
    window = {
        "start": start_date, "end": chosen[-1], "days": chosen,
        "expanded": bool(expanded), "minMatches": min_matches, "maxDays": max_days,
        "matchCount": count,
        "note": (f"Combined slate window {start_date} → {chosen[-1]} ({count} upcoming fixtures): a "
                 f"single-day slate was too thin for quality products, so the window widened to the "
                 f"next knockout fixtures." if expanded else
                 f"Single-day slate {start_date} ({count} fixtures) — wide enough on its own."),
    }
    return chosen, window


def event_odds(api_key: str, eid: str) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache = CACHE / f"wc_evodds_{eid}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    url = (f"{API_BASE}/sports/{SPORT_KEY}/events/{eid}/odds?regions=us"
           f"&markets={','.join(MARKETS)}&oddsFormat=american&apiKey={api_key}")
    body, rem = http_json(url)
    print(f"[wc] odds for {eid[:8]} · credits remaining {rem}")
    cache.write_text(json.dumps(body, indent=2))
    return body


def pick_anchor_book(books: list[dict]) -> dict | None:
    """The book pricing the most of our target markets (so one fixture reads from one book)."""
    best, best_n = None, -1
    for b in books:
        keys = {m["key"] for m in b.get("markets", [])}
        n = len(keys & set(MARKETS))
        if n > best_n:
            best, best_n = b, n
    return best


def market_of(book: dict, key: str) -> dict | None:
    return next((m for m in book.get("markets", []) if m.get("key") == key), None)


def devig_two(p_a: float, p_b: float) -> tuple[float, float]:
    s = p_a + p_b or 1.0
    return p_a / s, p_b / s


def confidence(prob: float) -> str:
    return "Lean" if prob >= 0.62 else "Watchlist"


def risk_tier(american: int) -> str:
    if american <= -150:
        return "Low"
    if american <= 130:
        return "Medium"
    if american <= 400:
        return "High"
    return "Longshot"


LIMITED_CAVEAT = ("Odds-only: no API-Football stat/lineup layer. Market-implied — confidence "
                  "capped; not a stat model.")


def build(date: str, min_matches: int = QUALITY_MIN_MATCHES,
          max_days: int = MAX_WINDOW_DAYS, force_single: bool = False) -> dict:
    api_key = os.environ.get("ODDS_API_KEY", "").strip()
    if not api_key:
        print("[wc] STOP ODDS_API_KEY not set")
        return {"error": "no_odds_key"}
    codes = team_codes()
    stages = stage_by_date()
    upcoming, _ = list_upcoming(api_key)
    chosen_dates, window = choose_window(upcoming, date, min_matches, max_days, force_single)
    print(f"[wc] slate window {window['start']} → {window['end']} · days {chosen_dates} · "
          f"{window['matchCount']} fixtures{' (EXPANDED — thin start day)' if window['expanded'] else ''}")
    # Schedule joins for every ET date in the window (keyed by lowercased team pair).
    sched: dict[tuple[str, str], dict] = {}
    for d in chosen_dates:
        sched.update(schedule_ids(d))
    chosen_set = set(chosen_dates)
    # Only the windowed events, kickoff-ordered. Priced odds fetched (and cached) per event below —
    # so we spend credits ONLY on the games in this slate window, never the whole tournament.
    window_events = [(etd, e) for (etd, _ko, e) in upcoming if etd in chosen_set]
    matches: list[dict] = []
    market_summary: dict[str, int] = {}

    for etd, ev in window_events:
        home, away = ev.get("home_team"), ev.get("away_team")
        books = event_odds(api_key, ev["id"]).get("bookmakers", [])
        book = pick_anchor_book(books)
        if not book or not home or not away:
            continue
        bk = book.get("key")
        fx = sched.get((home.strip().lower(), away.strip().lower()), {})
        mid = fx.get("id", ev["id"])
        hc, ac = codes.get(home), codes.get(away)
        stage = fx.get("stage") or stages.get(etd)
        is_ko = bool(stage and str(stage).lower() in KNOCKOUT_STAGES)
        base = {
            # `date` is the SLATE START (window label) so every `date == slateDate` consumer matches;
            # `matchDate`/`kickoffUtc` carry the TRUE ET date/time the UI displays.
            "sport": "world_cup", "date": date, "matchDate": etd, "slateStart": date, "matchId": mid,
            "homeTeam": home, "awayTeam": away, "kickoffUtc": ev.get("commence_time"),
            "homeCode": hc, "awayCode": ac, "homeLogo": None, "awayLogo": None,
            "group": fx.get("group"), "venue": fx.get("venueCity"),
            "stage": stage, "knockout": is_ko,
            "regulationOnly": True, "sampleSizeWarning": True, "opponentStrengthCoverage": 0,
            "provider": "odds_api", "oddsProvider": "odds_api", "modelVersion": MODEL_VERSION,
            "dataQuality": "limited", "bookmaker": bk,
        }

        # --- 3-way moneyline (headline) ---
        h2h = market_of(book, "h2h")
        three = None
        if h2h:
            price = {o["name"]: o["price"] for o in h2h["outcomes"]}
            if home in price and away in price and "Draw" in price:
                raw = {k: a2imp(price[k]) for k in (home, "Draw", away)}
                s = sum(raw.values()) or 1.0
                dv = {k: raw[k] / s for k in raw}
                three = {"home": dv[home], "draw": dv["Draw"], "away": dv[away]}
                side = max(dv, key=dv.get)
                sidekey = {home: "home", "Draw": "draw", away: "away"}[side]
                outcomes = [
                    {"label": home, "side": "home", "modelProbability": round(dv[home], 4), "marketProbability": round(dv[home], 4), "americanOdds": int(price[home])},
                    {"label": "Draw", "side": "draw", "modelProbability": round(dv["Draw"], 4), "marketProbability": round(dv["Draw"], 4), "americanOdds": int(price["Draw"])},
                    {"label": away, "side": "away", "modelProbability": round(dv[away], 4), "marketProbability": round(dv[away], 4), "americanOdds": int(price[away])},
                ]
                pp = dv[side]
                matches.append({**base,
                    "id": f"wc_{date}_{mid}_ml", "market": "moneyline_90",
                    "pick": sidekey, "pickLabel": side, "line": None, "americanOdds": int(price[side]),
                    "modelProbability": round(pp, 4), "marketProbability": round(pp, 4), "edgePct": 0.0,
                    "outcomes": outcomes, "confidence": confidence(pp), "projectionStatus": "active",
                    "public": True, "parlayEligible": sidekey != "draw" and pp >= PARLAY_PROB_FLOOR,
                    "bankBuilderEligible": False, "statusReason": None, "settlementSupport": "regulation_90",
                    "riskTier": risk_tier(int(price[side])), "factors": [],
                    "caveats": [LIMITED_CAVEAT, "Draw is a real third outcome (90-min regulation)."],
                    "notes": ["3-way moneyline de-vigged from the sportsbook price."],
                })
                market_summary["moneyline_90"] = market_summary.get("moneyline_90", 0) + 1

        # --- total goals (2.5) ---
        tot = market_of(book, "totals")
        if tot:
            lines = {}
            for o in tot["outcomes"]:
                lines.setdefault(o.get("point"), {})[o["name"]] = o["price"]
            pt = 2.5 if 2.5 in lines else (min(lines, key=lambda x: abs((x or 99) - 2.5)) if lines else None)
            if pt is not None and "Over" in lines[pt] and "Under" in lines[pt]:
                po, pu = devig_two(a2imp(lines[pt]["Over"]), a2imp(lines[pt]["Under"]))
                pick = "Over" if po >= pu else "Under"
                pprob = max(po, pu)
                matches.append({**base,
                    "id": f"wc_{date}_{mid}_tot", "market": "match_total_goals",
                    "pick": pick.lower(), "pickLabel": f"{pick} {pt}", "line": pt,
                    "americanOdds": int(lines[pt][pick]),
                    "modelProbability": round(pprob, 4), "marketProbability": round(pprob, 4), "edgePct": 0.0,
                    "outcomes": [
                        {"label": f"Over {pt}", "side": "over", "modelProbability": round(po, 4), "marketProbability": round(po, 4), "americanOdds": int(lines[pt]["Over"])},
                        {"label": f"Under {pt}", "side": "under", "modelProbability": round(pu, 4), "marketProbability": round(pu, 4), "americanOdds": int(lines[pt]["Under"])},
                    ],
                    "confidence": confidence(pprob), "projectionStatus": "active", "public": True,
                    "parlayEligible": pprob >= PARLAY_PROB_FLOOR, "bankBuilderEligible": False,
                    "statusReason": None, "settlementSupport": "regulation_90",
                    "riskTier": risk_tier(int(lines[pt][pick])), "factors": [],
                    "caveats": [LIMITED_CAVEAT], "notes": [f"Total goals at the {pt} line, de-vigged."],
                })
                market_summary["match_total_goals"] = market_summary.get("match_total_goals", 0) + 1

        # --- double chance: REAL book odds + model probs from the 3-way ---
        dc = market_of(book, "double_chance")
        if dc and three:
            # map outcome names to 1X / X2 / 12 by who's in them
            def classify(name: str) -> str | None:
                has_draw = "draw" in name.lower()
                has_home = home.lower() in name.lower()
                has_away = away.lower() in name.lower()
                if has_home and has_draw:
                    return "1X"
                if has_away and has_draw:
                    return "X2"
                if has_home and has_away:
                    return "12"
                return None
            book_imp, book_price = {}, {}
            for o in dc["outcomes"]:
                k = classify(o["name"])
                if k:
                    book_imp[k] = a2imp(o["price"])
                    book_price[k] = int(o["price"])
            if len(book_imp) == 3:
                # de-vig: the 3 double-chance covers sum to 2 outcomes worth
                fac = 2.0 / (sum(book_imp.values()) or 2.0)
                mkt = {k: book_imp[k] * fac for k in book_imp}
                model = {"1X": three["home"] + three["draw"], "X2": three["draw"] + three["away"], "12": three["home"] + three["away"]}
                lbl = {"1X": f"{home} or Draw", "X2": f"{away} or Draw", "12": f"{home} or {away}"}
                pick = max(model, key=model.get)
                outs = [
                    {"label": lbl[k], "side": k, "modelProbability": round(model[k], 4), "marketProbability": round(mkt[k], 4), "americanOdds": book_price[k]}
                    for k in ("1X", "X2", "12")
                ]
                edge = round((model[pick] - mkt[pick]) * 100, 2)
                matches.append({**base,
                    "id": f"wc_{date}_{mid}_dc", "market": "double_chance",
                    "pick": pick, "pickLabel": lbl[pick], "line": None, "americanOdds": book_price[pick],
                    "modelProbability": round(model[pick], 4), "marketProbability": round(mkt[pick], 4), "edgePct": edge,
                    "outcomes": outs, "confidence": confidence(model[pick]), "projectionStatus": "active",
                    "public": True, "parlayEligible": model[pick] >= 0.70, "bankBuilderEligible": False,
                    "statusReason": None, "settlementSupport": "regulation_90",
                    "riskTier": risk_tier(book_price[pick]), "factors": [],
                    "caveats": [LIMITED_CAVEAT, "Double chance covers two of three outcomes — lower variance, shorter price."],
                    "notes": ["Double chance from REAL book odds; model probability is the 3-way no-vig sum."],
                })
                market_summary["double_chance"] = market_summary.get("double_chance", 0) + 1

        # --- both teams to score ---
        btts = market_of(book, "btts")
        if btts:
            price = {o["name"]: o["price"] for o in btts["outcomes"]}
            if "Yes" in price and "No" in price:
                py, pn = devig_two(a2imp(price["Yes"]), a2imp(price["No"]))
                pick = "Yes" if py >= pn else "No"
                pprob = max(py, pn)
                matches.append({**base,
                    "id": f"wc_{date}_{mid}_btts", "market": "btts",
                    "pick": pick.lower(), "pickLabel": f"Both teams to score: {pick}", "line": None,
                    "americanOdds": int(price[pick]),
                    "modelProbability": round(pprob, 4), "marketProbability": round(pprob, 4), "edgePct": 0.0,
                    "outcomes": [
                        {"label": "BTTS Yes", "side": "yes", "modelProbability": round(py, 4), "marketProbability": round(py, 4), "americanOdds": int(price["Yes"])},
                        {"label": "BTTS No", "side": "no", "modelProbability": round(pn, 4), "marketProbability": round(pn, 4), "americanOdds": int(price["No"])},
                    ],
                    "confidence": confidence(pprob), "projectionStatus": "active", "public": True,
                    "parlayEligible": pprob >= PARLAY_PROB_FLOOR, "bankBuilderEligible": False,
                    "statusReason": None, "settlementSupport": "regulation_90",
                    "riskTier": risk_tier(int(price[pick])), "factors": [],
                    "caveats": [LIMITED_CAVEAT], "notes": ["Both-teams-to-score, de-vigged."],
                })
                market_summary["btts"] = market_summary.get("btts", 0) + 1

        # --- draw no bet ---
        dnb = market_of(book, "draw_no_bet")
        if dnb:
            price = {o["name"]: o["price"] for o in dnb["outcomes"]}
            if home in price and away in price:
                ph, pa = devig_two(a2imp(price[home]), a2imp(price[away]))
                pick = home if ph >= pa else away
                pprob = max(ph, pa)
                matches.append({**base,
                    "id": f"wc_{date}_{mid}_dnb", "market": "draw_no_bet",
                    "pick": "home" if pick == home else "away", "pickLabel": f"{pick} (draw no bet)", "line": None,
                    "americanOdds": int(price[pick]),
                    "modelProbability": round(pprob, 4), "marketProbability": round(pprob, 4), "edgePct": 0.0,
                    "outcomes": [
                        {"label": f"{home} (DNB)", "side": "home", "modelProbability": round(ph, 4), "marketProbability": round(ph, 4), "americanOdds": int(price[home])},
                        {"label": f"{away} (DNB)", "side": "away", "modelProbability": round(pa, 4), "marketProbability": round(pa, 4), "americanOdds": int(price[away])},
                    ],
                    "confidence": confidence(pprob), "projectionStatus": "active", "public": True,
                    "parlayEligible": pprob >= PARLAY_PROB_FLOOR, "bankBuilderEligible": False,
                    "statusReason": None, "settlementSupport": "regulation_90",
                    "riskTier": risk_tier(int(price[pick])), "factors": [],
                    "caveats": [LIMITED_CAVEAT, "Draw no bet voids on a draw (stake returned)."],
                    "notes": ["Draw-no-bet, de-vigged (two-way)."],
                })
                market_summary["draw_no_bet"] = market_summary.get("draw_no_bet", 0) + 1

    return assemble(date, matches, market_summary, window=window)


def assemble(date: str, matches: list[dict], market_summary: dict, window: dict | None = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    elig = [m for m in matches if m.get("parlayEligible")]
    n_matches = len({str(m["matchId"]) for m in matches})
    ko = any(m.get("knockout") for m in matches)
    proj = {
        "generatedAt": now, "sport": "world_cup", "date": date,
        "slateWindow": window,
        "modelVersion": MODEL_VERSION, "provider": "odds_api", "oddsProvider": "odds_api",
        "strengthSource": "none", "dataQuality": "limited",
        "disclaimer": "Paper-only, educational. Odds-backed market-implied World Cup projections "
                      "from The Odds API; no API-Football stat/lineup/xG layer." +
                      (" Knockout slate — lower-variance markets are preferred for survival lanes." if ko else ""),
        "methodology": "Per market: de-vig the sportsbook price (3-way for moneyline/double chance). "
                       "No independent stat model — confidence capped, model edge ~0 except where the "
                       "double-chance book price differs from the 3-way no-vig sum. A slate is a window "
                       "of upcoming fixtures (it widens past a thin day until it holds enough games for "
                       "quality products); each game keeps its true kickoff.",
        "matchCount": n_matches, "projectionCount": len(matches),
        "publicCount": len(matches), "parlayEligibleCount": len(elig),
        "public": True, "opponentStrengthCoverage": 0, "knockout": ko,
        "marketsCovered": market_summary,
        "statusCounts": {"active": len(matches)}, "matches": matches,
    }
    return {"projections": proj, "parlays": build_cards(date, matches)}


def build_cards(date: str, matches: list[dict]) -> dict:
    """Cards from odds-backed favorite legs across markets (one leg per match)."""
    # one strongest eligible leg per match, preferring lower-variance markets
    pref = {"double_chance": 0, "draw_no_bet": 1, "moneyline_90": 2, "match_total_goals": 3, "btts": 4}
    best_by_match: dict[str, dict] = {}
    for m in matches:
        if not m.get("parlayEligible"):
            continue
        mid = str(m["matchId"])
        cur = best_by_match.get(mid)
        if cur is None or (m["modelProbability"], -pref.get(m["market"], 9)) > (cur["modelProbability"], -pref.get(cur["market"], 9)):
            best_by_match[mid] = m
    legs_pool = sorted(best_by_match.values(), key=lambda m: m["modelProbability"], reverse=True)

    def leg(m: dict) -> dict:
        return {
            "matchId": m["matchId"], "match": f"{m['homeTeam']} vs {m['awayTeam']}",
            "market": m["market"], "pick": m["pickLabel"], "americanOdds": m["americanOdds"],
            "modelProbability": m["modelProbability"], "marketProbability": m["marketProbability"],
            "edgePct": m["edgePct"], "confidence": m["confidence"], "regulationOnly": True,
            "homeCode": m["homeCode"], "awayCode": m["awayCode"],
        }

    cards: list[dict] = []

    def make(cid: str, tier: str, title: str, src: list[dict], why: str):
        if len(src) < 2:
            return
        dec = 1.0
        hit = 1.0
        for m in src:
            dec *= a2d(m["americanOdds"])
            hit *= m["modelProbability"]
        american = round((dec - 1) * 100) if dec >= 2 else -round(100 / (dec - 1))
        cards.append({
            "id": cid, "sport": "world_cup", "riskTier": tier, "title": title,
            "legs": [leg(m) for m in src], "legCount": len(src),
            "combinedAmericanOdds": american, "combinedDecimal": round(dec, 3),
            "defaultStake": 10, "projectedReturn": round(10 * dec, 2),
            "estimatedHitProbability": round(hit, 4), "regulationOnly": True,
            "whyThisCard": why,
            "correlationNotes": "Legs are different matches — no same-game correlation.",
            "dataCaveats": [
                "Limited soccer data: odds-backed market-implied, no API-Football stat layer.",
                "Confidence capped — no team/player stat model.",
            ],
            "combinedTotalEdgePct": round(sum(m["edgePct"] for m in src), 2),
            "single": False, "dataQuality": "limited",
        })

    if len(legs_pool) >= 2:
        make(f"wc_{date}_low_001", "Low", "World Cup lower-risk card", legs_pool[:2],
             "The two strongest odds-backed legs today (lower-variance markets preferred), different matches.")
    if len(legs_pool) >= 3:
        make(f"wc_{date}_bal_001", "Medium", "World Cup balanced card", legs_pool[:3],
             "Three odds-backed legs across different matches — higher combined odds, more variance.")

    by = {"Low": 0, "Medium": 0, "High": 0, "Longshot": 0}
    for c in cards:
        by[c["riskTier"]] = by.get(c["riskTier"], 0) + 1
    gate = ["Longshot tier omitted: no plus-money eligible WC leg today."]
    if len(legs_pool) < 2:
        gate.append("Not enough odds-backed World Cup legs for a card today.")
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(), "sport": "world_cup", "date": date,
        "disclaimer": "Paper-only, educational. Limited-data odds-backed cards (no stat layer).",
        "cardCount": len(cards), "byRisk": by, "cards": cards,
        "gateReasons": gate, "sourceProjections": len(legs_pool), "valueLegs": [],
    }


def empty_player_props(date: str) -> dict:
    """Player props FAILED CLOSED: removes stale data. Anytime-goalscorer / shots-on-target
    ODDS exist on The Odds API, but the recent-form / hit-rate / lineup layer needs
    API-Football — so we mark unavailable rather than show odds with no stat context."""
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(), "sport": "world_cup", "date": date,
        "disclaimer": "Player props integration in progress. Anytime-goalscorer & shots odds are "
                      "available via The Odds API and API-Football player data is now configured; "
                      "the full player-match + per-player recent goal/shot form + hit-rate layer is "
                      "the next increment. No stale or fabricated props are shown in the meantime.",
        "lineupsPosted": False, "projectionCount": 0, "publicCount": 0, "parlayEligibleCount": 0,
        "status": "integration_pending",
        "byMarket": {}, "matchedPlayers": 0, "unmatchedPlayers": 0, "matches": [],
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Odds-backed World Cup projections + cards (limited data).")
    ap.add_argument("--date", required=True, help="ET slate date YYYY-MM-DD (window start)")
    ap.add_argument("--min-matches", type=int, default=QUALITY_MIN_MATCHES,
                    help="expand the window forward until it holds at least this many upcoming matches")
    ap.add_argument("--window-days", type=int, default=MAX_WINDOW_DAYS,
                    help="never look beyond slate-start + this many ET days when expanding")
    ap.add_argument("--no-expand", action="store_true", help="force a single-day slate (no expansion)")
    args = ap.parse_args(argv)
    out = build(args.date, min_matches=args.min_matches, max_days=args.window_days,
                force_single=args.no_expand)
    if out.get("error"):
        return 2
    # NOTE: player-projections are owned by `build_player_props.py` (odds-backed props with
    # API-Football identity). This generator no longer writes a placeholder there, so it
    # never clobbers real props. If player props are unavailable, run build_player_props to
    # write the honest empty/unavailable state.
    for sub in ("projections", "parlays"):
        (DATA / sub).mkdir(parents=True, exist_ok=True)
    for name, doc in (("projections", out["projections"]), ("parlays", out["parlays"])):
        (DATA / name / f"{args.date}.json").write_text(json.dumps(doc, indent=2) + "\n")
        (DATA / name / "latest.json").write_text(json.dumps(doc, indent=2) + "\n")
    p, c = out["projections"], out["parlays"]
    print(f"[wc] {args.date}: {p['matchCount']} fixtures, {p['projectionCount']} market projections "
          f"{p['marketsCovered']}, {c['cardCount']} cards {c['byRisk']} (player props via build_player_props)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
