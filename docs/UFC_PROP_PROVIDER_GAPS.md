# UFC Prop-Provider Gaps (2026-07-10)

The connected odds feed (**The Odds API — MMA**) returns **h2h (moneyline) only**. Every other UFC market is
`provider_needed` and is shown as roadmap on `/ufc` — never fabricated, never a lean, never a card leg.

`readiness-latest.json`: `propMarketsAvailable = { h2h: true, method: false, distance: false, rounds: false }`
`ops-status.propMarketStatus.note`: *"Not offered by the current sportsbook feed (The Odds API MMA = h2h only)."*

## Missing markets

| market | status | provider needed | settlement requirement |
|---|---|---|---|
| Method of victory (KO/TKO · submission · decision) | `provider_needed` | a book that posts MMA method props | official result method from the commission/ESPN |
| Round betting / exact round | `provider_needed` | MMA round props | official finishing round |
| Goes the distance (yes/no) | `provider_needed` | MMA distance props | did the fight reach the final scheduled round |
| Total rounds (over/under) | `provider_needed` | MMA round totals | official finishing round vs line |
| Submission / KO-TKO / decision (individual) | `provider_needed` | MMA method sub-markets | official result method |

## What exists as MODEL-ONLY (never priced, never a pick)

The Expanded Projections tab derives goes-the-distance / total-rounds / method distributions from real fighter
finish/method history. These carry **no sportsbook odds**, so they are badged **MODEL-ONLY · NOT PARLAY
ELIGIBLE**, are insight-only, and — while the model is unvalidated — are labeled unvalidated. They can never
enter a card or become a public pick.

## To add a prop market (honest path)
1. Connect a provider that actually posts the MMA prop (or confirm The Odds API adds MMA prop markets).
2. Ingest real two-sided prop odds (`build_prop_odds.py` already scaffolds this — it currently finds none).
3. Flip the relevant `propMarketsAvailable` flag ONLY from real ingested odds.
4. Add settlement (official method/round from a real results source) before anything is gradeable.
5. Only then surface as a market-implied prop; model-adjusted prop picks still require the same validation
   gate as moneyline.

Until a provider is connected, these markets stay `provider_needed`. **No prop odds are invented.**
