"""
fetch_official_soccer.py — READ-ONLY official-results fetcher for soccer settlement. Pulls FT scores +
per-player box-score lines (goals / assists / shots-on-target) from API-Football for a date, maps the
fixtures onto the slate's internal match ids, and prints the official-results bundle as JSON to stdout.

It WRITES NOTHING to the repo and NEVER fabricates — every number comes from the live official endpoint.
Pipe the output to a temp file and grade it with scripts/settle-soccer-slate.mjs --official <file>.

  set -a; . ./.env; set +a
  python3 pipeline/fetch_official_soccer.py --date 2026-06-23 > /tmp/official.json

Source: API-Football v3 /fixtures (FT regulation) + /fixtures/players (player stats).
"""
import argparse, datetime, json, os, sys, urllib.request

AF = "https://v3.football.api-sports.io"
KEY = os.environ.get("API_FOOTBALL_KEY", "").strip()
LEAGUE = int(os.environ.get("WC_API_FOOTBALL_LEAGUE", "1"))
SEASON = int(os.environ.get("WC_API_FOOTBALL_SEASON", "2026"))

# The slate's matches are DERIVED from that day's projections (matchId → home/away), never hardcoded —
# so the official bundle keys on the SAME matchIds the product legs reference, for ANY date. (Previously
# this was a frozen dict for the June-23 slate, which made every later date resolve to NOT_FOUND.)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_slate_matches(date):
    """Return {matchId: (homeTeam, awayTeam)} for the date, from the built WC projections."""
    path = os.path.join(REPO_ROOT, "app", "public", "data", "world-cup", "projections", f"{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            proj = json.load(f)
    except FileNotFoundError:
        return {}
    out = {}
    for p in proj.get("matches", []):
        mid = p.get("matchId")
        if mid is not None and mid not in out:
            out[mid] = (p.get("homeTeam"), p.get("awayTeam"))
    return out

def get(path):
    req = urllib.request.Request(f"{AF}{path}", headers={"x-apisports-key": KEY})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def norm(s):
    return "".join(ch for ch in (s or "").lower() if ch.isalnum())

def tokens(s):
    return set(t for t in "".join(c if c.isalnum() else " " for c in (s or "").lower()).split() if t)

def team_matches(slate_name, api_name):
    """Loose team match — handles 'DR Congo' vs 'Congo DR' and abbreviations by token-subset."""
    st, at = tokens(slate_name), tokens(api_name)
    if not st or not at:
        return False
    return st <= at or at <= st or norm(slate_name) in norm(api_name) or norm(api_name) in norm(slate_name)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.date.today().isoformat())  # default TODAY, never a stale past date
    args = ap.parse_args()
    if not KEY:
        print(json.dumps({"error": "API_FOOTBALL_KEY not set"})); sys.exit(1)

    # Late ET kickoffs roll into the next UTC day, so pull this date AND the next. Use real date math so
    # month/year boundaries carry correctly (audit P1-6: `dd+1` produced e.g. 2026-06-31 on the 30th).
    y, m, dd = map(int, args.date.split("-"))
    next_date = (datetime.date(y, m, dd) + datetime.timedelta(days=1)).isoformat()
    fixtures = []
    for date in (args.date, next_date):
        fixtures += get(f"/fixtures?date={date}&league={LEAGUE}&season={SEASON}").get("response", [])

    slate = load_slate_matches(args.date)
    if not slate:
        print(json.dumps({"error": f"no projections to derive the slate for {args.date}", "matches": [], "players": []}))
        sys.exit(0)

    matches, players = [], []
    for mid, (home, away) in slate.items():
        name_id = f"{home} vs {away}"
        # find the fixture by loose team match in EITHER orientation (handles 'DR Congo' vs 'Congo DR')
        fx, flipped = None, False
        for cand in fixtures:
            t = cand.get("teams", {})
            ah, aa = t.get("home", {}).get("name"), t.get("away", {}).get("name")
            if team_matches(home, ah) and team_matches(away, aa):
                fx, flipped = cand, False; break
            if team_matches(home, aa) and team_matches(away, ah):
                fx, flipped = cand, True; break
        if not fx:
            # emit NOT_FOUND under both keyings so a missing game is explicit, never silently dropped
            for key in (mid, name_id):
                matches.append({"matchId": key, "match": name_id, "homeGoals": None, "awayGoals": None, "status": "NOT_FOUND"})
            continue
        g = fx.get("goals", {}); st = fx.get("fixture", {}).get("status", {}); fid = fx.get("fixture", {}).get("id")
        # orient goals to the SLATE's home/away (so totals + DC grade against the right side)
        gh, ga = (g.get("away"), g.get("home")) if flipped else (g.get("home"), g.get("away"))
        row = {"match": name_id, "homeGoals": gh, "awayGoals": ga, "status": st.get("short"), "apiFootballFixtureId": fid}
        # Emit under BOTH the numeric projection matchId AND the "Home vs Away" name — product legs
        # reference one or the other (DC/ML legs use the numeric id; raw-pool totals use the name).
        matches.append({"matchId": mid, **row})
        matches.append({"matchId": name_id, **row})
        # player box scores (goals/assists/shots-on-target), keyed under both ids too
        try:
            pdata = get(f"/fixtures/players?fixture={fid}").get("response", [])
        except Exception:
            pdata = []
        for team in pdata:
            for p in team.get("players", []):
                info = p.get("player", {}); stats = (p.get("statistics") or [{}])[0]
                goals = stats.get("goals", {}); shots = stats.get("shots", {})
                base = {"player": info.get("name"), "goals": goals.get("total") or 0,
                        "assists": goals.get("assists") or 0, "shotsOnTarget": shots.get("on") or 0,
                        "minutes": (stats.get("games") or {}).get("minutes")}
                players.append({**base, "matchId": mid})
                players.append({**base, "matchId": name_id})

    bundle = {
        "generatedAt": f"{args.date}T00:00:00Z", "date": args.date,
        "source": "API-Football v3 /fixtures (FT regulation) + /fixtures/players (official player stats)",
        "matches": matches, "players": players,
    }
    print(json.dumps(bundle, indent=1, ensure_ascii=False))

if __name__ == "__main__":
    main()
