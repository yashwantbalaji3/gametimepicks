# June 7 Results Risk Reconciliation (latest)

> Trust-critical reconciliation. The user's /results screenshot (Low 0W/6L,
> Medium 0W/5L+1pend, High 0W/6L, Longshot 0W/6L) contradicted a prior report
> that claimed "published cards 3W/15L, Low 3W/2L". This document resolves it
> honestly. **The screenshot is correct. The prior report was wrong.**

## The authoritative June-7 records

| Scope | Record | Source |
|---|---|---|
| **Generated pool** (full DFS pool, 55 slips) | **2W-53L-0P · 1 pending** (3.6%) | `optimizer-summary.byDate[2026-06-07]` |
| **User-facing Suggested Parlays** (`publicRiskSections`, 24 slips) | **0W-23L-0P · 1 pending** (0.0%) | `optimizer-summary.byPublicSection.byDate[2026-06-07]` |
| — Low | **0W-6L** (0.0%) | byPublicSection |
| — Medium | 0W-5L · 1 pending | byPublicSection |
| — High | 0W-6L | byPublicSection |
| — Longshot | 0W-6L | byPublicSection |
| By sport | MLB 0W-23L (1 pend); NBA/Mixed none | bySportBucket |
| Legacy profiles artifact (18 slips) | 3W-15L | `parlays/graded/2026-06-07.json` (NOT user-facing) |

## Answers to the reconciliation questions

1. **Authoritative generated-pool record:** 2W-53L-0P, 1 pending (55 decisive, 3.6%).
2. **Authoritative published-card record (what users see):** **0W-23L-0P, 1 pending (0.0%)** — the `publicRiskSections` (Low/Medium/High/Longshot), 6 per bucket.
3. **Why the screenshot shows Low 0W/6L:** because it is true. The Low-Risk `publicRiskSection` genuinely went 0-6. The "conservative" tier did **not** behave conservatively.
4. **Was the prior 3W/15L report wrong?** **YES — the prior report was wrong.** It measured `parlays/graded/2026-06-07.json` — a *legacy* artifact of 18 "conservative/balanced/aggressive" PROFILE slips — and mislabeled it "published cards", then re-derived combined odds to bucket it, producing a false "Low 3W/2L". That artifact is **not** the user-facing Suggested Parlays. Results and the homepage use `publicRiskSections` (`byPublicSection`), which is 0-23. No excuse — the prior analysis read the wrong file.
5. **Results risk buckets are derived from:** the stored `byPublicSection` aggregation — the pipeline grades the generated `publicRiskSections` slips directly (results/page.tsx line ~344 → `summary.byPublicSection.byDate[date]`). Not recomputed odds bands, not the generated DFS pool, not the legacy profiles.
6. **Is there a Results aggregation bug?** Results is **not** hiding losses — it correctly shows 0-23. Two real scope issues remain: (a) Results grades the **generated** `publicRiskSections` (24, pre-volume-discipline) rather than the **displayed** subset (~15 after `parlay-volume-discipline`) users actually saw; (b) a parallel **legacy profiles** artifact (`graded/<date>.json`) coexists with `publicRiskSections` and is what caused the prior mis-report. Both are clarity/scope problems, not "hidden losses."
7. **What must change so Results cannot mislead again:**
   - All performance analysis (mine + scripts) must read `byPublicSection` / the displayed published set — **never** the legacy `graded/<date>.json` profiles.
   - Consider grading the **displayed** published cards (post volume-discipline) and labeling the scope explicitly ("generated public sections" vs "cards shown").
   - The deep-dive (Phase 2) and all gate simulations key off `byPublicSection` + leg-level `settled_leans.jsonl`.

## Bottom line
June 7 Suggested Parlays were a **near-total failure: 0W-23L (0.0%) across every risk tier, including Low Risk 0-6.** This is a genuine model + parlay-construction quality problem, not a display bug. The prior report's "wins" were an artifact-selection error and are retracted. Proceeding to deep post-mortem and evidence-backed quality gates.
