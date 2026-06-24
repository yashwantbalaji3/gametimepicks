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
import argparse, json, os, sys, urllib.request

AF = "https://v3.football.api-sports.io"
KEY = os.environ.get("API_FOOTBALL_KEY", "").strip()
LEAGUE = int(os.environ.get("WC_API_FOOTBALL_LEAGUE", "1"))
SEASON = int(os.environ.get("WC_API_FOOTBALL_SEASON", "2026"))

# Map the slate's internal match ids (used in product leg ids) → the two team names, so the official
# bundle keys on the SAME matchId the product legs reference (45-48 for the June 23 slate).
SLATE_MATCHES = {
    45: ("Portugal", "Uzbekistan"),
    46: ("England", "Ghana"),
    47: ("Panama", "Croatia"),
    48: ("Colombia", "DR Congo"),
}

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
    ap.add_argument("--date", default="2026-06-23")
    args = ap.parse_args()
    if not KEY:
        print(json.dumps({"error": "API_FOOTBALL_KEY not set"})); sys.exit(1)

    # Late ET kickoffs roll into the next UTC day, so pull this date AND the next.
    y, m, dd = map(int, args.date.split("-"))
    next_date = f"{y:04d}-{m:02d}-{dd+1:02d}"
    fixtures = []
    for date in (args.date, next_date):
        fixtures += get(f"/fixtures?date={date}&league={LEAGUE}&season={SEASON}").get("response", [])

    matches, players = [], []
    for mid, (home, away) in SLATE_MATCHES.items():
        # find the fixture by loose team match (handles 'DR Congo' vs 'Congo DR', abbreviations)
        fx = None
        for cand in fixtures:
            t = cand.get("teams", {})
            if team_matches(home, t.get("home", {}).get("name")) and team_matches(away, t.get("away", {}).get("name")):
                fx = cand; break
        if not fx:
            matches.append({"matchId": mid, "match": f"{home} vs {away}", "homeGoals": None, "awayGoals": None, "status": "NOT_FOUND"})
            continue
        g = fx.get("goals", {}); st = fx.get("fixture", {}).get("status", {})
        fid = fx.get("fixture", {}).get("id")
        matches.append({"matchId": mid, "match": f"{home} vs {away}", "homeGoals": g.get("home"),
                        "awayGoals": g.get("away"), "status": st.get("short"), "apiFootballFixtureId": fid})
        # player box scores for this fixture (goals/assists/shots-on-target)
        try:
            pdata = get(f"/fixtures/players?fixture={fid}").get("response", [])
        except Exception:
            pdata = []
        for team in pdata:
            for p in team.get("players", []):
                info = p.get("player", {}); stats = (p.get("statistics") or [{}])[0]
                goals = stats.get("goals", {}); shots = stats.get("shots", {})
                players.append({
                    "player": info.get("name"), "matchId": mid,
                    "goals": goals.get("total") or 0,
                    "assists": goals.get("assists") or 0,
                    "shotsOnTarget": shots.get("on") or 0,
                    "minutes": (stats.get("games") or {}).get("minutes"),
                })

    bundle = {
        "generatedAt": f"{args.date}T00:00:00Z", "date": args.date,
        "source": "API-Football v3 /fixtures (FT regulation) + /fixtures/players (official player stats)",
        "matches": matches, "players": players,
    }
    print(json.dumps(bundle, indent=1, ensure_ascii=False))

if __name__ == "__main__":
    main()
