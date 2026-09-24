# v1.8 — Bank Builder / Moonshot forensic diagnostic

**Date:** 2026-09-23 · **Branch:** `v18-bb-ms-forensics` · **Base:** `4dbd40a3b`
**Observational only. No selector, threshold, shadow definition, sample boundary or adoption gate changed.**

## 1. Sample boundaries

Everything below is the **RECEIPT ERA only**: `mr-dub/settled/<date>.json`, **38 dated receipts,
2026-08-15 → 2026-09-21**. That is the population the current methodology owns.

**Not included, and not combined:** the June `LEDGER_ONLY` completed ladders, the `PROTECTED_BASE`
(19–14), the `UNRECEIPTED_GAP` (07-08 → 08-14), the June Moonshot product ledger, and the preregistered
shadow challengers. Mixing any of them in would inflate n by destroying the thing n is supposed to measure.

**Pending is excluded from losses.** 77 of the 152 lane entries carry **zero legs** and
`result: "pending"` — they are no-play / awaiting-card placeholders, not cards. Counting them as anything
would be inventing outcomes.

| | cards with legs | decided | legs |
|---|---|---|---|
| Bank Builder | 38 | **38** | 78 |
| Moonshot | 37 | **37** | 116 |

Both samples are small. Every figure below carries that.

## 2. The headline: these are two different problems

| | leg hit rate | mean legs | card rate | card rate predicted by independent legs |
|---|---|---|---|---|
| **Bank Builder** | **65.4%** (51–27) | 2.05 | 44.7% (17–21) | **41.8%** |
| **Moonshot** | **48.3%** (56–60) | 3.27 | 10.8% (4–33) | **9.2%** |

**Both card records are almost exactly what their leg hit-rate and leg count imply.** There is no
correlation penalty to find, no construction pathology, no selector misfiring at the card layer. Card
outcomes are fully explained by leg quality × leg count.

So the two products fail for opposite reasons:

- **Bank Builder's legs beat the market comfortably** — 65.4%, 95% CI [54.3%, 75.0%]. Its card rate is
  "low" only because two legs compound.
- **Moonshot's legs are a coin flip** — 48.3%, 95% CI [39.4%, 57.3%]. No construction rescues that, and
  every extra leg makes it strictly worse.

Treating these as one "our products are losing" problem would be the wrong diagnosis twice.

## 3. Bank Builder — the record and the money disagree, and the money is three cards

Card rate **44.7%** against a breakeven of **33.3%** at the median card price of 3.00. On rate, it clears
breakeven comfortably. It still lost **−$1,237.43 (−17.2% ROI)** on $7,202 staked.

The ladder explains the whole gap:

| step | n | W–L | avg stake | staked | returned | **P&L** |
|---|---|---|---|---|---|---|
| 1 | 27 | 14–13 | $100 | $2,700 | $3,618 | **+$918** |
| 2 | 8 | 3–5 | $269 | $2,155 | $2,347 | **+$192** |
| 3 | **3** | **0–3** | **$782** | $2,347 | **$0** | **−$2,347** |

**Steps 1 and 2 are both profitable. The entire receipt-era loss is three Step-3 cards.**

At a 44.7% card rate, losing three in a row is a ~17% event — unremarkable. But the ladder concentrates
roughly a third of all stake into a rung that has been played **three times**.

`0–3` has a 95% CI of **[0.0%, 56.2%]**. It is compatible with the product's own 44.7% rate and with almost
anything else. **There is no supportable conclusion in it, and anything tuned on it would be tuned on
noise.** The honest statement is that the ladder makes record and P&L diverge by design, and the top rung's
sample is far too small to be evidence about selection.

## 4. Moonshot — the one finding the data actually supports

| step | n | W–L | staked | returned | P&L |
|---|---|---|---|---|---|
| 1 | **33** | **2–31** | $825 | $200 | −$625 |
| 2 | 2 | 2–0 | $200 | $800 | +$600 |
| 3 | 2 | 0–2 | $800 | $0 | −$800 |

Step 1 is the only cell in either product with a usable sample:

> **2–31 = 6.1%, 95% CI [1.7%, 19.6%], against a breakeven of 24.9% at the median price of 4.01.
> The interval's upper bound lies below breakeven.**

That is a supported signal rather than variance — the only one in this report. Steps 2 and 3 have n=2 and
say nothing.

### Its worst market is its most-used one

| Bank Builder | | | Moonshot | | |
|---|---|---|---|---|---|
| Moneyline | 49% of legs | **65.8%** | Total Runs | **36% of legs** | **44.7%** |
| Run Line | 33% | **65.4%** | Run Line | 29% | 48.6% |
| everything else | 18% | — | Moneyline | 21% | 52.0% |

**Bank Builder draws 82% of its legs from its two strongest families. Moonshot draws its largest share
from its weakest.** Both products price from the market rather than the model (F1 Option A), so this is a
statement about construction supply, not about a model family's status.

`batter_total_bases` is **0–3 across both products**. n=3; recorded, not concluded.

## 5. Card failure decomposition

| | lost cards | lost by exactly ONE leg |
|---|---|---|
| Bank Builder | 21 | **15 (71%)** |
| Moonshot | 33 | 14 (42%) |

Bank Builder's signature is a card that was one leg away. Moonshot's losses are spread across the card —
consistent with §2: its legs are individually near-random, so failures are not concentrated in one slot.

## 6. The MLB-only constraint

**Every one of the 194 legs across both products is MLB.** Markets used: Moneyline, Run Line, Total Runs,
`batter_hits`, `batter_hits_runs_rbis`, `batter_total_bases`, `pitcher_strikeouts`.

What this evidence does **not** establish: that more sports would have improved the record. No alternate
history was constructed and no NFL/EPL/UFC leg was retroactively inserted — doing so would fabricate a
record that never existed.

What it does establish is an **optionality** question: Moonshot needs 3.27 legs per card from one sport's
daily slate, and the family it reaches for most often is its weakest. Whether that is a supply constraint
or a selection preference is exactly what a preregistered experiment would have to separate.

**Cross-sport readiness is a gate, not a lever.** Only `ProductEligible` markets may enter production
products. NFL, EPL and UFC do not become eligible because a card needs more legs, and NBA stays
`HISTORICAL_ONLY`. As of today the eligible-universe panel reads *"96 eligible legs across 1 sport."*

## 7. Limitations, stated plainly

- 38 decided cards per product. Card-level intervals are ±15 points wide.
- One sport, 38 consecutive days, one season phase.
- Step-3 (BB) and Steps 2–3 (MS) have n ≤ 3.
- Leg-level prices are not in the receipts, so implied-probability bands per leg cannot be computed; only
  whole-card decimal is available.
- Favourite/underdog mix cannot be derived without leg prices.
- Day-of-week is not reported: 38 days is ~5 per weekday.

## 8. Ranked preregistered experiments — proposals only, none adopted

| # | question | why the evidence points here | design note |
|---|---|---|---|
| 1 | **Does Moonshot's step-1 card rate stay below breakeven?** | the only supported signal (§4) | forward-only, preregistered n and stopping rule; do **not** re-read the existing 33 |
| 2 | **Does Moonshot improve if Total Runs is excluded?** | its largest share is its weakest family (§4) | must be forward; excluding retrospectively is cherry-picking |
| 3 | **Does a shorter Bank Builder ladder change P&L, holding selection fixed?** | record clears breakeven while money does not, purely by stake geometry (§3) | a simulation over the *existing* receipts is legitimate — it changes no selection and invents no card |
| 4 | **Does a leg-count cap help Moonshot?** | 48.3% legs make every added leg strictly worse (§2) | pairs with #2 |
| 5 | **Is a candidate-quality floor achievable from one sport's slate?** | Moonshot needs 3.27 legs/card from a 96-leg single-sport universe (§6) | measure available-vs-used first; no product change |

Not proposed: anything that re-reads the three BB Step-3 cards, restarts a sample, or picks a winner
retrospectively.

## 9. Founder gates

Cross-sport supply for production products requires `ProductEligible` changes — a founder gate, and one
that must be earned by model evidence rather than by product appetite. No selector, threshold, era
boundary or shadow definition was touched by this analysis.
