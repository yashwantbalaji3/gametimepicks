# Sprint 048 — Automated Learning Loop, Calibration Deployment & Publishing Eligibility

**Starting SHA:** `b4316f74` · **Date:** 2026-07-29

Sprint 047 proved the model is overconfident and that Platt calibration fixes the *stated probability*
without creating predictive capability. This sprint builds the machinery around that result so it stays
true tomorrow: an automated loop, a calibration layer that cannot be misrepresented, an operational
market registry, and publishing rules that inform rather than curate.

**The model was not changed. No improvement to it is claimed.**

```bash
cd app
npm run learning:freshness      # do we have complete learning data today?
npm run learning:report         # market registry + daily autopsy
npm run audit:model-learning    # full calibration backtest
```

---

## 1. Status of every claim

### PROVEN

| Finding | Evidence |
|---|---|
| Model overconfident by **9.32pp** | 59.48% stated vs 50.16% observed, n = 21,633 |
| Model loses to the de-vigged market | Brier 0.2556 vs 0.2412; log loss 0.7079 vs 0.6754 |
| Platt improves **out-of-sample** | Brier −0.0104 on 6,695 rows never used for fitting |
| Calibration does **not** close the market gap | calibrated 0.2455 vs market 0.2413 |
| `batter_total_bases` fails on its own record | 43.76%, 95% CI [42.25%, 45.28%], n = 4,120 |
| The exporter was never scheduled | 0 workflow references; corpus froze 2026-07-08 |
| The corpus's `marketProbability` is vigged | 0.7110 stored vs 0.6672 de-vigged (2026-07-27) |
| **My own Sprint 047 loader mis-dated 134 rows** | see §4 |

### MEASURED BUT NOT PROVEN

- Per-market calibration error ranges 6.7pp → 15.1pp, suggesting per-market calibrators would beat one
  global fit. **Not backtested.** Do not adopt on this alone.
- Recent-window trends are all "not significant" — every market's recent interval overlaps its prior.
  There is no evidence of drift in either direction yet.

### HYPOTHESIS

- Feature attribution would explain *why* a market is miscalibrated. The schema supports it; the
  pipeline does not capture the inputs, so this is untested.
- Publishing eligibility improves user trust. Designed and tested for correctness; **no user has seen it.**

### FUTURE WORK

- Applying calibrated probabilities to live surfaces (built, not wired).
- Per-market calibrators; `pitcher_strikeouts` investigation; other sports.

---

## 2. What was built

| Phase | Deliverable | Path |
|---|---|---|
| 1 | Learning loop in the nightly workflow | `.github/workflows/nightly-settle.yml` |
| 1 | Freshness + coverage monitor | `app/scripts/check-learning-freshness.mjs` |
| 2 | Four-layer probability model | `app/src/lib/mlb/calibration/probability-layers.ts` |
| 2 | Claim guards | `calibration-claims.test.mjs` (13 tests) |
| 3 | Market registry + trend | `app/scripts/build-learning-report.mjs` → `registry.json` |
| 4 | Daily autopsy | → `autopsy/<date>.json` |
| 6 | Publishing eligibility | `publishing-eligibility.ts` (+ 10 tests) |
| 8 | Ops observability | `learningLoop` block in `admin/status.json` |

### 2.1 The loop is now automated (Phase 1)

The exporter runs inside `nightly-settle.yml`, immediately after settlement — the only moment the ledger
has newly-graded rows and the corpus does not. It is deterministic over committed inputs, so a re-run on
an unchanged repository is a no-op rather than a churn commit.

Scheduling it fixes *that* stall. It does not fix the next one, so `check-learning-freshness.mjs`
asserts the **property** rather than the process:

- the corpus must cover ≥ 98% of ledger rows,
- no settled date may be missing from it,
- it may lag the ledger by at most **1** day.

One day, not zero: settlement and export can straddle the two nightly passes. Two days would hide a full
missed cycle — which is exactly what went unnoticed for three weeks. The known-negative fixture is the
real 2026-07-08 shape, and there is a matching fixture asserting a 1-day lag does **not** cry wolf.

Current state: **22,660 corpus rows vs 22,660 ledger rows, 100% coverage, 0-day lag.**

### 2.2 Calibration is a layer, not a replacement (Phase 2)

Four probabilities, kept apart:

| Layer | Meaning |
|---|---|
| `raw` | what the model produced. **Never overwritten** — it is the evidence |
| `calibrated` | raw, corrected by a calibrator fitted on strictly earlier data |
| `market` | the sportsbook's **de-vigged** probability — the benchmark, not our output |
| `displayed` | what a user sees, plus which layer it came from |

Collapsing these is how a platform ends up unable to answer "did calibration help?" a month later.

The fitted parameters (`a = 0.5711, b = −0.2225`, 14,938 training rows) are **persisted**, not refitted
at runtime — a calibrator that silently refits on every deploy is a model change nobody reviewed.

**The claim guard.** "Our probabilities are now accurate" is true; "our model is now accurate" is not.
One word apart, and only one is supported. `calibration-claims.test.mjs` asserts the disclosure states
the limitation in the same breath as the benefit, and scans every file in the calibration directory for
market-beating language, with a test proving the scan has teeth.

### 2.3 Publishing eligibility informs, it does not curate (Phase 6)

The obvious implementation is a filter: hide what looks bad. That is the wrong shape, and it fails in a
specific, self-reinforcing way — the weak market vanishes, the remaining record improves, and the
platform has quietly curated itself into a flattering subset of its own history **without the model
improving at all**.

So eligibility returns a *presentation*, not a yes/no:

| Treatment | When |
|---|---|
| `SHOW` | the market meets the evidence bar on a sufficient sample |
| `SHOW_WITH_WARNING` | `RECALIBRATE` or `DISABLED` — shown with its measured record attached |
| `SHOW_WITHOUT_PROBABILITY` | provenance unprovable, or sample too small to support any statement |

`batter_total_bases` — our worst market — is **shown**, with its 43.76% on 4,120 rows stated plainly.
The test suite asserts this directly, because hiding it would make everything else look better than it is.

The only thing genuinely withheld is a number we cannot stand behind: if capture timing is unprovable,
the prediction appears **without** a probability rather than with an unsupported one. Provenance outranks
even a good market record, and that ordering is tested.

### 2.4 The autopsy answers a question, not a dashboard (Phase 4)

Output for 2026-07-27 is a handful of observations, each carrying `n`, plus **one** recommendation and a
standing caveat that one date is a prompt to look, never a result. Markets under 100 rows on the date are
reported as *insufficient to read* and are barred from driving the recommendation — tested.

It never modifies the model. A system that auto-tunes on yesterday's slate is fitting noise: the
day-to-day swing in this corpus exceeds most effects worth chasing.

### 2.5 Observability (Phase 8)

`admin/status.json` gained a `learningLoop` block: freshness, per-market registry statuses, disabled
markets, and the last autopsy recommendation. `GREEN` only when the corpus genuinely covers the ledger;
a stale corpus is `YELLOW`, not green — not an outage, but every conclusion drawn from it is out of date.
A missing artifact reports `UNKNOWN`, never a fabricated pass.

Current: **GREEN — learning data complete through 2026-07-27 (22,660 rows).**

---

## 3. Market registry

| Market | Status | n | Hit rate | Recent trend |
|---|---|---|---|---|
| `batter_hits` | RECALIBRATE | 9,005 | 53.81% | −0.2pp, not significant |
| `batter_hits_runs_rbis` | RECALIBRATE | 7,408 | 49.64% | −1.5pp, not significant |
| `batter_total_bases` | **DISABLED** | 4,120 | 43.76% | −4.5pp, not significant |
| `pitcher_strikeouts` | RECALIBRATE | 1,100 | 47.82% | +0.3pp, not significant |

Trends compare the most recent rows to everything prior and report `significant` only when the two
Wilson intervals do not overlap. **None currently does.** A market with 20 losses is never disabled; the
minimum for any status change is 500 rows, and that is tested.

---

## 4. A correction to Sprint 047

Sprint 047's loader dated each row by the **lean's own date**. That is the game's local date, and it
rolls past midnight for late West-Coast starts: the `2026-07-27` board carries **134 settled leans
stamped `2026-07-28`**. The audit therefore reported a phantom `2026-07-28` whose per-date figures were
really a slice of the 07-27 slate — and Sprint 047's stated range "2026-05-16 → 2026-07-28" was wrong.

Fixed to use the **ledger's** date, which is authoritative for settlement, with a regression test
asserting no audited date is absent from the ledger.

**Impact on Sprint 047's conclusions: none.** The misattribution moved rows between adjacent dates,
never in or out of the population. Re-measured after the fix, every headline number is identical —
21,633 rows, 9.32pp overconfidence, Brier 0.2556 vs 0.2412, Platt −0.0104, still behind by 0.0042. Only
the reported end date (07-28 → 07-27) and the train cutoff (06-25 → 06-24) change.

---

## 5. The lineage gate still has not run live

Independently re-verified this sprint: **0 of 22,660 ledger rows carry `eventId`**. A settlement did run
since Sprint 047 — 2026-07-27 is now fully settled — but the ledger shows no lineage fields, so the
gate's stamping path has not executed in production.

This remains **tested, not production-proven**, unchanged from Sprint 046's finding. The four-check
observation plan in `SPRINT_046_…` still applies and is still the cheapest open item in the repository.

---

## 6. Roadmap

### 30 days
1. **Wire calibrated probabilities into the live surfaces.** The layer and the disclosure exist and are
   tested; nothing user-facing consumes them yet.
2. **Verify the lineage gate on a live settlement** — four checks, one night.
3. **Decide `batter_total_bases` publicly.** The eligibility layer will show it with its record; that is
   a founder call to confirm, not an engineering default.
4. **Watch the loop for a week.** It has never run unattended. The freshness monitor is the alarm.

### 90 days
5. **Per-market calibrators**, backtested against the global fit before adoption.
6. **Capture model feature inputs** alongside predictions, enabling real error attribution.
7. **Investigate `pitcher_strikeouts`** — 15.1pp overconfident on the smallest sample.
8. **Public results narrative**: prediction → reasoning → outcome → lesson, per row.

### 180 days
9. **Decide what this product is.** After calibration it states honest probabilities and still does not
   out-predict the market. The honest options: find a real informational input the market lacks,
   reposition as a transparency and simulation product, or both. The measurement to make that decision
   now exists and runs nightly.

**Still not recommended:** adding sports. Three sprints of measurement point at the model, and more
sports multiply the problem rather than diversify it.

---

## 7. Success criteria

| Criterion | Status |
|---|---|
| Prediction history updates automatically | **Met** — in `nightly-settle.yml`, with a freshness alarm |
| Calibration production-ready | **Met as a layer** — built, tested, guarded; not yet wired to surfaces |
| The system explains model failures | **Partially** — autopsy explains *where*; *why* needs feature capture |
| Markets have evidence-based statuses | **Met** — derived, with intervals and sample minimums |
| Future model changes testable scientifically | **Met** — temporal backtest, fixed methodology, self-tests |
| Public surfaces communicate honestly | **Partially** — rules built and tested; no surface consumes them yet |
| Foundation for other sports | **Met** — but the evidence says do not use it yet |
