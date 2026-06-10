# Results + Suggested Parlays UX Audit — 2026-06-10

_Polish-only audit (no model/gate/math/settlement changes). Production:
https://gametime-picks.vercel.app — /results, /parlay-lab, /bank-builder, /mlb, /nba all 200._

## Findings
1. **Information hierarchy (Results):** already leads with leg-level Projection Accuracy
   (overall/MLB/NBA) + a two-record hero, then section-nav pills (Overview / Risk sections /
   Sport mix / Slip details / Projection audit / Learning signals). Structure is sound;
   the issue is **jargon + density**, not layout.
2. **Above the fold:** a first-time user sees hit-rate summary + lifetime records — good —
   but the labels "Generated pool" / "Published cards" are unexplained.
3. **Confusing labels:** "Generated pool · lifetime" reads like an internal metric.
   Renamed → **"All generated cards (internal tracking)"** vs **"Published cards (shown to
   users)"**, with a one-line plain-English explainer.
4. **Pending vs settled:** clarified — "**Only settled outcomes count toward hit rate —
   pending games are not counted yet**; pushes are listed separately."
5. **Projection accuracy vs parlay cards:** already separated (accuracy leads; parlay-card
   performance is a distinct section below) — preserved.
6. **Suggested Parlays (/parlay-lab) empty state:** the generic "No saved slips yet" didn't
   explain WHY. Rewritten with friendly reasons: slate not generated yet · no card cleared
   the safety gates · single-game slate (same-game stacking limited on purpose).
7. **Navigation:** added cross-links from the empty Suggested-Parlays state → Projections +
   Bank Builder so users aren't dead-ended.
8. **Mobile:** copy changes only; no layout regression (cards/list reflow as before).
9. **Repeated disclaimers:** left intact (honesty), but the record explainer is now a single
   clear sentence instead of jargon.
10. **`/suggested-parlays` route:** does not exist (404) — the live surface is **/parlay-lab**;
    documented so links/QA target the correct route.

## Scope of this PR (safe, copy/clarity only)
- `results-hero.tsx`: clearer record labels + settled-vs-pending explainer.
- `results/page.tsx`: softened "generated pool" body jargon.
- `parlay-lab/page.tsx`: friendly multi-reason empty state + cross-links.
- **Unchanged:** projection logic, parlay gates, Bank Builder math, settlement, all data artifacts.
