# June 24 — Final Ship Report

## What changed this run
- **Audits produced:** product-status, data-health, June 23 settlement-verification, performance-review,
  this ship report. (No code/data mutations needed — June 24 MLB board + slate-date fix already shipped in
  PR #585.)
- **Verified:** money integrity (unchanged), settlement tracking accuracy (ledgers reconcile), mobile QA.

## What's live / production-ready (June 24)
- **MLB flagship** — fully live: Homer Nukes (5 legs, +49828, $9,985 return), 243-prop board, Featured /
  Pitcher props / Game Explorer; real headshots + opponent logos; 12 games.
- **Results / tracking** — product ledgers + WC specials history (PR #584); settlement engine operational.
- **Money** — bankroll $10,176.17 / crown $10,376.17 / record 10-2, verified unchanged.

## What remains (blocked on the projection pipeline, documented — NOT fabricated)
- **Bank Builder June 24 ladders** — orchestrator returns NO_QUALIFIED_LAUNCH (0 eligible legs); needs the
  methodology projection model run for June 24. The system is honest (won't force picks).
- **Moonshot / WC Specials / WC Parlays / daily portfolio June 24** — same dependency (projection + WC
  odds-discovery pipeline).
- **One data bug:** WC parlay card empty `double_chance` leg → graded PENDING (generator fix).
- **On-page per-product ROI** — ledger data exists; Results page component not yet wired.

## QA
- `tsc` clean · **1326/1326 tests** · build clean (214 routes).
- Mobile: **375 / 390 / 430 / 768 / 1024 / 1440 — zero horizontal overflow** on /mlb (June 24 board).
- Money files unchanged (bankroll/crown/record byte-consistent).

## Recommendations (next run)
1. Run the methodology projection pipeline for June 24 → unblocks Bank Builder / Moonshot / daily portfolio.
2. Run the WC odds-discovery + specials/parlay generators for the 6 June 24 fixtures.
3. Wire the shared `ProductResults` page over `product-ledger/*` (on-page ROI).
4. Fix the WC-parlay empty-leg generator bug.
5. Advance the canonical Bank Builder ladder for June 23 via the official seed-model settle pipeline.

## Verdict
The **MLB product is production-ready and live for June 24** with honest, real-data picks and verified
settlement/tracking. The projection-driven products are gated on a pipeline run (correctly refusing to
fabricate), and that's the single workstream between here and a full multi-product June 24 launch.
