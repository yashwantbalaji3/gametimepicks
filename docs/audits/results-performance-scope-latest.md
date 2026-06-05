# Results Performance Scope — Recommendation (2026-06-05)

> Which universe should Results represent: published cards, generated pool, or
> both? Documentation + recommendation only — **no Results rewrite implemented**
> (would be higher-risk; needs browser QA).

## The three universes (June 4 example)
| Universe | What it is | June 4 | Lifetime |
|----------|-----------|--------|----------|
| **Generated pool** (`totalSlips` / graded `uniqueSlips`) | every combination the optimizer built, deduped | 64 generated → **48 unique → 6W/42L** | 87W-514L (14.5%) |
| **Published cards** (`publicRiskSections`, graded → `optimizer-summary.byPublicSection`) | the curated subset users actually saw in Suggested mode | 16 curated; **~4 displayed** after volume discipline | low 12-14, med 6-18, high 1-25, ls 0-27 |
| **Displayed cards** (post `filterOfficialSuggestedSlips` + `applyVolumeDiscipline`) | what's literally on `/parlay-lab` | **4** (low 3, med 1, high 0, ls 0) | — |

## Current Results behavior (from `app/src/app/results/page.tsx`)
- **Risk-section + sport-bucket breakdowns ALREADY use the published-card grading**
  (`summary.byPublicSection.byDate` / `bySportBucket.byDate`) — explicitly "so the
  numbers match what users actually saw in Suggested mode" (falls back to
  classifying `uniqueSlips` only when section grading is absent).
- **Per-date slip list + the lifetime headline use the generated pool**
  (`uniqueSlips` / `optimizer-summary.lifetime` = 87-514, 14.5%).
- So Results is a **hybrid** today: published-card breakdowns + generated-pool
  list/headline. That's the root of the "different universe without explanation"
  confusion.

## User expectation
A user who saw ~4 published cards expects Results to tell them how **those** did,
or at least to clearly label when a number reflects the broader generated pool.

## Recommendation (option 3 — both, clearly separated)
1. **Keep** the published-card section/sport breakdowns (already correct).
2. **Label the lifetime headline** explicitly as the **generated-pool** record
   (e.g., "Model pool record" / "all generated slips"), distinct from a
   **"Published cards" record** (from `byPublicSection.lifetime`). Show both, each
   labeled — never blend them into one unlabeled number.
3. **Per-date list:** label it "all graded slips for this date (generated pool)"
   so it's clear it's broader than the published cards.
4. Do **not** silently switch the headline to one universe — show both with labels.

## Risk / implementation
- The data already exists (`byPublicSection.lifetime` + `optimizer-summary.lifetime`),
  so this is mostly a **labeling + a second headline stat**, not a data/grading
  change. Still, it touches the Results page → **browser QA at 375/1280 required**;
  not implemented in this pass.
- **No grading-scope change.** grade_optimizer continues to grade the generated
  pool (uniqueSlips) AND the published sections (byPublicSection) — both are
  intentional and should remain. Do not narrow grading to published-only (it would
  lose the model-pool signal used internally).

## Decision
- **Do not rewrite Results now.** Implement the labeling clarification (option 3)
  in a dedicated, browser-QA'd UI pass. Until then, the hybrid is technically
  honest but under-labeled.

*Documentation only; no Results/UI change applied.*
