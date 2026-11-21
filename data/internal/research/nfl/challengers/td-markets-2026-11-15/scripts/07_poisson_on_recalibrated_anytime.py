"""Diagnostic: is the Poisson SHAPE wrong, or is the anytime probability it is built on over-confident at the top?

POISSON_RECAL: p' = walk-forward bin recalibration of P_anytime (observed anytime rate in the same 0.05 bin over all
earlier seasons, add-20 smoothing toward the bin's mean p); then P(2+) = 1 - e^-mu' (1 + mu'), mu' = -ln(1 - p').
Historical: scored 2015-2025. 2026: recalibration fit on 2014-2025 only. Compared with BUCKET (04_two_plus.py).
Usage: python3 -I 07_poisson_on_recalibrated_anytime.py <resultsDir>
"""
import json, math, random, sys
from collections import defaultdict

RES = sys.argv[1]
rep = json.load(open(f"{RES}/replay_rows_2014_2025.json"))
RC = {c: i for i, c in enumerate(rep["columns"])}
fwd = json.load(open(f"{RES}/forward_2026.json"))
EDGES = [0, .05, .10, .15, .20, .25, .30, .35, .40, .45, .50, .60, 1.0001]
binof = lambda p: next(k for k in range(len(EDGES) - 1) if p < EDGES[k + 1])
clipp = lambda p: min(1 - 1e-6, max(1e-6, p))
pois2 = lambda p: (lambda mu: 1 - math.exp(-mu) * (1 + mu))(-math.log(1 - min(p, .9999)))
hist = [{"g": r[RC["gameId"]], "s": r[RC["season"]], "p": r[RC["p"]], "c": r[RC["tdCount"]]} for r in rep["rows"]]

def fit(train):
    cells = defaultdict(lambda: [0, 0, 0, 0.0])
    for r in train:
        x = cells[binof(r["p"])]; x[0] += 1; x[1] += r["c"] >= 1; x[2] += r["c"] >= 2; x[3] += r["p"]
    n1 = sum(r["c"] >= 1 for r in train); n2 = sum(r["c"] >= 2 for r in train); ratio = n2 / n1
    def recal(p):
        n, k1, k2, sp = cells.get(binof(p), [0, 0, 0, 0.0]); return (k1 + 20 * (sp / n if n else p)) / (n + 20)
    def bucket(p):
        n, k1, k2, sp = cells.get(binof(p), [0, 0, 0, 0.0]); return (k2 + 20 * ratio * (sp / n if n else p)) / (n + 20)
    return recal, bucket
def metrics(rows, key):
    n = len(rows); ll = sp = sy = br = 0.0
    for r in rows:
        p = clipp(r[key]); y = r["y2"]; ll -= math.log(p) if y else math.log(1 - p); br += (p - y) ** 2; sp += p; sy += y
    return {"n": n, "logLoss": ll / n, "brier": br / n, "predOverObs": sp / sy}
def boot(rows, a, b, B=2000, seed=20261115):
    g = defaultdict(lambda: [0.0, 0])
    for r in rows:
        pa, pb, y = clipp(r[a]), clipp(r[b]), r["y2"]
        g[r["g"]][0] += (-math.log(pa) if y else -math.log(1 - pa)) - (-math.log(pb) if y else -math.log(1 - pb)); g[r["g"]][1] += 1
    v = list(g.values()); G = len(v); rnd = random.Random(seed); st = []
    for _ in range(B):
        smp = [v[rnd.randrange(G)] for _ in range(G)]; st.append(sum(x[0] for x in smp) / sum(x[1] for x in smp))
    st.sort(); N = sum(x[1] for x in v)
    return {"games": G, "n": N, "dLogLoss": sum(x[0] for x in v) / N, "ci95": [st[int(.025 * B)], st[int(.975 * B) - 1]]}
H = []
for s in range(2015, 2026):
    recal, bucket = fit([r for r in hist if r["s"] < s])
    for r in hist:
        if r["s"] == s:
            H.append({"g": r["g"], "y2": int(r["c"] >= 2), "POISSON": pois2(r["p"]), "POISSON_RECAL": pois2(recal(r["p"])), "BUCKET": bucket(r["p"])})
recal, bucket = fit(hist)
F = [{"g": r["gameId"], "y2": int(r["count"] >= 2), "POISSON": pois2(r["p"]), "POISSON_RECAL": pois2(recal(r["p"])), "BUCKET": bucket(r["p"])} for r in fwd["official"]]
out = {"definitions": __doc__}
for tag, rows in (("historical_2015_2025", H), ("forward2026_official", F)):
    out[tag] = {k: metrics(rows, k) for k in ("POISSON", "POISSON_RECAL", "BUCKET")}
    out[tag]["paired_POISSON_RECAL_vs_BUCKET"] = boot(rows, "POISSON_RECAL", "BUCKET")
    out[tag]["paired_POISSON_RECAL_vs_POISSON"] = boot(rows, "POISSON_RECAL", "POISSON")
json.dump(out, open(f"{RES}/two_plus_recal.json", "w"), indent=1, default=lambda x: round(x, 6))
print(json.dumps({k: v for k, v in out.items() if k != "definitions"}, default=lambda x: round(x, 5), indent=0))
