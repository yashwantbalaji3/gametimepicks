# Level B (priced) NBA: what is missing, by blocker

- **For:** the founder report, 2026-10-24. Text only: nothing here changes code, gates or flags.
- **Scope:** Level B is priced recommendations: real sportsbook prices, EV, book comparison, payouts and a sportsbook handoff. Level A (non-transactional model suggestions, including the NBA game-winner cards) is outside this list.
- **Categories:** each blocker is named as one of authorized prices, provider terms, storage decision, settlement promotion, operator registry or legal. One prerequisite fits none of them and is listed separately at the end.

## 1. Priced NBA player props

| Blocker | Category | State today | What would clear it |
|---|---|---|---|
| No standing authorization to buy NBA prices | **authorized prices** | The only NBA receipt is the founder's points pilot for 2026-10-21 only: player points, at most 11 credits, private research only, with public picks and product legs disabled (`docs/receipts/ODDS_AUTHORIZATION_NBA_POINTS_PILOT_2026-10-21.md`). The credit guard refuses any paid NBA call without a committed receipt for that date. | A founder receipt naming the dates, markets, credit ceiling and capture cadence for a recurring priced lane |
| Showing captured prices publicly | **provider terms** | The odds provider's terms for public display or redistribution of its prices have not been confirmed for this site. The repo is public. | A written check of the provider's display and redistribution terms for public, derived product use |
| Where public priced artifacts live | **storage decision** | Decided for raw prices: they live in private storage outside every repo (`resolvePrivateDataDir`), never in the public repo. Not decided: whether and how a derived, priced public card (which the static build must read) may be committed. | A decision on the public, derived form a priced card may take and where the build reads it from |
| Prop settlement | **settlement promotion** | The NBA prop-settlement gate needs evidence and a founder promotion record. `data/internal/research/nba/promotion-record.json` has `records: []`, so no market is promoted. | A PROMOTION record citing a READY_FOR_FOUNDER_REVIEW evaluator verdict for the market |

## 2. Priced NBA parlays (multi-leg cards with real prices and payouts)

| Blocker | Category | State today | What would clear it |
|---|---|---|---|
| Prices for every leg | **authorized prices** | As in §1. No authorized NBA game or prop prices exist for any slate after 10-21. | A recurring receipt that covers the leg markets |
| Public display of the combined price and payout | **provider terms** | As in §1 | As in §1 |
| Public, derived priced artifact | **storage decision** | As in §1 | As in §1 |
| Grading prop legs | **settlement promotion** | Game-winner legs grade on the NBA settlement contract. Prop legs need the §1 promotion. | As in §1 |

## 3. Bank Builder and Moonshot priced cards (NBA)

| Blocker | Category | State today | What would clear it |
|---|---|---|---|
| Priced NBA legs in the product universe | **authorized prices** | The product eligible-leg builder admits only priced legs. There are no authorized NBA prices. | As in §1 |
| Public display of prices | **provider terms** | As in §1 | As in §1 |
| Public, derived priced artifact | **storage decision** | As in §1 | As in §1 |
| Settling priced props in the ladder and lane | **settlement promotion** | As in §1 | As in §1 |

## 4. Smart Betslip handoff (sending a selection to a sportsbook)

| Blocker | Category | State today | What would clear it |
|---|---|---|---|
| Which sportsbooks may receive a handoff | **operator registry** | No NBA handoff operator is registered. The 10-21 pilot named nine verified operators for private price capture only, not for handoff. Expanding operator authorization is outside this workstream's authority. No sportsbook deep link is built, and none may be invented. | A founder-approved operator registry entry per sportsbook: licensed jurisdictions, the approved link format, and expiry |
| Jurisdiction, age and responsible-gambling requirements for directing a user to a sportsbook | **legal** | Not reviewed for a handoff flow. Level A's "Copy selections" carries no link and places nothing. | A legal review of the handoff flow and its required disclosures, per jurisdiction |
| Price at handoff time | **authorized prices** | A handoff would have to show a live, unexpired price. None is authorized. | As in §1 |

## Prerequisite outside the six categories

NBA is `HISTORICAL_ONLY` in the capability registry, so `canEnterPredictionProducts("nba")` is false. Level B for NBA also needs the model to meet its preregistered regular-season bars (`docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md`) and a governance change of the registry state. Clearing every blocker above would not, by itself, open Level B for NBA.
