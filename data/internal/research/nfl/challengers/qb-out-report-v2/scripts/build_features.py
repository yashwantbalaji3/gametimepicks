"""Feature builder for qb-out-report-*-v2 (see ../PREREGISTRATION.md). Reads NO outcomes for features.
Writes results/features.json: per game {gameId, season, flagHome, flagAway, gapHome, gapAway, primaries, injury stamps}.
Usage: python3 -I build_features.py
"""
import csv, gzip, hashlib, json, sys
from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

R = "/Users/yashwantbalaji/Downloads/gametimepicks/data/internal/research/nfl/raw/nflverse"
OUT = "/Users/yashwantbalaji/gtp-evidence/nfl-markets-20261115/qb/results/features.json"
PREREG = "/Users/yashwantbalaji/gtp-evidence/nfl-markets-20261115/qb/PREREGISTRATION.md"
ET = ZoneInfo("America/New_York")
PINS = {
    f"{R}/games.csv": "cf8632c85fdc82c8915c7866d0bd16465a88946052bccfbf83b44bee87d5d65e",
    f"{R}/injuries_2022.csv": "5f0d60324e597edd1a2ced8540b04e40b51dd440591dd1df11b8d96343387c9e",
    f"{R}/injuries_2023.csv": "16b04e21da5aa3944cfa9c22cafcc84ed7e6d9866eaddf0344e9b8cbf2f63afe",
    f"{R}/injuries_2024.csv": "498bce8e13cb64b2ab9bb0ad6cb81d0a63c2ddb24016c9fc90c2de2126fae449",
    f"{R}/injuries_2025.csv": "873ca1606dd575bd01152508a243ef6b3a0f8f97b90b707217e62ee8c7ceb735",
}
def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()
def refuse(why): print("REFUSED:", why); sys.exit(1)
if sha(PREREG) != open(PREREG + ".sha256").read().split()[0]: refuse("preregistration hash mismatch")
for p, h in PINS.items():
    if sha(p) != h: refuse(f"pin mismatch {p}")

N_PRIOR = 4
SHRINK = 150
FEATURE_SEASONS = [2022, 2023, 2024, 2025]

# games (schedule only for features; scores are not read here)
games = []
for g in csv.DictReader(open(f"{R}/games.csv")):
    s = int(g["season"])
    if s < 2020 or s > 2025: continue
    kick = datetime.strptime(g["gameday"] + " " + (g["gametime"] or "13:00"), "%Y-%m-%d %H:%M").replace(tzinfo=ET).astimezone(timezone.utc)
    games.append(dict(gid=g["game_id"], season=s, gt=g["game_type"], week=int(g["week"]), date=g["gameday"], kick=kick, home=g["home_team"], away=g["away_team"]))
games.sort(key=lambda x: (x["date"], x["gid"]))
team_games = defaultdict(list)
for g in games:
    team_games[g["home"]].append(g); team_games[g["away"]].append(g)

# attempts per (gid, team, player)
att = defaultdict(lambda: defaultdict(int))
for y in range(2020, 2026):
    with gzip.open(f"{R}/player-stats/stats_player_week_{y}.csv.gz", "rt") as f:
        for r in csv.DictReader(f):
            a = r["attempts"]
            if a and float(a) > 0: att[(r["game_id"], r["team"])][r["player_id"]] += int(float(a))

def primary_qb(team, g):
    prior = [x for x in team_games[team] if x["date"] < g["date"]][-N_PRIOR:]
    prior = [x for x in prior if (x["gid"], team) in att]
    if not prior: return None
    tot = defaultdict(int)
    for x in prior:
        for p, a in att[(x["gid"], team)].items(): tot[p] += a
    last = att[(prior[-1]["gid"], team)]
    return sorted(tot, key=lambda p: (-tot[p], -last.get(p, 0), p))[0]

prim = {}
for g in games:
    for t in (g["home"], g["away"]): prim[(g["gid"], t)] = primary_qb(t, g)

# injuries
inj = {}
stamped = {}
for y in FEATURE_SEASONS:
    rows = list(csv.DictReader(open(f"{R}/injuries_{y}.csv")))
    stamped[y] = "date_modified" in rows[0]
    for r in rows:
        inj[(y, r["game_type"], int(r["week"]), r["team"], r["gsis_id"])] = r

def flag(g, team):
    p = prim[(g["gid"], team)]
    if p is None: return None, None
    r = inj.get((g["season"], g["gt"], g["week"], team, p))
    if r is None or r["report_status"] not in ("Out", "Doubtful"): return 0, None
    if stamped[g["season"]]:
        dm = r.get("date_modified") or ""
        if not dm: refuse(f"{g['gid']} {team} primary-QB row has no stamp")
        t = datetime.fromisoformat(dm.replace("Z", "+00:00"))
        if not t < g["kick"]: refuse(f"{g['gid']} {team} primary-QB row stamped at/after kickoff ({dm})")
        return 1, dm
    return 1, "UNSTAMPED"

# arm B: dropbacks
drop = defaultdict(list)          # player -> [(date, epa)]
season_drops = defaultdict(list)  # season -> [(gid, team, player, epa)]
for y in range(2021, 2026):
    with gzip.open(f"{R}/pbp/play_by_play_{y}.csv.gz", "rt") as f:
        for r in csv.DictReader(f):
            if r["qb_dropback"] not in ("1", "1.0") or not r["id"] or r["qb_epa"] in ("", "NA"): continue
            e = float(r["qb_epa"])
            drop[r["id"]].append((r["game_date"], y, e))
            season_drops[y].append((r["game_id"], r["posteam"], r["id"], e))
lg = {}
for y, xs in season_drops.items():
    allm = sum(x[3] for x in xs) / len(xs)
    rep = [x[3] for x in xs if prim.get((x[0], x[1])) is not None and prim.get((x[0], x[1])) != x[2]]
    lg[y] = dict(muAll=allm, muRep=sum(rep) / len(rep), nAll=len(xs), nRep=len(rep))

def gap(g, p):
    S = g["season"]
    if S - 1 not in lg: return None
    xs = [e for (d, y, e) in drop.get(p, []) if y in (S - 1, S) and d < g["date"]]
    q = (sum(xs) + SHRINK * lg[S - 1]["muAll"]) / (len(xs) + SHRINK)
    return dict(gap=max(0.0, q - lg[S - 1]["muRep"]), q=q, n=len(xs))

out = []
for g in games:
    if g["season"] not in FEATURE_SEASONS: continue
    fh, sh = flag(g, g["home"]); fa, sa = flag(g, g["away"])
    row = dict(gameId=g["gid"], season=g["season"], week=g["week"], gameType=g["gt"], kickoffUtc=g["kick"].strftime("%Y-%m-%dT%H:%MZ"),
               home=g["home"], away=g["away"], primaryHome=prim[(g["gid"], g["home"])], primaryAway=prim[(g["gid"], g["away"])],
               flagHome=fh, flagAway=fa, stampHome=sh, stampAway=sa, gapHome=0.0, gapAway=0.0)
    if fh: row["gapHomeDetail"] = gap(g, row["primaryHome"]); row["gapHome"] = row["gapHomeDetail"]["gap"]
    if fa: row["gapAwayDetail"] = gap(g, row["primaryAway"]); row["gapAway"] = row["gapAwayDetail"]["gap"]
    out.append(row)
summary = {y: dict(games=sum(1 for r in out if r["season"] == y),
                   unknownPrimary=sum(1 for r in out if r["season"] == y and (r["flagHome"] is None or r["flagAway"] is None)),
                   flaggedSides=sum((r["flagHome"] or 0) + (r["flagAway"] or 0) for r in out if r["season"] == y),
                   stamped=stamped[y]) for y in FEATURE_SEASONS}
json.dump(dict(league=lg, summary=summary, games=out), open(OUT, "w"), indent=0)
print(json.dumps(dict(summary=summary, league=lg), indent=1))
