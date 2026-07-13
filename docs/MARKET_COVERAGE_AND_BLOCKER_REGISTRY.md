# Market Coverage & Blocker Registry (2026-07-13)

The product's "no hidden gaps, no overclaim" contract, now a real code registry: **`app/src/lib/market-coverage.ts`**
(rendered by `components/simulation-coverage-matrix.tsx`, live on `/simulate`). Every sport × market has a
status, a prediction source, the data it needs, its settlement support, and a plain-English public explanation.

## Status vocabulary
`supported` (live where odds/artifacts exist) · `conditional` (needs a specific input) · `experimental` (labelled,
never product-eligible) · `provider_needed` (needs a feed we don't ingest) · `settlement_blocked` (predictable but
not gradable) · `coming_soon`.

## Prediction-source honesty
`independent_sim` (a real Monte-Carlo model — **claimed nowhere yet**) · `market_anchored` (de-vigged lines, MLB
team markets) · `market_implied` (de-vigged implied probs — WC 90', UFC ML) · `projection_only` (MLB props pre-10k)
· `experimental_model` (UFC method reads) · `none`.

## Current coverage (summary — see the lib for the full table)
| sport | supported | conditional / experimental | blocked (why) |
|---|---|---|---|
| **Soccer/WC** | match result, double chance, draw-no-bet, total goals, BTTS (all market-implied, 90' settled) | Asian handicap (needs AH settlement) | scorer / shots / corners / cards / correct-score → **provider_needed** (no prop feed + settlement) |
| **MLB** | moneyline, run line, total (market-anchored, box-score settled) | player props (10k where artifact); full-game sim = **experimental** market-implied | team totals → **settlement_blocked**; F5 → **coming_soon** |
| **UFC** | — | moneyline (experimental market-implied), method (experimental model) | round / distance → **provider_needed**; **nothing UFC is product-eligible** (unvalidated) |

## The blockers, explicitly
- **Soccer corners/cards/shots/scorer** need a player-prop / set-piece odds **provider feed + settlement source**.
- **Soccer anytime scorer** additionally needs lineup/minutes.
- **UFC method/round/distance odds** need an MMA odds **provider feed**.
- **MLB team totals** need a **settlement source** before product-card eligibility.
- **Independent soccer + MLB full-game sims** need **validated, backtested models** before dropping the
  "market-implied" label.

## Enforcement (tested)
- `isProductEligible(market)` = `settlementSupport==="supported" && status∈{supported,conditional}`. Every
  `settlement_blocked` / `experimental` / `provider_needed` market — and **all** UFC markets — return false, so
  they can never enter a Bank Builder / Moonshot card. (`market-coverage.test.mjs`)
- Unsupported markets are **present in the registry as provider_needed/unsupported** (shown, not hidden) with
  `predictionSource: "none"` (never faked).
- No forbidden claims in any public explanation (scanned in the test).

## Where it's shown
`/simulate` (live this pass). Next: `/mlb`, `/world-cup`, `/ufc` (per-sport filtered via
`<SimulationCoverageMatrix sport="…"/>`), and `/methodology`.
