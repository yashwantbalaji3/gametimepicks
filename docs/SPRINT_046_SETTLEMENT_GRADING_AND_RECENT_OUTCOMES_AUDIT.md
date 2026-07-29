# Sprint 046 — How Settling & Grading Actually Work, and What the Last Few Days Show

**Audit run:** 2026-07-29 01:10 ET (05:10 UTC) · **HEAD/production:** `65c1f8fd` · **Read-only audit**

This is written for a founder who wants exact evidence without opening the codebase. Every material
statement links to an artifact, script, or workflow. Reproduce any number with:

```bash
cd app && npm run audit:settlement-and-outcomes -- --date-from 2026-07-25 --date-to 2026-07-27 --check-finality
```

---

## Executive summary

**Is the system trustworthy right now?** For measurement, yes — with two caveats you should know about.

1. The population accounting **closes exactly** for the three most recent fully-settled dates. Every
   generated row lands in exactly one bucket. Gap = 0, 0, 0. This is the first time that has been proven.
2. **The lineage gate built last sprint has never run in production.** It is proven in tests and against
   historical boards; no live settlement has executed since it landed. Do not treat it as production-proven.
3. **Three public pages were showing a stale settle rate** (51.7% when the ledger said 51.0%). Found by
   this audit, fixed, and now guarded by a test that scans the pages rather than one accessor function.

**The headline numbers for 2026-07-25 → 2026-07-27:**

| Question | Answer | Denominator |
|---|---|---|
| How often were directional calls right? | **49.24%** | 782 wins / 1,588 decisive rows |
| Did the model out-predict the sportsbook? | **No** — Brier 0.2548 vs 0.2398 | 1,588 identical paired rows |
| Are the probabilities calibrated? | **No** — mean predicted 59.1%, observed 49.2% | same 1,588 rows |
| What did the official paper money do? | **Nothing — zero events in this window** | last paper event 2026-07-07 |

The single most important sentence in this document: **the model says 59% and is right 49% of the time.**
That is a ~10 percentage-point overconfidence, consistent across every probability bucket.

---

## 1. The lifecycle, end to end

```
  MLB StatsAPI schedule ──┐
                          ├──► pregame market capture ──► normalized snapshot (+ capturedAt per row)
  The Odds API ───────────┘         mlb-pregame-capture.yml · 11:00 UTC + 15/17/19/21/23 UTC
                                                   │
                                                   ▼
                        projections + simulations ──► BOARD (leans)
                                    mlb-daily-production.yml · 14:15 UTC
                                                   │
                     ┌─────────────────────────────┤
                     ▼                             ▼
              public surfaces              (event happens)
            /today /board /mlb                     │
                                                   ▼
                                   nightly-settle.yml · 05:30 + 07:30 UTC
                                     ├─ fetch official MLB box score
                                     ├─ grade each market family
                                     ├─ ✱ settlement-lineage gate  ← NEW, never yet run live
                                     └─ append to settled_leans.jsonl + comparison report
                                                   │
                                                   ▼
                                  /results · category captions · calibration
```

### Authoritative artifacts

| Stage | Path | Authority |
|---|---|---|
| Schedule | `app/public/data/mlb/schedule/<date>.json` | game list only — **carries no status** |
| Pregame capture | `data/internal/mlb/pregame-archive/market-snapshots/<date>/…/normalized.json.gz` | **the only per-row provenance in the repo** |
| Board (generated leans) | `app/public/data/mlb/boards/<date>.json` | **authoritative for the generated population** |
| Research ledger | `app/public/data/mlb/results/settled_leans.jsonl` | **authoritative for settled outcomes** |
| Comparison report | `pipeline/validation/mlb_comparison_report_<date>.json` | aggregates; records unavailable counts |
| Official money | `app/public/data/mr-dub/{portfolio,banked-ladders}.json` | **authoritative for the 19-14 record** |

When surfaces disagree, the **board** decides what was generated and the **ledger** decides what settled.

### Workflow schedule vs observed start (last 12 runs of `nightly-settle`)

| Scheduled | Observed delay |
|---|---|
| 07:30 UTC | +1, +14, +24, +25, +27 min (first pass) |
| 07:30 UTC | +82, +108, +123, +145, +148, +156, +204 min (second pass) |

Settlement in practice lands **04:00–06:00 ET**, not at the nominal cron. Nothing is broken by this —
settlement is idempotent and refuses in-progress games — but it means "yesterday's results" are not
available at 1:30 AM ET as the workflow comments suggest.

---

## 2. Grading policy, market by market

Only four MLB market families are graded (`GRADABLE_MARKETS` in `pipeline/mlb/settle_mlb_results.py`):

| Family | Graded from | Win / Loss | Void |
|---|---|---|---|
| `pitcher_strikeouts` | `stats.pitching.strikeOuts` | actual vs line, by side | actual == line |
| `batter_hits` | `stats.batting.hits` | actual vs line, by side | actual == line, **or 0 plate appearances (DNP)** |
| `batter_total_bases` | derived from the batting line | actual vs line, by side | as above |
| `batter_hits_runs_rbis` | hits + runs + RBI | actual vs line, by side | as above |

**Not graded at all:** moneyline, run line, and game totals. They are generated and displayed but never
settled, so no run-line orientation claim can be made from settled data — there is none.

**Special cases.** A postponed or suspended game leaves its rows **pending**, never a loss. A player who
never took a plate appearance produces a **void** if he was in the box score, and an **unavailable** row
if he was not in it at all. Doubleheaders are separated by scheduled start time to the minute; the three
historical boards where that failed are quarantined and documented in Sprint 044.

---

## 3. Population reconciliation — the accounting closes

Window: **2026-07-25 → 2026-07-27**. These qualify because all three have a complete board, a completed
slate, and a finished settlement run. 2026-07-28 is excluded (see §5).

| Date | Generated | Win | Loss | Void | Pending | Unavailable | Pass | **Gap** |
|---|---|---|---|---|---|---|---|---|
| 2026-07-25 | 650 | 272 | 281 | 42 | 0 | 0 | 55 | **0** |
| 2026-07-26 | 690 | 297 | 297 | 33 | 0 | 0 | 63 | **0** |
| 2026-07-27 | 557 | 213 | 228 | 64 | 2 | 2 | 48 | **0** |

The two **pending** rows on 07-27 are gamePk 824490 (CLE @ CIN), **Postponed**. The two **unavailable**
rows are Sam Huff, who did not appear. Neither is a loss, and neither is in any hit-rate denominator.

> **A real finding:** unavailable rows are **never written to the ledger at all**. They exist only as a
> count in the comparison report. So the ledger alone cannot tell you what was generated — you must diff
> it against the board, which is exactly what the new audit tool does. This is not a bug, but it means
> any analysis that starts from the ledger silently understates the generated population.

---

## 4. The outcome numbers

### 4.1 Directional accuracy (research ledger — **not** money)

| Population | Rate | Numerator / denominator |
|---|---|---|
| **Overall, 07-25 → 07-27** | **49.24%** | 782 / 1,588 decisive |
| 2026-07-25 | 49.19% | 272 / 553 |
| 2026-07-26 | 50.00% | 297 / 594 |
| 2026-07-27 | 48.30% | 213 / 441 |

By market family — **all four shown, including the bad ones**:

| Family | Rate | n |
|---|---|---|
| `batter_hits` | 53.86% | 622 |
| `batter_hits_runs_rbis` | 49.18% | 610 |
| `pitcher_strikeouts` | 44.93% | 69 |
| `batter_total_bases` | **40.42%** | 287 |

By descriptive category (these are groupings shown in-product, **not** predictive confidence):

| Category | Rate | n |
|---|---|---|
| High | 48.23% | 705 |
| Medium | 51.82% | 220 |
| Low | 49.47% | 663 |

The categories do not order by outcome. That is consistent with every prior calibration finding in this
repository and is why the product stopped describing them as confidence.

### 4.2 Coverage and completion

| Metric | Value | Meaning |
|---|---|---|
| Terminal coverage | **91.04%** (1,727 / 1,897) | share of generated rows that reached Win/Loss/Void |
| Settlement completion | **99.77%** (1,727 / 1,731) | share of rows expected to settle that did |

The 8.96% that never reaches a terminal state is almost entirely **Pass** rows (166 of 1,897) — rows the
model declined to take a side on. That is intended behaviour, not failure.

### 4.3 Model vs sportsbook — identical rows, market de-vigged

1,588 paired decisive rows. Zero excluded for missing model probability, zero for missing market.
The book's raw probabilities sum to ~1.069, so they are **de-vigged** before comparison; skipping that
step would hand the model a ~6.9-point head start.

| | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| Model | 0.2548 | 0.7047 | 59.11% |
| **Market (de-vigged)** | **0.2398** | **0.6724** | 50.16% |
| Observed | — | — | 49.24% |

**The model scored worse than the market on both measures** (Brier +0.0150, log loss +0.0323) over this
window. The market's mean prediction (50.16%) sits almost exactly on the observed rate (49.24%); the
model's (59.11%) does not.

### 4.4 Calibration

| Predicted bucket | n | Mean predicted | Observed |
|---|---|---|---|
| 0.3–0.4 | 74 | 36.2% | 32.4% |
| 0.4–0.5 | 246 | 45.8% | 41.9% |
| 0.5–0.6 | 524 | 55.2% | 44.8% |
| 0.6–0.7 | 469 | 64.9% | 54.8% |
| 0.7–0.8 | 246 | 73.7% | 57.7% |
| 0.8–0.9 | 29 | 82.1% | 72.4% |

**Every bucket is below its prediction.** This is systematic overconfidence, not noise in one cohort.

### 4.5 Official paper money — completely separate

**Zero official paper events occurred in 2026-07-25 → 2026-07-27.** The last one was **2026-07-07**.

The official record remains **19-14, bankroll $19,065.40**, unchanged, covering 2026-06-09 → 2026-07-07.

> The 19-14 record and the 49.24% research rate describe **different populations over different, entirely
> disjoint dates**. Neither validates the other. Combining them would be meaningless.

---

## 5. Failure, drift, and exclusion audit

| Check | Result |
|---|---|
| Workflow failures in the window | None — all 12 recent `nightly-settle` runs succeeded |
| Settlement delay | Real: +1 to +204 min past cron; effective settle time 04:00–06:00 ET |
| Capture after event start | **0 of 19,297** archived rows; minimum lead 72 minutes |
| Stored vs re-derived research eligibility | **0 disagreements of 19,297** |
| Duplicate settled rows | **0** — 22,660 rows, 22,660 unique ids |
| Deployment staleness | None — HEAD, origin/main, and production all `65c1f8fd` |
| Stale public rate copy | **3 found and fixed** (see below) |
| Money artifacts touched | **0** |
| **Live lineage-gated settlement** | **NOT OBSERVED — see below** |

### 5.1 The lineage gate has not run in production

Two independent proofs:

1. The gate commit `0099dadf` landed **2026-07-28 21:23 ET**. The most recent `nightly-settle` run started
   **2026-07-28 10:06 UTC** — before it.
2. **0 of 22,660** ledger rows carry the `eventId` field the gate stamps. If it had run, they would.

2026-07-28's slate is final (15 Final, 1 Postponed) but unsettled, which is **expected**: settlement for
it is due on the 05:30 UTC pass, roughly 20 minutes after this audit was taken.

**Bounded observation plan.** After the next `nightly-settle` run: (a) confirm rows dated 2026-07-28 exist
in the ledger, (b) confirm they carry `eventId`, `providerEventId`, `eventStartTime`, `settlementSource`,
(c) confirm the run's log shows no `SettlementLineageError`, (d) re-run this audit with the window
extended to 2026-07-28 and confirm the gap is still 0. Until all four hold, the gate is *tested*, not
*production-proven*.

### 5.2 Stale published rates — found and fixed

`confidenceCaption()` was correct (51.0%) and guarded since Sprint 036. But the same three numbers were
**hardcoded again as literal JSX** in `board/page.tsx` (twice) and `about/page.tsx`, where nothing
recomputed them. Category C read **51.7%** — stale by 0.7pp, publicly, while CI stayed green.

Guarding the accessor is not the same as guarding the claim. `published-rate-claims.test.mjs` now scans
the page sources themselves and fails when any printed category rate drifts more than 0.5pp from the
ledger. It failed on all three before the fix, which is how we know it works.

An `about` page paragraph also read "High **is now** 49.7% on 396 settled rows" — figures from the May 22
settlement against a current ledger of 9,672 High rows. Reworded to state plainly that they are the
May 22 figures.

---

## 6. Founder FAQ

**What counts as one simulation, one prediction, one settled result?**
A *simulation* is one Monte Carlo run set for one player-market — 10,000 draws produce **one** row, not
10,000 predictions. A *prediction* (lean) is one directional row on the board. A *settled result* is one
graded row in the ledger. On 2026-07-26: 690 leans generated, 627 directional, 594 decisive.

**When does a row become Win / Loss / Void / Pending / Unavailable?**
Win/Loss when the official box-score stat is above/below the line and matches the side taken. Void when
the stat exactly equals the line, or the batter recorded no plate appearance. Pending when the game is
not final. Unavailable when the game finished but the player produced no gradable line.

**Which source decides the outcome?** The MLB Stats API official box score. Never a web snippet, never
the model's own output. The allowlist is enforced in code (`OFFICIAL_SETTLEMENT_SOURCES`).

**What if the market, simulation, and result refer to different events?** Before Sprint 041, nothing
caught it — that is what corrupted 49 legs across three doubleheader dates. Now board generation refuses
to publish a collided mapping, and settlement refuses to write one. The settlement half has not yet run
live.

**Why does the research hit rate differ from 19-14?** Different populations, different dates, and no
overlap at all. 19-14 is 33 founder-approved paper selections between 2026-06-09 and 2026-07-07. The
49.24% is 1,588 research rows between 07-25 and 07-27. Neither is evidence about the other.

**What was the success rate over the most recent fully settled days?** 49.24% (782/1,588) across
2026-07-25 → 2026-07-27.

**Which markets did best and worst?** Best `batter_hits` 53.86% (n=622); worst `batter_total_bases`
40.42% (n=287). `pitcher_strikeouts` at 44.93% has only 69 rows — too few to conclude anything.

**Did the model out-predict the sportsbook?** No. Brier 0.2548 vs 0.2398 on 1,588 identical rows.

**Are the probabilities calibrated?** No — the model says 59.1% on average and wins 49.2%, and every
probability bucket lands below its prediction.

**Were any results excluded, and why?** Four rows on 07-27: two pending (postponed game), two unavailable
(player did not appear). Both categories are excluded from hit-rate denominators by policy and counted
explicitly. Nothing else was excluded.

**Has the lineage gate run live?** No. See §5.1.

**Can I trust the public Results page?** The settled numbers, yes — the ledger reconciles exactly and has
no duplicates. The category captions were stale until today and are now guarded. Note the page shows the
research ledger, not the money record.

**What should be fixed before adding sports?** The calibration, not the plumbing. See below.

---

## 7. What changed in Sprints 041–046, and what is merely tested

| Capability | Status |
|---|---|
| Doubleheader identity resolution (board generation) | **Production-observed** — running since 2026-07-28 |
| Publication gate refusing collided boards | Tested + verified on 58 historical boards; no live collision since |
| Alias index on read paths (`/markets`, game report) | **Production-observed** — shipped and rendering |
| Settlement lineage gate | **Tested only — never run live** |
| Per-row research provenance (MLB internal archive) | **Production-observed** — 19,297 rows, 100% eligible |
| Historical corruption audit (49 legs) | Complete; preserved, not rewritten |
| UFC collision audit | Complete; UFC remains `SCAFFOLD_ONLY`, no money exposure |

---

## 8. Go / no-go for Sprint 047

### Recommendation: **PAUSE sport expansion. Fix calibration first.**

The plumbing is now in good shape — identity, lineage, provenance, and accounting all reconcile, and this
sprint found the remaining measurement defects rather than assuming there were none. That is exactly the
condition under which the honest next step becomes visible, and it is not "add a sport":

**The model is systematically overconfident by ~10 percentage points and loses to the de-vigged market on
every scoring rule.** Adding UFC or soccer multiplies that problem across more surfaces. Fixing
calibration improves every product that already exists.

**Do first, in order:**

1. **Observe the lineage gate on a live settlement** (four checks in §5.1). Cheap — it happens tonight.
2. **Recalibrate the four MLB markets.** The overconfidence is monotone across buckets, so an isotonic or
   Platt fit on held-out settled rows is the obvious first attempt. Measure against the de-vigged market
   on identical rows, using this audit tool, and publish the result whether or not it improves.
3. **Investigate `batter_total_bases` at 40.42%** — it is 9pp below the other families on 287 rows, which
   is large enough to be worth a look and small enough not to over-read.
4. **Consider deriving the category captions from the artifact at build time**, so the class of defect
   found in §5.2 becomes impossible rather than guarded.

**Do not** unify soccer settlement, activate UFC, or add a provider until (1) and (2) are done. Neither
sport has a calibrated model to expand *with*.
