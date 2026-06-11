# Bank Builder — NBA Finals Featured-Card Policy (2026-06-10)

## Decision
For NBA Finals Game 4 we surface a **Featured NBA Finals same-game card** on
`/bank-builder` **outside the tracked $100→$3,000 paper ladder**. We do **not**
replace the canonical Daily Builder Pick or alter any settled history.

## Why outside the ladder (not a swap)
The canonical ladder is **settled-only and never fabricated** (built by
`scripts/build-bank-builder-ledger.mjs`, surfaced via `data-bank-builder.ts`). Its
Daily Builder Pick is drawn from the official single-sport Suggested pool via
`selectPlus100BuilderSlip`. Swapping in an NBA same-game parlay would:
- change the tracked bankroll math on a correlation profile the ledger wasn't
  built to grade, and
- risk implying the June 9 settled win or the ladder progression changed.

Neither is acceptable. So the NBA Finals card is a **clearly-labeled featured
spotlight**, illustrative only, that does not touch bankroll history.

## How the featured card is chosen (honest, deterministic)
`selectFeaturedFinalsCard()` (in `lib/nba-finals-cards.ts`):
1. Source = the real optimizer NBA leg pool (model leans + real book odds) for a
   genuine **one-game** NBA slate. Returns null otherwise (page keeps only the
   canonical slip).
2. Candidate = a **2-leg same-game** card with combined odds in **+150…+400** where
   **both legs are Medium+ model confidence**.
3. Pick = highest total leg score (deterministic tie-break by card id).
4. Display = player photos, picks, real odds, combined odds, and an illustrative
   "paper stake → potential paper return" using the **current ladder bankroll** as
   the stake. Paper only; clearly marked "outside the tracked ladder".

## Guardrails honored
- No fabricated odds, legs, or results; combined odds = exact product of per-leg
  decimals.
- No "lock / safe / guaranteed / sure thing / free money / risk-free / can't miss"
  language.
- A correlation note states the legs share one game.
- If no card qualifies, nothing is shown (the canonical slip stands alone).

## Tonight's selection (2026-06-10)
The selector surfaces a 2-leg, both-High-confidence card (e.g. *Castle REB Over 4.5
+ Anunoby PRA Over 23.5*, ~+244, ~3.4×) → at the current ~$211.85 bankroll that's an
illustrative ~$700+ paper return. Exact card auto-updates with the leg pool.
