# Mr. Dub — protected money ledger (canonical)

The canonical description of how official Mr. Dub money is owned, moved, reconciled and displayed.
Versioned with the code; `npm run money:audit` (in `app/`) proves every statement below against the
committed data. Established Session 8 (2026-10-02). Session 9 (2026-10-02) added the founder's completion
banking rule **C1** (§5); nothing else in the accounting changed, and no folded day was restated.

## 1. Owners

| Concept | Owner (file) | Producer | Notes |
|---|---|---|---|
| Protected record (bankroll, crown, record, fold) | `app/public/data/mr-dub/portfolio.json` | `scripts/mr-dub/fold-protected-era.mjs` (nightly-settle) | History keys hash-locked (`HISTORY_HASH`); crown immutable |
| Official lane receipts (what was placed + its result) | `app/public/data/mr-dub/settled/<date>.json` | nightly-settle receipt writer | Write-once; the fold's only input after 07-07 |
| Rule S fold | `app/src/lib/mr-dub/protected-fold.mjs` | — | Pure; `foldReceipts` / `applyFold` / `foldLedgerRows` |
| Invariant | `app/src/lib/mr-dub/protected-invariant.mjs` | — | History hash, crown, bankroll = base + fresh fold |
| Ledger events / day chain | `ledger.json`, `daily-summary.json` | fold (`protected_fold` rows) | July rows hash-protected; one `folded_day` row per settled day |
| **Per-card money movements** | `app/src/lib/mr-dub/money-movements.mjs` | — (projection, never persisted) | Session 8: attributes every move to its card |
| Open exposure (displayed) | `app/src/lib/mr-dub/open-exposure.ts` `computeOpenExposure` | — | Today's placed stakes across products |
| Public projection | `/mr-dub` (`MoneyMovementsPanel`, flagship dashboard) | build time | Renders nothing when reconciliation fails |

There is no second money ledger. The movements are derived from the owners above on every read, so they
cannot drift from them.

## 2. Accounting semantics

**Era PROTECTED_BASE (2026-06-09 → 07-07):** the ledger rows as booked. The two June ladders banked their
final value into the bankroll (ladder 2 completed on 06-24 → **$20,465.40, the crown**). July lost steps cost
their $100 seed. Closes at $19,065.40 (`PROTECTED_BASE`).

**Era RULE_S (2026-07-08 →, founder 2026-09-10):**

| Ticket result | Bankroll movement |
|---|---|
| LOSS | − seed (Bank Builder $100, Moonshot $25) |
| WIN, non-final rung | 0 — the payout rolls into the next rung's stake |
| PUSH / VOID | 0 — seed returned |
| WIN that **completes the ladder** (the final rung, or an earlier rung whose real payout clears the final goal) | **+ (final settled value − seed), once** — `COMPLETION_BANKING_C1`, from 2026-10-02 (§5) |

Each movement records both views, never conflated:
- `stake / return / economicPnl` — the lane ticket (stake = the rolled lane balance at risk);
- `bankrollDelta` — the protected bankroll under Rule S.

Example: Bank Builder A step 4 on 2026-09-30 lost a $1,435.47 stake. Its ticket P/L is −$1,435.47 and its
bankroll movement is −$100.

**Exposure:** an awaiting or candidate row is not exposure, a shadow card is not exposure, and a no-card day
is not exposure. A placed (`status: active`) card that has not settled is open exposure. Pending never
creates a realized loss: the fold halts on an open day.

**Peak:** derived. The peak is the maximum of $100, every July-era `bankrollAfter`, and every Rule S folded
day's close (the fold's granularity). It must equal the stored `highWaterMark`. The **crown**
(`crownBankroll`, $20,465.40) is the June era's peak: a hash-locked history key that never moves and must sit
at or below the peak. The two are equal until a C1 completion lifts the bankroll past June; from then on the
public "Historical peak" is the high-water mark, and drawdown = high-water mark − bankroll.

## 3. Reconciliation (`npm run money:audit`, also health-check §3b = the deploy gate)

It fails closed on any of the following, and repairs nothing:
1. $100 + Σ movements ≠ current bankroll.
2. A movement id is applied twice (duplicate settlement).
3. The July history does not close on the protected base.
4. A Rule S row moved the bankroll other than by the table above, or a win returned ≤ its stake. Also
   fails if the Σ card movements per folded day ≠ the record's folded day.
5. Stake carry is broken: each step-1 stake must equal the seed, and each later stake must equal the prior
   won step's return. This catches a stake or return edited after the fact.
6. The day chain fails: an opening ≠ the prior close, a closing ≠ opening + P/L, Σ movements per day ≠ the
   day P/L, or the last close ≠ the bankroll.
7. The recomputed peak ≠ the stored high-water mark, the crown ≠ the June crown, or the crown sits above the
   peak.
8. An unknown product (e.g. a shadow product) appears in a receipt, or a completion dated before C1 took
   effect appears inside a folded day.
9. (C1) A completed run's bankroll movement ≠ its card's settled return − the product seed, or its
   completion receipt (policy, seed, final value, banked) does not re-prove from the card.
10. The ledger's fold rows: more than one per date, or one whose `paperProfit` ≠ Σ its day's card movements.

Mutation probes (`money-movements.test.mjs`): each one lands on a copy of the real record and is caught.
- settled loss omitted
- win double-applied
- stake changed after freeze
- return changed after settlement
- pending counted as loss
- push counted as loss
- void moves bankroll
- shadow card moves bankroll
- duplicate settlement
- balanceBefore mismatch
- balanceAfter mismatch
- historical peak decreases
- historical row disappears
- bankroll edited
- completed ladder folded as a roll
- Session 9 · C1 (`completion-banking.test.mjs`, each lands on a correctly folded completion and is caught):
  C2 full-value banking, C3 forfeiture, seed double-counted, wrong seed, duplicate completion (card twice,
  ledger row twice), final value changed after banking, banked before settlement, June row rewritten, crown
  raised to the new peak, completion dropped (folded as a roll), high-water mark not recomputed

## 4. State at 2026-10-02 (folded through 2026-10-01)

| | |
|---|---|
| Current bankroll | **$15,240.40** |
| Historical peak (crown) | **$20,465.40**, 2026-06-24 (recomputed = stored) |
| Difference | **−$5,225.00** |
| Open exposure | $0.00 (MLB off day; no placed card open) |
| Movements | 127: 29 PROTECTED_BASE, 98 RULE_S (29 W / 69 L) |
| Record | Bank Builder 43–42; Moonshot 5–41 (own line) |
| Lanes | BB A step 1 ($100), BB B step 3 ($951.89 carried), MS A step 1 ($25), MS B step 2 ($100.17 carried) |

## 5. Completion banking — C1 (founder decision, Session 9, 2026-10-02)

**Rule.** A completed ladder banks its **final settled value − the lane's original seed**, once
(`COMPLETION_POLICY` in `lib/mr-dub/protected-fold.mjs`, id `COMPLETION_BANKING_C1`). The seed was never
deducted when the run started, so it is not profit; the payout above it is. This is symmetric with "a loss
costs the seed": ticket P/L summed over a run equals the run's bankroll movement in both directions.
Rejected: **C2** (bank the full final value, the June precedent — overstates by the seed) and **C3**
(forfeit the run — the bankroll could then never rise).

**What completes a run.** The lane machine's own rule (`products/ladder-position.mjs`), shared through
`completesLadder`: a won final rung (Bank Builder step 5, Moonshot step 3), or a won earlier rung whose real
payout already clears the final goal ($10,000 / $1,000). A push or void on the final rung is not a
completion: the stake comes back and the same rung is played again. A pending final rung halts the fold
(open day) — nothing is banked before settlement.

**Effective boundary — prospective only.** C1 covers completions in receipts dated **on or after
2026-10-02**, the first day the record had not folded when it was adopted (folded through 2026-10-01). No
receipt between 07-08 and 10-01 completes a ladder, so every folded day is byte-identical under C1 (a test
proves it). A completion dated before the boundary still halts the fold with
`LADDER_COMPLETION_OPERATOR_GATED` — it is never banked retroactively. June's banking (C2-style, the crown)
is history and stays as booked.

**Completion receipt.** The folded day carries `completions[]` (only on a day that completed a run, so no
other day's bytes change), mirrored on that day's `ledger.json` fold row:
`policy · effectiveFrom · product · lane · cycle · step · seed · finalValue · banked · source
(mr-dub/settled/<date>.json#lanes[i]) · settledAt`. `money:audit` re-derives `banked` from the card itself and
fails if the receipt disagrees.

**Once.** Each settled day folds exactly once (`foldLedgerRows` refuses to restate a folded day, including
its completions), the protected invariant replays a fresh fold every night, and a duplicate card or ledger
row is a reconciliation failure. A completed card with no real settled value halts
(`LADDER_COMPLETION_VALUE_MISSING`) instead of banking a guess.

**Lifecycle.** The lane restarts at Step 1 with its seed the next day (unchanged lane machine); the fold
continues through later days — a completed run no longer blocks the record.

**Peak.** See §2: the high-water mark recomputes from the folded path; the June crown never moves.
