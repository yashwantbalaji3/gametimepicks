# Suggested-Parlay Publishing Depth — 2026-06-04 (auto-generated)

> `audit-suggested-parlay-publishing-depth.mjs --write-report` · READ-ONLY · no paid API · no generation/grading/model change · no fabrication.

## Verdict: WARN

## Publish funnel (distinct slips)
| step | count |
|------|------:|
| source buckets (nba+mlb+multi, deduped) | 31 |
| publicRiskSections (curated subset) | 16 |
| after official filter (mixed dropped) | 16 |
| after volume discipline → **DISPLAYED** | **6** |

- dropped by official filter (mixed): **0**
- dropped by volume discipline: **10**

## Composition (distinct)
- source: MLB-only 31 · NBA-only 0 · mixed 0
- publicRiskSections: MLB-only 16 · NBA-only 0 · mixed 0
- sourcePools (leans): {"nbaCount":0,"mlbCount":426}

## PUBLISHED per sport view (live policy: selectPublishedSections)
- MLB: 6 · NBA: 0 · Mixed: 0 · All: 6
- All ⊇ every child view: yes ✅

## Why depth is lost
- MLB published 6 < target 10. publicRiskSections carries 16 MLB-only slips but with low variety (few distinct players / a dominant market), so the per-player/market diversity caps honestly limit depth — NOT a cap-tuning issue (looser caps do not help). The deeper bucket pool has 31 distinct MLB, but those are not the graded "published" set; raising diverse MLB depth requires promoting more varied MLB slips into publicRiskSections at generation (a separate pipeline change), never padding.
- Published per view: MLB 6, NBA 0, Mixed 0, All 6. NBA depth reflects the slate (one-game NBA days are honestly small).

*Read-only; no UI/data changed by this script.*