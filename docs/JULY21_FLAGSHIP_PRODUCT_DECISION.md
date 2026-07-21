# July 21 Flagship Product Decision

Money locked `affe6b21`, exposure $0. Products activate only with current, eligible, settlement-supported legs —
otherwise honest No Play. Nothing forced.

## Slate
- **MLB:** 15 games July 21; **3** have posted odds (team markets) + 10k player-prop sims so far.
- **World Cup:** complete — no eligible legs (archive; player props were always settlement-pending anyway).
- NBA/NFL/NHL/UFC: not active.

## Candidate search (July 21)
The daily paper candidate engine (`activate-daily-portfolio.mjs`) ran against the current MLB markets and produced
**0 eligible lanes** across Bank Builder + Moonshot (exposure $0). Why:
- **MLB full-game team markets** (moneyline / run line / total) are **market-anchored, de-vigged lines with ~0
  edge** — they mirror the book (confirmed at 81 games: the internal full-game sim ties the market). No edge → not
  a value leg. Using a market-anchored line as an "edge" is explicitly forbidden.
- **MLB player props** surface only as **model-qualified** picks; today's 3-game sim produced 5 picks — too few /
  no qualifying multi-leg with independent, correlation-clean edge for a product card at this hour.
- **World Cup** legs: tournament over (no current games) + player props settlement-pending → ineligible.
- Internal MLB full-game / pitcher-v1 / bullpen-v1 outputs: internal-only, not adopted → ineligible.

## Decision
- **Bank Builder = No Play / awaiting eligible slate.** No approved card; $0. Not forced.
- **Moonshot = No Play.** Public ladder stopped, $0; candidate pool free of settlement-pending props (cleaned
  July 15).
- **Today / Mr. Dub:** honest No Play surface; money-journey ledger unchanged.

This is the honest, public-ready state: a current MLB slate is loaded, the product engine found no eligible edge
legs, so the products show No Play rather than a fabricated card. As more July-21 odds/props post and the sim pool
grows, the engine may surface eligible MLB legs — the operator can then approve a paper card through the
md5-guarded promoter. Until then: No Play.

## Money / exposure — UNCHANGED
`portfolio.json` md5 `affe6b21`, exposure $0, bankroll $19,065.40, crown $20,465.40, record 19-14. No active/placed
card; no player props placed; no official-money change.
