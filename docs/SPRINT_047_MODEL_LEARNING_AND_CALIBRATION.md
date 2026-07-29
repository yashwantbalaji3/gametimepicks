# Sprint 047 — Model Learning & Calibration Audit

**Starting SHA:** `18705b6a` · **Audit run:** 2026-07-29 ET · Reproduce with:

```bash
cd app && npm run audit:model-learning
```

Sprint 046 measured three days and found the model overconfident. This measures **21,633 decisive rows
across 50 dates (2026-05-16 → 2026-07-28)** and then asks the only question that follows: *can a
calibrator fix it, and can we prove that out of sample?*

**The answer is yes to the first half and no to the second.** Calibration fixes the honesty of the
stated probability. It does not create predictive capability.

---

## 1. Proven findings

### 1.1 The model is overconfident by 9.32 percentage points

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2556 | **0.2412** |
| Log loss ↓ | 0.7079 | **0.6754** |
| Mean predicted | **59.48%** | 50.16% |
| Observed | 50.16% | — |

Hit rate 50.16% (10,852 / 21,633), 95% CI [49.50%, 50.83%]. The market's mean prediction lands on the
observed rate almost exactly; the model's is nine points above it.

### 1.2 Overconfidence grows with stated confidence

| Predicted bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated |
|---|---|---|---|---|
| 0.3–0.4 | 1,087 | 36.5% | 36.5% [33.7%, 39.4%] | no |
| 0.4–0.5 | 3,386 | 45.7% | 41.3% [39.6%, 43.0%] | **yes** |
| 0.5–0.6 | 6,453 | 55.3% | 47.2% [46.0%, 48.4%] | **yes** |
| 0.6–0.7 | 6,604 | 64.9% | 53.9% [52.7%, 55.1%] | **yes** |
| 0.7–0.8 | 3,665 | 73.9% | 59.9% [58.3%, 61.5%] | **yes** |
| 0.8–0.9 | 400 | 82.8% | 59.0% [54.1%, 63.7%] | **yes** |
| 0.9–1.0 | 35 | 94.2% | 51.4% [35.6%, 67.0%] | **yes** |

Eight of nine buckets are miscalibrated at 95%, and the gap widens monotonically. The only well-calibrated
band is 0.3–0.4 — the one the model is least sure about. **The more certain the model claims to be, the
less it should be believed**, which is the exact inverse of what a probability is for.

### 1.3 The descriptive categories invert

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 9,672 | 49.26% | 0.2649 | 0.2425 | **14.2pp** |
| Medium | 3,086 | 50.62% | 0.2450 | 0.2396 | 7.5pp |
| Low | 8,875 | 51.00% | 0.2491 | 0.2404 | 4.6pp |

"High" has the **worst** hit rate, the **worst** Brier, and **triple** the overconfidence of "Low". This
corroborates the existing product decision to stop describing these as confidence — and strengthens it:
they are not merely uninformative, they are inverted.

### 1.4 One market fails on its own evidence

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | RECALIBRATE | 9,005 | 53.81% [52.78%, 54.84%] | 0.2434 | 0.2349 | 6.7pp |
| `batter_hits_runs_rbis` | RECALIBRATE | 7,408 | 49.64% [48.50%, 50.77%] | 0.2638 | 0.2477 | 10.4pp |
| `batter_total_bases` | **DISABLED** | 4,120 | **43.76% [42.25%, 45.28%]** | 0.2628 | 0.2426 | 11.6pp |
| `pitcher_strikeouts` | RECALIBRATE | 1,100 | 47.82% [44.88%, 50.77%] | 0.2729 | 0.2435 | **15.1pp** |

`batter_total_bases` is the only market whose **entire 95% interval sits below break-even** on a large
sample. Sprint 046 flagged it at 40.42% on 287 rows and correctly declined to conclude; on 4,120 rows the
conclusion is available.

`pitcher_strikeouts` is the most overconfident market (15.1pp) but its interval still crosses 50% on
n=1,100 — it is `RECALIBRATE`, not `DISABLED`. **The registry never disables on a small sample**, which is
tested.

### 1.5 Calibration works out-of-sample — and does not close the gap to the market

Fitted on **2026-05-16 → 06-25** (14,938 rows), scored on **2026-07-01 → 07-28** (6,695 rows). The split
is by date, so no slate straddles it.

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| Raw model | 0.2559 | 0.7095 | 59.23% |
| **Platt** | **0.2455** | **0.6847** | **50.08%** |
| Isotonic | 0.2456 | 0.6844 | 50.07% |
| Market (de-vigged) | **0.2413** | **0.6757** | 50.08% |
| _observed_ | — | — | 49.84% |

Platt scaling improves Brier by **0.0104** and log loss by **0.0248** on data it never saw, and moves the
mean stated probability from 59.23% to 50.08% against an observed 49.84%.

**It still loses to the market by 0.0042 Brier.**

> **Recommendation: adopt a calibrator for the honesty of stated probabilities, not as a performance
> improvement.** After calibration the platform would state probabilities that are approximately true.
> It would still not out-predict the sportsbook. Those are different claims and only the first is
> supported.

### 1.6 A methodological defect in the existing calibration corpus

`public/data/mlb/results/calibration/*.jsonl` stores `marketProbability` as the **raw, vigged** implied
probability. Verified on 2026-07-27: stored 0.7110, raw implied 0.7110, de-vigged 0.6672.

This biases in one direction, and it is the flattering one — the inflated market number scores worse
against a ~50% observed rate, so the market looks weaker and the model looks better by comparison. Any
prior model-vs-market conclusion drawn from that corpus carried the entire ~6.9% hold as a thumb on the
scale.

The Sprint 047 audit therefore reconstructs the market probability from **both sides of the board** and
normalises. The corpus remains valid for everything that does not involve a market baseline.

### 1.7 The prediction-history layer already existed — and had silently frozen

Phase 1 asked for a canonical prediction history. `export-mlb-calibration-rows.mjs` already produces
exactly that schema. It is referenced by **no workflow and no npm script**, so it had stopped being run
on **2026-07-08**: 40 date files and 18,227 rows while the ledger held 22,660 rows through 07-27.

Refreshed in this sprint to **50 dates / 22,660 rows**. The exporter is deterministic — verified by
re-running and hashing (identical). **It still is not scheduled**, which is a live risk, not a fixed one.

---

## 2. What was built

| Deliverable | Path |
|---|---|
| Model-learning audit engine | `app/scripts/model-learning-audit.mjs` (`npm run audit:model-learning`) |
| Methodology tests | `app/src/lib/model-learning.test.mjs` (15 tests) |
| Machine-readable audit | `data/internal/mlb/model-learning/model-learning-audit.json` |
| Founder-readable audit | `data/internal/mlb/model-learning/model-learning-audit.md` |
| Refreshed prediction history | `app/public/data/mlb/results/calibration/*.jsonl` (50 dates) |

### Methodology, and why each choice matters

| Choice | Why |
|---|---|
| **Temporal** train/test split | A random split puts correlated rows from the same game on both sides and inflates every out-of-sample result. Time answers "would this have helped on a day we had not seen?" |
| Split snapped to a **date boundary** | So no single slate straddles it. |
| **De-vigged** market baseline | The raw book sums to ~1.069. Skipping this hands the model the hold. |
| **Identical rows** for every scorer | A score difference must not be a population difference. |
| **Wilson** intervals | The normal interval escapes [0,1] at small n — exactly where "disable this market?" is decided. |
| **Minimum 500 rows** before a status change | A bad record on a small sample is not evidence. Tested: 10 straight losses yields `MONITOR`, never `DISABLED`. |
| Nothing is **adopted** here | The audit reports whether a calibrator helps. Applying one to production is a separate decision needing its own evidence. |

Each of these is pinned by a test that fails if the property is removed — including one asserting a
calibrator must **not** claim a large gain on already-calibrated data, because a calibrator that always
reports success is indistinguishable from a working one until you test it on data needing no correction.

---

## 3. Market Performance Registry

Statuses are derived, never hand-assigned:

- **`APPROVED`** — beats the de-vigged market on Brier *and* is within 5pp of calibrated, on n ≥ 500.
- **`RECALIBRATE`** — loses to the market on Brier, or is miscalibrated by more than 5pp.
- **`DISABLED`** — the entire 95% hit-rate interval sits below 50% on n ≥ 500.
- **`MONITOR`** — n < 500. Reported, never acted on.

**No MLB market currently qualifies as `APPROVED`.** One is `DISABLED`, three are `RECALIBRATE`.

---

## 4. Designs (not yet built)

### 4.1 Publishing gates (Phase 6)

A prediction should reach a user only when all of the following hold, each evidence-backed rather than
tuned:

1. The market's registry status is `APPROVED` or `RECALIBRATE`-with-a-calibrator-applied — never `DISABLED`.
2. The stated probability is post-calibration, so what is shown is approximately true.
3. The row's sample support meets the minimum for its market.
4. The displayed label is supported by measured data, not by the model's raw confidence.

Deliberately **not** "remove predictions that look bad". A `DISABLED` market should be *shown as
disabled with its evidence*, which is more useful than silence and cannot be mistaken for a good result.

### 4.2 Daily learning loop (Phase 7)

```
generate → capture inputs → (event) → settle → append to history
    → refresh calibration corpus → run model-learning audit
    → update registry → produce a diff vs yesterday
```

The loop's output should answer one question: **"what did we learn yesterday that changes how we operate
today?"** Concretely, a daily diff of registry statuses and calibration drift — not another dashboard of
levels, which nobody reads, but a short list of *changes* with sample sizes attached.

The blocking dependency is that the exporter is not scheduled (§1.7). Until it is, the corpus freezes
whenever someone forgets, and the loop silently analyses stale data.

### 4.3 Error learning (Phase 4)

Designed, not built. Post-settlement each row can be attributed to one of: probability too high, market
mispriced relative to the model's own inputs, data gap, or genuine variance. Only the first is
distinguishable with today's artifacts — the others need the feature inputs to be captured alongside the
prediction, which the history schema supports but the pipeline does not yet populate.

**This is a hypothesis, not a finding.** No claim is made that feature attribution would improve accuracy.

---

## 5. Roadmap

### 30 days
1. **Schedule the calibration exporter** in `nightly-settle.yml`. Highest value per effort; without it
   everything downstream silently staleness-rots.
2. **Apply Platt calibration to displayed probabilities**, framed as honesty, not improvement. Measure
   before/after on the next 30 days with this same tool.
3. **Act on `batter_total_bases`.** Either disable it publicly with its evidence shown, or state plainly
   why 43.76% on 4,120 rows is being kept.
4. **Add the audit to CI** so registry changes surface as diffs.

### 90 days
5. **Capture model feature inputs alongside predictions**, so Phase 4 attribution becomes possible.
6. **Per-market calibrators.** Overconfidence ranges from 4.6pp to 15.1pp; one global fit is leaving
   accuracy on the table. Backtest per-market against the global fit before adopting.
7. **Understand `pitcher_strikeouts`** — most overconfident (15.1pp) and smallest sample (1,100). Is it a
   modelling problem or a volume problem?

### 180 days
8. **Decide whether the model should exist as a predictor at all.** After calibration it states honest
   probabilities and still does not out-predict the market. The honest strategic options are: find a real
   informational input the market lacks, reposition as a transparency/simulation product rather than a
   prediction one, or both. This is a founder decision, and it should be made on measurement — which now
   exists.

**Not recommended before the above:** adding sports. Sprint 046's recommendation stands and is now
better supported — the problem is the model, and more sports multiply it.

---

## 6. Separation of claims

| Proven | Hypothesis | Not claimed |
|---|---|---|
| Model overconfident 9.32pp on 21,633 rows | Per-market calibrators beat a global one | That the model is improved |
| Model loses to de-vigged market on Brier and log loss | Feature capture enables useful attribution | That calibration creates capability |
| Platt improves out-of-sample by 0.0104 Brier | `pitcher_strikeouts` is fixable | That any market is currently `APPROVED` |
| `batter_total_bases` interval sits below 50% on n=4,120 | Publishing gates raise trust | That the market can be out-predicted |
| The corpus's `marketProbability` is vigged | | |
| The exporter froze on 2026-07-08 | | |

---

## 7. Success criteria

| Criterion | Status |
|---|---|
| Trace every prediction from generation to settlement | **Met** — board → ledger join, 21,633 rows, Sprint 046 accounting closes |
| Know which markets help or hurt | **Met** — registry with intervals and sample minimums |
| Know where probabilities are inflated | **Met** — 9.32pp overall, per-bucket and per-market breakdowns |
| A repeatable learning loop | **Partially met** — the audit is repeatable and deterministic; the loop is designed but the exporter is unscheduled |
| Future model changes measurable scientifically | **Met** — temporal backtest with a fixed methodology and self-tests |

**No claim is made that the model improved. It was not changed.**
