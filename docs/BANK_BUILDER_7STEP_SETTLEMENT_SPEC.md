# Bank Builder — 7-Step Settlement Spec (LADDER_V2)

*Plan 0007 Phase 1 deliverable: the single source of truth the future 7-step settlement engine implements.
The numbers below are copied from `bankBuilderV2StepPolicy` in `app/src/lib/methodology/ladder-policy.ts` and
reconciled against the canonical bankroll math.*

> **STATUS — PREVIEW ONLY, NOT SETTLEMENT-IMPLEMENTED TODAY.** The live product settles the **5-step** ladder
> (`BANK_BUILDER_LADDER`, `BANK_BUILDER_STEP_COUNT = 5`, $100 → $10,000). This 7-step "profit-locking" ladder
> has **no settlement / accounting / generation / ledger support** yet. It is display/preview only until Plan
> 0007 flips the version constant. This doc is the spec that migration implements — not a description of live
> behavior. See [vp/plans/0007-seven-step-bank-builder-migration.md](../vp/plans/0007-seven-step-bank-builder-migration.md).

## The live control

The single control point is the constant **`BANK_BUILDER_LADDER_VERSION`** in
`app/src/lib/bank-builder/ladder-version.ts`, currently **`"v1"`**. While `"v1"`:
- the live settlement + accounting + generation path runs the implemented **5-step** ladder;
- the 7-step policy is preview-only and moves no money;
- every surface reads its step count from `bankBuilderLiveStepCount()` (→ 5), so the truth is single-sourced.

Flipping it to **`"v2"`** is the **final, owner-gated** step of Plan 0007 — only after the settlement engine
grades 7-step cards, accounting handles the dynamic stake + lock/roll events, generation shapes per-step
cards, and a shadow ledger reconciles a full lane cycle to the penny (Plan 0007 Phases 2–6). Do not flip it
before then.

## (a) The reconciled 7-step dollar schedule

From `bankBuilderV2StepPolicy` (the operator's dollar-schedule ladder, reconciled). All figures at the
canonical starting roll of **$100**; a "safe under target" win scales `target`/`lock` proportionally so the
math still reconciles exactly.

| Step | Roll (stake in) | Target payout | Target × | Lock (→ profit) | Roll-forward (target − lock) | Cumulative locked | Min-acceptable payout | Max legs | Per-leg odds band | Risk band |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | $100 | $200 | 2.00× | $0 | $200 | $0 | $160.00 | 3 | −600…+300 | standard |
| 2 | $200 | $500 | 2.50× | $100 | $400 | $100 | $380.00 | 3 | −600…+300 | standard |
| 3 | $400 | $1,000 | 2.50× | $200 | $800 | $300 | $760.00 | 2 | −600…+150 | protected |
| 4 | $800 | $1,800 | 2.25× | $300 | $1,500 | $600 | $1,400.00 | 2 | −600…+150 | protected |
| 5 | $1,500 | $3,300 | 2.20× | $500 | $2,800 | $1,100 | $2,580.00 | 2 | −600…+150 | protected |
| 6 | $2,800 | $5,600 | 2.00× | $1,000 | $4,600 | $2,100 | $4,480.00 | 2 | −600…+150 | safety-first |
| 7 | $4,600 | $8,280 | 1.80× | $0¹ | $8,280 | $2,100¹ | $6,808.00 | 2 | −600…+150 | safety-first |

¹ Step 7 `lock = 0` is a marker: **completing the ladder realizes EVERYTHING** — the full $8,280 payout plus
the $2,100 already locked. It is not a "no lock" step; it is the terminal cash-out.

**Reconciliation (verified):**
- Roll-forward equals `target − lock` at every step.
- Target multiple is strictly non-increasing from Step 3 (2.50 ≥ 2.25 ≥ 2.20 ≥ 2.00 ≥ 1.80) — later steps trade
  payout for survival by design.
- `cumulativeLocked` is a running Σ of locks: 0, 100, 300, 600, 1,100, 2,100, 2,100.
- **Completed-ladder realized total = Σ locks ($2,100) + final payout ($8,280) = $10,380.**
- **Seed recovery:** the $100 seed is recovered by the Step-2 lock ($100); the ladder **freerolls from Step 3
  onward** (all subsequent risk is house money against banked profit).
- `minAcceptablePayout = roll × (1 + (targetMultiple − 1) × 0.6)` — the "safe under target" floor (≥ 60% of the
  intended edge).
- Market/leg tightening: 3 legs + all team markets (incl. BTTS) at Steps 1–2; 2 legs + narrower markets from
  Step 3; Step 6–7 drop to the most reliable markets (double_chance / draw_no_bet / moneyline_90 → dc/dnb).

## (b) Win-with-lock money mechanics (Step ≥ 3)

On a **win** at a non-final step from Step 3:
- **Bank** the step's `lock` to banked profit (a **new money-movement event** the v1 engine does not have).
- **Roll** `payout − lock` into the next step as its stake.
- Steps 1–2 `lock = 0` → the full payout rolls (identical shape to v1's all-in behavior for those steps).

Increment on a Step-N win at exactly the target: banked profit += `lock_N`; next stake := `target_N − lock_N`
(= the next step's canonical roll). For a "safe under target" win, `lock` and `roll-forward` scale
proportionally to the achieved payout.

## (c) "Safe under target" advance

A card may settle **below the exact rung target** and still advance, provided the payout is at least
`minAcceptablePayout` (≥ 60% of the intended edge). A win in `[minAcceptablePayout, target)` is an
**advance-with-lock**, not a hold — the engine computes the scaled `lock` and `roll-forward` from the achieved
payout. This exists so the product never adds a weak leg just to force the exact rung.

## (d) Loss mechanics

A **loss** at any step: drop the **$100 seed** (bankroll − $100), identical to v1. **All profit locked at
earlier steps stays banked** — that is the entire point of "profit-locking." A Step-5 loss does **not** claw
back the $1,100 already locked at Steps 2–4; only the currently-rolling position (house money) is surrendered,
and the canonical realized loss is the original $100 seed.

## (e) Void / push / pending

**Hold** — unchanged from v1. A void/push/pending leg does not advance, lock, or drop the seed; the step is
held until it settles official-final. Pending is never a loss.

## (f) Reconciliation invariants (the money gates must enforce)

Post-migration, `verify-money-integrity` and `forensic-money-audit` must enforce:
1. **Every lock is traceable** to a specific settled winning step (no orphan profit).
2. **Roll-forward identity:** for every settled winning step, `rollForward == target − lock` (scaled for
   safe-under-target wins).
3. **Cumulative-locked monotonicity:** `cumulativeLocked` is a non-decreasing running Σ; it never decreases on
   a later-step loss (earlier locks are retained).
4. **Bankroll identity:** `bankroll == base ± seeds ± locks ± completions` — money moves only on seed-drop
   (loss), lock (Step ≥ 3 win), and completion (Step 7 terminal realization).
5. **Completion total:** a full 7-step run realizes exactly Σ locks + final payout = **$10,380** at the $100
   seed (scaled for any safe-under-target path).
6. **Dual-lane:** Lane A and Lane B are two independent attempts at the *same* 7-step ladder — **no risk
   modes**. Their locks aggregate additively into banked profit; each lane completes/stops independently.

## (g) The version flag is the live control

Restating (a) for the gate: the flip is `BANK_BUILDER_LADDER_VERSION` (`ladder-version.ts`) `"v1"` → `"v2"`,
owner-gated, done only when both lanes are at a safe cutover boundary (stopped/complete — no in-flight v1 roll
to reinterpret). No historical v1 bankroll is retro-graded; the canonical ledger appends, never rewrites.
Rollback = flip back to `"v1"` for all future cards (already-settled v2 cards remain in history).

## Related docs

- [vp/plans/0007-seven-step-bank-builder-migration.md](../vp/plans/0007-seven-step-bank-builder-migration.md) — the
  full gated migration plan (this doc is its Phase 1).
- [METHODOLOGY_V2_LADDER.md](METHODOLOGY_V2_LADDER.md) — the methodology/display background for the v2 ladder.
- [UI_UX_OPERATING_SYSTEM.md](UI_UX_OPERATING_SYSTEM.md) — the non-negotiable that the 5-step-live vs
  7-step-preview distinction stays unmistakable in the UI.
