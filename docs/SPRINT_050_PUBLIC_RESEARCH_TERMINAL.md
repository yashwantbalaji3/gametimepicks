# Sprint 050 — Public Research Contract & Operational Proof Status

**Starting SHA:** `013fb3b7` (no bot drift) · **Date:** 2026-07-29 10:57 ET

Sprint 049 left one gap: the engineering foundation was materially stronger than the public product.
Identity, provenance, lineage, calibration, registry, eligibility and the daily brief all existed and
were consumed by nothing a user could see.

This sprint built the **contract that closes that gap** — one artifact every surface reads — and
resolved the status of the two outstanding operational proofs. Both remain **OPEN**, for reasons that
are recorded rather than worked around.

```bash
cd app && npm run research:contract          # print
npm run research:contract -- --write         # emit the public artifacts
```

---

## 1. Operational proofs — both OPEN, neither claimed

### 1.1 pipefail live-proof: **OPEN**

| | |
|---|---|
| Fix landed | `013fb3b7` at **2026-07-29 10:11:41 ET** |
| Most recent settle run | started **2026-07-29 10:07:41 UTC** on sha `9fc71547` |
| Verdict | the run **predates the fix** — no scheduled run has executed the corrected orchestrator |

The deterministic known-negative in `automation_settle_pipefail_test.sh` remains the standing evidence.
**Forcing a real failure by corrupting production data is not acceptable**, so this closes when a
scheduled run next encounters any failing step.

### 1.2 Clean lineage-stamping: **OPEN**

**0 of 22,660** ledger rows carry `eventId`. The only slate offered to the gate since it shipped was
2026-07-28, which was correctly **refused**. The stamping path has not run — through no fault of the
code.

The **2026-07-29 board is the first generated under the publication gate**; its settlement runs
2026-07-30 at 05:30/07:30 UTC and is the first clean candidate.

Both are recorded in `data/internal/mlb/integrity/operational-proof-observation-plan.json` with the
exact conditions that would close them.

> **A live proof requires an actual scheduled run.** Neither of these can be closed by code inspection
> or unit tests, and neither is being claimed.

### 1.3 Quarantine is now visible

2026-07-28 appears in the public contract as an explicit `QUARANTINED` entry with a plain-language
explanation, **no hit rate, no wins, no losses** — asserted by test. It is excluded from every rate on
the site rather than silently absent.

---

## 2. The public research contract (Phase 2 + 7)

`app/public/data/research/` — built nightly, immediately after the learning loop:

| Artifact | Purpose |
|---|---|
| `terminal-summary.json` | positioning, model universe, calibration, registry, quarantines, status, brief |
| `system-status.json` | each lifecycle stage with an independent state |
| `daily-brief.json` | public-safe daily research brief |

**Why one artifact rather than per-surface derivation:** `/board` and `/about` each hardcoded the same
category rates, and Category C drifted to a stale 51.7% for weeks while CI stayed green (Sprint 046). A
number that appears on two pages comes from one place, or it will eventually disagree with itself.

### System status is worst-of, never an average

```
predictionHistory      READY        complete through 2026-07-27 (22,660 rows, 0-day lag)
calibrationArtifact    READY        platt-1, fitted through 2026-06-24, held out on 6,695 rows
marketRegistry         READY        as of 2026-07-27, 21,633 decisive rows
dailyResearchBrief     READY        newest settled date 2026-07-27
latestSettlement       QUARANTINED  2026-07-28 refused by the settlement integrity gate
──────────────────────────────────────────────────────────────────────────────────────
overall                QUARANTINED  latestSettlement is QUARANTINED
```

Four stages are READY and the overall signal is **not**. That is the Sprint 049 failure inverted: a
green badge sat over a refused settlement for a day. A test asserts that no stage can hide behind an
overall `READY`, and that the reason names the failing stage.

### What the contract refuses to do

Asserted by 15 tests over the **artifact itself**, not the builder:

- no prohibited language (with a test proving the scan has teeth);
- every published rate carries a denominator, date window, and Wilson interval;
- the research universe is labelled and the paper record's numbers (`19-14`, the bankroll) **cannot
  appear in the file at all**;
- calibration copy states the limitation beside the benefit, and `stillBehindMarket` must agree with the
  Brier scores it summarises;
- an empty `APPROVED` set is explained rather than left blank;
- a `DISABLED` market keeps its sample size, rate, and reason — history is never curated away;
- a quarantined date cannot carry `hitRate`, `wins`, `losses`, or `decisiveRows`;
- thin market samples are marked insufficient rather than reported as findings.

---

## 3. Current public numbers

| | |
|---|---|
| Model research universe | **21,633** decisive rows, **50.16%**, 2026-05-16 → 2026-07-27 |
| Overconfidence | **9.32pp** before calibration |
| Registry | 0 APPROVED · 3 RECALIBRATE · 1 DISABLED |
| Calibration | `platt-1` — raw 0.2559 → calibrated 0.2455; market **0.2413** |
| Quarantined | 2026-07-28 |

The calibration plain-language block ships four sentences, the last two of which are the limitation:
*calibration does not create new predictive information*, and *on the same held-out results the
sportsbook's own no-vig price scored more accurately than ours.*

---

## 4. Validation

| | |
|---|---|
| Tests | **3304 / 3300 pass / 0 fail / 4 skip** |
| Typecheck · Build | 0 · 0 |
| Python identity · lineage | 14/14 · 18/18 |
| Health gate | 18/18 |
| Script self-tests | 5/5 |
| pipefail proof | pass (known-negative reproduces the original defect) |
| Money · Locks | `c5b425a1…` · `cb80473f…` unchanged, 0 money artifacts touched |
| `vp/` | untouched |

---

## 5. Status of every claim

### PROVEN
- The public contract cannot carry a prohibited claim, an undenominated rate, a curated-away market, or
  a quarantined date wearing a record — 15 artifact-level tests.
- System status cannot report READY while a stage is failing.
- 2026-07-28 is represented as quarantined with a user-readable explanation.
- The contract builds deterministically and is wired into the nightly loop.

### MEASURED BUT NOT PROVEN
- The contract is *consumable* by a surface. It is well-formed and tested, but **no page renders it yet**.

### BLOCKED
- **pipefail live-proof** — needs a scheduled run on the fixed orchestrator that encounters a failure.
- **Clean lineage-stamping** — needs a clean slate to settle. First candidate: 2026-07-30.

### FUTURE WORK
- Rendering the contract on the homepage, `/today`, the game report, `/results`, and a status page;
  responsive and accessibility passes; per-market calibrators.

---

## 6. Launch-readiness matrix

| Dimension | Verdict | Evidence |
|---|---|---|
| Identity | 🟢 GREEN | canonical `EventIdentity`, cross-surface agreement tests, cross-language parity |
| Pregame provenance | 🟢 GREEN | 19,297 rows, 100% eligible, min 72-min lead, 0 stored-vs-derived disagreements |
| Settlement | 🟡 YELLOW | rejection path **proven live**; stamping path **not yet observed** |
| Automation | 🟡 YELLOW | pipefail fixed and pinned; **not yet exercised by a live failure** |
| Prediction history | 🟢 GREEN | 22,660/22,660, 0-day lag, exported nightly, freshness-alarmed |
| Calibration | 🟡 YELLOW | versioned, compatibility-checked, **in the contract but not on a page** |
| Registry | 🟢 GREEN | derived, versioned, intervals + sample minimums, in the contract |
| Results accounting | 🟢 GREEN | closed accounting, `npm run audit:settlement-and-outcomes`, gap 0 |
| Public claims | 🟢 GREEN | artifact-derived, 15 guards, scans proven to have teeth |
| UX | 🔴 RED | **no surface consumes the contract** |
| Accessibility | 🔴 RED | not assessed — there is no new surface to assess |
| Model capability | 🟢 GREEN *as a distinction* | measured, published, separated from product readiness |

**Overall: not ready for public exposure.** One blocker, and it is the same one as last sprint — the
contract now exists and is guarded; nothing renders it.

---

## 7. Sprint 051 recommendation

The charter's decision rule points two ways at once: *UX polished, operational proofs still open* →
reliability closure; *public data contract complete* → build the surfaces. The honest reading is that
UX is **not** polished — it is unstarted — so:

### **Render the contract. Nothing else.**

Everything needed is now a single, tested JSON file. The work is presentation, not derivation:

1. **A system status page** — five stages, honest state language, the quarantine explained. Smallest,
   highest-integrity, and immediately useful to the founder.
2. **The homepage hero** — what the market says, what the simulation says, what calibration changes,
   what happened. Registry counts with the empty-`APPROVED` explanation.
3. **`/today` rows** — calibrated / raw / market side by side, with registry status and sample size
   beside the number, sorted by event time and completeness — never by probability.
4. **`/results`** — the accounting categories, including quarantined, reconciling to the generated
   population.
5. **Then** responsive and accessibility passes.

**Observe 2026-07-30's settlement first.** It is the first clean board under the publication gate and
the first chance to close the stamping proof — one command, and it closes the oldest open item in the
repository.

**Still not recommended:** adding a sport. Nothing measured this sprint changes that.
