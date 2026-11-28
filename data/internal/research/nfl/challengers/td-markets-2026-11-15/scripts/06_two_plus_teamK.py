"""Two-plus TDs, stated alternative distribution (historical only; the 2026 forward rows do not carry team lambda).

TEAMK: team scorer-TD count K ~ EMPIRICAL pmf of actual team rush+rec TDs among team-games of earlier seasons whose
pregame lambda (lamRush+lamRec) fell in the same 0.25-wide bin; the player's share of each team TD is
s = (mu - c) / lambda (capped at 1), thinned binomially; plus an independent Poisson(c) other-TD term (c = 0.00296).
   A_k = sum_K P(K) C(K,k) s^k (1-s)^(K-k);  P(0) = e^-c A_0;  P(1) = e^-c (A_1 + c A_0);  P(2+) = 1 - P(0) - P(1).
With Poisson K this collapses exactly to the POISSON candidate; the empirical K tests whether the team-count shape
(under/over-dispersion vs Poisson) explains the POISSON miscalibration. Compared against the same walk-forward BUCKET
baseline as 04_two_plus.py (scored 2015-2025, game-clustered bootstrap).
Usage: python3 -I 06_two_plus_teamK.py <resultsDir>
"""
import json, math, random, sys
from collections import defaultdict
sys.path.insert(0, sys.path[0])

RES = sys.argv[1]
rep = json.load(open(f"{RES}/replay_rows_2014_2025.json"))
RC = {c: i for i, c in enumerate(rep["columns"])}
TG = {c: i for i, c in enumerate(rep["teamGameColumns"])}
c0 = rep["league"]["otherTdPerPlayerGame"]
lam = {}
tg_rows = []
for t in rep["teamGames"]:
    L = t[TG["lamRush"]] + t[TG["lamRec"]]
    lam[(t[TG["gameId"]], t[TG["team"]])] = L
    if t[TG["actRushTd"]] is not None:
        tg_rows.append((t[TG["season"]], L, t[TG["actRushTd"]] + t[TG["actRecTd"]]))
lbin = lambda L: min(int(L / 0.25), 16)

EDGES = [0, .05, .10, .15, .20, .25, .30, .35, .40, .45, .50, .60, 1.0001]
binof = lambda p: next(k for k in range(len(EDGES) - 1) if p < EDGES[k + 1])
clipp = lambda p: min(1 - 1e-6, max(1e-6, p))
rows = [{"g": r[RC["gameId"]], "s": r[RC["season"]], "team": r[RC["team"]], "p": r[RC["p"]], "mu": r[RC["mu"]], "c": r[RC["tdCount"]]} for r in rep["rows"]]
scored = []
for s in range(2015, 2026):
    pm = defaultdict(lambda: defaultdict(int))
    for (ss, L, k) in tg_rows:
        if ss < s: pm[lbin(L)][k] += 1
    pmf = {b: {k: v / sum(d.values()) for k, v in d.items()} for b, d in pm.items()}
    pooled = defaultdict(int)
    for (ss, L, k) in tg_rows:
        if ss < s: pooled[k] += 1
    pooledpmf = {k: v / sum(pooled.values()) for k, v in pooled.items()}
    train = [r for r in rows if r["s"] < s]
    n1 = sum(r["c"] >= 1 for r in train); n2 = sum(r["c"] >= 2 for r in train); ratio = n2 / n1
    cells = defaultdict(lambda: [0, 0, 0.0])
    for r in train:
        x = cells[binof(r["p"])]; x[0] += 1; x[1] += r["c"] >= 2; x[2] += r["p"]
    for r in rows:
        if r["s"] != s: continue
        L = lam[(r["g"], r["team"])]
        sh = min(1.0, max(0.0, (r["mu"] - c0) / L)) if L > 0 else 0.0
        P = pmf.get(lbin(L)) or pooledpmf
        if sum(1 for _ in P) < 3: P = pooledpmf
        A0 = sum(pk * (1 - sh) ** k for k, pk in P.items())
        A1 = sum(pk * k * sh * (1 - sh) ** (k - 1) for k, pk in P.items() if k >= 1)
        p0 = math.exp(-c0) * A0; p1 = math.exp(-c0) * (A1 + c0 * A0)
        n, k_, sp = cells.get(binof(r["p"]), [0, 0, 0.0])
        bucket = (k_ + 20 * ratio * (sp / n if n else r["p"])) / (n + 20)
        mu = -math.log(1 - min(r["p"], .9999))
        scored.append({"g": r["g"], "y2": int(r["c"] >= 2), "y1": int(r["c"] >= 1), "TEAMK2": 1 - p0 - p1, "TEAMK1": 1 - p0,
                       "POISSON": 1 - math.exp(-mu) * (1 + mu), "BUCKET": bucket, "p": r["p"]})

def metrics(key, y="y2"):
    n = len(scored); ll = br = sp = sy = 0.0
    for r in scored:
        p = clipp(r[key]); yy = r[y]; ll -= math.log(p) if yy else math.log(1 - p); br += (p - yy) ** 2; sp += p; sy += yy
    return {"n": n, "logLoss": ll / n, "brier": br / n, "meanPred": sp / n, "obsRate": sy / n, "predOverObs": sp / sy}
def boot(a, b, y="y2", B=2000, seed=20261115):
    g = defaultdict(lambda: [0.0, 0])
    for r in scored:
        pa, pb, yy = clipp(r[a]), clipp(r[b]), r[y]
        g[r["g"]][0] += (-math.log(pa) if yy else -math.log(1 - pa)) - (-math.log(pb) if yy else -math.log(1 - pb)); g[r["g"]][1] += 1
    v = list(g.values()); G = len(v); rnd = random.Random(seed); st = []
    for _ in range(B):
        smp = [v[rnd.randrange(G)] for _ in range(G)]; st.append(sum(x[0] for x in smp) / sum(x[1] for x in smp))
    st.sort(); N = sum(x[1] for x in v)
    return {"games": G, "n": N, "dLogLoss": sum(x[0] for x in v) / N, "ci95": [st[int(.025 * B)], st[int(.975 * B) - 1]]}
rel = []
for k in range(len(EDGES) - 1):
    sub = [r for r in scored if binof(r["p"]) == k]
    if sub: rel.append({"pBin": [EDGES[k], min(1, EDGES[k + 1])], "n": len(sub), "obs2": round(sum(r["y2"] for r in sub) / len(sub), 4), "TEAMK2": round(sum(r["TEAMK2"] for r in sub) / len(sub), 4), "POISSON": round(sum(r["POISSON"] for r in sub) / len(sub), 4), "BUCKET": round(sum(r["BUCKET"] for r in sub) / len(sub), 4)})
out = {"definitions": __doc__, "TEAMK_twoPlus": metrics("TEAMK2"), "TEAMK_anytime": metrics("TEAMK1", "y1"), "POISSON": metrics("POISSON"), "BUCKET": metrics("BUCKET"),
       "paired_TEAMK_vs_BUCKET": boot("TEAMK2", "BUCKET"), "paired_TEAMK_vs_POISSON": boot("TEAMK2", "POISSON"), "reliabilityByAnytimeBin": rel}
json.dump(out, open(f"{RES}/two_plus_teamK.json", "w"), indent=1, default=lambda x: round(x, 6))
print(json.dumps({k: v for k, v in out.items() if k != "definitions"}, default=lambda x: round(x, 5)))
