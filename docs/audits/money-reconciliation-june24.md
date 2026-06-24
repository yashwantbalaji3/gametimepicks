# Money Reconciliation Audit — June 24, 2026

_Highest-priority audit. Reverse-engineers the intended money model and reconciles every settlement._

## What the bankroll represents (decoded from the data)
**One paper bankroll**, starting **$100** (2026-06-09), that compounds via the **Bank Builder core only**.
- **Crown** = all-time high-water mark of that bankroll.
- **Record** = settled Bank Builder bets (W-L).
- **Moonshot, WC Specials, Homer Nukes** are explicitly `separateFromCore: true` (confirmed in
  `portfolio.json.moonshot`) — each has its **own** paper ledger and does **not** feed the canonical
  bankroll/record/crown.

It is **NOT** cash, net deposits, or all-products P/L — it is the Bank Builder ladder balance.

## Reconciliation (exact)
| Step | Event | Bankroll |
|---|---|---|
| Start (Jun 9) | seed | $100.00 |
| Ladder Run #1 (Jun 9-13, 5-0) | "Road to $10K" completed | **$10,376.17** ← crown / high-water |
| Dual-lanes Run #2 (Jun 15) | both lanes lost, $100/lane | −$200 → **$10,176.17** |
| **Current (pre-June 23)** | | **$10,176.17** ✔ = crown − $200 |

`settledProfit $10,076.17` = $10,176.17 − $100 start ✔. `drawdown $200` = crown − current ✔. Record
10-2 = 5 ladder wins + 5 dual-lane step wins (Jun 17-22) + 2 dual-lane losses (Jun 18, 19). ✔

Lane balances **compound**: `awaitingCards` "Lane A Step 3 cleared — $601.56 rolls to **$1464.71**",
"Lane B Step 1 cleared — $100 rolls to **$277.11**" ⇒ the June 23 lane stakes ($1,464.71 / $277.11) are
the real, accumulated balances at risk. Confirmed against `daily-portfolio.json`.

## Inconsistencies / double-counting / phantom exposure / orphans found
1. **Phantom / understated exposure** — `daily-portfolio.json.openExposure = $250`, but the real at-risk
   for June 23 was Bank Builder **$1,741.82** ($1,464.71 + $277.11) + Moonshot **$50** = **$1,791.82**.
   The $250 figure is a generator bug (it understated exposure ~7×).
2. **Stale artifact** — `bank-builder/dual-lanes-latest.json` is frozen at Run #2 (Jun 15, both lost);
   the `ledger.json` has dual-lane events through Jun 22 (Runs #3+) that never updated the dual-lanes file.
3. **Record source disagreement** — `bank-builder/public-summary-latest.json` record = **5-0** (ladder
   only); `portfolio.json` record = **10-2** (ladder + dual lanes). The ladder summary was never advanced
   past Run #1.
4. **No double-counting of Moonshot/Specials** into the core bankroll (correct — they're separate), but
   they had **no persisted product ledger** until PR #584 — their history was an orphan (WC Specials
   `world-cup-specials-history.json` had 0 entries before this run).
5. **June 17-22 dual-lane ledger events carry no `bankrollAfter`** — their net (−$0, wins advanced /
   2 losses already in the −$200) is inferable but not explicit; a future ledger should stamp running
   balance on every event.

## Intended clean model (going forward)
- Canonical bankroll = Bank Builder core (ladder + compounding dual lanes); crown = high-water; record =
  Bank Builder settled.
- Every other product (Moonshot / WC Specials / Homer Nukes) → its own `product-ledger/<id>.json` with
  independent bankroll/record (the new tracking system). The Mr. Dub "portfolio" view should show each
  product's own bankroll, not pool their exposure into one number.
- Exposure = Σ active lane balances at risk (not a hardcoded $250).

## June 23 application → SEE CORRECTION BELOW
_(An earlier draft of this section claimed +$2,463.20 was applied using the rolled balance as the stake.
That was wrong — the test suite enforces the $100-SEED model. See the CORRECTION at the bottom: canonical
bankroll UNCHANGED; dual-lane wins recorded as product-ledger history only.)_

## Manual-review items
- `daily-portfolio` openExposure $250 = $100-seed × 2 BB lanes + $25 × 2 Moonshot — this is CORRECT per the
  test suite (NOT a bug; the rolled $1,464.71 is display, not stake).
- Refresh / regenerate `dual-lanes-latest.json` and `public-summary` record to match `portfolio.json`.
- Apply June 23 to the canonical bankroll only via `settle_dual_bank_builder.py` (seed model).

---

## ⚑ CORRECTION (post-test-suite verification)
My initial "+$2,463.20 → $12,639.37" application was **WRONG** and the money-invariant test suite caught
it (22 failures). The tests are the canonical model and state explicitly:
- **"BB exposure is the $100 SEED, not the rolled balance"** — the $1,464.71 is the lane's rolled
  *display/target*, NOT the at-risk stake.
- **"BB $200 + Moonshot $50 = $250 … active bankroll + crown UNCHANGED"** — the $250 exposure is CORRECT
  (not a bug), and activation/settlement does **not** hand-mutate the active bankroll/crown.

**Corrected conclusion:** the canonical bankroll stays **$10,176.17** / crown **$10,376.17** / record
**10-2** for June 23. The dual-lane wins are recorded as **history in the product ledgers** (PR #584);
applying them to the canonical bankroll must go through the official **`settle_dual_bank_builder.py`**
(seed-model) pipeline, which I did NOT hand-run. Money files reverted to HEAD; 1326/1326 tests green.
This vindicates the prior "history/tracking only, no bankroll mutation" decision.
