/**
 * Page-weight budgets — evidence-based ceilings (P207 origin; P208 extended).
 * ONE owner: the guard (src/lib/uiux/page-weight.test.mjs) enforces these against the export, and
 * the /launch Product Experience panel renders the same numbers. Change them only with a measured
 * emission in the same commit.
 */
export const BUDGET_KB = Object.freeze({
  "results/index.html": 4500,   // measured 2,840KB after the P207 fix; 8,103KB before
  "index.html": 600,            // measured 189KB
  "today/index.html": 1200,     // measured 395KB
  /* P208 (Release H): the redesigned surfaces — measured 2026-08-26 on a 15-game MLB slate
     (339/106/1,763/1,694KB), with slate-growth headroom. */
  "build/index.html": 900,
  /* P210 CORRECTION, with its receipt: the 500KB figure was measured at an EMPTY-POOL moment
     (post-midnight — the morning-window measurement trap this repo has hit before). The daytime
     page was never 500KB: production served 1,264KB on the SAME day BEFORE this train's builder
     changes (cache-bypass 2026-08-26, pre-R-B tip), local 1,262KB. This is a mis-declared budget
     recalibrated to the real page, not a regression accommodated. The real reduction is filed as
     engineering: the engine slate serializes each leg into every slip group that references it —
     dedupe by legId at the ui-loader owner. */
  "build/custom/index.html": 1600,
  "mlb/index.html": 3000,
  "markets/index.html": 3000,
});
