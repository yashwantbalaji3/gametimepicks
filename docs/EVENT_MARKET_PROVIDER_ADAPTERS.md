# Event-Market Provider Adapters (read-only contract)

_Provider-neutral, READ-ONLY adapters that map a prediction-market platform's data into the event-intelligence domain
model. The interface is `MarketDataAdapter` in [app/src/lib/event-markets/types.ts](../app/src/lib/event-markets/types.ts).
This is a contract + caveats document — no live integration exists, and none should be built without valid credentials
and an explicit ToS review._

## Absolute boundaries

- **Read-only.** No trading, no order placement, no wallet connection, no funds movement — ever. The adapter surface
  has no write methods, and none may be added.
- **No scraping / no ToS violation.** Only official APIs with valid credentials + an approved integration. If a
  platform's terms forbid programmatic access or redistribution, we do not integrate it.
- **Fields a platform does not expose are returned `null`, never faked.**

## Required adapter outputs (all provider-neutral)

`fetchMarket` → `EventMarket` (metadata, outcomes, rules, resolution source/deadline, provider URL).
`fetchSnapshot` → `MarketSnapshot` (outcome prices, order-book summary *where permitted*, liquidity, volume,
`capturedAt`, source). `listMarkets?` → discovery (optional; returns `[]` when unsupported).
Each adapter declares `capabilities`: `{ priceHistory, orderBook, resolutionRules, requiresAuth, notes }`.

## Per-provider caveats (to confirm before any integration)

### Kalshi-like (binary/categorical, regulated exchange)
- **Auth**: API key / member auth required for most data. Confirm what is available unauthenticated.
- **Rate limits**: strict; cache snapshots, do not poll aggressively.
- **ToS**: confirm redistribution + display terms for prices and rules.
- **Unavailable fields**: full historical order book may be restricted → `orderBook`/`priceHistory` likely `false`
  without elevated access.
- **Resolution rules**: usually well-specified + machine-readable → `resolutionRules: true`.

### Polymarket-like (on-chain, binary or multi-outcome)
- **Auth**: public read endpoints exist for markets/prices, but confirm current terms + rate limits.
- **On-chain nuance**: prices/liquidity derive from AMM/order-book state; `liquidity`/`volume` semantics differ from a
  regulated book — document the mapping, don't pretend they're identical to Kalshi.
- **ToS/legal**: jurisdictional restrictions apply to *participation*; we only READ public market data. Confirm display
  terms; never facilitate access to trading.
- **Resolution**: UMA-style oracle resolution → capture `resolutionSource` + `ruleVersion` verbatim.

### Future providers
Implement the same `MarketDataAdapter`; document auth, rate limits, ToS, unavailable fields, and unsupported actions in
`capabilities.notes`.

## What is explicitly NOT built here

- No live adapter implementation (contract only).
- No news/evidence ingestion (a separate future system; the `EvidenceItem` shape is defined, the pipeline is not).
- No probability (see [PROBABILITY_EXPLAINABILITY_STANDARD.md](PROBABILITY_EXPLAINABILITY_STANDARD.md)).

Nothing in this subsystem touches money, Bank Builder, Moonshot, or the public product.
