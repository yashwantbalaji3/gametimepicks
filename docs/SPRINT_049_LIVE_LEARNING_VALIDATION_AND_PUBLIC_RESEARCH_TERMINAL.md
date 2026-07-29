# Sprint 049 — Live Learning Validation & Calibrator Versioning

**Starting SHA:** `45b5845d` → synced over 3 bot commits to `ca9ae2e4` · **Date:** 2026-07-29 10:02 ET

The headline result of this sprint was not built — it was **observed**. The settlement-lineage gate,
test-proven since Sprint 045 and unproven in production through Sprints 046–048, ran overnight and
**failed closed on a real board**.

---

## 1. PROVEN — the lineage gate is live

At 08:02 UTC and again at 10:07 UTC on 2026-07-29, `nightly-settle` targeted 2026-07-28 and produced:

```
pipeline.mlb.settlement_lineage.SettlementLineageError: Settlement 2026-07-28
failed lineage validation — refusing to write 641 row(s):
  WRONG_EVENT_MAPPING: gamePk 824489 is claimed by 2 distinct events
  (mlb:cincinnati-reds-v-cleveland-guardians:20260728t1741,
   mlb:cincinnati-reds-v-cleveland-guardians:20260728t2310)
```

That is the CLE @ CIN doubleheader — the identical defect that corrupted 49 settled legs in Sprint 044,
caught this time **before** anything was written.

### The four-way production proof

| Requirement | Status | Evidence |
|---|---|---|
| The scheduled workflow completed | ✅ | two runs, both `success` |
| New rows produced by gate-bearing code | ✅ | the gate raised; the code path executed |
| Every eligible row carries lineage | ✅ *vacuously* | **no rows were written** — the gate refused all 641 |
| Ledger and artifacts reconcile | ✅ | 22,660 rows, 22,660 unique ids, 0 duplicates, no partial write |

The third row is honest rather than flattering: the gate's *stamping* path still has not written a
production row, because the first slate it met was corrupt. What **is** proven — and is the more
valuable half — is that the gate executes in production and refuses bad data. Reproduced locally against
the committed board: same single `WRONG_EVENT_MAPPING`, same gamePk.

Evidence artifact: `data/internal/mlb/integrity/settlement-lineage-live-proof.json`.

### Why the board was corrupt

The 2026-07-28 board was generated at ~10:15 ET on 2026-07-28. The publication gate that refuses a
collided board landed in `1ccddf41` at **21:23 ET the same day** — eleven hours later. **The board
predates its own guard.** Boards generated from 2026-07-29 onward are covered.

### 2026-07-28 is permanently quarantined

Settling it would grade game 1's predictions against game 2's box score. Regenerating the board is not a
fix either — the publication gate would now refuse to write it. Leaving the date unsettled is the
correct outcome, and it is now *visible* rather than silent (see §2).

---

## 2. PROVEN — a second, larger defect found by the same event

The gate fired. The workflow went **green**. `automation_settle.sh` printed:

```
✓ MLB settlement completed
```

Root cause, at `scripts/automation_settle.sh`:

```bash
if $PY -m pipeline.mlb.settle_mlb_results --date "$D" 2>&1 | tee /tmp/log; then
    ok "MLB settlement completed"
```

Bash defines a pipeline's exit status as that of its **last** command — `tee`, which always succeeds.
The Python traceback took the `then` branch. `set -o pipefail` was never declared.

**Scope: 10 steps**, including both settlements and both exports. **Every settlement failure since this
script was written has been reported as success.** This is the single highest-impact defect found in the
last four sprints, and it was invisible precisely because nothing had ever failed hard enough to expose
it — until a gate we built started refusing data.

Fixed by declaring `pipefail` before the first piped step, proven by
`scripts/automation_settle_pipefail_test.sh`, which includes a known-negative reproducing the original
behaviour exactly (`REPORTED_SUCCESS` on an `exit 7`) and a known-positive confirming healthy runs stay
green.

### Freshness could not see it either

A ledger-vs-corpus comparison shows perfect health when a date is missing from **both** sides. The
freshness monitor now compares **boards to the ledger** and reports completed slates with no settled
rows — surfacing 2026-07-28 plus 7 pre-existing gaps. Reported as a *warning*, not a problem: a refused
settlement is the correct outcome, and the loop's own data is internally consistent.

An earlier version of this check excluded "the newest board", which hid 2026-07-28 exactly. It now keys
on the ET date.

---

## 3. Calibrator versioning (Phase 2)

`data/internal/mlb/model-learning/calibrator-manifest.json` — version `platt-1`, corpus fingerprint
`3f60fbe593c46368`:

| Field | Value |
|---|---|
| Fit window | 2026-05-16 → 2026-06-24 (14,938 rows) |
| Held-out window | 2026-07-01 → 2026-07-27 (6,695 rows) |
| Raw Brier → calibrated | 0.2559 → **0.2455** |
| Market (de-vigged) Brier | **0.2413** |
| Still behind market | **true** |

`checkCompatibility()` refuses to apply the calibrator on: missing manifest, schema mismatch, a market
family absent from the fit, staleness beyond 45 days, malformed parameters, or an unparseable date —
because **an unknown age is not a young age**. Each refusal carries an actionable reason, and the
fallback is a labelled raw-only view, never a corrected number that was never valid for the row.

The 45-day bound is set by the fit window's own length (~40 days), not by preference. There is no
measured drift to justify tightening it: every market's recent Wilson interval still overlaps its prior.

`manifestInterpretation()` generates the public sentence **from the manifest's own measured numbers**,
so it cannot drift the way the hardcoded 51.7% caption did before Sprint 046 caught it.

---

## 4. Market registry (unchanged, re-derived)

| Market | Status | n | Hit rate | Recent trend |
|---|---|---|---|---|
| `batter_hits` | RECALIBRATE | 9,005 | 53.81% | −0.2pp, not significant |
| `batter_hits_runs_rbis` | RECALIBRATE | 7,408 | 49.64% | −1.5pp, not significant |
| `batter_total_bases` | **DISABLED** | 4,120 | 43.76% | −4.5pp, not significant |
| `pitcher_strikeouts` | RECALIBRATE | 1,100 | 47.82% | +0.3pp, not significant |

No market is `APPROVED`. Overall: 21,633 decisive rows, 50.16% hit rate, model 9.32pp overconfident.

---

## 5. Public-launch readiness

| Dimension | Verdict | Evidence |
|---|---|---|
| Data lifecycle | 🟢 GREEN | corpus 22,660/22,660, 0-day lag, deterministic export in `nightly-settle` |
| Settlement | 🟢 GREEN | gate observed live, failed closed, no partial write, 0 duplicates |
| Calibration | 🟡 YELLOW | versioned, held-out validated, compatibility-checked — **not wired to any surface** |
| Market registry | 🟢 GREEN | derived, versioned, intervals + sample minimums, exposed on `/ops` |
| Research brief | 🟢 GREEN | autopsy generated nightly from authoritative settled data |
| Public claims | 🟢 GREEN | derived captions, banned-phrase scans, mutation-proven guards |
| UX | 🔴 RED | **no user-facing surface consumes calibration, eligibility, or registry** |
| Operations | 🟡 YELLOW | pipefail fixed today; the fix has **not yet survived a live cycle** |
| Model capability | 🟢 GREEN *as a distinction* | measured, published, and clearly separated from product readiness |

**Overall: not ready for broad public exposure.** Two dimensions block it, and neither is about the
model — the research plumbing is sound and the *product* has not been built on top of it.

---

## 6. Status of every claim

### PROVEN
- The lineage gate executes in production and fails closed on a real collided board (641 rows refused).
- `automation_settle.sh` reported every failed step as success; 10 steps affected; fixed and pinned.
- The ledger has no duplicates and suffered no partial write during the refusal.
- The calibrator is versioned, fingerprinted, and refuses incompatible application.
- 2026-07-28's board predates its own publication gate by 11 hours.

### MEASURED BUT NOT PROVEN
- The pipefail fix behaves correctly under a real failing settlement — proven in fixtures and by
  known-negative, **not yet observed live**. The next refusal will be the test.
- Per-market calibration error ranges 6.7pp → 15.1pp, suggesting per-market calibrators. Not backtested.

### HYPOTHESIS
- Publishing eligibility improves user trust. Built and tested; no user has seen it.

### BLOCKED
- The gate's **stamping** path (rows written *with* lineage fields) remains unobserved. It requires a
  clean board to settle. 2026-07-29's board is the first post-gate board; its settlement runs tomorrow.

### FUTURE WORK
- Wiring calibration/eligibility/registry into surfaces; per-market calibrators; feature capture.

---

## 7. Sprint 050 recommendation

By the charter's own decision rule, two conditions now hold: *public UX incomplete but data loop stable*,
and *lineage gate now live-proven*. That points to one place.

**Build the research terminal UX on the contracts that already exist.**

Everything a user-facing surface needs was completed in Sprints 047–049 and is consumed by nothing:
the four probability layers, the calibrator manifest with compatibility, publishing eligibility, the
market registry, the daily brief. The gap between "the platform measures itself honestly" and "a person
can see that" is now entirely presentation.

**Do first, in order:**

1. **Watch tomorrow's settlement.** The 2026-07-29 board is the first generated under the publication
   gate. Its settlement is the first chance to observe the *stamping* path, and the first live test of
   the pipefail fix. Cheap, and it closes the last BLOCKED item.
2. **Wire the probability layers into `/today` and the game report** — raw, calibrated, market, with the
   disclosure. This is the single change that turns six sprints of measurement into a product.
3. **Surface the registry and the daily brief.** `batter_total_bases` shown with its record is the most
   trust-building thing on the site precisely because it is unflattering.
4. **Then** accessibility, empty/stale/error states, and mobile QA.

**Still not recommended:** adding a sport. Nothing measured this sprint changes that, and the UX gap
would only be duplicated.
