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
  /* P211 R-0 · the dedupe LANDED and the attribution is now measured: cards ship ordered legIds
     against ONE legs-by-id index (387 unique legs serialize once — parity guards in
     explorer-slate-view.test.mjs). Post-dedupe the page measures 1,222KB, and the remainder is
     RENDERED content carried twice by architecture (server DOM + RSC flight for the client
     explorer): ~387 marketplace/card legs with their rendered factor lists + ~180 builder pool
     rows + the seed map. The <600KB target is NOT supported by the current static-export
     architecture without a capability change; the evidence-backed lever is generation-time
     slate-view JSON + on-expand fetch for the marketplace (filed as ENGINEERING with that exact
     acceptance). Ceiling frozen at the measured daytime page + headroom; shrink-only from here. */
  "build/custom/index.html": 1400,
  "mlb/index.html": 3000,
  "markets/index.html": 3000,
  /*
   * P231 · J — THE SIMULATION AND SPORT ROUTES HAD NO CEILING AT ALL.
   *
   * Seven routes were budgeted. The simulation hub, every sport hub, and every signature-product
   * page were not — including the two heaviest here, `/simulate` (522KB) and `/ufc` (514KB), which
   * carry the sport scenes this release is about. A page with no budget cannot regress, because
   * nothing is measuring it; the guard's coverage was the list, not the site.
   *
   * Measured 2026-09-02 against the built export, ~2x headroom, which is the ratio the earlier
   * entries use (index 189→600, today 395→1200). Tight enough that doubling a payload fails.
   */
  "simulate/index.html": 1000,        // measured 522KB — the scene bundle lives here
  "ufc/index.html": 1000,             // measured 514KB
  "nfl/index.html": 600,              // measured 279KB
  "methodology/index.html": 500,      // measured 236KB
  "epl/index.html": 500,              // measured 226KB
  "bank-builder/index.html": 400,     // measured 181KB
  "homer-nukes/index.html": 300,      // measured 116KB
  "sports/index.html": 300,           // measured 115KB
  "moonshot/index.html": 300,         // measured 112KB
  "nba/index.html": 200,              // measured 63KB
});
