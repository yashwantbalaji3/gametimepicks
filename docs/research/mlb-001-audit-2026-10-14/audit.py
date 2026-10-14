"""MLB-001 audit, step 2: provenance, internal-coherence invariants, rules exposure, and realised comparison.

Inputs : out/games.json (from extract.py) + committed files read with `git show origin/main:<path>`:
         app/public/data/mlb/results/game-projected-scores-graded.jsonl  (realised finals)
         data/internal/mlb/linescores-history/{2023,2024,2025}/*.json    (historical regular-season finals)
Outputs: out/provenance.json, out/invariants.json, out/rules.json, out/scores.json, out/historical.json
Run    : python3 -I audit.py /Users/yashwantbalaji/Downloads/gametimepicks
READ-ONLY against the repo. Deterministic (bootstrap seed 20261014).
"""
import json, math, os, subprocess, sys, collections
from datetime import datetime
import numpy as np

REPO = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
G = json.load(open(os.path.join(OUT, "games.json")))
MAIN = G["originMain"]
POSTSEASON_FROM = "2026-09-29"  # first 2026 file date after the last regular-season date (09-27); 09-28 has no file
B = 10000
rng = np.random.default_rng(20261014)


def git(*a):
    return subprocess.run(["git", "-C", REPO, *a], check=True, capture_output=True).stdout


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def dump(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, indent=1, default=float)


R = G["records"]
period = lambda d: "post" if d >= POSTSEASON_FROM else ("jul-aug" if d < "2026-09-01" else ("sep01-14" if d < "2026-09-15" else "sep15-27"))

# ------------------------------------------------------------------ A. provenance
prov = collections.Counter()
prov_rows = collections.defaultdict(list)
for r in R:
    m, l, mg = r["main"], r["lcp"], r["mainGame"]
    fp = ts(r["firstPitch"])
    if l is None:
        cat = "NO_PREGAME_COMMIT_" + ("SIM_ON_MAIN" if mg and m["status"] != "unavailable" else "UNAVAILABLE")
    elif m["artifactHash"] == l["artifactHash"]:
        cat = "MAIN_EQUALS_LAST_PREGAME_COMMIT"
    elif m["status"] == "unavailable":
        cat = "PREGAME_SIM_ERASED_ON_MAIN"
    else:
        first = next(x for x in r["history"] if x["artifactHash"] == m["artifactHash"])
        cat = "MAIN_IS_POST_PITCH_REVISION" if ts(first["fileGeneratedAt"]) > fp else (
            "MAIN_PREGAME_GENERATED_COMMITTED_LATE" if ts(first["commitIso"]) > fp else "MAIN_REVERTED_TO_EARLIER_BYTES_AFTER_PITCH")
    prov[cat] += 1
    prov_rows[cat].append({"file": r["path"], "gamePk": r["gamePk"], "firstPitch": r["firstPitch"],
                           "mainHash": (m or {}).get("artifactHash", "")[:12], "lastPregameHash": (l or {}).get("artifactHash", "")[:12],
                           "lastPregameCommit": (l or {}).get("commit", "")[:10]})
# frozenPregame ledger checks on main
ledger_bad = []
for r in R:
    e = (r["main"] or {}).get("frozenEntry")
    if e:
        if e.get("artifactHash") != r["main"]["artifactHash"] or ts(e["forecastGeneratedAt"]) > ts(r["firstPitch"]):
            ledger_bad.append({"file": r["path"], "gamePk": r["gamePk"], "entry": e, "mainHash": r["main"]["artifactHash"]})
dup_pk = collections.defaultdict(list)
for r in R:
    if r["lcpGame"]:
        dup_pk[r["gamePk"]].append(r["date"])
dups = {k: v for k, v in dup_pk.items() if len(v) > 1}
dump("provenance.json", {"originMain": MAIN, "counts": prov, "rows": prov_rows, "frozenLedgerViolations": ledger_bad,
                         "gamePkWithPregameSimOnTwoDates": dups})

# ------------------------------------------------------------------ B. invariants on every distinct simulated record
recs = {}
roles = collections.defaultdict(set)
for r in R:
    for key in ("lcpGame", "mainGame"):
        g = r[key]
        if g and g.get("status") != "unavailable" and g.get("runs"):
            recs[g["artifactHash"]] = (r["path"], g)
            roles[g["artifactHash"]].add("lastPregame" if key == "lcpGame" else "main")
viol = collections.defaultdict(list)
stats = collections.defaultdict(list)


def V(name, path, g, detail):
    viol[name].append({"file": path, "gamePk": g["gamePk"], "artifactHash": g["artifactHash"][:12], "roles": sorted(roles[g["artifactHash"]]), "detail": detail})


def pctl_from_bins(bins, n, q):
    idx = min(n - 1, max(0, round(q * (n - 1))))
    c = 0
    for b in bins:
        c += b["count"]
        if c > idx:
            return b["value"]


hash_seen = collections.Counter(h for h in recs)
for h, (path, g) in recs.items():
    n = g["runCount"]
    wp = g["winProbability"]
    if abs(wp["home"] + wp["away"] - 1) > 0.0011:
        V("I01_win_mass", path, g, wp)
    td, rd = g["totalRuns"]["distribution"], g["runDifferential"]["distribution"]
    if sum(b["count"] for b in td) != n: V("I02_total_pmf_mass", path, g, sum(b["count"] for b in td))
    if sum(b["count"] for b in rd) != n: V("I03_diff_pmf_mass", path, g, sum(b["count"] for b in rd))
    zero = sum(b["count"] for b in rd if b["value"] == 0)
    if zero: V("I04_tied_worlds", path, g, zero)
    for b in td + rd:
        if abs(b["probability"] - b["count"] / n) > 0.00051: V("I05_bin_prob_vs_count", path, g, b); break
    pos = sum(b["count"] for b in rd if b["value"] > 0)
    if abs(pos / n - wp["home"]) > 0.0005 + 1e-9: V("I06_win_vs_diff_pmf", path, g, [pos / n, wp["home"]])  # JS rounds half-up; compare unrounded
    for rl in g["runLine"]:
        L = rl["line"]
        hc = sum(b["count"] for b in rd if b["value"] > L) / n
        ac = sum(b["count"] for b in rd if -b["value"] > L) / n
        if abs(hc - rl["homeCover"]) > 0.0005 + 1e-9 or abs(ac - rl["awayCover"]) > 0.0005 + 1e-9:
            V("I07_runline_vs_diff_pmf", path, g, [L, hc, rl["homeCover"], ac, rl["awayCover"]])
    ra, rh = g["runs"]["away"], g["runs"]["home"]
    d1 = rh["mean"] - ra["mean"] - g["runDifferential"]["mean"]; stats["meanDiffGap"].append(d1)
    if abs(d1) > 0.0151: V("I08_team_means_vs_diff_mean", path, g, round(d1, 4))
    d2 = rh["mean"] + ra["mean"] - g["totalRuns"]["mean"]; stats["meanTotalGap"].append(d2)
    if abs(d2) > 0.0151: V("I09_team_means_vs_total_mean", path, g, round(d2, 4))
    tail = [b for b in td if str(b["label"]).endswith("+")]
    body = sum(b["value"] * b["count"] for b in td if not str(b["label"]).endswith("+"))
    if tail:
        implied = (g["totalRuns"]["mean"] * n - body) / tail[0]["count"]
        stats["tailImpliedMean"].append(implied)
        if implied < tail[0]["value"] - 50 / tail[0]["count"]: V("I10_total_tail_mean_impossible", path, g, round(implied, 2))
    else:
        if abs(body / n - g["totalRuns"]["mean"]) > 0.0051: V("I10_total_mean_vs_pmf", path, g, [body / n, g["totalRuns"]["mean"]])
    for q, k in ((0.1, "p10"), (0.5, "median"), (0.9, "p90")):
        if pctl_from_bins(td, n, q) != g["totalRuns"][k]: V("I11_total_quantile_vs_pmf", path, g, [k, pctl_from_bins(td, n, q), g["totalRuns"][k]])
        if pctl_from_bins(rd, n, q) != g["runDifferential"][k]: V("I11_diff_quantile_vs_pmf", path, g, [k, pctl_from_bins(rd, n, q), g["runDifferential"][k]])
    for side in ("away", "home"):
        tt = g["teamTotals"][side]
        for t in tt:
            if abs(t["over"] + t["under"] - 1) > 0.0011: V("I12_teamtotal_mass", path, g, t)
        if len(tt) == 2 and tt[1]["over"] > tt[0]["over"] + 1e-9: V("I12_teamtotal_monotone", path, g, tt)
        med = g["runs"][side]["median"]
        for t in tt:
            if t["line"] == med - 0.5 and t["over"] < 0.4995: V("I13_teamtotal_vs_median", path, g, [side, med, t])
            if t["line"] == med + 0.5 and t["over"] > 0.5005: V("I13_teamtotal_vs_median", path, g, [side, med, t])
    fs = g["finalScores"]
    for s in fs:
        if s["away"] == s["home"]: V("I14_tied_final_score", path, g, s)
        pt = sum(b["count"] for b in td if b["value"] == s["away"] + s["home"]) / n
        pd_ = sum(b["count"] for b in rd if b["value"] == s["home"] - s["away"]) / n
        if s["probability"] > min(pt, pd_) + 0.0006: V("I15_final_score_exceeds_marginal", path, g, [s, pt, pd_])
    if any(fs[i]["probability"] < fs[i + 1]["probability"] for i in range(len(fs) - 1)): V("I16_final_scores_order", path, g, fs)
    ex = g.get("extraInningsProbability")
    if ex is None or not (0 <= ex <= 1): V("I17_extras_range", path, g, ex)
    # players
    bats = g["players"]["batters"]; pits = {p["team"]: p for p in g["players"]["pitchers"]}
    for side, team in (("away", g["awayTeam"]), ("home", g["homeTeam"])):
        tb = sorted([b for b in bats if b["team"] == team], key=lambda b: b["battingOrder"])
        if len(tb) != 9: V("I18_lineup_size", path, g, [team, len(tb)]); continue
        pa = [b["plateAppearances"] for b in tb]
        stats["teamPA"].append(sum(pa)); stats["slot1PA"].append(pa[0]); stats["slot9PA"].append(pa[8])
        if any(pa[i] + 0.0011 < pa[i + 1] for i in range(8)) or pa[0] - pa[8] > 1.0011: V("I19_pa_by_slot", path, g, pa)
        sr = sum(b["runs"] for b in tb); srbi = sum(b["rbi"] for b in tb)
        gap = g["runs"][side]["mean"] - sr; stats["teamRunsMinusBatterRuns"].append(gap)
        if abs(gap) > 0.0101: V("I20_team_runs_vs_batter_runs", path, g, [side, round(gap, 4)])
        stats["rbiOverRuns"].append(srbi / sr if sr else float("nan"))
        if srbi > sr + 0.005: V("I21_rbi_exceed_runs", path, g, [side, srbi, sr])
        for b in tb:
            if not (b["homeRuns"] <= b["hits"] + 1e-9 <= b["plateAppearances"] + 2e-9) or not (b["hits"] - 1e-9 <= b["totalBases"] <= 4 * b["hits"] + 0.002) \
                    or b["hits"] + b["walks"] + b["strikeouts"] > b["plateAppearances"] + 0.002:
                V("I22_batter_line_impossible", path, g, b)
        opp = pits.get(g["homeTeam"] if side == "away" else g["awayTeam"])
        if opp:
            stats["starterBF"].append(opp["battersFaced"]); stats["starterOuts"].append(opp["outsRecorded"])
            if opp["battersFaced"] > 25.0005: V("I23_starter_bf_above_cap", path, g, opp)
            if opp["outsRecorded"] > opp["battersFaced"] + 1e-6 or opp["strikeouts"] > opp["battersFaced"] or opp["hitsAllowed"] > opp["battersFaced"]:
                V("I24_starter_line_impossible", path, g, opp)
            if opp["battersFaced"] > sum(pa) + 0.005 or opp["hitsAllowed"] > sum(b["hits"] for b in tb) + 0.005 \
                    or opp["strikeouts"] > sum(b["strikeouts"] for b in tb) + 0.005 or opp["runsAllowed"] > g["runs"][side]["mean"] + 0.006:
                V("I25_starter_exceeds_team", path, g, [side, opp])
    mk = g.get("market")
    if mk:
        if ts(mk["capturedAt"]) > ts(g["firstPitch"]): V("I26_market_captured_after_first_pitch", path, g, mk["capturedAt"])
        if mk.get("moneyline") and abs(mk["moneyline"]["home"] + mk["moneyline"]["away"] - 1) > 0.0011: V("I27_market_ml_mass", path, g, mk["moneyline"])
    if (g["status"] == "ready") != ((g.get("completeness") or {}).get("level") == "ready"): V("I28_status_vs_completeness", path, g, [g["status"], g["completeness"]["level"]])

summ = lambda x: {"n": len(x), "mean": float(np.nanmean(x)), "min": float(np.nanmin(x)), "p50": float(np.nanmedian(x)), "max": float(np.nanmax(x))} if x else None
dump("invariants.json", {"recordsChecked": len(recs), "violationCounts": {k: len(v) for k, v in sorted(viol.items())},
                         "violations": {k: v[:25] for k, v in viol.items()}, "stats": {k: summ(v) for k, v in stats.items()}})

# ------------------------------------------------------------------ C. pregame evaluation set + realised join
graded = [json.loads(l) for l in git("show", f"{MAIN}:app/public/data/mlb/results/game-projected-scores-graded.jsonl").decode().splitlines() if l.strip()]
gkey = collections.Counter((x["gamePk"], x["date"]) for x in graded)
graded_dups = [k for k, c in gkey.items() if c > 1]
gby = {(x["gamePk"], x["date"]): x for x in graded}
ev, cross = [], collections.Counter()
cross_rows = collections.defaultdict(list)
for r in R:
    g = r["lcpGame"]
    if not g:
        continue
    x = gby.get((r["gamePk"], r["date"]))
    if not x:
        cross["lcp_without_graded_final"] += 1; continue
    gen_match = abs(ts(x["forecastGeneratedAt"]) - ts(r["lcp"]["fileGeneratedAt"])) < 1
    med_match = x["projectedScore"]["away"] == g["runs"]["away"]["median"] and x["projectedScore"]["home"] == g["runs"]["home"]["median"]
    cross[("graderGeneratedAt==lastPregameCommit" if gen_match else "graderGeneratedAt!=lastPregameCommit",
           "medians_match" if med_match else "medians_differ")] += 1
    if not gen_match or not med_match:
        cross_rows["mismatch"].append({"date": r["date"], "gamePk": r["gamePk"], "graderForecastGeneratedAt": x["forecastGeneratedAt"],
                                       "graderSource": x["forecastSource"], "lastPregameCommitGeneratedAt": r["lcp"]["fileGeneratedAt"],
                                       "graderScore": x["projectedScore"], "lcpMedians": [g["runs"]["away"]["median"], g["runs"]["home"]["median"]]})
    ev.append((r, g, x))
graded_without_lcp = [k for k in gby if k not in {(r["gamePk"], r["date"]) for r in R if r["lcpGame"]}]


def boot_mean_ci(diff):
    diff = np.asarray(diff, float); n = len(diff)
    idx = rng.integers(0, n, size=(B, n))
    m = diff[idx].mean(axis=1)
    return [float(diff.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5)), n]


def ll(p, y):
    p = min(max(p, 1e-6), 1 - 1e-6)
    return -(y * math.log(p) + (1 - y) * math.log(1 - p))


def pmf(g):
    n = g["runCount"]
    return {b["value"]: b["count"] / n for b in g["totalRuns"]["distribution"]}, max(b["value"] for b in g["totalRuns"]["distribution"])


def crps_int(p, cap, y):
    # CRPS for an integer-valued forecast: sum_k (F(k) - 1{y<=k})^2, top bin treated as the point `cap` (understates tail)
    F, s = 0.0, 0.0
    for k in range(0, max(cap, y) + 1):
        F += p.get(k, 0.0)
        s += (F - (1.0 if y <= k else 0.0)) ** 2
    return s


rows = []
for r, g, x in ev:
    a, h = x["actual"]["awayRuns"], x["actual"]["homeRuns"]
    if a == h:
        continue
    p, cap = pmf(g)
    tot = a + h
    yH = 1 if h > a else 0
    F_lo = sum(v for k, v in p.items() if k < tot); F_eq = p.get(min(tot, cap), 0.0) if tot <= cap else 0.0
    row = {"date": r["date"], "period": period(r["date"]), "gamePk": r["gamePk"], "status": g["status"], "pH": g["winProbability"]["home"],
           "yH": yH, "tot": tot, "simMeanTot": g["totalRuns"]["mean"], "crpsTot": crps_int(p, cap, tot),
           "pitLo": F_lo, "pitHi": F_lo + F_eq, "absDiff1": 1 if abs(h - a) == 1 else 0,
           "simP1run": sum(b["count"] for b in g["runDifferential"]["distribution"] if abs(b["value"]) == 1) / g["runCount"],
           "simExtras": g.get("extraInningsProbability"), "aRuns": a, "hRuns": h, "simA": g["runs"]["away"]["mean"], "simH": g["runs"]["home"]["mean"],
           "simTotSD": math.sqrt(sum(v * (k - g["totalRuns"]["mean"]) ** 2 for k, v in p.items())),
           "simP21plus": p.get(cap, 0.0)}
    mk = g.get("market")
    if mk and ts(mk["capturedAt"]) <= ts(g["firstPitch"]):
        row["mH"] = mk["moneyline"]["home"]
        L = mk["total"]["line"]
        if tot != L:
            po = sum(v for k, v in p.items() if k > L); pu = sum(v for k, v in p.items() if k < L)
            row.update({"ouSim": po / (po + pu), "ouMkt": mk["total"]["over"], "ouY": 1 if tot > L else 0, "ouLine": L})
        rl = mk.get("runLine")
        if rl and rl.get("homeCover") is not None:
            sim_rl = next(z for z in g["runLine"] if z["line"] == 1.5)
            margin = h - a
            if rl["line"] == -1.5:
                row.update({"rlSim": sim_rl["homeCover"], "rlMkt": rl["homeCover"], "rlY": 1 if margin >= 2 else 0, "rlSide": "home-1.5"})
            elif rl["line"] == 1.5:
                row.update({"rlSim": 1 - sim_rl["awayCover"], "rlMkt": rl["homeCover"], "rlY": 1 if margin >= -1 else 0, "rlSide": "home+1.5"})
    rows.append(row)


def block(rs):
    out = {"n": len(rs)}
    if not rs:
        return out
    yH = [z["yH"] for z in rs]
    out["homeWinRealised"] = float(np.mean(yH)); out["homeWinSimMean"] = float(np.mean([z["pH"] for z in rs]))
    out["winLL_sim"] = float(np.mean([ll(z["pH"], z["yH"]) for z in rs]))
    out["winLL_coin"] = math.log(2)
    out["winLL_sim_minus_coin"] = boot_mean_ci([ll(z["pH"], z["yH"]) - math.log(2) for z in rs])
    mm = [z for z in rs if "mH" in z]
    if mm:
        out["winLL_market_subset"] = {"n": len(mm), "sim": float(np.mean([ll(z["pH"], z["yH"]) for z in mm])), "market": float(np.mean([ll(z["mH"], z["yH"]) for z in mm]))}
        out["winLL_sim_minus_market"] = boot_mean_ci([ll(z["pH"], z["yH"]) - ll(z["mH"], z["yH"]) for z in mm])
        out["winBrier_sim_minus_market"] = boot_mean_ci([(z["pH"] - z["yH"]) ** 2 - (z["mH"] - z["yH"]) ** 2 for z in mm])
    out["totalLevel_actual_minus_sim"] = boot_mean_ci([z["tot"] - z["simMeanTot"] for z in rs])
    out["totalCRPS_sim"] = float(np.mean([z["crpsTot"] for z in rs]))
    out["totalActualSD_resid"] = float(np.std([z["tot"] - z["simMeanTot"] for z in rs], ddof=1)); out["totalSimSD_mean"] = float(np.mean([z["simTotSD"] for z in rs]))
    # randomized PIT, fixed seed
    u = [z["pitLo"] + rng.random() * (z["pitHi"] - z["pitLo"]) for z in rs]
    out["PIT_decile_shares"] = [float(c) for c in np.histogram(u, bins=10, range=(0, 1))[0] / len(u)]
    out["PIT_outer20"] = float(np.mean([(v < 0.1 or v > 0.9) for v in u]))
    out["oneRun_realised"] = float(np.mean([z["absDiff1"] for z in rs])); out["oneRun_simMean"] = float(np.mean([z["simP1run"] for z in rs]))
    out["extras_simMean"] = float(np.mean([z["simExtras"] for z in rs if z["simExtras"] is not None]))
    out["awayRunsLevel_actual_minus_sim"] = boot_mean_ci([z["aRuns"] - z["simA"] for z in rs])
    out["homeRunsLevel_actual_minus_sim"] = boot_mean_ci([z["hRuns"] - z["simH"] for z in rs])
    out["P_total_ge_cap_simMean"] = float(np.mean([z["simP21plus"] for z in rs])); out["P_total_ge_21_realised"] = float(np.mean([z["tot"] >= 21 for z in rs]))
    ou = [z for z in rs if "ouSim" in z]
    if ou:
        out["ou_n"] = len(ou)
        out["ouLL"] = {"sim": float(np.mean([ll(z["ouSim"], z["ouY"]) for z in ou])), "market": float(np.mean([ll(z["ouMkt"], z["ouY"]) for z in ou])), "coin": math.log(2)}
        out["ouLL_sim_minus_market"] = boot_mean_ci([ll(z["ouSim"], z["ouY"]) - ll(z["ouMkt"], z["ouY"]) for z in ou])
        out["ouOverRealised"] = float(np.mean([z["ouY"] for z in ou])); out["ouOverSimMean"] = float(np.mean([z["ouSim"] for z in ou])); out["ouOverMktMean"] = float(np.mean([z["ouMkt"] for z in ou]))
    rl = [z for z in rs if "rlSim" in z]
    if rl:
        out["rl_n"] = len(rl)
        out["rlLL"] = {"sim": float(np.mean([ll(z["rlSim"], z["rlY"]) for z in rl])), "market": float(np.mean([ll(z["rlMkt"], z["rlY"]) for z in rl]))}
        out["rlLL_sim_minus_market"] = boot_mean_ci([ll(z["rlSim"], z["rlY"]) - ll(z["rlMkt"], z["rlY"]) for z in rl])
        out["rlCoverRealised"] = float(np.mean([z["rlY"] for z in rl])); out["rlSimMean"] = float(np.mean([z["rlSim"] for z in rl])); out["rlMktMean"] = float(np.mean([z["rlMkt"] for z in rl]))
    return out


scores = {"evaluationRule": "last revision committed to origin/main first-parent history at/before first pitch (GitHub evidence, not Vercel served-revision evidence)",
          "joinedGames": len(ev), "tiesExcluded": len(ev) - len(rows), "crossCheckWithGrader": {str(k): v for k, v in cross.items()},
          "crossCheckMismatchRows": cross_rows["mismatch"], "gradedDuplicateKeys": graded_dups, "gradedRowsWithoutPregameSim": len(graded_without_lcp),
          "all": block(rows)}
for p_ in ("jul-aug", "sep01-14", "sep15-27", "post"):
    scores[p_] = block([z for z in rows if z["period"] == p_])
for st in ("ready", "degraded"):
    scores["status_" + st] = block([z for z in rows if z["status"] == st])
dump("scores.json", scores)
with open(os.path.join(OUT, "eval_rows.jsonl"), "w") as f:
    for z in rows:
        f.write(json.dumps(z) + "\n")

# ------------------------------------------------------------------ D. historical baseline (2023-2025 regular season finals)
hist = []
names = [n for n in git("ls-tree", "-r", "--name-only", MAIN, "data/internal/mlb/linescores-history").decode().split() if n.endswith(".json") and "/20" in n]
for n_ in names:
    d = json.loads(git("show", f"{MAIN}:{n_}"))
    for g in d.get("games", []):
        if g.get("isFinal") and g.get("gameType", "R") == "R" and g.get("homeRuns") is not None:
            hist.append((g["season"], g["awayRuns"], g["homeRuns"]))
H = {}
for season in ("2023", "2024", "2025", "all"):
    hs = [z for z in hist if season == "all" or z[0] == season]
    tots = [a + h for _, a, h in hs]
    H[season] = {"games": len(hs), "meanTotal": float(np.mean(tots)), "sdTotal": float(np.std(tots, ddof=1)),
                 "homeWin": float(np.mean([h > a for _, a, h in hs])), "oneRun": float(np.mean([abs(h - a) == 1 for _, a, h in hs])),
                 "ties": int(sum(a == h for _, a, h in hs)), "P_total_ge_21": float(np.mean([t >= 21 for t in tots]))}
dump("historical.json", H)

# ------------------------------------------------------------------ E. rules exposure
ev_sims = [g for r in R if (g := r["lcpGame"])]
post = [g for r in R if (g := r["lcpGame"]) and r["date"] >= POSTSEASON_FROM]
rules = {"pregameSimGames": len(ev_sims), "postseasonPregameSimGames": len(post),
         "postseasonMeanExtrasProbability": float(np.mean([g["extraInningsProbability"] for g in post])) if post else None,
         "postseasonExpectedExtraInningGames": float(sum(g["extraInningsProbability"] for g in post)) if post else None,
         "allMeanExtrasProbability": float(np.mean([g["extraInningsProbability"] for g in ev_sims])),
         "starterBF_mean": stats and float(np.mean(stats["starterBF"])), "starterOuts_mean": float(np.mean(stats["starterOuts"])),
         "teamPA_mean": float(np.mean(stats["teamPA"])), "slot1PA_mean": float(np.mean(stats["slot1PA"])), "slot9PA_mean": float(np.mean(stats["slot9PA"]))}
dump("rules.json", rules)
print(json.dumps({"provenance": prov, "invariantViolations": {k: len(v) for k, v in sorted(viol.items())}, "recordsChecked": len(recs),
                  "joined": len(ev), "cross": {str(k): v for k, v in cross.items()}, "rules": rules}, indent=1, default=float))
