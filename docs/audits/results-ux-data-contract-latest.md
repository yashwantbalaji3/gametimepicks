# Results UX Data Contract (2026-06-05)

> Diagnosis before the Results UX revamp. READ-ONLY analysis — no data/grading
> change. Sources read by `app/src/app/results/page.tsx`.

## Data sources
| Source | Helper | What it is |
|--------|--------|-----------|
| `optimizer-summary.json` `.lifetime` | `getOptimizerSummary().lifetime` | **Generated pool** lifetime W/L/P/pending (the full deduped optimizer-graded universe). |
| `optimizer-summary.json` `.byPublicSection.byDate[date]` / `.lifetime` | same | **Published cards** graded by risk section (low/medium/high/longshot) — what users saw in Suggested. |
| `optimizer-summary.json` `.bySportBucket.byDate[date]` / `.lifetime` | same | **Published cards** graded by sport bucket: `nba`, `mlb`, **`multi`** (Mixed). |
| `optimizer-graded/<date>.json` `.uniqueSlips` | `getOptimizerGradedForDate` | **Generated pool** slip list (drilldown / per-date sections). |
| latest optimizer snapshot | `getLatestOptimizerSnapshot` | active/pending slate pointer (Pregame banner). |

## Latest settled slate (2026-06-04)
- **Generated pool:** 6W / 42L / 0P / 0 pending (48 decisive, 12.5%).
- **Published cards (byPublicSection sum):** low 3W/1L, medium 1W/3L, high 0W/4L, longshot 0W/0 → published record per slate.
- **Published cards by sport (bySportBucket):** see lifetime below; per-date varies.

## Lifetime (public era)
- **Generated pool (`.lifetime`):** **87W / 514L / 0P / 27 pending**, 601 decisive, **14.5%**.
- **Published cards (sum of `.byPublicSection.lifetime`):** **19W / 84L / 0P / 9 pending**, 103 decisive, **18.4%**.
- **Published by sport (`.bySportBucket.lifetime`):** NBA 5W/7L (41.7%), MLB 11W/93L (10.6%), **Mixed 5W/41L (10.9%)**.

## Explicit answers
1. **Which numbers are generated-pool?** The hero headline ("Lifetime · public era", 14.5%) and the per-date slip sections / drilldown (`uniqueSlips`).
2. **Which numbers are published-cards?** The risk-section breakdown (`byPublicSection`) and the sport-mix breakdown (`bySportBucket`).
3. **Which include Mixed?** `bySportBucket.multi` (and the new top published-cards card, which sums all sections). Mixed IS gradable today.
4. **Most user-visible headline?** The hero's "Lifetime · public era" hit rate — which is the **generated pool** (14.5%), but reads like "the cards I saw." This is the core confusion.
5. **Confusing labels?**
   - Hero implies the headline is the published-card record; it's the generated pool.
   - The sport-mix Mixed note is **stale**: it says "Suggested Parlays are now single-sport only; cross-sport slips live in Build Your Own" — but **#278 added a real Mixed Suggested tab**, so Mixed is now a published card type.
6. **What the UI will change / keep unchanged:**
   - **Change:** add two clearly labeled lifetime cards — **Published cards** (19W/84L, 18.4%) vs **Generated pool** (87W/514L, 14.5%) — with a neutral one-line explainer; relabel breakdowns "Published cards by risk" / "Published cards by sport mix"; relabel slip drilldown honestly; rewrite the stale Mixed note (Mixed is now a published card type).
   - **Unchanged:** all W/L math, grading, generated data, the per-date generated-pool slip sections (kept, labeled as generated pool), the projection-audit + learning-signals + methodology blocks.

*Read-only diagnosis. No model/projection/grading/data change.*
