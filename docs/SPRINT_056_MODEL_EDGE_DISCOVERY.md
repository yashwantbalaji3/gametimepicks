# Sprint 056 — Model Edge Discovery: Founder Decision Memo

**SHA:** `014bcb30` · **Date:** 2026-07-29 · **Baseline frozen:** 21,633 rows, 2026-05-16 → 2026-07-27

```bash
cd app && npx tsx scripts/audit-model-edge.mjs --self-test   # methodology
npx tsx scripts/audit-model-edge.mjs                         # the analysis
```

---

## The answer

# The MLB model has no measurable predictive edge.

Twelve segments, **declared before scoring**, tested on a held-out window. Eleven lose to the
de-vigged market. The twelfth "survives" by **0.00024 Brier — one tenth of one percent** of the
market's own score, statistically indistinguishable from zero.

And that twelfth segment is *"model within 2.5pp of market."* **The one place the model does not lose
is where it agrees with the market.** That is not an edge; it is a tautology wearing one.

---

## 1. Where the model disagrees, it is worse

| Preregistered segment | Held-out n | Brier edge vs market |
|---|---|---|
| model ≥10pp **above** market | 2,561 | **−0.0336** |
| model ≥70% confident | 1,223 | **−0.0329** |
| `pitcher_strikeouts` | 359 | −0.0254 |
| `batter_total_bases` | 1,296 | −0.0242 |
| market 45–55% | 2,162 | −0.0194 |
| `batter_hits_runs_rbis` | 2,248 | −0.0163 |
| market ≤40% | 928 | −0.0116 |
| market ≥60% | 1,137 | −0.0090 |
| `batter_hits` | 2,792 | −0.0075 |
| model ≤40% | 361 | −0.0004 |
| **model within 2.5pp of market** | **1,075** | **+0.0002** |
| model ≥10pp **below** market | **0** | — |

The two worst segments are *"disagrees most with the market"* and *"most confident."* The best is
*"agrees with the market."* The gradient runs in exactly one direction: **the model's information is
worth less the more of it you use.**

## 2. A structural finding: the model cannot disagree downward

**Zero rows** in 21,633 have the model 10pp *below* the market. It disagrees upward 8,683 times and
downward never.

That is not a calibration offset — it is a structural bias in how the model forms probabilities. A
model that only ever says "more likely than the market thinks" is not producing an independent
estimate; it is producing the market's estimate plus a positive constant, and the constant is wrong.

## 3. Simulation quality: understated variance, not a constant offset

| Predicted band | n | Predicted | Observed | Error |
|---|---|---|---|---|
| 0.3–0.4 | 1,087 | 36.5% | 36.5% | **−0.0pp** |
| 0.4–0.5 | 3,386 | 45.7% | 41.3% | +4.4pp |
| 0.5–0.6 | 6,453 | 55.3% | 47.2% | +8.1pp |
| 0.6–0.7 | 6,604 | 64.9% | 53.9% | +11.0pp |
| 0.7–0.8 | 3,665 | 73.9% | 59.9% | +14.0pp |
| 0.8–0.9 | 400 | 82.8% | 59.0% | +23.8pp |
| 0.9–1.0 | 35 | 94.2% | 51.4% | **+42.8pp** |

Mean absolute error near even money: **5.86pp**. Far from even money: **26.84pp** — a **4.6×**
increase.

The model is *perfectly calibrated* at 36.5% and *catastrophically wrong* at 94%. Error that grows
with distance from even money is the signature of **understated variance** in the simulation — the
distributions are too narrow, so extreme probabilities get produced that the underlying process never
supports.

**This matters for what to fix.** A constant overconfidence would be repaired by a scaling factor, and
Platt calibration already does that. This is not that. Widening the simulated distributions is a
modelling change, and it is the one change with a mechanism behind it rather than a curve fit.

## 4. `batter_total_bases` forensics: the model, not the market

| | Model | Market | Observed |
|---|---|---|---|
| Mean stated probability | 55.3% | 44.4% | **43.8%** |
| Error | **+11.6pp** | **+0.6pp** | — |

The market is calibrated on this market to within **0.6 percentage points** across 4,120 settled rows.
The model is off by **11.6pp in the same direction**.

This is not a hard market. It is a market the model is simply wrong about — and the damage is on the
high side, where it takes 3,042 of its 4,120 positions at a 44.2% hit rate.

---

## 5. Market-by-market recommendations

| Market | n | Hit rate | Recommendation | Basis |
|---|---|---|---|---|
| `batter_hits` | 9,005 | 53.81% | **RESEARCH** | smallest deficit (−0.0075); the only market where the model is close |
| `batter_hits_runs_rbis` | 7,408 | 49.64% | **RESEARCH** | loses, but not structurally worse than the rest |
| `pitcher_strikeouts` | 1,100 | 47.82% | **RESEARCH** | worst per-row deficit, smallest sample — insufficient to disable |
| `batter_total_bases` | 4,120 | 43.76% | **DISABLE for prediction** | 11.6pp error against a market accurate to 0.6pp, on a large sample |

**No market qualifies as KEEP** under any evidence-based reading. `batter_total_bases` is the only one
where the sample is large enough and the failure clear enough to act.

Disabling means **withdrawing the probability claim**, not deleting the history. The measured record
stays visible — hiding the worst market would improve every remaining number without improving
anything real.

---

## 6. Method — why these numbers are trustworthy

| Guard | Why |
|---|---|
| Segments **preregistered** | Slicing 21,633 rows enough ways always yields a flattering subset |
| **Temporal** split at 2026-07-01 | A residual measured on the rows that suggested it is circular |
| **All twelve reported** | Including the four that make the model look worst |
| **Bonferroni** α = 0.0042 | Twelve looks at noise produce ~1 spurious "hit" by construction |
| ≥200 held-out rows | Below that, a segment result is not evidence |

Two fixture defects were caught by the self-test before any conclusion was drawn: a floating-point
boundary (`0.60 − 0.50 = 0.0999…`, silently emptying a segment) and a degenerate synthetic set where
every row won, which made an overconfident model look genuinely better. Both would have produced
confident, wrong findings.

---

## 7. Strategic recommendation

### Position GameTimePicks as a **research terminal**, not a predictor.

The evidence does not support a predictor, and five sprints of measurement have not moved that. But
the same evidence supports something the platform is already unusually good at:

- it reconstructs what the sportsbook implies, cleanly de-vigged;
- it states what a simulation produced, and what that becomes after correction;
- it accounts for every generated row, including the ones it cannot grade;
- it withholds a slate rather than publish a result graded against the wrong game;
- and it says, on every surface, that it does not out-predict the market.

**That is a product.** It is not the product a predictor would be, and it is honest — which is the only
durable version of this given the measurements.

### 90-day roadmap

**Days 1–30 — stop the bleeding, no new modelling.**
1. Withdraw `batter_total_bases` prediction claims; keep its history visible with the 11.6pp finding.
2. Apply the persisted Platt calibrator to displayed probabilities (built, tested, unwired).
3. Close the two live operational proofs on the next settlement.

**Days 31–60 — one preregistered experiment, and only one.**
4. **Widen the simulated distributions.** The variance finding is the only defect with a mechanism
   rather than a curve fit. Preregister: hypothesis, train/validation/test windows, acceptance criteria
   declared *before* scoring, market baseline on identical rows. Accept or reject on that alone.

**Days 61–90 — decide on the evidence.**
5. If variance widening moves any market to parity with the de-vigged market out of sample, iterate on
   that market only.
6. If it does not, **stop trying to out-predict the market** and invest entirely in the research
   terminal. That is not a failure state; it is the honest conclusion of a properly run search.

**Not recommended at any point in the 90 days:** adding a sport. Every finding here is about the model,
and a second sport multiplies the problem across surfaces rather than diversifying it.

---

## 8. Status of every claim

### PROVEN
- No preregistered segment shows a meaningful out-of-sample edge; the sole survivor is +0.0002 Brier
  and not significant.
- The model never disagrees ≥10pp below the market — 0 of 21,633 rows.
- Simulation error grows 4.6× with distance from even money.
- On `batter_total_bases` the market is accurate to 0.6pp and the model is off by 11.6pp.

### MEASURED BUT NOT PROVEN
- That widening simulated variance would improve out-of-sample scores. It is the best-supported
  hypothesis available; it has not been tested.

### HYPOTHESIS
- That the upward-only bias and the understated variance are the same defect. Plausible from the
  shape; untested.

### NOT CLAIMED
- That any market can be made to beat the sportsbook. Nothing measured supports it.
