# NBA / EPL / UFC Readiness Update

**Program:** 076–079 · **Date:** 2026-07-31 · Continuity verified this session by running the real guards, not by re-reading old reports.

## NBA — code-complete for its gates; every remaining item is live-evidence

**Verified now:** the 45-test continuity run passes — the historical-boards scale test (all 61 committed boards resolve injectively through the tricode+slate-date identity join, board hashes unchanged) and the NBA guards (no promotion, no model fields on Market Center output, legacy parlay gate cannot reactivate).

| Gate | Code | Live evidence |
|---|---|---|
| G1 official results | ✅ settlement whitelist + box-score maps (3PM/STL/BLK/PRA synthesis) | founder ruling on ESPN-vs-official source share, scheduled W4 of the preseason plan |
| G2 identity | ✅ EventIdentity adapter, collision-refusing, no doubleheader tie-break | first live preseason slate must resolve injectively |
| G3 leakage | ✅ tipoffIso persisted; researchEligible derived, fails closed; backfill mechanically refused | first live board must carry native stamps |
| G4 settlement | ✅ lineage-gated by import from the MLB gate | first live settlement through the gate |
| G5 evaluation | ✅ path exists (dense Oct–Jun schedule) | corpus accrues only after launch |
| G6 product value | ✅ market-intelligence scope only | — |

**First preseason acceptance day:** the first day of NBA preseason with a posted odds slate (~mid-Oct 2026): run the dress-rehearsal command (`pipeline/nba/rehearsal.py`, correctly NO_GO against historical data today), require capturedAt < tipoffIso on every row, injective identity, lineage-gated settlement of the finals, gap-0 accounting → go/no-go artifact for founder sign-off. Fail-closed behavior on incomplete coverage is the rehearsal's default: any unrunnable check reports UNAVAILABLE and the verdict is NO_GO.

**Not done here:** the pre-existing `balldontlie` rate-limiter test flakiness (2 deterministic + 2 load-dependent failures, proven pre-existing at pristine HEAD two programs ago). It needs its own evidence-backed commit — likely injecting a clock instead of real sleeps — and touching a provider test file at 1 AM inside an operations program is how flakiness gets "fixed" into decorativeness. FUTURE WORK with the reproduction commands already recorded.

## EPL — odds-side alive, settlement honestly switched off

Identity and lifecycle guards re-run green (same-club-pair at two kickoffs distinct; POSTPONED/ABANDONED void; unknown status refuses to grade). `RESULTS_SOURCE_PENDING` stands: **no results vendor has been approved** — that decision (`EPL_RESULTS_SOURCE_DECISION.md`) is the founder boundary, and no final score can exist in an EPL artifact until it is made. The preview remains pruned from the public export (re-verified in the cleanup regression checks). Season starts mid-August; the odds-side capture path is ready the day a vendor is approved.

## UFC — archive stable, settlement repair intact

`pipeline/ufc/` 98/98 including the opposite-winner rematch mutation and fail-closed missing-boutId paths. The public surface is the dated settled archive shipped in the cleanup ("Archived · card settled 2026-06-15"; no live framing — re-verified on production). SCAFFOLD_ONLY stands; no simulation claims were added.
