"""MLB-001 audit, step 4: simulated player means (last pregame commit) vs settled player stats.

Settled stats come from app/public/data/mlb/results/model-rows/*.json (`settledStat`, one value per player-game-market,
repeated across lines). Only players with a posted prop line appear there, so this is a selected subset (disclosed).
Run after extract.py:  python3 -I player_check.py /Users/yashwantbalaji/Downloads/gametimepicks  -> out/players.json
"""
import json, os, subprocess, sys, unicodedata, re, collections
import numpy as np

REPO = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out")
G = json.load(open(os.path.join(OUT, "games.json"))); MAIN = G["originMain"]
rng = np.random.default_rng(20261014)
git = lambda *a: subprocess.run(["git", "-C", REPO, *a], check=True, capture_output=True).stdout


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", s)
    return re.sub(r"[^a-z]", "", s)


settled = {}  # (gamePk, normName, market) -> stat
conflicts = []
for f in git("ls-tree", "-r", "--name-only", MAIN, "app/public/data/mlb/results/model-rows").decode().split():
    doc = json.loads(git("show", f"{MAIN}:{f}"))
    for r in doc.get("rows", []):
        if r.get("settledStat") is None or r.get("outcome") in ("void", "pending", None):
            continue
        k = (str(r["gameId"]), norm(r["player"]), r["market"])
        if k in settled and settled[k] != r["settledStat"]:
            conflicts.append({"file": f, "key": list(k), "a": settled[k], "b": r["settledStat"]})
        settled.setdefault(k, r["settledStat"])

FAM = {"batter_hits": lambda b: b["hits"], "batter_total_bases": lambda b: b["totalBases"],
       "batter_hits_runs_rbis": lambda b: b["hits"] + b["runs"] + b["rbi"]}
pairs = collections.defaultdict(list)  # market -> (gamePk, sim, actual, rateSource)
for r in G["records"]:
    g = r["lcpGame"]
    if not g:
        continue
    pk = str(g["gamePk"])
    for b in g["players"]["batters"]:
        for m, fn in FAM.items():
            k = (pk, norm(b["name"]), m)
            if k in settled:
                pairs[m].append((pk, fn(b), settled[k], b.get("rateSource", "unknown")))
    for p in g["players"]["pitchers"]:
        k = (pk, norm(p["name"]), "pitcher_strikeouts")
        if k in settled:
            pairs["pitcher_strikeouts"].append((pk, p["strikeouts"], settled[k], "starter"))


def cluster_boot(rows):
    by = collections.defaultdict(list)
    for pk, s, a, _ in rows:
        by[pk].append(a - s)
    keys = list(by); sums = np.array([sum(by[k]) for k in keys]); cnts = np.array([len(by[k]) for k in keys])
    idx = rng.integers(0, len(keys), size=(10000, len(keys)))
    bm = sums[idx].sum(1) / cnts[idx].sum(1)
    return [float(sums.sum() / cnts.sum()), float(np.percentile(bm, 2.5)), float(np.percentile(bm, 97.5))]


out = {"settledKeys": len(settled), "settledStatConflicts": len(conflicts), "conflictExamples": conflicts[:10], "families": {}}
for m, rows in pairs.items():
    sim = np.array([x[1] for x in rows]); act = np.array([x[2] for x in rows])
    out["families"][m] = {"n": len(rows), "games": len({x[0] for x in rows}), "simMean": float(sim.mean()), "actualMean": float(act.mean()),
                          "ratioActualOverSim": float(act.mean() / sim.mean()), "level_actual_minus_sim_clusterBoot95": cluster_boot(rows),
                          "bySource": {src: {"n": len(rs), "simMean": float(np.mean([x[1] for x in rs])), "actualMean": float(np.mean([x[2] for x in rs]))}
                                       for src in {x[3] for x in rows} for rs in [[x for x in rows if x[3] == src]]}}
json.dump(out, open(os.path.join(OUT, "players.json"), "w"), indent=1)
print(json.dumps(out, indent=1)[:3000])
