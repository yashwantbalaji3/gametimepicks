"""MLB-005 / MLB-002 · EXPLORATORY (2026, examined repeatedly; the MLB-002 holdout already used Sep–Oct): winner log loss
of the coherent engine (v2 inputs; v1 and with substitution) against the published game model of record and the market,
on the same graded games. Read-only.

  python3 -I docs/research/mlb/mlb-005/coherence-v1/compare-games-2026.py
"""
import json, math, random, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, "../../../../.."))
eng = {g["gamePk"]: g for g in json.load(open(os.path.join(HERE, "coherence-2026-exposed-v2-substitution-gamerows.json")))["gameRowsDump"]}
graded = [json.loads(l) for l in open(os.path.join(REPO, "app/public/data/mlb/results/game-predictions-graded.jsonl")) if l.strip()]
cls = {}
try:
    cls = {g["gamePk"]: g.get("class") for g in json.load(open(os.path.join(REPO, "data/internal/ops/forecast-of-record-shadow/classification.json")))["games"]}
except Exception:
    pass
def ll(p, y):
    p = min(1 - 1e-6, max(1e-6, p)); return -math.log(p if y else 1 - p)
rows = []
for r in graded:
    if r["market"] != "moneyline" or r["gamePk"] not in eng or r.get("marketImpliedProbability") is None: continue
    home_pick = r["pick"].endswith("(home)")
    pub = r["modelProbability"] if home_pick else 1 - r["modelProbability"]
    mkt = r["marketImpliedProbability"] if home_pick else 1 - r["marketImpliedProbability"]
    y = 1 if r["actual"]["winner"] == "home" else 0
    e = eng[r["gamePk"]]
    if e["yHome"] != y: continue  # identity check against the box-score final
    rows.append({"date": r["date"], "y": y, "pub": pub, "mkt": mkt, "v1": e["pHomeV1"], "v2": e["pHomeV2"], "cls": cls.get(r["gamePk"])})
def boot(rs, d, iters=4000, seed=20261010):
    by = {}
    for r, x in zip(rs, d): by.setdefault(r["date"], []).append(x)
    g = [(sum(v), len(v)) for v in by.values()]; rnd = random.Random(seed); ms = []
    for _ in range(iters):
        t = n = 0
        for _ in g: a = g[rnd.randrange(len(g))]; t += a[0]; n += a[1]
        ms.append(t / n)
    ms.sort(); return [round(ms[int(0.025 * iters)], 4), round(ms[int(0.975 * iters)], 4)]
def report(rs, name):
    out = {"subset": name, "n": len(rs)}
    for m in ["pub", "mkt", "v1", "v2"]: out[m] = round(sum(ll(r[m], r["y"]) for r in rs) / len(rs), 4)
    for a, b in [("v2", "pub"), ("v2", "mkt"), ("pub", "mkt"), ("v1", "pub")]:
        d = [ll(r[a], r["y"]) - ll(r[b], r["y"]) for r in rs]; out[f"{a}-minus-{b}"] = {"mean": round(sum(d) / len(d), 4), "ci95": boot(rs, d)}
    return out
res = {"label": "EXPLORATORY — 2026 examined repeatedly; no claim follows", "results": [report(rows, "all graded with engine"), report([r for r in rows if r["cls"] == "VERIFIED_AGREES"], "VERIFIED_AGREES (#1046)")]}
json.dump(res, open(os.path.join(HERE, "compare-games-2026.json"), "w"), indent=1)
for o in res["results"]: print(json.dumps(o))
