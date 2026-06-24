# Bankroll After June 23 — CORRECTED

## Outcome: canonical bankroll UNCHANGED (correctly)
| Field | Before | After | Delta |
|---|---|---|---|
| currentBankroll | $10,176.17 | **$10,176.17** | $0 |
| crownBankroll | $10,376.17 | **$10,376.17** | $0 |
| record | 10-2 | **10-2** | 0 |

## Why (corrected reasoning)
My first pass applied +$2,463.20 using the lane's *rolled* balance ($1,464.71) as the stake. The
money-invariant **test suite rejected this** — it encodes that **Bank Builder exposure is the $100 seed
per lane, not the rolled balance**, and that activation/settlement does not hand-mutate the active
bankroll/crown. I reverted (git checkout) and re-verified **1326/1326 tests pass**.

The June 23 dual-lane wins (Lane A, Lane B) are recorded as **history** in the product ledgers
(`product-ledger/*`, PR #584). To move the **canonical** bankroll, the official seed-model pipeline
(`pipeline/daily/settle_dual_bank_builder.py`) must run — that is the correct, test-aligned path, and it is
flagged for the operator rather than hand-applied. **No money state was changed in this run.**

## Integrity note
The canonical bankroll model is whatever the test suite enforces. When a hand-computed mutation conflicts
with those tests, the tests win and the mutation is reverted. This is the guardrail that prevented a
$2,463 ledger corruption.
