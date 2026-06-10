# Bank Builder Paper-Bankroll Policy
_2026-06-10. Follows the existing ladder design (`bank-builder-ladder.ts` §3.2)._

**Paper only — educational tracking, not betting advice, not a guarantee, no real money.**

## Ladder
- Starting paper bankroll: **$100** (base).
- Crown / goal: **$3,000** over 5 rungs (each ~2× except the final 1.875×).
- One Builder Pick per eligible slate — the pending official Suggested slip nearest +100
  combined odds (2-leg preferred). Gates are NOT loosened to force a pick.

## Settlement-driven progression (let it ride; reset on loss)
- **Win:** bankroll × combined decimal odds; advance rung. Streak W+1.
- **Loss:** reset to **$100** base, Step 1 (reset always shown, never hidden). Streak L+1.
- **Push/void:** stake returned, bankroll + step unchanged.
- **No qualifying pick:** no stake, bankroll unchanged, no ledger entry.
- Never chase losses; never fabricate a pick.

## Honesty rules
- A pick is graded only from official leg results (`settlementSource`), never a manual claim.
- Settled-only ledger; no target-game leakage (legs must be dated on the slate date).
- Idempotent settlement: re-running the same date yields byte-identical artifacts.
- Lifetime record (W-L-P) is shown alongside current-run P/L — never hidden.

## Summary fields (`summary-latest.json`)
startingBankrollUnits, currentBankrollUnits, currentRunProfitUnits, currentRunRoiPct,
record{wins,losses,pushes}, settledPickCount, currentProgressionStep, currentStreak,
lastSettledDate, lastSettledResult, nextEligibleDate, nextPickStatus, nextPick.
