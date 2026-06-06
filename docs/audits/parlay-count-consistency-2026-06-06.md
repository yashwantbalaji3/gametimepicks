# Parlay Count Consistency — 2026-06-06 (auto-generated)

> `audit-parlay-count-consistency.mjs --write-report` · READ-ONLY · no paid API · no fabrication.

## Verdict: WARN — CASE 1 — expected but confusing labels

## The count chain
- **Generated pool (top-bar "N slips") = totalSlips = 64** — every generated combination across the 4 profile buckets.
- **Graded unique slips = 0** — the deduped generated pool that settlement grades → **0W / 0L / 0P / 0 pending**. This drives the lifetime/byDate hit rate.
- **publicRiskSections curated subset (union) = 24** (per risk: low 6, medium 6, high 6, longshot 6).
- **DISPLAYED official cards = 8** (after `filterOfficialSuggestedSlips` + `applyVolumeDiscipline`): low 5, medium 3, high 0, longshot 0.
- **Published-card record (byPublicSection)**: (not in summary)

## publicRiskSections by risk × sport
| risk | all | mlb | nba | multi |
|------|----:|----:|----:|------:|
| low | 6 | 6 | 0 | 0 |
| medium | 6 | 6 | 0 | 0 |
| high | 6 | 6 | 0 | 0 |
| longshot | 6 | 6 | 0 | 0 |

## Why the numbers differ (reasons)
- top-bar "64 slips" = generated pool; only 8 official cards displayed (after official filter + volume discipline caps {"low":5,"medium":5,"high":3,"longshot":2} + exposure caps).

## Recommended fix
- **Labels (low-risk copy):** top-bar `"N slips"` → `"N generated combinations"`; `"Showing N parlays"` → `"Showing N published cards"`; add `"Published cards are a curated subset of the generated pool."`
- **Empty High/Longshot:** `"No qualifying <risk> cards for this slate after quality + exposure caps."`
- **MLB-only day:** `"MLB-only slate; NBA had no games."`
- **Results scope:** label which universe each number reflects — section/sport breakdowns already use the **published-card** grading (byPublicSection); the lifetime headline uses the **generated pool**. Make that explicit (see results-performance-scope-latest.md).
- **No model/generation change** required; this is a labeling/scope-clarity issue, not an under-display bug.

*Read-only; no UI changed by this script.*