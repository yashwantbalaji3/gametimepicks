# Mr. Dub — protected money ledger (canonical)

The canonical description of how official Mr. Dub money is owned, moved, reconciled and displayed.
Versioned with the code; `npm run money:audit` (in `app/`) proves every statement below against the
committed data. Established Session 8 (2026-10-02). Accounting rules are **unchanged** by that session.

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

## 2. Accounting semantics (as found — not changed)

**Era PROTECTED_BASE (2026-06-09 → 07-07):** the ledger rows as booked. The two June ladders banked their
final value into the bankroll (ladder 2 completed on 06-24 → **$20,465.40, the crown**). July lost steps cost
their $100 seed. Closes at $19,065.40 (`PROTECTED_BASE`).

**Era RULE_S (2026-07-08 →, founder 2026-09-10):**

| Ticket result | Bankroll movement |
|---|---|
| LOSS | − seed (Bank Builder $100, Moonshot $25) |
| WIN, non-final rung | 0 — the payout rolls into the next rung's stake |
| PUSH / VOID | 0 — seed returned |
| WIN on the **final rung** (a completed run) | **undefined — founder gate (§5).** The fold halts. |

Each movement records both views, never conflated:
- `stake / return / economicPnl` — the lane ticket (stake = the rolled lane balance at risk);
- `bankrollDelta` — the protected bankroll under Rule S.

Example: Bank Builder A step 4 on 2026-09-30 lost a $1,435.47 stake. Its ticket P/L is −$1,435.47 and its
bankroll movement is −$100.

**Exposure:** an awaiting or candidate row is not exposure, a shadow card is not exposure, and a no-card day
is not exposure. A placed (`status: active`) card that has not settled is open exposure. Pending never
creates a realized loss: the fold halts on an open day.

**Peak:** derived. The peak is the maximum of $100 and every `bankrollAfter` across the movement chain, and
it must equal both the stored `crownBankroll` and `highWaterMark`.

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
7. The recomputed peak ≠ the stored crown or the high-water mark.
8. An unknown product (e.g. a shadow product) appears in a receipt, or a completed run appears inside a
   folded day.

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

## 5. Founder gate — completion banking (open)

Under Rule S as written, **the bankroll can only stay flat or fall**:
- losses cost seeds;
- wins roll;
- a completed run has no rule.

So the protected bankroll cannot return above the $20,465.40 peak under the current semantics, however the
models perform. The only upward movement in the record's history was the June completion banking.

Until Session 8, the nightly fold would have counted a completed run (BB step 5 or Moonshot step 3 won) as a
$0 roll, which silently forfeits it. The live settler flags the same event "operator-gated". The fold now
**halts** with `LADDER_COMPLETION_OPERATOR_GATED` instead, and nothing after that day folds until a rule
exists.

This is live-relevant now. Bank Builder B is two wins from completing and Moonshot B is two wins from
completing.

The options (the founder decides; nothing is implemented):
- **C1 — bank `finalValue − seed`:** the run's economic profit. Symmetric with "a loss costs the seed".
- **C2 — bank `finalValue`:** the June 24 precedent. Overstates by the seed, because the seed is never
  deducted at the start.
- **C3 — bank nothing:** the run is forfeited. This makes the bankroll monotone non-increasing for good.

**Recommendation: C1.** It is the only option under which ticket P/L summed over a run equals the run's
bankroll movement, in both directions.
