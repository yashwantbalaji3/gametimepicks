# Bank Builder Settlement — 2026-06-09
_2026-06-10. Verified from official settled results (not a manual claim)._

## Result: ✅ WIN
| Field | Value |
|---|---|
| Slip ID | `slip_2026-06-09_conservative_9df8ab96b46c` |
| Risk profile | conservative · 2 legs |
| Combined odds | +112 (decimal 2.118) |
| Leg 1 | **Shohei Ohtani** Over 0.5 batter_hits → finalStat 1 → **win** |
| Leg 2 | **Corey Seager** Under 1.5 batter_hits → finalStat 1 → **win** |
| Settlement source | `mlb_stats_api` (both legs) |
| Slip result | **WIN** (all legs resolved) |
| Stake (paper) | $100 (Step 1) |
| Payout (paper) | $211.85 |
| Profit (paper) | +$111.85 |
| Bankroll | $100 → **$211.85** |
| Progression step | 1 → **2** |

## Audit flags (all true)
officialResultConfirmed ✅ · noManualOverride ✅ · noTargetGameLeakage ✅ (legs dated
2026-06-09) · allLegsResolved ✅.

## Verification method
The canonical Builder Pick was re-selected from the June 9 **pre-game snapshot** with the
site's own `selectPlus100BuilderSlip`, then graded from `parlays/graded/2026-06-09.json`
by `slipId`. No manual win marking; the underlying leg results drive the grade.

## Ledger context (real settled history)
Across 16 settled dates, 10 had a qualifying Builder Pick (record **3-7**). June 9 began a
new run after a prior-day reset: $100 → $211.85, Step 2, current streak W1.
