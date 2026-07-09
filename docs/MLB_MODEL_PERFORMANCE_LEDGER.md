# MLB Model-Performance Ledger (money-independent)

**What it is.** A grading pipeline that scores every *published MLB projection lean*
against official box scores. It measures **model quality** — it is **not** the
official paper-card record (19-14) and never touches money. The two are surfaced
separately and are never combined.

- Official product-card record → `mr-dub/portfolio.json` (money; the 19-14).
- MLB model-performance ledger → `public/data/mlb/results/*` (model quality).

Grep-verified money-independence: the grader never reads `portfolio.json` /
`mr-dub` / money artifacts, and the canonical money md5
(`affe6b21071f2b3be96bb2774eb347c3`) is unchanged before/after a run.

## Pipeline

| Stage | Command | Writes | Money-independent |
|---|---|---|---|
| Grade a date | `npm run mlb:grade-results -- --date YYYY-MM-DD` | `pipeline/validation/mlb_settled_leans.jsonl` + `mlb_comparison_report_<date>.json` (internal) | yes |
| Export to public | `npm run mlb:export-results` | `app/public/data/mlb/results/` (comparison reports, `available_dates.json`, `lifetime_summary.json`, `settled_leans.jsonl`) | yes |

Both npm scripts live in `app/package.json` and run the Python modules from the
repo root (`PYTHONPATH=. python3 -m pipeline.mlb.settle_mlb_results` /
`… export_mlb_results`). Grading is **idempotent by lean id** — re-running a
graded date reproduces identical grading (only the `generatedAt`/`settledAt`
timestamps re-stamp). Official MLB Stats API (`statsapi.mlb.com`, free) only.

**Markets graded (all four the board publishes):** `pitcher_strikeouts`,
`batter_hits`, `batter_total_bases`, `batter_hits_runs_rbis`. Over wins if
`actual > line`, Under if `actual < line`, push if equal. Pending games
(`state != Final`), insufficient-data, missing-stat, and Pass/No-Play leans are
excluded from the decisive denominator — never fabricated, never marked lost.

## Where it surfaces (UI)

- `/results/mlb` (= `/mlb/results`) — per-date summary, by-market / by-confidence
  breakdown, and a **by-edge-band calibration** table computed live from the
  current `settled_leans.jsonl` via `buildMlbAudit()` (`lib/results-audit-notes.ts`).
  A banner states plainly that this is a model-performance ledger, not the
  product-card record.
- `/results` — the Trust Center MLB summary card (latest date, decisive count,
  day + lifetime hit rate, by-market), with the same explicit separation.
- `/results/model-audit` — the deeper cross-sport audit (edge bands, quartiles,
  confidence calibration, cohorts) from `audit/model_audit.json`.

**Calibration read (2026-07-08 lifetime, from settled leans):** the model is
currently *inversely* calibrated on edge — leans in the 0–5pp edge band hit
~51% while the 20–30pp band sits ~44%. A bigger stated edge has **not** meant a
higher hit rate. This is a model-improvement signal, surfaced honestly; it is
not advice.

## Automation status

`.github/workflows/nightly-settle.yml` already composes the MLB grade → export
(git-adds `app/public/data/mlb/results/` + `pipeline/validation/mlb_settled_leans.jsonl`).
The workflow is **dormant in this environment** (it needs repo secrets for the
paid fetch jobs it shares a runner with), so MLB grading has been run **manually**
with the two npm scripts above after games go final. MLB grading itself needs no
paid keys — only the free MLB Stats API — so it can be split into its own
secret-free scheduled job as a follow-up.

## Next grading — July 9 (run AFTER finals only)

July-9 has 13 scheduled MLB games (board + 10,000-run sims generated). The raw
projection board is **not graded yet and must not be** until the official box scores
are final (the latest graded date remains 2026-07-08; `/mlb/results` correctly shows
July-8, never implying July-9 is settled). Once July-9 games go Final:

```
npm run mlb:grade-results -- --date 2026-07-09   # official statsapi box scores
npm run mlb:export-results                        # refresh the public /mlb/results bundle
```

This is model-performance only — it never touches the 19-14 product-card record or
canonical money. The `/mlb/results` "latest graded date" will then advance to July-9.

## Deferred follow-ups (daylight, not overnight)

1. **Persist `byEdge` in the export schema.** The by-edge calibration is computed
   live in the UI today; persisting it into `comparison_report_<date>.json` +
   `lifetime_summary.json` would require re-grading all dates (data churn) and is
   best done deliberately, not overnight.
2. **Re-sync `audit/model_audit.json`.** The cross-sport `/results/model-audit`
   artifact was last generated 2026-07-08 morning and predates the July-8 MLB
   grading; a `pipeline.model_audit` refresh would bring its edge/quartile view
   current.
3. **Split MLB grading into its own secret-free nightly job** so it runs
   automatically off the free MLB Stats API, independent of the paid fetch jobs.
