# Overnight Run — Executive Summary (June 24, 2026)

## What was settled
June 23 World Cup — all products graded from **official API-Football** results (Portugal 5-0 Uzbekistan ·
England 0-0 Ghana · Panama 0-1 Croatia · Colombia 1-0 DR Congo). Bank Builder lanes **2-0** (Lane A +,
Lane B +); Moonshot **0-2**; WC Specials **0-5**. Recorded to product ledgers + settlement history.

## Bankroll changes
**None — by design, and that's the headline integrity result.** My first attempt applied +$2,463.20
(using the rolled lane balance as the stake). The money-invariant **test suite rejected it** — Bank
Builder exposure is the **$100 seed**, not the rolled balance — so I reverted. Canonical bankroll stays
**$10,176.17** / crown **$10,376.17** / record **10-2**; 1326/1326 tests green. Applying June 23 to the
canonical bankroll must go through `settle_dual_bank_builder.py` (seed model), flagged for the operator.

## Product performance
Registry + performance engine + product ledgers operational (`docs/reports/product-performance-june24.md`).
Bank Builder lifetime 12-2 / +$10,076 / crown $10,376.17 (canonical). Moonshot/WC Specials now have
persisted ledgers (were orphan history before).

## New picks generated
**MLB June 24 — fully regenerated from live Odds API** (12 games, 771 props ingested, free statsapi
enrichment 100% matched): Homer Nukes (5 legs, +49828, $9,985 return), 243-row props board, Featured /
Pitcher props / Game Explorer all derive. Flagship date now auto-resolves to the freshest board (June 24),
so June 23 rolls to results — no stale outputs.
**World Cup June 24** — 6 matches exist; specials/parlays generation requires the projection+odds pipeline
(operator-gated, API-Football credits) — documented, not fabricated.

## Bugs fixed
- **Stale-slate bug**: MLB flagship was pinned to the WC-biased `currentSlateDate` (June 23) and ignored
  newly-ingested MLB boards → added `latestMlbBoardDate()` (latest board ≤ today). June 24 now surfaces.
- Money-model misapplication caught + reverted (integrity guardrail held).

## Architecture improvements
Unified soccer settlement engine + read-only official fetcher + product registry/performance + guarded
persist script (all from this + PR #584). Money model fully decoded + documented.

## Outstanding risks
1. **WC June 24** specials/parlays not generated (pipeline run needed).
2. **On-page per-product ROI** (Moonshot/WC Specials/Homer Nukes) — data exists, Results page not wired.
3. **Canonical bankroll June 23 apply** deferred to the official seed-model pipeline (correctly).
4. Daily-portfolio display uses rolled balances ($1,464.71) — clarify vs the $100-seed at-risk in the UI.

## Recommended next sprint
Build the shared `ProductResults` page (Today/History/Stats/ROI) over `product-ledger/*`; run the official
`settle_dual_bank_builder.py` for June 23 to advance the canonical ladder; generate the WC June 24 slate;
backfill pre-June-23 product history.
