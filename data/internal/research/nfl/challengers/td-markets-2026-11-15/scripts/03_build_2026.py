"""Assemble the 2026 forward populations (read-only on the repo).

A. OFFICIAL: P300/P301 blind forward anytime_td rows (weeks with a graded file), mean = P(anytime) frozen pregame.
   Outcome: graded `actual` (binary, incl. ST/fumble-recovery) + TD count = rushTd + recTd from player-games-2026-v1
   (ESPN stat lines; per-player return/defensive TDs are not carried there, so a return TD is counted only through
   the binary). Leakage: file generatedAt and graded forecastCommittedAt must precede firstKickoffUtc, and every
   row's kickoffUtc must be >= firstKickoffUtc; the git commit time of the forecast file is also checked.
B. SIM-V2: receipt of record per event = latest generatedAt strictly before eventStart. Rows: every
   playerStatDistributions entry. Played = the player has a participation-2026 row (offense snaps > 0) in that game.
   Outcome count = rushTd + recTd from player-events-v1/2026 (0 when the player played and has no stat line).
Usage: python3 -I 03_build_2026.py <worktreeRoot> <outJson>
"""
import glob, gzip, json, os, re, subprocess, sys
from datetime import datetime

ROOT, OUT = sys.argv[1], sys.argv[2]
R = lambda p: os.path.join(ROOT, p)
def iso(s):
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    if re.match(r"^\d{4}-\d\d-\d\dT\d\d:\d\d\+", s):
        s = s.replace("+", ":00+", 1)
    s = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], s)
    return datetime.fromisoformat(s)
drops = []
FWD = "data/internal/research/nfl/replay/player-props-share-level-forward"

pg = json.load(gzip.open(R("data/internal/research/nfl/replay/player-games-2026-v1.json.gz")))
PC = {c: i for i, c in enumerate(pg["columns"])}
pg_rows = {(r[PC["gameId"]], r[PC["playerId"]]): r for r in pg["rows"]}

def git_commit_time(path):
    try:
        out = subprocess.run(["git", "-C", ROOT, "log", "--diff-filter=A", "--format=%cI", "--", path], capture_output=True, text=True, timeout=60).stdout.strip().splitlines()
        return out[-1] if out else None
    except Exception:
        return None

_pe = json.load(open(R("data/internal/research/nfl/player-events-v1/2026.json")))
PE_BY_GID_ESPN = {}
for g in _pe["games"]:
    gid0 = f"2026_{g['week']:02d}_{g['away']}_{g['home']}"
    for p in g["players"]:
        PE_BY_GID_ESPN[(gid0, p["playerId"].replace("nfl-athlete-", ""))] = p
official = []
weeks = []
for gf in sorted(glob.glob(R(f"{FWD}/2026-*.graded.json"))):
    ff = gf.replace(".graded.json", ".json")
    fc = json.load(open(ff)); gd = json.load(open(gf))
    first = iso(fc["firstKickoffUtc"])
    commit = git_commit_time(os.path.relpath(ff, ROOT))
    w = {"week": fc["week"], "generatedAt": fc["generatedAt"], "forecastCommittedAt": gd.get("forecastCommittedAt"), "gitAddedAt": commit,
         "firstKickoffUtc": fc["firstKickoffUtc"], "late": gd.get("late"), "partial": gd.get("partial")}
    w["preKickoff"] = iso(fc["generatedAt"]) < first and (gd.get("forecastCommittedAt") is None or iso(gd["forecastCommittedAt"]) < first) and (commit is None or iso(commit) < first)
    weeks.append(w)
    if not w["preKickoff"] or gd.get("late"):
        drops.append({"what": f"official week {fc['week']}", "why": "not committed before first kickoff"}); continue
    C = {c: i for i, c in enumerate(gd["columns"])}
    for r in gd["rows"]:
        if r[C["market"]] != "anytime_td":
            continue
        if iso(r[C["kickoffUtc"]]) < first:
            drops.append({"what": r[C["gameId"]], "why": "row kickoff before file first kickoff"}); continue
        if r[C["state"]] != "SCORED":
            continue
        gid, pid = r[C["gameId"]], r[C["playerId"]]
        prow = pg_rows.get((gid, pid))
        cnt = (prow[PC["rushTd"]] + prow[PC["recTd"]]) if prow else None
        y = r[C["actual"]]
        src = "player-games-2026"
        if cnt is None:
            e = PE_BY_GID_ESPN.get((gid, str(r[C["espnId"]])))
            if e is not None:
                cnt, src = (e.get("rushTd") or 0) + (e.get("recTd") or 0), "player-events-2026"
            elif y == 0:
                cnt, src = 0, "binary-zero"
            else:
                drops.append({"what": f"{gid}|{pid}", "why": "SCORED y=1 row with no stat line in player-games/player-events (count unknown)"}); continue
        count = max(cnt, y)  # a return/fumble TD seen only in the binary counts once
        official.append({"gameId": gid, "week": fc["week"], "kickoffUtc": r[C["kickoffUtc"]], "team": r[C["team"]], "playerId": pid, "espnId": r[C["espnId"]],
                         "name": r[C["name"]], "position": r[C["position"]], "p": r[C["mean"]], "y1": y, "count": count, "countMismatch": int((cnt > 0) != (y > 0)), "countSource": src})

# ── sim-v2 receipts of record ──
pe = json.load(open(R("data/internal/research/nfl/player-events-v1/2026.json")))
ev = {g["providerEventId"]: g for g in pe["games"]}
part = {}
for line in open(R("data/internal/research/nfl/nflverse/participation-2026.jsonl")):
    x = json.loads(line)
    if x.get("espnId") and (x.get("offenseSnaps") or 0) > 0:
        part[(x["gameId"], str(x["espnId"]))] = x
ABBR = {"WSH": "WAS", "LAR": "LA"}
by_event = {}
for f in glob.glob(R("data/internal/research/nfl/sim-v2/shadow/*/*.json")):
    d = json.load(open(f))
    by_event.setdefault(d["eventId"], []).append((d["generatedAt"], f, d["eventStart"]))
sim = []
sim_games = []
for eid, lst in sorted(by_event.items()):
    start = iso(lst[0][2])
    pre = sorted([x for x in lst if iso(x[0]) < start])
    if not pre:
        drops.append({"what": f"sim-v2 {eid}", "why": f"no receipt generated before eventStart ({len(lst)} receipts, all after)"}); continue
    gen, f, _ = pre[-1]
    g = ev.get(eid)
    if g is None:
        drops.append({"what": f"sim-v2 {eid}", "why": "no player-events-v1 game (not final / not captured yet)"}); continue
    gid = f"2026_{g['week']:02d}_{g['away']}_{g['home']}"
    d = json.load(open(f))
    stats = {p["playerId"]: p for p in g["players"]}
    sim_games.append({"eventId": eid, "gameId": gid, "week": g["week"], "receipt": os.path.relpath(f, ROOT), "generatedAt": gen, "eventStart": lst[0][2], "schema": d["schemaVersion"],
                      "firstTdScorer": d["scoringEventDistributions"]["firstTdScorer"], "teamFirstTd": d["scoringEventDistributions"]["teamFirstTd"]})
    for p in d["playerStatDistributions"]:
        esp = p["playerId"].replace("nfl-athlete-", "")
        if (gid, esp) not in part:
            continue  # DNP / no offensive snaps: void
        s = stats.get(p["playerId"], {})
        cnt = (s.get("rushTd") or 0) + (s.get("recTd") or 0)
        sim.append({"eventId": eid, "gameId": gid, "week": g["week"], "playerId": p["playerId"], "espnId": esp, "name": p["name"], "position": p["position"], "team": ABBR.get(p["team"], p["team"]),
                    "anytime": p["anytimeTd"], "twoPlus": p["twoPlusTd"], "count": cnt})
json.dump({"weeks": weeks, "official": official, "sim": sim, "simGames": sim_games, "drops": drops}, open(OUT, "w"))
print(json.dumps(weeks, indent=0)[:2500])
from collections import Counter; print(Counter(r["countSource"] for r in official)); print("official", len(official), "games", len({r["gameId"] for r in official}), "countMismatch", sum(r["countMismatch"] for r in official))
print("sim rows", len(sim), "games", len(sim_games))
from collections import Counter
print(Counter(d["why"] for d in drops))
