"""Two-plus touchdowns: score candidates historically (2015-2025 walk-forward) and on the 2026 blind forward rows.

Candidates
  POISSON  P(2+) = 1 - e^-mu (1 + mu),  mu = -ln(1 - P_anytime). This IS the official opportunityTd model's own
           distribution (it publishes P = 1 - exp(-mu) for a Poisson player TD count). Equivalent to the team-K
           Poisson + binomial-thinning chain, since a thinned Poisson is Poisson(lambda * share).
  SIMV2    sim-v2 receipt-of-record twoPlusTd as published.
Baselines (no Poisson assumption; fit only on seasons strictly before the scored season)
  BUCKET     empirical P(2+ | P_anytime bin), add-20 smoothing toward the training pooled ratio P(2+)/P(1+) * p
  BUCKETPOS  same by P_anytime bin x position (QB/RB/WR/TE/FB)
Usage: python3 -I 04_two_plus.py <resultsDir>
"""
import json, math, random, sys
from collections import defaultdict

RES = sys.argv[1]
rep = json.load(open(f"{RES}/replay_rows_2014_2025.json"))
RC = {c: i for i, c in enumerate(rep["columns"])}
fwd = json.load(open(f"{RES}/forward_2026.json"))
EDGES = [0, .05, .10, .15, .20, .25, .30, .35, .40, .45, .50, .60, 1.0001]
binof = lambda p: next(k for k in range(len(EDGES) - 1) if p < EDGES[k + 1])
POS = lambda s: s if s in ("QB", "RB", "WR", "TE", "FB") else "OTHER"
clipp = lambda p: min(1 - 1e-6, max(1e-6, p))

def poisson2(p):
    p = min(p, 0.9999)
    mu = -math.log(1 - p)
    return 1 - math.exp(-mu) * (1 + mu)

class Bucket:
    def __init__(self, train, by_pos, alpha=20):
        n1 = sum(1 for r in train if r["c"] >= 1); n2 = sum(1 for r in train if r["c"] >= 2)
        self.ratio = n2 / n1
        self.by_pos, self.alpha = by_pos, alpha
        self.cells = defaultdict(lambda: [0, 0, 0.0])
        for r in train:
            c = self.cells[self.key(r)]; c[0] += 1; c[1] += r["c"] >= 2; c[2] += r["p"]
    def key(self, r):
        return (binof(r["p"]), POS(r["pos"])) if self.by_pos else binof(r["p"])
    def __call__(self, r):
        n, k, sp = self.cells.get(self.key(r), [0, 0, 0.0])
        prior = self.ratio * (sp / n if n else r["p"])
        return (k + self.alpha * prior) / (n + self.alpha)

def metrics(rows, f, ykey="y2"):
    n = len(rows); ll = br = sp = sy = 0.0
    for r in rows:
        p = clipp(f(r)); y = r[ykey]
        ll -= math.log(p) if y else math.log(1 - p); br += (p - y) ** 2; sp += p; sy += y
    return {"n": n, "logLoss": ll / n, "brier": br / n, "meanPred": sp / n, "obsRate": sy / n, "predOverObs": sp / sy if sy else None}

def reliability(rows, f, edges=(0, .01, .02, .04, .07, .10, .15, .20, .30, 1.0001), ykey="y2"):
    b = [[0, 0.0, 0] for _ in range(len(edges) - 1)]
    for r in rows:
        p = f(r); k = next(i for i in range(len(edges) - 1) if p < edges[i + 1]); b[k][0] += 1; b[k][1] += p; b[k][2] += r[ykey]
    return [{"bin": [edges[i], min(edges[i + 1], 1)], "n": x[0], "meanPred": round(x[1] / x[0], 4), "obs": round(x[2] / x[0], 4)} for i, x in enumerate(b) if x[0]]

def paired_boot(rows, fa, fb, B=2000, seed=20261115, ykey="y2"):
    """game-clustered bootstrap of mean per-row (loss_a - loss_b), log loss and Brier."""
    g = defaultdict(lambda: [0.0, 0.0, 0])
    for r in rows:
        pa, pb, y = clipp(fa(r)), clipp(fb(r)), r[ykey]
        la = -math.log(pa) if y else -math.log(1 - pa); lb = -math.log(pb) if y else -math.log(1 - pb)
        x = g[r["g"]]; x[0] += la - lb; x[1] += (pa - y) ** 2 - (pb - y) ** 2; x[2] += 1
    vals = list(g.values()); G = len(vals); rnd = random.Random(seed); sl, sb = [], []
    for _ in range(B):
        s = [vals[rnd.randrange(G)] for _ in range(G)]; n = sum(v[2] for v in s)
        sl.append(sum(v[0] for v in s) / n); sb.append(sum(v[1] for v in s) / n)
    sl.sort(); sb.sort(); N = sum(v[2] for v in vals)
    return {"games": G, "n": N, "dLogLoss": sum(v[0] for v in vals) / N, "dLogLoss95": [sl[int(.025 * B)], sl[int(.975 * B) - 1]],
            "dBrier": sum(v[1] for v in vals) / N, "dBrier95": [sb[int(.025 * B)], sb[int(.975 * B) - 1]]}

out = {"definitions": __doc__}
# ── historical ──
hist = [{"g": r[RC["gameId"]], "s": r[RC["season"]], "pos": r[RC["position"]], "p": r[RC["p"]], "c": r[RC["tdCount"]], "y2": int(r[RC["tdCount"]] >= 2), "y1": int(r[RC["tdCount"]] >= 1)} for r in rep["rows"]]
scored = []
for s in range(2015, 2026):
    train = [r for r in hist if r["s"] < s]
    b, bp = Bucket(train, False), Bucket(train, True)
    for r in hist:
        if r["s"] == s:
            r = dict(r); r["BUCKET"] = b(r); r["BUCKETPOS"] = bp(r); scored.append(r)
P = lambda r: poisson2(r["p"])
H = {"population": "P301 opportunityTd walk-forward replay rows (players with share gate who PLAYED), seasons 2015-2025; outcome = rushTd+recTd+otherTd >= 2 (nflverse)",
     "rowsByCandidate": {}, "paired": {}, "reliability": {}, "byPosition": {}}
for name, f in (("POISSON", P), ("BUCKET", lambda r: r["BUCKET"]), ("BUCKETPOS", lambda r: r["BUCKETPOS"])):
    H["rowsByCandidate"][name] = metrics(scored, f); H["reliability"][name] = reliability(scored, f)
H["anytimeCheck"] = metrics(scored, lambda r: r["p"], "y1")
H["paired"]["POISSON_vs_BUCKET"] = paired_boot(scored, P, lambda r: r["BUCKET"])
H["paired"]["POISSON_vs_BUCKETPOS"] = paired_boot(scored, P, lambda r: r["BUCKETPOS"])
for pos in ("QB", "RB", "WR", "TE"):
    sub = [r for r in scored if r["pos"] == pos]
    H["byPosition"][pos] = {"POISSON": metrics(sub, P), "BUCKETPOS": metrics(sub, lambda r: r["BUCKETPOS"])}
# conditional ratio diagnostic: observed P(2+|1+) by anytime bin vs Poisson-implied
cond = []
for k in range(len(EDGES) - 1):
    sub = [r for r in scored if binof(r["p"]) == k]
    if not sub: continue
    n1 = sum(r["y1"] for r in sub); n2 = sum(r["y2"] for r in sub)
    cond.append({"pBin": [EDGES[k], min(EDGES[k + 1], 1)], "n": len(sub), "obs2given1": round(n2 / n1, 4) if n1 else None, "poisson2given1": round(sum(P(r) for r in sub) / sum(r["p"] for r in sub), 4)})
H["conditional2given1"] = cond
out["historical"] = H

# ── 2026 forward ──
allhist = [r for r in hist]
b26, bp26 = Bucket(allhist, False), Bucket(allhist, True)
off = [{"g": r["gameId"], "pos": r["position"], "p": r["p"], "c": r["count"], "y2": int(r["count"] >= 2), "y1": r["y1"], "esp": str(r["espnId"]), "wk": r["week"]} for r in fwd["official"]]
for r in off: r["BUCKET"] = b26(r); r["BUCKETPOS"] = bp26(r)
F = {"population": "P300/P301 blind forward anytime_td rows, 2026 weeks 2-9, state SCORED (played); outcome count = rushTd+recTd (ESPN), at least the graded binary",
     "rowsByCandidate": {}, "paired": {}, "reliability": {}}
for name, f in (("POISSON", P), ("BUCKET", lambda r: r["BUCKET"]), ("BUCKETPOS", lambda r: r["BUCKETPOS"])):
    F["rowsByCandidate"][name] = metrics(off, f); F["reliability"][name] = reliability(off, f)
F["anytimeCheck"] = metrics(off, lambda r: r["p"], "y1")
F["paired"]["POISSON_vs_BUCKET"] = paired_boot(off, P, lambda r: r["BUCKET"])
F["paired"]["POISSON_vs_BUCKETPOS"] = paired_boot(off, P, lambda r: r["BUCKETPOS"])
F["games"] = len({r["g"] for r in off})
out["forward2026_official"] = F

# sim-v2 population and intersection
sim = [{"g": r["gameId"], "pos": r["position"], "p": r["anytime"], "two": r["twoPlus"], "c": r["count"], "y2": int(r["count"] >= 2), "y1": int(r["count"] >= 1), "esp": r["espnId"]} for r in fwd["sim"]]
viol = [r for r in sim if r["two"] > r["p"] + 1e-12]
S = {"population": "sim-v2 receipts of record (latest generatedAt < eventStart), every listed player with >0 offensive snaps; outcome rushTd+recTd (ESPN player-events)",
     "games": len({r["g"] for r in sim}), "consistencyTwoPlusLeAnytime": {"rows": len(sim), "violations": len(viol)}}
for r in sim: r["BUCKET"] = b26(r); r["BUCKETPOS"] = bp26(r)
S["SIMV2"] = metrics(sim, lambda r: r["two"]); S["reliability_SIMV2"] = reliability(sim, lambda r: r["two"])
S["SIMV2_anytime"] = metrics(sim, lambda r: r["p"], "y1")
S["POISSON_of_simAnytime"] = metrics(sim, P)
S["BUCKET_of_simAnytime"] = metrics(sim, lambda r: r["BUCKET"])
S["paired_SIMV2_vs_BUCKET_of_simAnytime"] = paired_boot(sim, lambda r: r["two"], lambda r: r["BUCKET"])
out["forward2026_simv2"] = S

# intersection: same player-games in both
offk = {(r["g"], r["esp"]): r for r in off}
inter = []
for r in sim:
    o = offk.get((r["g"], r["esp"]))
    if o: inter.append({"g": r["g"], "pOff": o["p"], "pSim": r["p"], "twoSim": r["two"], "p": o["p"], "pos": o["pos"], "y1": o["y1"], "y2": o["y2"], "BUCKET": o["BUCKET"], "BUCKETPOS": o["BUCKETPOS"]})
I = {"rows": len(inter), "games": len({r["g"] for r in inter})}
if inter:
    a = [r["pOff"] for r in inter]; s_ = [r["pSim"] for r in inter]; n = len(a); ma, ms = sum(a) / n, sum(s_) / n
    cov = sum((x - ma) * (y - ms) for x, y in zip(a, s_)); va = sum((x - ma) ** 2 for x in a); vs = sum((y - ms) ** 2 for y in s_)
    I["anytime"] = {"meanOfficial": ma, "meanSimv2": ms, "meanAbsDiff": sum(abs(x - y) for x, y in zip(a, s_)) / n, "pearson": cov / math.sqrt(va * vs),
                    "official": metrics(inter, lambda r: r["pOff"], "y1"), "simv2": metrics(inter, lambda r: r["pSim"], "y1"),
                    "paired_simv2_vs_official": paired_boot(inter, lambda r: r["pSim"], lambda r: r["pOff"], ykey="y1")}
    I["twoPlus"] = {"SIMV2": metrics(inter, lambda r: r["twoSim"]), "POISSON_official": metrics(inter, lambda r: poisson2(r["pOff"])), "BUCKET": metrics(inter, lambda r: r["BUCKET"]),
                    "BUCKETPOS": metrics(inter, lambda r: r["BUCKETPOS"]),
                    "paired_SIMV2_vs_BUCKET": paired_boot(inter, lambda r: r["twoSim"], lambda r: r["BUCKET"]),
                    "paired_POISSON_vs_BUCKET": paired_boot(inter, lambda r: poisson2(r["pOff"]), lambda r: r["BUCKET"]),
                    "paired_SIMV2_vs_POISSON": paired_boot(inter, lambda r: r["twoSim"], lambda r: poisson2(r["pOff"]))}
out["forward2026_intersection"] = I
json.dump(out, open(f"{RES}/two_plus.json", "w"), indent=1, default=lambda x: round(x, 6))
def show(t, m): print(f"{t:38s} n={m['n']:6d} LL={m['logLoss']:.5f} Brier={m['brier']:.5f} pred={m['meanPred']:.4f} obs={m['obsRate']:.4f} ratio={m['predOverObs'] and round(m['predOverObs'],3)}")
for k, m in H["rowsByCandidate"].items(): show("HIST " + k, m)
show("HIST anytime", H["anytimeCheck"])
print(json.dumps(H["paired"], default=lambda x: round(x, 5)))
print(json.dumps(H["conditional2given1"]))
for pos, d in H["byPosition"].items(): show("HIST POISSON " + pos, d["POISSON"]); show("HIST BUCKETPOS " + pos, d["BUCKETPOS"])
for k, m in F["rowsByCandidate"].items(): show("2026 " + k, m)
show("2026 anytime", F["anytimeCheck"]); print(F["games"], json.dumps(F["paired"], default=lambda x: round(x, 5)))
print(json.dumps(F["reliability"]["POISSON"]))
print(json.dumps({k: v for k, v in S.items() if k not in ("population",)}, default=lambda x: round(x, 5)))
print(json.dumps(I, default=lambda x: round(x, 5)))
