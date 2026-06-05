# Suggested-Parlay Publishing Depth — 2026-06-05 (auto-generated)

> `audit-suggested-parlay-publishing-depth.mjs --write-report` · READ-ONLY · no paid API · no generation/grading/model change · no fabrication.

## Verdict: WARN

## Publish funnel (distinct slips)
| step | count |
|------|------:|
| source buckets (nba+mlb+multi, deduped) | 74 |
| publicRiskSections (curated subset) | 36 |
| after official filter (mixed dropped) | 36 |
| after volume discipline → **DISPLAYED** | **8** |

- dropped by official filter (mixed): **16**
- dropped by volume discipline: **28**

## Composition (distinct)
- source: MLB-only 31 · NBA-only 11 · mixed 32
- publicRiskSections: MLB-only 16 · NBA-only 4 · mixed 16
- sourcePools (leans): {"nbaCount":89,"mlbCount":687}

## PUBLISHED per sport view (live policy: selectPublishedSections)
- MLB: 6 · NBA: 4 · Mixed: 7 · All: 17
- All ⊇ every child view: yes ✅

## Why depth is lost
- MLB published 6 < target 10. publicRiskSections carries 16 MLB-only slips but with low variety (few distinct players / a dominant market), so the per-player/market diversity caps honestly limit depth — NOT a cap-tuning issue (looser caps do not help). The deeper bucket pool has 31 distinct MLB, but those are not the graded "published" set; raising diverse MLB depth requires promoting more varied MLB slips into publicRiskSections at generation (a separate pipeline change), never padding.
- Mixed published 7 < target 10 although 16 mixed slips exist in publicRiskSections — check Mixed caps.
- Published per view: MLB 6, NBA 4, Mixed 7, All 17. NBA depth reflects the slate (one-game NBA days are honestly small).

*Read-only; no UI/data changed by this script.*