# MLB Projection Grading — Audit (2026-07-09)

**Founder's question: are we grading the raw MLB projection board (not just the money/product cards)?** Answer up front: **YES — a complete, money-independent MLB projection-grading pipeline exists and has run through July-7. July-8 (683 leans) is simply not run yet, but is fully gradeable now (verified by a reverted dry-run below).** Nothing in this audit changed money, the 19-14 record, or any artifact.

## Phase 0 — precheck (1:22am EDT)
Branch `june30-reset` @ `e4b9a0be` (local, ahead of origin `2a42da06` only by the Chunk-6A audit doc; nightly bot has NOT fired) · tree clean · money md5 `affe6b21071f2b3be96bb2774eb347c3` · record 19-14 · bankroll $19,065.40 · crown $20,465.40 · drawdown $1,400 · open exposure $0. July-8 board `app/public/data/mlb/boards/2026-07-08.json` (2.5MB, 683 leans); sim `app/public/data/mlb/game-simulations/2026-07-08.json`; daily-portfolio `app/public/data/mlb/…`/`mr-dub/daily-portfolio.json` (no-play, $0). **No data files modified in 2h (no automation in flight).**

## Phase 1 — does MLB projection grading exist? → **YES**

| File / artifact | Purpose | Grades raw MLB leans? | Changes money? | Status |
|---|---|---|---|---|
| `pipeline/mlb/settle_mlb_results.py` | Grade published board leans vs **official MLB Stats API final box scores** (free API, no fabrication) | **YES** | **No** | works; run through July-7 |
| `pipeline/mlb/export_mlb_results.py` | Export internal grading → public `/mlb/results` bundle | — (exporter) | No | works |
| `pipeline/validation/mlb_settled_leans.jsonl` | Internal: one row per graded lean (idempotent by id, 18k+ rows) | holds the graded rows | No | current thru July-7 |
| `pipeline/validation/mlb_comparison_report_<date>.json` | Internal per-date summary (W/L/P, hitRate, byMarket, byConfidence, byGame, topHits, biggestMisses) | the summary | No | thru July-7 |
| `public/data/mlb/results/comparison_report_<date>.json` | **Public** per-date report (UI) | the public report | No | **thru July-7** |
| `public/data/mlb/results/available_dates.json` · `lifetime_summary.json` · `settled_leans.jsonl` | Public index + lifetime aggregate + sanitized rows | aggregate | No | thru July-7 |
| `app/src/lib/data-mlb-results.ts` (`latestMlbResultDate`, `getMlbComparisonReport`, `getMlbLifetimeSummary`, `getMlbSettledLeansForDate`) | Reads the public bundle for the UI | reads | No | live |
| UI: `/mlb/results`, `/results/mlb`, `/results/model-audit` | Surfaces the grading | display | No | live |

**Verdict: YES, MLB projections are being graded** — a full grade→export→UI pipeline, entirely **separate from the 19-14 money/product record** (grep-confirmed: the grader never references `portfolio.json`/`mr-dub`/money; money md5 unchanged after a live run). Grade rule: Over wins if actual > line, Under if actual < line, Push if equal; pending games (state != Final) left ungraded; insufficient-data / missing-stat / Pass-No-Play leans excluded from the decisive denominator.

## Phase 2 — July-8 board structure
683 leans across 15 games, 4 markets: **pitcher_strikeouts 31 · batter_hits 269 · batter_total_bases 114 · batter_hits_runs_rbis 269**. Each lean carries: `id` (unique), `gamePk`/`gameId`, `playerId`/`playerName`/`playerTeamAbbr`, `opponentAbbr`, `marketKey`/`marketLabel`, `line`, `projection`, `sigma`, `samples`, `lean` (side), `confidence`, `modelProbOver`/`Under`, `edgePct`. **Every field needed to grade is present**, keyed by a stable id.

## Phase 3 — data needed + availability
| Market | Official stat (MLB Stats API boxscore) | Grading rule |
|---|---|---|
| pitcher_strikeouts | `stats.pitching.strikeOuts` | over/under/push vs line |
| batter_hits | `stats.batting.hits` | over/under/push vs line |
| batter_total_bases | `stats.batting.totalBases` | over/under/push vs line |
| batter_hits_runs_rbis | hits + runs + RBIs | over/under/push vs line |
The official source (`https://statsapi.mlb.com/api/v1`, free) is **already wired** into `settle_mlb_results.py` (schedule finality + boxscore fetch by gamePk). July-8: **all 15 games are Final** (confirmed by a live schedule probe) — box scores available now. (The grader's docstring lists only 3 markets, but the CODE grades all 4 — the docstring is stale; noted as a doc-fix, not a coverage gap.)

## Phase 5 — July-8 feasibility → **YES, FULLY** (dry-run below; fully reverted, nothing persisted)
Ran `python3 -m pipeline.mlb.settle_mlb_results --date 2026-07-08` (live statsapi; writes only to internal `pipeline/validation/`), read the report, then `git checkout` + `git clean` restored the tree exactly (money md5 unchanged, no public/data or money touched, no commit).

**July-8 dry-run result (NOT persisted):**
- 683 leans · 15/15 final · **decisive 644** · **wins 287 · losses 299 · pushes ~58** · **hit rate 44.6%** · unavailable 0 · pending 0 · small-sample false.
- **By market:** strikeouts **56.7%** (17-13) · hits **54.4%** (123-103-26) · H+R+RBI **47.8%** (108-118-26) · total-bases **37.5%** (39-65-6).
- **By confidence:** Low **47.8%** (269) · Medium **51.6%** (104) · High **49.2%** (271).
- **Calibration signal (model-improvement value):** the confidence tiers barely separate hit rate (High 49.2% ≈ Low 47.8%) — the model's "High confidence" isn't yet predictive of a higher hit rate. And total-bases (37.5%) is a clear weak market. These are exactly the raw-projection insights the founder wants, and they're **invisible until July-8 is graded**.

## Phase 4 / 6 — architecture + Chunk 9 plan
The architecture the mission proposes (`projection-results` / `model-performance` artifacts, per-market/confidence/edge/calibration sections, feeding `/results/model-audit`) **already exists** as `comparison_report_<date>.json` + `lifetime_summary.json`. So Chunk 9 is mostly **run + automate + surface**, not build-from-scratch:
1. **Run July-8 (and any un-graded date):** `settle_mlb_results.py --date <D>` then `export_mlb_results.py --date <D>` → public bundle updates; UI `latestMlbResultDate` advances to July-8.
2. **Automate:** the grader is referenced in `.github/workflows/nightly-settle.yml` but the GH Actions are **DORMANT** (need repo secrets, per prior ops notes) — so grading has run **manually**. Wire the MLB grade+export to run nightly after games finish (or a one-command local `scripts/` step), independent of money settlement.
3. **Fill the by-edge bucket + calibration view** (byMarket/byConfidence exist; add by-edge-bucket + projected-prob-vs-actual calibration to `/results/model-audit`).
4. **Fix the stale docstring** (3→4 markets) and the `/results` "settled-through" banner to read the true `available_dates` latest.
5. **Tests:** money md5 unchanged after grading · official product record (19-14) unchanged · pending games not graded · missing players marked unavailable · pushes handled · confidence-tier aggregation correct · no fabricated stats.

## Answers (plain)
1. **Have we graded MLB projections?** Yes — a full pipeline (`settle_mlb_results.py` → `export_mlb_results.py` → `/mlb/results` UI), through July-7.
2. **Where?** `pipeline/validation/` (internal) → `public/data/mlb/results/comparison_report_*.json` + `lifetime_summary.json`, surfaced on `/mlb/results`, `/results/mlb`, `/results/model-audit` via `data-mlb-results.ts`.
3. **If partial, what's missing?** Not partial by design; the only gaps are operational — **July-8 not yet run**, the grader isn't **auto-run** (GH Actions dormant), and a stale docstring/banner.
4. **If no, what to build?** N/A — it exists. Chunk 9 = run + automate + surface (above).
5. **Can July-8 be graded now?** **Yes, fully** — 15/15 final, 644 decisive, 0 pending/unavailable (dry-run confirmed).
6. **Separate from the 19-14 official record?** **Yes** — the grader never touches money/portfolio; money md5 unchanged after a live run.
7. **What artifacts should exist?** They do: per-date `comparison_report`, `settled_leans.jsonl`, `available_dates`, `lifetime_summary` (+ optionally by-edge/calibration additions).
8. **What UI shows model performance?** `/results/model-audit` (deep audit) + `/mlb/results` + the `/results` MLB summary — add the calibration + by-edge view.
9. **What daily automation should run?** `settle_mlb_results.py` + `export_mlb_results.py` per date after games are Final (nightly, post-settlement, money-independent) — currently manual/dormant.
10. **Money md5 before/after:** `affe6b21071f2b3be96bb2774eb347c3` → unchanged.
11. **Anything changed?** No — audit-only; the dry-run was fully reverted; no commit beyond this doc.
12. **Next recommended implementation prompt:** **Chunk 9 — MLB Projection Performance Ledger: run July-8 grading (settle+export), wire the nightly grade+export automation, add the by-edge + calibration view to `/results/model-audit`, fix the 3→4 market docstring + the settled-through banner, and add the money-unchanged / pending-not-graded / calibration tests.** (Run after the 2am nightly window; re-check origin + money md5 first.)
