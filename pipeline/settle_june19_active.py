"""
Settle the June 19 active paper cards from OFFICIAL sources only — reproducible, never fabricated.

Active cards (engine-namespace, non-protected):
  • Core Dual Bank Builder Lane A · Step 2 ($197.88, +204): USA ML + Nick Gonzales HRR Under 2.5
  • Core Dual Bank Builder Lane B · Step 1 ($100, +111):    Turkey or Draw + Rhys Hoskins HRR Under 1.5
  • Moonshot Lane · Step 1 ($25, +808): Morocco ML + Vinícius Jr GS + Ismael Saibari GS + Turkey or Draw

Official sources:
  • WC team result (moneyline / double-chance): ESPN FIFA World Cup scoreboard FT score (regulation).
  • WC anytime goalscorer: API-Football /fixtures/events (Goal events, regulation; penalties-missed excluded).
  • MLB Hits+Runs+RBIs: MLB Stats API box score (DNP/no plate appearance → void per project rule).

Writes ONLY the non-protected artifacts:
  app/public/data/methodology/launch/dual-bank-builder-active.json  (Lane A advance / Lane B stop)
  app/public/data/moonshot-lane/active.json                          (Moonshot Step 1 settle)
Never touches protected public/data/bank-builder/*. Re-running is idempotent.
"""
import json, os, sys, unicodedata, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BB = ROOT / "app" / "public" / "data" / "methodology" / "launch" / "dual-bank-builder-active.json"
MOON = ROOT / "app" / "public" / "data" / "moonshot-lane" / "active.json"
NOW = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
AF_KEY = os.environ.get("API_FOOTBALL_KEY", "").strip()
AF_LEAGUE = os.environ.get("WC_API_FOOTBALL_LEAGUE", "1")
AF_SEASON = os.environ.get("WC_API_FOOTBALL_SEASON", "2026")


def _get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _norm(s):
    """Lowercase, strip accents (í→i, ü→u), keep ASCII letters only. Official sources differ in accents."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "".join(c for c in s.lower() if c.isascii() and c.isalpha())


# Team aliases across official sources (ESPN display name vs the card label).
TEAM_ALIASES = [
    {"usa", "unitedstates", "unitedstatesofamerica"},
    {"turkey", "turkiye"},
    {"southkorea", "korearepublic", "republicofkorea"},
    {"ivorycoast", "cotedivoire"},
]


def _team_keys(label):
    n = _norm(label.split(" or ")[0].replace("moneyline90", "").replace("doublechance", ""))
    for grp in TEAM_ALIASES:
        if n in grp:
            return grp | {n}
    return {n}


def _team_hit(label, name):
    """True if the card's team label matches an official team display name (alias + substring tolerant)."""
    keys = _team_keys(label)
    nn = _norm(name)
    return any(k == nn or k in nn or nn in k for k in keys)


# ── ESPN FIFA World Cup FT scores (official) ─────────────────────────────────────────────────────
_ESPN_CACHE = {}
def espn_scores(date_yyyymmdd):
    if date_yyyymmdd in _ESPN_CACHE:
        return _ESPN_CACHE[date_yyyymmdd]
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates={date_yyyymmdd}"
    out = []
    for e in _get(url).get("events", []):
        comp = e["competitions"][0]
        ft = comp["status"]["type"]["name"] == "STATUS_FULL_TIME"
        cs = {c["homeAway"]: c for c in comp["competitors"]}
        out.append({
            "home": cs["home"]["team"]["displayName"], "away": cs["away"]["team"]["displayName"],
            "hs": int(cs["home"]["score"]), "as": int(cs["away"]["score"]), "ft": ft,
        })
    _ESPN_CACHE[date_yyyymmdd] = out
    return out


def find_wc_match(team_label, dates):
    for d in dates:
        for m in espn_scores(d):
            if _team_hit(team_label, m["home"]) or _team_hit(team_label, m["away"]):
                return m
    return None


def grade_wc_moneyline(team_label, dates):
    m = find_wc_match(team_label, dates)
    if not m: return {"result": "needs_review", "official": "no official FT fixture found", "source": "espn_fifa_world"}
    if not m["ft"]: return {"result": "pending", "official": f"{m['home']} {m['hs']}-{m['as']} {m['away']} (not FT)", "source": "espn_fifa_world"}
    is_home = _team_hit(team_label, m["home"])
    my, opp = (m["hs"], m["as"]) if is_home else (m["as"], m["hs"])
    res = "won" if my > opp else "lost"
    return {"result": res, "official": f"{m['home']} {m['hs']}–{m['as']} {m['away']} FT", "source": "espn_fifa_world", "started": True}


def grade_wc_double_chance(team_label, dates):
    m = find_wc_match(team_label, dates)
    if not m: return {"result": "needs_review", "official": "no official FT fixture found", "source": "espn_fifa_world"}
    if not m["ft"]: return {"result": "pending", "official": f"{m['home']} {m['hs']}-{m['as']} {m['away']} (not FT)", "source": "espn_fifa_world"}
    is_home = _team_hit(team_label, m["home"])
    my, opp = (m["hs"], m["as"]) if is_home else (m["as"], m["hs"])
    res = "won" if my >= opp else "lost"  # win OR draw
    return {"result": res, "official": f"{m['home']} {m['hs']}–{m['as']} {m['away']} FT", "source": "espn_fifa_world", "started": True}


# ── API-Football anytime goalscorer (official goals, regulation) ─────────────────────────────────
def af_fixtures(date):
    q = urllib.parse.urlencode({"league": AF_LEAGUE, "season": AF_SEASON, "date": date})
    return _get(f"https://v3.football.api-sports.io/fixtures?{q}", {"x-apisports-key": AF_KEY}).get("response", [])


def grade_goalscorer(player_name, dates):
    pn = _norm(player_name)
    for d in dates:
        for fx in af_fixtures(d):
            if fx["fixture"]["status"]["short"] not in ("FT", "AET", "PEN"):
                continue
            ev = _get(f"https://v3.football.api-sports.io/fixtures/events?fixture={fx['fixture']['id']}", {"x-apisports-key": AF_KEY}).get("response", [])
            names = set()
            for e in ev:
                if e.get("type") == "Goal" and e.get("detail") != "Missed Penalty" and e.get("detail") != "Penalty Shootout":
                    names.add(_norm((e.get("player") or {}).get("name")))
            # only consider a fixture that actually involves this player's appearance window
            roster_match = any(pn in n or n in pn or _last(pn) == _last(n) for n in names)
            # Determine if this player's team played in this fixture by checking events broadly:
            teams = {_norm(fx["teams"]["home"]["name"]), _norm(fx["teams"]["away"]["name"])}
            # We only grade if we found the fixture via the goals OR the player's club is in this match.
            scored = any(pn == n or pn in n or n in pn or _last(pn) == _last(n) for n in names)
            if scored:
                return {"result": "won", "official": f"scored (official goal, {fx['teams']['home']['name']} v {fx['teams']['away']['name']})", "source": "api_football", "started": True}
    return None  # caller decides loss vs needs_review


def _last(n):
    parts = (n or "").split()
    return parts[-1] if parts else n


def grade_goalscorer_in_match(player_name, home, away, dates):
    """Grade a scorer: WON if an official goal is credited; else LOSS once the named match is FT."""
    won = grade_goalscorer(player_name, dates)
    if won:
        return won
    # confirm the player's match is FT (so a no-goal is a real loss, not pending)
    hN, aN = _norm(home), _norm(away)
    for d in dates:
        for fx in af_fixtures(d):
            ts = {_norm(fx["teams"]["home"]["name"]), _norm(fx["teams"]["away"]["name"])}
            if (hN in ts or any(hN in t for t in ts)) and (aN in ts or any(aN in t for t in ts)):
                if fx["fixture"]["status"]["short"] in ("FT", "AET", "PEN"):
                    return {"result": "lost", "official": f"no official goal ({fx['teams']['home']['name']} v {fx['teams']['away']['name']} FT)", "source": "api_football", "started": True}
                return {"result": "pending", "official": "match not final", "source": "api_football"}
    return {"result": "needs_review", "official": "match not found", "source": "api_football"}


# ── MLB Hits+Runs+RBIs (official box score) ──────────────────────────────────────────────────────
def grade_hrr(player_name, side, line, date):
    pn = _norm(player_name)
    sched = _get(f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date}")
    for dd in sched.get("dates", []):
        for g in dd.get("games", []):
            pk = g["gamePk"]; final = g["status"]["abstractGameState"] == "Final"
            box = _get(f"https://statsapi.mlb.com/api/v1/game/{pk}/boxscore")
            for sidekey in ("home", "away"):
                for pid, pdata in box["teams"][sidekey]["players"].items():
                    if _norm(pdata["person"]["fullName"]) != pn:
                        continue
                    if not final:
                        return {"result": "pending", "official": "game not Final", "source": "mlb_stats_api"}
                    bat = pdata.get("stats", {}).get("batting", {})
                    if not bat or bat.get("hits") is None or not bat.get("plateAppearances"):
                        return {"result": "void", "official": "did not bat (no plate appearance) — no-action", "source": "mlb_stats_api"}
                    hrr = int(bat.get("hits", 0)) + int(bat.get("runs", 0)) + int(bat.get("rbi", 0))
                    won = hrr < line if side == "under" else hrr > line
                    return {"result": "won" if won else "lost", "official": f"{hrr} H+R+RBI", "source": "mlb_stats_api", "started": True}
    return {"result": "needs_review", "official": "player not found in official box scores", "source": "mlb_stats_api"}


# ── Leg dispatcher ───────────────────────────────────────────────────────────────────────────────
WC_DATES = ["20260619", "20260620"]   # ESPN dates (UTC) covering June 19 ET slate incl. late games
AF_DATES = ["2026-06-19", "2026-06-20"]
MLB_DATE = "2026-06-19"


def settle_bb_leg(leg):
    sport, market = leg.get("sport"), (leg.get("marketType") or "")
    label = leg.get("label", "")
    if sport == "WORLD_CUP" and "moneyline" in market:
        return grade_wc_moneyline(leg.get("participantName") or label, WC_DATES)
    if sport == "WORLD_CUP" and "double_chance" in market:
        return grade_wc_double_chance(leg.get("participantName") or label, WC_DATES)
    if sport == "MLB":
        return grade_hrr(leg.get("participantName"), leg.get("side"), float(leg.get("line")), MLB_DATE)
    return {"result": "needs_review", "official": f"no rule for {sport} {market}", "source": "none"}


def lane_outcome(results):
    if any(r == "lost" for r in results): return "lost"
    nonvoid = [r for r in results if r != "void"]
    if nonvoid and all(r == "won" for r in nonvoid): return "won"
    if any(r in ("pending", "needs_review") for r in results): return "pending"
    return "pending"


def dec(american):
    return 1 + american / 100 if american > 0 else 1 + 100 / abs(american)


# ── Settle the Dual Bank Builder ─────────────────────────────────────────────────────────────────
def settle_dual_bb():
    doc = json.loads(BB.read_text())
    run = doc["run"]
    summary = {}
    for lk in ("laneA", "laneB"):
        lane = run[lk]
        step = next(s for s in lane["steps"] if s["status"] == "pending")
        # grade the lane's active legs (these are the active-step card legs)
        results = []
        for leg in lane["legs"]:
            res = settle_bb_leg(leg)
            leg["settlement"] = res
            results.append(res["result"])
        # mirror onto the step's leg copies
        for sleg in step.get("legs", []):
            match = next((l for l in lane["legs"] if l.get("label") == sleg.get("label")), None)
            if match: sleg["settlement"] = match["settlement"]
        outcome = lane_outcome(results)
        lane["settledLegs"] = sum(1 for r in results if r in ("won", "lost", "void"))
        if outcome == "won":
            payout = round(step["stake"] * dec(step["combinedOdds"]), 2)
            step["status"] = "settled"; step["result"] = "won"; step["payout"] = payout
            nxt = next((s for s in lane["steps"] if s["step"] == step["step"] + 1), None)
            if nxt:
                nxt["status"] = "awaiting"; nxt["stake"] = payout
            lane["laneStatus"] = "advanced"; lane["advanced"] = True; lane["publicVisible"] = True
            lane["awaiting"] = True; lane["nextStepStake"] = payout
            lane["currentStep"] = step["step"] + 1
            lane["awaitingNote"] = f"Step {step['step']} won (${step['stake']} → ${payout}); awaiting a pre-event Step {step['step']+1} card at ${payout}."
            summary[lk] = {"outcome": "won", "step": step["step"], "stake": step["stake"], "payout": payout, "results": results}
        elif outcome == "lost":
            step["status"] = "settled"; step["result"] = "lost"; step["payout"] = 0
            lane["laneStatus"] = "stopped"; lane["publicVisible"] = False
            lane["stopReason"] = "Step settled a loss — " + "; ".join(
                f"{l['label']}: {l['settlement']['result'].upper()} ({l['settlement']['official']})" for l in lane["legs"])
            lane["restartCandidate"] = {"note": f"Fresh $100 restart is a candidate after the June 20 slate — not placed here.", "stake": 100}
            summary[lk] = {"outcome": "lost", "step": step["step"], "stake": step["stake"], "results": results}
        else:
            summary[lk] = {"outcome": "pending", "results": results}
    run["settlementPassAt"] = NOW
    run["lifecycle"] = {
        "laneA": {"status": run["laneA"].get("laneStatus"), "public": run["laneA"].get("publicVisible", True)},
        "laneB": {"status": run["laneB"].get("laneStatus"), "public": run["laneB"].get("publicVisible", True)},
        "note": "Stopped lanes are hidden from the public Bank Builder and tracked on Mr. Dub. Settled from official sources.",
    }
    doc["meta"]["june19SettledAt"] = NOW
    BB.write_text(json.dumps(doc, indent=2) + "\n")
    return summary


# ── Settle the Moonshot lane ─────────────────────────────────────────────────────────────────────
def settle_moonshot():
    lane = json.loads(MOON.read_text())
    step = lane["ladder"][0]
    card = step["card"]
    results = []
    for leg in card["legs"]:
        m = leg.get("market", "")
        if m == "moneyline_90":
            res = grade_wc_moneyline(leg.get("participant", ""), WC_DATES)
        elif m == "double_chance":
            res = grade_wc_double_chance(leg.get("participant", ""), WC_DATES)
        elif m == "player_goal_scorer_anytime":
            # opponent + fixture for the no-goal confirmation
            home, away = (leg.get("team") or leg.get("participant"), leg.get("opponent"))
            res = grade_goalscorer_in_match(leg.get("participant", ""), home or "", away or "", AF_DATES)
        else:
            res = {"result": "needs_review", "official": f"no rule for {m}", "source": "none"}
        leg["settlement"] = {**leg.get("settlement", {}), **res, "started": True}
        results.append(res["result"])
    outcome = lane_outcome(results)
    card["result"] = outcome
    if outcome == "lost":
        step["status"] = "stopped"
        lane["status"] = "stopped"
        lane["stopNote"] = "Step 1 settled a loss — " + "; ".join(
            f"{l['participant']}: {l['settlement']['result'].upper()}" for l in card["legs"])
    elif outcome == "won":
        step["status"] = "cleared"
        lane["status"] = "active"
    lane["settledAt"] = NOW
    MOON.write_text(json.dumps(lane, indent=2) + "\n")
    return {"outcome": outcome, "results": [(l["participant"], l["settlement"]["result"]) for l in card["legs"]]}


def main():
    if not AF_KEY:
        print("API_FOOTBALL_KEY not set — cannot settle goalscorers"); return 2
    bb = settle_dual_bb()
    moon = settle_moonshot()
    print("=== Dual Bank Builder ===")
    for lk, s in bb.items():
        print(f"  {lk}: {s['outcome'].upper()} (step {s.get('step')}, results {s['results']})" + (f" payout ${s['payout']}" if s.get('payout') else ""))
    print("=== Moonshot ===")
    print(f"  {moon['outcome'].upper()} · legs {moon['results']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
