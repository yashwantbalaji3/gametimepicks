# Bank Builder Ladder Continuation — Implementation Plan

_The single highest-value remaining item. Grounded in the actual code; money-safe by design._

## What already exists (verified, tested)
- **Continuation/placement:** `lib/daily-portfolio/bank-builder-generation.ts` — `readLaneRungs(root)`
  (Lane A: nextStep 4, cleared 3, rolledStake $1,464.71, target $3,500; Lane B: nextStep 2, cleared 1,
  rolled $277.11, target $700) + `selectSafestTargetFitCard(pool, lane, used)` (safest 2-leg card hitting
  the rung target, max 1/game). `lib/daily-portfolio/accounting.ts` `buildPersistedDailyPortfolio` places
  them with **$100-seed exposure, active bankroll unchanged at activation**. All green
  (`bank-builder-next-steps.test.mjs`).
- So "place the next card" is DONE. The gap is settling the placed card to advance the ladder.

## The blocker (precise)
`scripts/settle-daily-portfolio.mjs --apply` is an **unimplemented stub** — it prints a REFUSED message and
never settles (its gate also wrongly treats June 23 games as pre-event). The OLD `pipeline/daily/
settle_dual_bank_builder.py` settles a DIFFERENT artifact (`bank-builder/dual-lanes-latest.json`, the stale
June 15 run) — not the launch-active run that holds the June 23 cards. So there is **no path that settles
the active ladder's placed cards**, so it can't advance to Step 5 / Step 3, so June 24 can't place.

## Seed-model settlement semantics (derived from the canonical history — the key spec)
- A **won step ADVANCES the lane** (its compounded balance rides to the next step): **bankroll UNCHANGED**,
  record **+1 win**. (Confirmed: Lane A Steps 1-3 won, bankroll never grew; crown $10,376.17 was the Run #1
  peak, current $10,176.17 = crown − Run#2's two **$100-seed** losses.)
- A **lost step STOPS the lane**: bankroll **−$100 (the seed)**, record **+1 loss**.
- A lane that **completes its target ($10k)** banks the gain to the bankroll (this is how Run #1 made $10k).
- ⇒ My earlier "+$2,463.20 on a won step" was WRONG (it used the rolled balance as the stake). The test
  suite correctly rejected it. **A won step does not bank — it advances.**

## June 23 outcome (already graded from official results, PR #584)
Lane A Step 4 **WON**, Lane B Step 2 **WON** → so settlement must:
- Advance Lane A → Step 5 awaiting (balance $3,502.57 rides), Lane B → Step 3 awaiting ($702.45 rides).
- **Bankroll/crown UNCHANGED** ($10,176.17 / $10,376.17). Record **10-2 → 12-2** (two step wins).

## Implementation (focused, money-safe)
1. **Implement `settle-daily-portfolio.mjs --apply`** (replace the stub):
   - Load the active run + the official-scores bundle (or grade via `lib/settlement/soccer-markets.ts`,
     already built + tested).
   - For each active lane card: grade it. WON → mark the step settled-won, open the next step
     (`coming_soon`→awaiting) with the rolled stake; LOST → stop the lane, debit $100 seed from bankroll;
     VOID → leg drops, regrade.
   - Update record (+1 per decisive step). Touch bankroll ONLY on stop (−$100) or target completion.
     Never touch crown except a new high-water on completion.
   - Refuse if any leg's game is not officially final (keep the honest gate, but read the REAL final state,
     not a hardcoded pre-event assumption).
2. **Run it for June 23** → record 12-2, bankroll unchanged, Lane A→Step 5, Lane B→Step 3.
3. **Continuation auto-places June 24** — `buildPersistedDailyPortfolio` will select Step 5 / Step 3 cards
   from the June 24 model pool (board now shipped, PR #588) at the rolled stakes, $100-seed exposure.

## Required test coverage (update + add)
- Update `bank-builder-next-steps.test.mjs`: post-settlement rungs (Lane A nextStep 5 / cleared 4 / rolled
  $3,502.57; Lane B nextStep 3 / cleared 2 / rolled $702.45).
- Update `portfolio.json` record assertions 10-2 → 12-2 across the suite (several tests assert 10-2).
- New tests for `settle-daily-portfolio --apply`: won→advance (bankroll unchanged, record +1); lost→stop
  (−$100 seed); void→drop; not-final→refuse; lane-completes-target→bank + crown high-water.

## Why this was NOT hand-run now (safety)
Implementing the settle-apply + advancing the canonical record + the active ladder + reconciling the three
overlapping dual-BB artifacts (launch-active vs daily-portfolio vs dual-lanes) is a careful, money-adjacent
change. Per the non-negotiables ("never mutate bankroll incorrectly", "preserve active ladder state",
"never bypass tests"), it deserves a focused implementation pass with the test updates above — not a
multi-artifact mutation slipped into a long session. The bankroll math is now known (won = unchanged), so
the implementation is low-$-risk; the artifact transitions + test updates are the work.
