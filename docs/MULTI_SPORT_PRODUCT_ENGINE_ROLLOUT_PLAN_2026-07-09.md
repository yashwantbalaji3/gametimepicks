# Multi-Sport Product Engine — Rollout Plan (2026-07-09)

**The gated path from a read-only multi-sport candidate pool to (eventually) a paper-only official
multi-sport product — one founder-approved step at a time. We are at the end of Phase 1 / start of
Phase 2.**

---

## Phases

**Phase 1 — Read-only candidate pool.** ✅ Done. `data/internal/multi-sport/candidate-pool/<date>.json`
gathers artifact-backed MLB + Soccer legs, each tagged `productEligible` by settlement support. No
exposure, no card.

**Phase 2 — Separate settlement ledger.** ◑ In progress (this mission). Pure MLB settlement rules
(`src/lib/mlb/product-settlement/mlb-markets.ts`, tested + cross-checked vs the pipeline on 18k real
props) + a SEPARATE preview ledger (`data/internal/mlb/product-settlement/<date>.json`,
`officialMoneyRecordAffected:false`). MLB legs may now be `productEligible` in the read-only pool.
Remaining before Phase 3: wire a free statsapi linescore source so group-A (team-market) legs grade
live, and accumulate several final-date settlement validations.

**Phase 3 — Founder-review cards.** Surface multi-sport watchlist candidates for founder review only —
clearly labelled "Founder review / Watchlist only / No exposure / Not placed". No activation.

**Phase 4 — Paper-only official product activation.** Only after Phase 3 review + repeated settlement
validation, and only behind the existing approval + money guards (md5 guard, card locks, all-or-nothing
settlement), may a real multi-sport paper card be activated. Founder-approved, one product at a time.

**Phase 5 — Automated daily generation.** After sustained manual validation, daily generation of the
candidate pool + preview (still no auto-activation of money cards) via the existing refresh scripts.

## Explicit warnings

- **Do not merge any MLB settlement into the official 19-14 record** until the founder explicitly
  approves — the product-settlement ledger is a separate preview.
- **Do not activate MLB money products** until the settlement rules pass several real final-date
  validations (not just unit tests).
- **Do not use shadow calibration publicly** until forward testing passes the go/no-go in
  `docs/SHADOW_CALIBRATION_BACKTEST_PLAN_2026-07-09.md`.
- **Settleable ≠ good pick.** A market can be settlement-supported yet historically net-negative
  (e.g. batter_total_bases 44.4%). Eligibility is about *gradeability*; pick quality is the separate
  calibration/reliability gate.

## Current gate status

| gate | state |
|---|---|
| official record | 19-14 unchanged |
| money md5 | affe6b21… unchanged |
| exposure | $0 |
| active cards | none |
| MLB settlement rules | shipped + tested (18k-prop cross-check, 0 mismatches) |
| MLB team-market live grading | data-pending (needs statsapi linescore source) |
| MLB `productEligible` | enabled in read-only pool only |
| Bank Builder / Moonshot | watchlist / no-play, never active |

## Owner decisions

1. Approve wiring a free **statsapi linescore** fetch (guarded, no Odds credits) so group-A team markets
   grade live?
2. Approve moving to **Phase 3** (founder-review cards) once N final-date settlement validations pass —
   define N (suggest 5).
