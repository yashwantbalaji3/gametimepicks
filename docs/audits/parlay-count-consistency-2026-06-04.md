# Parlay Count Consistency — 2026-06-04 (auto-generated)

> `audit-parlay-count-consistency.mjs --write-report` · READ-ONLY · no paid API · no fabrication.

## Verdict: WARN — CASE 1 — expected but confusing labels

## The count chain
- **Generated pool (top-bar "N slips") = totalSlips = 64** — every generated combination across the 4 profile buckets.
- **Graded unique slips = 48** — the deduped generated pool that settlement grades → **6W / 42L / 0P / 0 pending**. This drives the lifetime/byDate hit rate.
- **publicRiskSections curated subset (union) = 16** (per risk: low 4, medium 4, high 4, longshot 4).
- **DISPLAYED official cards = 4** (after `filterOfficialSuggestedSlips` + `applyVolumeDiscipline`): low 3, medium 1, high 0, longshot 0.
- **Published-card record (byPublicSection)**: 4W / 12L / 0 pending — what users actually saw, graded.

## publicRiskSections by risk × sport
| risk | all | mlb | nba | multi |
|------|----:|----:|----:|------:|
| low | 4 | 4 | 0 | 0 |
| medium | 4 | 4 | 0 | 0 |
| high | 4 | 4 | 0 | 0 |
| longshot | 4 | 4 | 0 | 0 |

## Why the numbers differ (reasons)
- top-bar "64 slips" = generated pool; only 4 official cards displayed (after official filter + volume discipline caps {"low":3,"medium":3,"high":2,"longshot":1} + exposure caps).
- graded universe = 48 unique generated slips (W/L lifetime), NOT the 4 displayed published cards — Results must label which universe it shows.

## Recommended fix
- **Labels (low-risk copy):** top-bar `"N slips"` → `"N generated combinations"`; `"Showing N parlays"` → `"Showing N published cards"`; add `"Published cards are a curated subset of the generated pool."`
- **Empty High/Longshot:** `"No qualifying <risk> cards for this slate after quality + exposure caps."`
- **MLB-only day:** `"MLB-only slate; NBA had no games."`
- **Results scope:** label which universe each number reflects — section/sport breakdowns already use the **published-card** grading (byPublicSection); the lifetime headline uses the **generated pool**. Make that explicit (see results-performance-scope-latest.md).
- **No model/generation change** required; this is a labeling/scope-clarity issue, not an under-display bug.

*Read-only; no UI changed by this script.*