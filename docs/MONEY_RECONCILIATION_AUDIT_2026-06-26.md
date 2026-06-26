# Money Reconciliation Audit — $100 → today (2026-06-26)

**Question answered:** *"If the platform started with exactly $100, can a user trace EVERY dollar from $100 to today's bankroll?"*

**Answer: Yes.** Every dollar is traceable from canonical sources, the chain is continuous (each day's opening equals the prior day's closing), and the sum of daily P/L equals the canonical settled profit to the cent. No assumptions — every row below is read straight from `app/public/data/mr-dub/daily-summary.json`, which derives from the canonical ledger (`ledger.json`) and `portfolio.json`.

## Reconciliation table (every settled day)

| Date | Opening | Δ P/L | Closing | Reason |
|---|---|---|---|---|
| 2026-06-09 | $100.00 | +$111.85 | $211.85 | Crown ladder Step 1 — realized rung |
| 2026-06-10 | $211.85 | +$516.91 | $728.76 | Crown ladder Step 2 — realized rung |
| 2026-06-11 | $728.76 | +$694.88 | $1,423.64 | Crown ladder Step 3 — realized rung |
| 2026-06-12 | $1,423.64 | +$2,200.33 | $3,623.97 | Crown ladder Step 4 — realized rung |
| 2026-06-13 | $3,623.97 | +$6,752.20 | $10,376.17 | Crown ladder Step 5 — **Ladder 1 completed & banked** ($100 → $10,376.17) |
| 2026-06-18 | $10,376.17 | +$197.88 | $10,574.05 | Ladder 2 (Lane A) Step 1 won — rolled |
| 2026-06-19 | $10,574.05 | +$403.68 | $10,977.73 | Ladder 2 (Lane A) Step 2 won — rolled |
| 2026-06-21 | $10,977.73 | +$863.15 | $11,840.88 | Ladder 2 (Lane A) Step 3 won — rolled |
| 2026-06-23 | $11,840.88 | +$2,037.86 | $13,878.74 | Ladder 2 (Lane A) Step 4 won — rolled |
| 2026-06-24 | $13,878.74 | +$6,586.66 | **$20,465.40** | Ladder 2 (Lane A) Step 5 — **Ladder 2 completed & banked**; cumulative crown peak = **high-water mark** |
| 2026-06-25 | $20,465.40 | −$400.00 | **$20,065.40** | Dual-lane drawdown realized: Lane B stop −$100 + three prior stopped-lane seeds −$300 |

## Proofs (machine-checked, not asserted)

- **Chain continuous:** every `opening` equals the prior day's `closing`. First opening = **$100.00**; last closing = **$20,065.40**. ✓
- **Σ daily P/L = settled profit:** `Σ(day.pl)` = **$19,965.40** = `portfolio.settledProfit` = `currentBankroll − $100`. ✓ (no double-counting)
- **Canonical totals (from `portfolio.json`):**
  - Current bankroll: **$20,065.40**
  - Crown bankroll (Σ two banked $100→$10K ladder finals): **$20,465.40** = $10,376.17 + $10,089.23
  - High-water mark: **$20,465.40** (= crown; the June-24 closing peak)
  - Drawdown: **$400.00** (1.95% of HWM) = HWM − bankroll = sum of stopped-lane seeds
  - Realized profit: **$19,965.40** · ROI **199.65×**
  - Record: **14–4**
- **Money-integrity gate:** `scripts/verify-money-integrity.mjs` → *"✓ all invariants hold (0 warnings)"* — guards against phantom crown, bankroll > crown, drawdown drift, and chain breaks.

## Money model (how the numbers relate)

```
crown      = Σ official completed-ladder finals           (immutable, append-only)
bankroll   = crown − realized dual-lane losses            (= crown − drawdown)
settledPL  = bankroll − $100  =  Σ daily P/L              (single realized-profit figure)
ROI        = settledPL / $100
HWM        = crown                                         (the peak; bankroll ≤ crown always)
drawdown   = HWM − bankroll                                (currently the $400 stopped-lane seeds)
```

## What changed in this audit (PRIORITY 3 — complete journey)

Before this pass, Ladder 2's climb (June 18 → 24) was collapsed into a single lump event on June-24, so the calendar showed only 9 days and skipped the day-by-day progression. The underlying data (`scripts/build-mr-dub-ledger.mjs`) now emits **one `ladder_step_won` event per step** — money-preservingly (the steps sum to the same banked $10,089.23). The calendar now shows the **complete 11-day journey** across both ladders. Canonical totals are unchanged; the gate still passes.

> Paper-portfolio tracking only. No wagers are placed. Not financial advice.
