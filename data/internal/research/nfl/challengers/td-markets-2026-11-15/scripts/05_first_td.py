"""First touchdown scorer.

COMPETING-RISKS (CR) model on the official opportunityTd chain. Assumptions, stated:
  every touchdown source is an independent Poisson process with a constant hazard over game time, so the first
  event is source j with probability rate_j / M and no touchdown happens with probability e^-M:
    candidate i (played): rate mu_i - c   (mu_i = the official per-player Poisson mean, c = the model's constant
                                           other-TD term 0.00296, which is moved into DEF/ST)
    other offensive players, per team: max(0, lamRush + lamRec - sum_i(mu_i - c))  (the team's own pregame
                                           TD form lambda minus what the played candidates hold)
    DEF/ST (both teams): d = mean non-offensive TDs per game over all seasons before the scored one (pbp)
  P(i first) = (rate_i / M) (1 - e^-M),  P(none) = e^-M.  This partition is complete; no floor is needed.
NAIVE baseline: P(i first) = p_i / sum(p) x (1 - qNone - qDefSt - qOtherOff) with the q's the walk-forward historical
  frequencies (this is the 'normalise the anytime percentages' derivation, used only as a baseline).
Scored: 2015-2025 games (pbp first TD, nflverse), walk-forward. 2026: only 4 games have a scoring-order source on
disk (live ESPN summary captures under ~/gtp-evidence/live-v2-*), descriptive only.
Usage: python3 -I 05_first_td.py <resultsDir> <worktreeRoot>
"""
import glob, json, math, os, random, re, sys
from collections import defaultdict

RES, ROOT = sys.argv[1], sys.argv[2]
rep = json.load(open(f"{RES}/replay_rows_2014_2025.json"))
RC = {c: i for i, c in enumerate(rep["columns"])}
TG = {c: i for i, c in enumerate(rep["teamGameColumns"])}
OTHER_C = rep["league"]["otherTdPerPlayerGame"]
pbp = {g["gameId"]: g for g in json.load(open(f"{RES}/pbp_first_td_2014_2025.json"))["games"]}
FLOOR = 1e-4

cands = defaultdict(list)
for r in rep["rows"]:
    cands[r[RC["gameId"]]].append({"pid": r[RC["playerId"]], "team": r[RC["team"]], "mu": r[RC["mu"]], "p": r[RC["p"]], "pos": r[RC["position"]]})
teams = defaultdict(dict)
for t in rep["teamGames"]:
    teams[t[TG["gameId"]]][t[TG["team"]]] = t

# walk-forward class frequencies from pbp
season_of = lambda gid: int(gid[:4])
def hist_rates(before):
    gs = [g for g in pbp.values() if g["season"] < before]
    n = len(gs)
    defst_per_game = sum(g["defSt"] for g in gs) / n
    q = {"NONE": sum(g["first"]["class"] == "NONE" for g in gs) / n, "DEF_ST": sum(g["first"]["class"] == "DEF_ST" for g in gs) / n}
    # first TD by an offensive player who was not a played candidate
    oo = 0
    for g in gs:
        if g["first"]["class"] == "OFF" and g["gameId"] in cands and g["first"]["playerId"] not in {c["pid"] for c in cands[g["gameId"]]}:
            oo += 1
    q["OTHER_OFF"] = oo / n
    return defst_per_game, q

games_out = []
rates_cache = {}
dropped = defaultdict(int)
resid_ratio = []
for gid, g in sorted(pbp.items()):
    s = g["season"]
    if s < 2015:
        continue
    if gid not in cands or len(teams.get(gid, {})) != 2:
        dropped["no replay candidates / team lambda for both teams"] += 1; continue
    if s not in rates_cache:
        rates_cache[s] = hist_rates(s)
    d, q = rates_cache[s]
    cl = cands[gid]
    rate = {}
    other_off = 0.0
    for team, t in teams[gid].items():
        lam = t[TG["lamRush"]] + t[TG["lamRec"]]
        held = sum(max(0.0, c["mu"] - OTHER_C) for c in cl if c["team"] == team)
        other_off += max(0.0, lam - held)
        resid_ratio.append((max(0.0, lam - held), held))
    for c in cl:
        rate[c["pid"]] = max(0.0, c["mu"] - OTHER_C)
    M = sum(rate.values()) + other_off + d
    pany = 1 - math.exp(-M)
    cr = {k: v / M * pany for k, v in rate.items()}
    cr["OTHER_OFF"] = other_off / M * pany; cr["DEF_ST"] = d / M * pany; cr["NONE"] = math.exp(-M)
    sp = sum(c["p"] for c in cl); mass = 1 - q["NONE"] - q["DEF_ST"] - q["OTHER_OFF"]
    nv = {c["pid"]: c["p"] / sp * mass for c in cl}
    nv.update({"OTHER_OFF": q["OTHER_OFF"], "DEF_ST": q["DEF_ST"], "NONE": q["NONE"]})
    f = g["first"]
    if f["class"] == "NONE": actual = "NONE"
    elif f["class"] == "DEF_ST": actual = "DEF_ST"
    else: actual = f["playerId"] if f["playerId"] in rate else "OTHER_OFF"
    games_out.append({"gameId": gid, "season": s, "actual": actual, "cr": cr, "nv": nv, "cands": [c["pid"] for c in cl]})

def score(key):
    n = len(games_out); ll = 0.0; top1 = top5 = e1 = e5 = 0.0
    classes = {k: [0.0, 0] for k in ("NONE", "DEF_ST", "OTHER_OFF")}
    bins = [[0, 0.0, 0] for _ in range(8)]; edges = [0, .02, .04, .06, .08, .10, .13, .17, 1.0001]
    for g in games_out:
        P = g[key]
        ll -= math.log(max(FLOOR, P.get(g["actual"], 0.0)))
        ranked = sorted(g["cands"], key=lambda k: -P[k])
        top1 += ranked[0] == g["actual"]; e1 += P[ranked[0]]
        top5 += g["actual"] in ranked[:5]; e5 += sum(P[k] for k in ranked[:5])
        for k in classes: classes[k][0] += P[k]; classes[k][1] += g["actual"] == k
        for k in g["cands"]:
            p = P[k]; b = next(i for i in range(8) if p < edges[i + 1]); bins[b][0] += 1; bins[b][1] += p; bins[b][2] += g["actual"] == k
    candp = sum(sum(g[key][k] for k in g["cands"]) for g in games_out); candy = sum(g["actual"] in g["cands"] for g in games_out)
    return {"games": n, "multinomialLogLoss": ll / n, "top1Hit": top1 / n, "top1Expected": e1 / n, "top5Hit": top5 / n, "top5Expected": e5 / n,
            "candidateMassPredOverObs": candp / candy,
            "classes": {k: {"meanPred": v[0] / n, "obs": v[1] / n} for k, v in classes.items()},
            "playerReliability": [{"bin": [edges[i], min(1, edges[i + 1])], "n": b[0], "meanPred": round(b[1] / b[0], 4), "obs": round(b[2] / b[0], 4)} for i, b in enumerate(bins) if b[0]]}

def boot(B=2000, seed=20261115):
    diffs = [(-math.log(max(FLOOR, g["cr"].get(g["actual"], 0)))) - (-math.log(max(FLOOR, g["nv"].get(g["actual"], 0)))) for g in games_out]
    rnd = random.Random(seed); G = len(diffs); st = sorted(sum(diffs[rnd.randrange(G)] for _ in range(G)) / G for _ in range(B))
    return {"games": G, "dLogLoss_CR_minus_NAIVE": sum(diffs) / G, "ci95": [st[int(.025 * B)], st[int(.975 * B) - 1]]}

hist = {"population": "2015-2025 REG+POST games in both nflverse pbp and the P301 replay (played candidates; DNP voids)", "dropped": dict(dropped),
        "CR": score("cr"), "NAIVE": score("nv"), "paired": boot(),
        "residualShareOfTeamLambda": sum(a for a, b in resid_ratio) / sum(a + b for a, b in resid_ratio)}

# ── 2026: sim-v2 structure + the 4 games with a scoring-order source ──
fwd = json.load(open(f"{RES}/forward_2026.json"))
struct = []
for sg in fwd["simGames"]:
    ft = sg["firstTdScorer"]; tot = sum(x["probability"] for x in ft) + sg["teamFirstTd"]["none"]
    struct.append({"eventId": sg["eventId"], "schema": sg["schema"], "rows": len(ft), "sumPlusNone": round(tot, 4), "hasDefSt": any(x["playerId"] == "DEF_ST" for x in ft), "hasOther": any(x["playerId"] == "OTHER" for x in ft)})
# P(first) <= P(anytime) inside sim-v2 receipts of record
simrows = defaultdict(dict)
for r in fwd["sim"]:
    simrows[r["eventId"]][r["playerId"]] = r["anytime"]
viol = 0; checked = 0
for sg in fwd["simGames"]:
    d = json.load(open(os.path.join(ROOT, sg["receipt"])))
    at = {p["playerId"]: p["anytimeTd"] for p in d["playerStatDistributions"]}
    for x in sg["firstTdScorer"]:
        if x["playerId"] in at:
            checked += 1; viol += x["probability"] > at[x["playerId"]] + 1e-9
simstruct = {"games": len(struct), "sumPlusNoneRange": [min(s["sumPlusNone"] for s in struct), max(s["sumPlusNone"] for s in struct)],
             "bySchema": {sv: {"games": sum(1 for s in struct if s["schema"] == sv), "withDefStRow": sum(1 for s in struct if s["schema"] == sv and s["hasDefSt"]), "withOtherRow": sum(1 for s in struct if s["schema"] == sv and s["hasOther"])} for sv in sorted({s["schema"] for s in struct})},
             "firstLeAnytime": {"checked": checked, "violations": viol}}

# scoring order captures
caps = defaultdict(list)
for f in glob.glob(os.path.expanduser("~/gtp-evidence/live-v2-*/captures/*espn*.json")):
    m = re.search(r"(\d{8}T\d{6}Z)-espn(?:-(\d+))?\.json$", f)
    if not m: continue
    eid = m.group(2) or re.search(r"live-v2-(\d+)", f).group(1)
    caps[eid].append((m.group(1), f))
truth = {}
for eid, lst in caps.items():
    ts, f = sorted(lst)[-1]
    d = json.load(open(f))
    status = d.get("header", {}).get("competitions", [{}])[0].get("status", {}).get("type", {}).get("name")
    if status != "STATUS_FINAL": continue
    tds = [s for s in d.get("scoringPlays", []) if s.get("type", {}).get("abbreviation") == "TD" or "Touchdown" in s.get("type", {}).get("text", "")]
    if not tds: truth[eid] = {"class": "NONE", "capture": f}; continue
    s0 = tds[0]; t = s0["type"]["text"]
    off = t in ("Passing Touchdown", "Rushing Touchdown")
    truth[eid] = {"class": "OFF" if off else "DEF_ST", "text": s0["text"], "type": t, "team": s0["team"]["abbreviation"], "capture": f}
sim_by_eid = {sg["eventId"]: sg for sg in fwd["simGames"]}
off_by_game = defaultdict(list)
for r in fwd["official"]:
    off_by_game[r["gameId"]].append(r)
rho = hist["residualShareOfTeamLambda"]; d_all, q_all = hist_rates(2026)
g26 = []
norm = lambda s: re.sub(r"[^a-z]", "", s.lower().replace(" jr.", "").replace(" iii", "").replace(" ii", ""))
for eid, t in sorted(truth.items()):
    sg = sim_by_eid.get(eid)
    row = {"eventId": eid, "truth": {k: v for k, v in t.items() if k != "capture"}, "truthSource": os.path.relpath(t["capture"], os.path.expanduser("~"))}
    if sg is None:
        row["simv2"] = "no receipt of record (receipts start 2026-10-05; this event has none before kickoff)"
    else:
        ft = sg["firstTdScorer"]
        if t["class"] == "OFF":
            hit = [x for x in ft if x["playerId"] not in ("OTHER", "DEF_ST") and norm(t["text"]).startswith(norm(x["name"]))]
            p_act = hit[0]["probability"] if hit else sum(x["probability"] for x in ft if x["playerId"] == "OTHER" and x["team"] == t["team"])
            row["simv2"] = {"receipt": sg["receipt"], "generatedAt": sg["generatedAt"], "eventStart": sg["eventStart"], "pActual": p_act, "matched": hit[0]["name"] if hit else "OTHER (team residual)",
                            "rankOfActual": (sorted([x["probability"] for x in ft if x["playerId"] not in ("OTHER", "DEF_ST")], reverse=True).index(hit[0]["probability"]) + 1) if hit else None}
        gid = sg["gameId"]
        cl = off_by_game.get(gid, [])
        if cl:
            rate = {r["name"]: max(0.0, -math.log(1 - min(r["p"], .9999)) - OTHER_C) for r in cl}
            held = sum(rate.values()); other_off = held * rho / (1 - rho); M = held + other_off + d_all; pany = 1 - math.exp(-M)
            if t["class"] == "OFF":
                hit = [n for n in rate if norm(t["text"]).startswith(norm(n))]
                p_act = rate[hit[0]] / M * pany if hit else other_off / M * pany
                row["competingRisks"] = {"pActual": p_act, "matched": hit[0] if hit else "OTHER_OFF", "rankOfActual": (sorted(rate.values(), reverse=True).index(rate[hit[0]]) + 1) if hit else None, "candidates": len(rate)}
    g26.append(row)
out = {"definitions": __doc__, "historical": hist, "simv2Structure2026": simstruct, "games2026WithScoringOrder": g26,
       "scoringOrderSourceNote": "No committed 2026 source carries scoring order: player-events-v1/2026 has per-player rush/rec TD totals only; results/official-periods have quarter scores; live-props keep final stats. Only the ESPN summary captures in ~/gtp-evidence/live-v2-401872995 and live-v2-sun-1018 carry scoringPlays."}
json.dump(out, open(f"{RES}/first_td.json", "w"), indent=1, default=lambda x: round(x, 6))
print(json.dumps({k: v for k, v in hist.items() if k not in ("CR", "NAIVE")}, default=lambda x: round(x, 5)))
for k in ("CR", "NAIVE"):
    m = hist[k]; print(k, json.dumps({kk: vv for kk, vv in m.items()}, default=lambda x: round(x, 4)))
print(json.dumps(simstruct)); print(json.dumps(g26, indent=0, default=lambda x: round(x, 4)))

# ── diagnostic: where does the CR-vs-NAIVE log-loss gap come from? (by actual outcome class) ──
diag = defaultdict(lambda: [0, 0.0, 0.0])
for g in games_out:
    k = g["actual"] if g["actual"] in ("NONE", "DEF_ST", "OTHER_OFF") else "CANDIDATE"
    x = diag[k]; x[0] += 1
    x[1] += -math.log(max(FLOOR, g["cr"].get(g["actual"], 0))); x[2] += -math.log(max(FLOOR, g["nv"].get(g["actual"], 0)))
diag_out = {k: {"games": v[0], "meanLossCR": v[1] / v[0], "meanLossNAIVE": v[2] / v[0], "sumDiffPerAllGames": (v[1] - v[2]) / len(games_out)} for k, v in diag.items()}
# candidate-only conditional comparison: P(actual | first TD is by a played candidate), renormalised over candidates
cc = [0, 0.0, 0.0]
for g in games_out:
    if g["actual"] in g["cands"]:
        sc = sum(g["cr"][k] for k in g["cands"]); sn = sum(g["nv"][k] for k in g["cands"])
        cc[0] += 1; cc[1] += -math.log(g["cr"][g["actual"]] / sc); cc[2] += -math.log(g["nv"][g["actual"]] / sn)
diag_out["conditionalOnCandidateFirst"] = {"games": cc[0], "meanLossCR": cc[1] / cc[0], "meanLossNAIVE": cc[2] / cc[0]}
out["historical"]["gapDiagnostic"] = diag_out
json.dump(out, open(f"{RES}/first_td.json", "w"), indent=1, default=lambda x: round(x, 6))
print(json.dumps(diag_out, default=lambda x: round(x, 4)))

# ── POST-HOC variant (added after seeing the gap above; one look, exploratory only) ──
# CR2: keep the Poisson-race allocation among played candidates (rate_i / sum rate) and the game-specific
# P(none) = e^-M, but take the OTHER_OFF and DEF_ST shares of the first TD from the walk-forward historical
# frequencies (as NAIVE does) instead of the clipped per-game residual.
for g in games_out:
    s = g["season"]; d, q = rates_cache[s]
    cr = g["cr"]; pn = cr["NONE"]
    sc = sum(cr[k] for k in g["cands"])
    sO = q["OTHER_OFF"] / (1 - q["NONE"]); sD = q["DEF_ST"] / (1 - q["NONE"])
    cr2 = {k: cr[k] / sc * (1 - sO - sD) * (1 - pn) for k in g["cands"]}
    cr2.update({"OTHER_OFF": sO * (1 - pn), "DEF_ST": sD * (1 - pn), "NONE": pn})
    g["cr2"] = cr2
def boot_pair(a, b, B=2000, seed=20261115):
    diffs = [(-math.log(max(FLOOR, g[a].get(g["actual"], 0)))) - (-math.log(max(FLOOR, g[b].get(g["actual"], 0)))) for g in games_out]
    rnd = random.Random(seed); G = len(diffs); st = sorted(sum(diffs[rnd.randrange(G)] for _ in range(G)) / G for _ in range(B))
    return {"games": G, f"dLogLoss_{a}_minus_{b}": sum(diffs) / G, "ci95": [st[int(.025 * B)], st[int(.975 * B) - 1]]}
out["historical"]["CR2_posthoc"] = score("cr2")
out["historical"]["paired_CR2_vs_NAIVE_posthoc"] = boot_pair("cr2", "nv")
json.dump(out, open(f"{RES}/first_td.json", "w"), indent=1, default=lambda x: round(x, 6))
print("CR2", json.dumps(out["historical"]["CR2_posthoc"], default=lambda x: round(x, 4)))
print(json.dumps(out["historical"]["paired_CR2_vs_NAIVE_posthoc"], default=lambda x: round(x, 5)))
