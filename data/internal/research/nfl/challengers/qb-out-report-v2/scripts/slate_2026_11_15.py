"""Apply the preregistered primary-QB / Out-Doubtful feature to the 2026-11-15/16 slate (research only).
Primary QB = most pass attempts over the team's previous 4 games (ESPN player-events, committed);
status = ESPN injuries feed (data/internal/research/injuries/nfl/latest.json)."""
import json, math
from collections import defaultdict
WT = "/Users/yashwantbalaji/Downloads/gametimepicks/.claude/worktrees/gametimepicks-program-director-e36970"
ev = json.load(open(f"{WT}/data/internal/research/nfl/player-events-v1/2026.json"))
inj = json.load(open(f"{WT}/data/internal/research/injuries/nfl/latest.json"))
ros = json.load(open(f"{WT}/app/public/data/nfl/rosters/latest.json"))
fc = json.load(open(f"{WT}/app/public/data/nfl/forecasts/2026-11-15.json"))
ev_keys = set()
for g in ev["games"]:
    for p in g["players"]: ev_keys |= set(p.keys())
attk = [k for k in ev_keys if "att" in k.lower() and "pass" in k.lower()]
assert len(attk) == 1, attk
ATT = attk[0]
tid2abbr = {t["providerTeamId"]: t["teamAbbr"] for t in ros["teams"]}
status = {(tid2abbr.get(e["providerTeamId"]), e["athleteId"]): e for e in inj["entries"]}
games = sorted(ev["games"], key=lambda g: g["dateUtc"])
tg = defaultdict(list)
for g in games:
    for t in (g["home"], g["away"]): tg[t].append(g)
EV_ALIAS = {"LAR": "LA", "WSH": "WAS"}
def primary(team, before):
    gteam = EV_ALIAS.get(team, team)
    prior = [g for g in tg[gteam] if g["dateUtc"] < before][-4:]
    tot = defaultdict(int); name = {}
    for g in prior:
        for p in g["players"]:
            if p.get("teamAbbr") in (team, gteam) and p.get(ATT): tot[p["playerId"]] += p[ATT]; name[p["playerId"]] = p["name"]
    per = [{"date": g["dateUtc"][:10], "opp": g["away"] if g["home"] == gteam else g["home"],
            "att": {name.get(p["playerId"], p["name"]): p[ATT] for p in g["players"] if p.get("teamAbbr") in (team, gteam) and p.get(ATT)}} for g in prior]
    best = sorted(tot, key=lambda k: -tot[k])
    return (best[0], name[best[0]], tot[best[0]]) if best else None, per
SHIFT = 145  # arm A fit on stamped 2022-2024 (results/evaluation.json applicationFit2022to2024.A)
dOf = lambda p: -400 * math.log10(1 / p - 1); pOf = lambda d: 1 / (1 + 10 ** (-d / 400))
out = []
for f in fc["forecasts"]:
    row = {"event": f["providerEventId"], "matchup": f["matchup"], "kickoffUtc": f["kickoffUtc"],
           "incumbentPHome": f["forecastSummary"]["winProbability"]["homeUnrounded"], "teamInputs": f["teamInputs"]["state"], "sides": {}}
    net = 0
    for side in ("home", "away"):
        t = f[side]["abbr"]
        pq, per = primary(t, f["kickoffUtc"].replace("Z", ":00Z") if len(f["kickoffUtc"]) == 17 else f["kickoffUtc"])
        st = status.get((t, pq[0].replace("nfl-athlete-", ""))) if pq else None
        flagged = bool(st and st["status"] in ("Out", "Doubtful") and st["statedAt"] < f["kickoffUtc"])
        net += (1 if side == "away" else -1) * flagged
        row["sides"][t] = {"primaryQb": pq[1] if pq else None, "attemptsPrev4": pq[2] if pq else None,
                           "status": st["status"] if st else "not on report", "statedAt": st["statedAt"] if st else None,
                           "flag": flagged, "prev4": per}
    row["net"] = net
    if net: row["armA_pHome"] = pOf(dOf(row["incumbentPHome"]) + SHIFT * net)
    out.append(row)
json.dump({"attemptsField": ATT, "injuriesSourceAsOf": inj["sourceAsOf"], "shiftArmA": SHIFT, "games": out},
          open("/Users/yashwantbalaji/gtp-evidence/nfl-markets-20261115/qb/results/slate-2026-11-15.json", "w"), indent=1)
for r in out:
    print(r["matchup"], round(r["incumbentPHome"], 4), r["teamInputs"], "net", r["net"], round(r.get("armA_pHome", r["incumbentPHome"]), 4))
    for t, s in r["sides"].items():
        print("   ", t, s["primaryQb"], s["attemptsPrev4"], s["status"], s["statedAt"], "FLAG" if s["flag"] else "", [ (x["date"], x["att"]) for x in s["prev4"]][-4:])
