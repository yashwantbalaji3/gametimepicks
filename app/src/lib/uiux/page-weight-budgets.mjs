/**
 * Page-weight budgets — evidence-based ceilings (P207 origin; P208 extended).
 * ONE owner: the guard (src/lib/uiux/page-weight.test.mjs) enforces these against the export, and
 * the /launch Product Experience panel renders the same numbers. Change them only with a measured
 * emission in the same commit.
 */
export const BUDGET_KB = Object.freeze({
  /* P251 · F10: 8,103KB before P207 → 2,840KB after it → 3,078KB by drift → 1,821KB now, measured
     2026-09-09. Two changes, both weight-only: the six style attributes repeated once per rendered
     leg moved to classes (byte-for-byte, .gtp-team-logo / .gtp-leg-row in globals.css), and the
     MISSED slips — 509 of the 545 legs, inside a collapsed block most readers never open — render
     as compact lines that still name every leg and its graded result. The ceiling comes down with
     the emission, which is the rule this file states above. Shrink-only from here. */
  "results/index.html": 2300,
  /* P296: the NFL week report renders every graded player prediction (~400 rows a week, collapsed per
     game). Set from the first measured build; shrink-only like every other ceiling here. */
  "results/nfl/index.html": 700,
  /* 2026-10-24 (Release H follow-up): /results/nba had no ceiling. Measured 2,794KB on a flag-ON build at 9baef3847c
     (the retired May–June archive is ~2,770KB of it; the 2026-27 Official Forecast section lists at most the newest
     7 days, ~10KB each, earlier days one line each). Ceiling = measurement + headroom; shrink-only like the rest.
     Lighter archive (same day): the newest archive date's per-game player tables moved to their day pages (summary
     rows link there) and the graded-row utilities moved into CSS — 2,794KB → 986KB (1,009,438 B, flag-ON, same data).
     Ceiling 3,000 → 1,100 (the capped 2026-27 section + small headroom). */
  "results/nba/index.html": 1100,
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
  /* P251 · F10: 832KB → 573KB when the per-leg style attributes became classes.
     P257: 573KB on 373 legs (09-09) grew to 886KB on 598 (09-11) — the collapsed "Advanced" explorer carried
     every leg again. It now loads on first open (data/build/explorer-slate.json): measured 427KB on the
     598-leg slate. Ceiling down 800 → 560 with the emission; the builder pool still adds ~0.31KB/leg. */
  "build/custom/index.html": 560,
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
  /* P308 (2026-09-15): measured 268KB after the explorer moved to on-open loading; ~2x headroom, shrink-only. */
  "simulate/index.html": 600,         // measured 268KB
  "ufc/index.html": 1000,             // measured 514KB
  /* P695 (2026-09-26): the comment below said "measured 279KB" and that stopped being true when NFL
     went live. The page reached 631KB — 31KB OVER — and blocked every PR's quality gate, on a
     breach nothing in the diff caused: the slate filled. Two below-the-fold blocks now mount on
     scroll (the 45 ranked board rows, keeping their filter chips eager, and the 16 schedule cards),
     which hides no record and re-measures at 531KB. The ceiling is NOT raised, per the rule above.
     ⚠ HEADROOM IS 11%, and only the server DOM can be bought back this way: the page is 251KB of
     DOM against 302KB of RSC flight, and DeferUntilVisible still ships every deferred child in the
     flight. The next lever is the flight, which is the architecture change /build/custom's note
     below already describes — not another deferral. */
  "nfl/index.html": 600,              // measured 531KB (2026-09-26, 14-game slate)
  "methodology/index.html": 500,      // measured 236KB
  "epl/index.html": 500,              // measured 226KB
  "bank-builder/index.html": 400,     // measured 181KB
  "homer-nukes/index.html": 300,      // measured 116KB
  "sports/index.html": 300,           // measured 115KB
  "moonshot/index.html": 300,         // measured 112KB
  "nba/index.html": 250,              // measured 236KB on 2026-10-20 (was ~194KB before): +~42KB for the NBA experimental public lane (preregistration §13 — 3 games × at most ~22 frozen player rows, one class string per table); bounded by the slate, not by history. 2026-10-21: an 11-game slate with full tables measured 388KB — the compact hub (rows on /nba/projections only) keeps the ceiling; do not raise it
  "nba/projections/index.html": 200, // measured 2026-10-21 (PR 1163, packed island + table-level row styling): 149KB on the real 11-game 10-21 slate (242 rows; was 206KB), 175KB on a 15-game synthetic slate, 72KB empty; ~6.4KB per game, so 200 holds a full 15-game night with headroom and fails a payload regression; bounded by the slate, not by history
});

/**
 * Route FAMILIES — one ceiling for every page a dynamic route emits, checked against the heaviest. A dated
 * family cannot be budgeted by one path (the path rots), and an unbudgeted family cannot regress because
 * nothing measures it. Same rule as above: measured emission + headroom, shrink-only.
 */
export const FAMILY_BUDGET_KB = Object.freeze({
  /* Results V2 · B-3 (2026-09-29): 115 day pages. The day view added game-by-game calls + every NFL player
     range (2026-09-27: 1,574KB → 1,953KB, 583 collapsed range rows, styled by class). The CEILING is set by
     the legacy June NBA-era pages (heaviest 2026-06-10 at 5,033KB, unchanged by B-3) — that legacy weight is
     backlog, not headroom for new days. Shrink-only. */
  "results/date": 5300,
  /* /nba/projections/<date>/ (PR 1171: one static page per committed slate snapshot + the build's ET date). The family
     test reads out/nba/projections/<dir>/index.html, so it covers the DATED pages only; the default view keeps its own
     "nba/projections/index.html" ceiling above. Measured under the build lock 2026-10-21 on PR 1171 at 25eaad51dd —
     2026-10-20 page 100,416 B, 2026-10-21 page 155,051 B, current page 154,297 B at 11 games and 181,330 B at a
     15-game synthetic slate. Bounded by one slate per page, not by history. Shrink-only. */
  "nba/projections": 200,
  /* NBA Simulation Theater public candidate (PR 1167), one page per published game. MEASURED under the build lock 2026-10-21 (flag-ON build of
     PR 1167 c1feea7a49, real 11-game 10-21 slate): 169,020–180,315 B per page. A flag-ON build measured 446-458KB before the island's props were packed (wire.mjs + event-codec.mjs:
     five event logs as ledgers, ~346KB → ~65KB escaped in the flight). Estimate after: island markup 34-36KB + props
     63-66KB escaped + the ~74KB site shell (measured page − that same estimate on the old build) = 171-176KB. Emitted
     only by a flag-ON build (FLAG_GATED_FAMILIES). Replace with the measured emission + headroom; shrink-only. */
  "nba/simulation": 250,
  /* /nba/lines/<eventId>/ (page weight 2026-10-30): one game's FULL model-vs-sportsbook-line table, moved off the game
     page (a key build measured /nba/simulation/<id>/ at 328–363 KiB with the table vs the 250 family ceiling). Generated
     only on a build with a readable line artifact (FLAG_GATED_FAMILIES: absent from every keyless CI build). NOT YET
     MEASURED — sized by rule from the Production-parity key build of ccd7e61538 (2026-10-29) game pages:
       per row  1.14 KiB = ~0.41 KiB row HTML (prop-line-weight.test.mjs PER_ROW_MAX 430 B) + ~0.75 KiB of the same row
                escaped in the RSC flight — the slope between the 67-row and 97-row pages (336,280 → 371,354 B);
       fixed    ~33 KiB section (heading, coverage, CSS once, header row, legend, notes; HTML + flight) = the fit's
                0-row intercept 252 KiB − the 219 KiB Production game page without the section;
       shell    ~71 KiB (the smallest exported pages, e.g. /games/ 73,054 B) + ~2 KiB back-link and title.
     ≈ 106 KiB + 1.14 KiB × rows: the heaviest real game (97 rows) ≈ 217 KiB; the worst-case fixture game (every lane
     player × every family, 154 rows) ≈ 282 KiB. Ceiling 300 holds 170 rows. Replace with the measured emission +
     headroom on the first key build; shrink-only. */
  "nba/lines": 300,
});

/**
 * Families a DEFAULT build does not emit: scripts/prune-internal-routes.mjs deletes the directory unless the route's
 * public gate is on (nba/lines: unless the build can read a line artifact — a display key). Absent → nothing to measure (skipped); present → the ceiling above applies to every page.
 */
export const FLAG_GATED_FAMILIES = Object.freeze(["nba/simulation", "nba/lines"]);
