# Event-Market Provider Decision Package (Phase 13)

**Date:** 2026-07-23
**Author scope:** TECHNICAL feasibility only.
**Status of this document:** decision-support, not a decision. No provider is approved by this file.

---

## 0. How to read this document — TECHNICALLY POSSIBLE ≠ APPROVED FOR USE

These are two different questions and this package answers **only the first**:

- **TECHNICALLY POSSIBLE** — *Could* the existing read-only `MarketDataAdapter`
  ([app/src/lib/event-markets/providers/adapters.ts](../app/src/lib/event-markets/providers/adapters.ts))
  be pointed at a real endpoint and return the shapes our domain model expects (auth, endpoints,
  rate limits, data shape)? This is an engineering assessment and is the subject of this file.
- **APPROVED FOR USE** — *May* GameTimePicks lawfully and per-terms consume, store, and (especially)
  **publicly display / build a derivative product on** that data? This is a **legal / terms-of-service /
  founder decision** and is **explicitly out of scope here.** Nothing below grants it.

> A provider can be 100% technically feasible and still be **NOT APPROVED**. Feasibility is a
> precondition for a decision, never the decision itself. Where legality or a platform's terms matter,
> this document says **"requires founder + legal/ToS review"** and stops — it draws no legal conclusion.

The current subsystem status is unchanged by this document: **FIXTURE_ONLY.** Both provider adapters
are live-disabled; a live read throws `LiveIntegrationDisabledError` rather than hitting any endpoint or
inventing a response. This package does not change that and does not enable anything.

Prior technical/compliance detail (endpoints, rate limits, verbatim terms citations) lives in
[EVENT_MARKET_PROVIDER_AUDIT.md](EVENT_MARKET_PROVIDER_AUDIT.md) and
[EVENT_MARKET_PROVIDER_ADAPTERS.md](EVENT_MARKET_PROVIDER_ADAPTERS.md); this file is the decision layer on top.

---

## 1. Invariants that hold regardless of any provider decision

These are true whether or not a provider is ever approved, and no provider integration may weaken them:

1. **Read-only forever.** The `MarketDataAdapter` contract has no write methods; no wallet, no orders,
   no trades, no balances, no funds movement — none may be added.
2. **No fabricated data.** Fields a platform does not expose are returned `null`, never faked. No
   synthetic prices, no invented "current odds".
3. **No independent probability without the gate.** The modelability contract (§4) governs whether an
   independent number may ever appear. The honest default —
   `estimateStatus: "NOT_YET_MODELED"`, `estimatedProbability: null` — holds until a validated engine
   **and** founder approval exist. A provider going live does **not** unlock a probability.
4. **Money is untouched.** This subsystem never reads or writes portfolio.json, Bank Builder, or Moonshot.

---

## 2. Polymarket — decision sheet

**Platform shape:** on-chain (Polygon) prediction market; outcome tokens trade on a central-limit order
book (CLOB) with UMA optimistic-oracle resolution. Multi-outcome questions are modeled as an **event that
groups N binary Yes/No markets** (one per candidate/outcome).

### 2a. What going live would require (engineering)

| Dimension | Finding (technical) |
|---|---|
| **Auth** | Gamma API + Data API are public, **no authentication**. CLOB **read** endpoints (orderbook, prices, midpoint, spread, price history) are public; only order placement/cancellation needs auth — and we never do that. So: **no credential to provision** for reads. |
| **Endpoints** | Gamma `https://gamma-api.polymarket.com` (metadata/discovery/sports), Data `https://data-api.polymarket.com`, CLOB `https://clob.polymarket.com` (prices/history/order book). Per-market prices key off `clobTokenIds`. |
| **Rate limits** | Not stated on the official intro page; community-reported ≈ 60 req/min unauthenticated. Engineering plan: cache snapshots, prefer WebSocket for realtime, throttle discovery. *Reconfirm exact numbers at integration.* |
| **Data shape returned** | Maps cleanly to our contract: market objects → `EventMarket` (question, outcomes, description/resolution text, resolution source); CLOB price/midpoint/liquidity/volume → `MarketSnapshot.outcomePrices` / `bidAsk` / `liquidity` / `volume` stamped with our `capturedAt`. On-chain AMM/order-book liquidity semantics differ from a regulated book — document the mapping, do not equate. |
| **Engineering blockers** | **None material for reads.** Reads are keyless and, per the audit, not geoblocked. The only remaining item to pin at integration is exact rate limits. |

### 2b. What outcome / evidence data it provides

- **Outcome (market) data:** implied prices per binary outcome, order book, price history, volume,
  liquidity. These are the **platform's** numbers and enter our model as **market context only**
  (`MarketSnapshot.outcomePrices`) — never as our independent estimate.
- **Resolution data:** UMA-oracle resolution is on-chain and readable → supports a later
  `ResolutionRecord`, and the market's description/resolution text → `EventMarket.resolutionRules` +
  `resolutionSource` captured verbatim.
- **Evidence data:** **none.** Polymarket is a price/rules source, not a news feed. `EvidenceItem`s come
  from the separate evidence pipeline; a provider integration does not populate them.

### 2c. How the modelability-contract gate applies

The adapter's fields feed specific modelability dimensions: `resolutionRules` present → `ruleClarity`;
a residual/"field" outcome → `outcomeExhaustiveness`; `snapshot.liquidity` → `liquidity`; listed
outcomes → `outcomeClarity`. **But** most sports event contracts Polymarket lists (player movement,
personnel, retirement) carry insider-driven priors, so the contract classifies them `INFORMATION_ONLY`
and `mayShowIndependentProbability` stays **false**. Net effect: even fully live, the honest emitted state
for those markets remains **market data + evidence + rules with `estimatedProbability: null`.**

### 2d. Verdict block — Polymarket

```
Provider: Polymarket (read-only MarketDataAdapter, platform "polymarket")
Technical feasibility: FEASIBLE for read-only integration — public/keyless Gamma+Data+CLOB reads,
  clean mapping to EventMarket/MarketSnapshot/ResolutionRecord, no credential to provision, no
  engineering blocker beyond confirming rate limits at integration.
Approval status: NOT APPROVED — requires founder + legal/ToS review.
  (Commercial public display / derivative-product use of this data is a legal/ToS question this
   package does not assess or conclude. Live stays DISABLED until that review clears.)
```

---

## 3. Kalshi — decision sheet

**Platform shape:** US, CFTC-regulated event-contract exchange. Contracts are **binary Yes/No**;
multi-outcome questions are a set of related binary markets grouped under one event/series ticker.

### 3a. What going live would require (engineering)

| Dimension | Finding (technical) |
|---|---|
| **Auth** | Trading/portfolio calls require an **API key pair + per-request RSA-PSS signature** (`KALSHI-ACCESS-KEY`/`-TIMESTAMP`/`-SIGNATURE`) — we never make those. Market-data reads are *reported* public/keyless (`GET /markets`, `/markets/{ticker}`, `/series/{series_ticker}`) but this is corroborated from developer guides, **not** machine-verified from the official reference — *reconfirm at integration.* The adapter currently declares `requiresAuth: true` conservatively. |
| **Endpoints** | Reported base `https://api.kalshi.com/trade-api/v2` (host has moved historically — reconfirm). Discovery via `/series` + `/markets` filtered by series/category (Kalshi has a Sports category). |
| **Rate limits** | Reported tiered (Basic ≈ 20 read req/s); unauthenticated reads subject to per-IP limits; `429` on breach. Cache; do not poll aggressively. *Reconfirm.* |
| **Data shape returned** | Maps to our contract: market objects → `EventMarket` with **precise, machine-readable rules** → strong `resolutionRules`/`resolutionSource` capture; current price on the market object → `MarketSnapshot.outcomePrices`; settlement `result` → later `ResolutionRecord`. Historical/candlestick + order-book depth are reportedly available but **restricted by Kalshi's Data Terms** (a terms question, not an engineering one). |
| **Engineering blockers** | Exact public-read surface + host + rate limits must be reconfirmed from official docs; RSA-PSS signing is only needed for the write/portfolio calls we never make. |

### 3b. What outcome / evidence data it provides

- **Outcome (market) data:** binary Yes/No implied prices; reported price history + order book (access
  governed by terms). Enter our model as **market context only.**
- **Resolution data:** Kalshi's rulebook is precise and machine-readable → the **strongest**
  `resolutionRules`/`resolutionSource` source of the two providers; settlement `result` → `ResolutionRecord`.
- **Evidence data:** **none** — same as Polymarket. Not a news/evidence feed.

### 3c. How the modelability-contract gate applies

Same mechanism as §2c. Kalshi's precise rules would raise `ruleClarity`/`contractConfidence`, which helps
**structured** categories (qualification, award, tournament_winner) more than insider-driven ones. Even so,
the gate — not the provider — decides: `INFORMATION_ONLY`/`LOW`/`UNSUPPORTED` contracts keep
`estimatedProbability: null`; only `HIGH`/`MEDIUM` *and* a validated engine *and* founder approval could
ever change that.

### 3d. Verdict block — Kalshi

```
Provider: Kalshi (read-only MarketDataAdapter, platform "kalshi")
Technical feasibility: FEASIBLE-WITH-RECONFIRMATION for read-only integration — reads reported
  keyless (reconfirm from official docs), best-in-class machine-readable resolution rules, clean
  mapping to EventMarket/MarketSnapshot/ResolutionRecord; RSA-PSS auth is only for write/portfolio
  calls we never make.
Approval status: NOT APPROVED — requires founder + legal/ToS review.
  (Kalshi's Data Terms of Use govern non-personal / public-display / derivative / AI-ML use; whether
   our use is permitted, and whether a written data license is needed, is a legal/founder question
   this package does not assess or conclude. Live stays DISABLED until that review clears.)
```

---

## 4. The modelability gate applies the same way to every provider (the honesty spine)

No provider integration bypasses this. For any market, from any platform:

1. `scoreModelability()` classifies the contract from ten dimensions
   ([modelability-contract.ts](../app/src/lib/event-markets/modelability-contract.ts)).
2. Only `HIGH_MODELABILITY` / `MEDIUM_MODELABILITY` set `mayShowIndependentProbability: true`. Everything
   else is **information-only** by construction — market data + evidence + rules, no independent number.
3. Even when the gate *permits* a number, the preview assembler still emits `NOT_YET_MODELED` /
   `estimatedProbability: null` until a **validated engine** exists and a **founder approves** it.
4. Provider prices are surfaced as **market context**, explicitly distinct from (and never relabeled as)
   our independent estimate; the neutral gap field is `differencePts`, never "edge".

The Phase 15 evidence-pipeline demonstration exercises this end-to-end on a fixture and asserts the
no-probability invariant holds.

---

## 5. Combined verdict (the decision-maker's summary)

```
EVENT-MARKET PROVIDERS — DECISION VERDICT (2026-07-23)

Subsystem status: FIXTURE_ONLY. Both adapters live-disabled; no network call is made.

Polymarket   Technical feasibility: FEASIBLE (read-only)          Approval: NOT APPROVED — requires founder + legal/ToS review
Kalshi       Technical feasibility: FEASIBLE-WITH-RECONFIRMATION  Approval: NOT APPROVED — requires founder + legal/ToS review

TECHNICALLY POSSIBLE ≠ APPROVED FOR USE. This package assesses feasibility only and approves nothing.
No independent probability is or would be emitted by either integration; the modelability gate + the
"NOT_YET_MODELED until validated engine + founder approval" rule hold regardless of provider status.
No legal or terms-of-service conclusion is drawn here — those are reserved for founder + legal review.
```

---

## 6. Explicitly NOT decided here (reserved for founder + legal/ToS review)

The following are flagged, not resolved, and none is a conclusion of this document:

- Whether either platform's terms permit our intended read, storage, and (especially) public display /
  derivative-product use. **requires founder + legal/ToS review.**
- Whether Kalshi requires a written data license / prior written consent for our use. **requires founder + legal/ToS review.**
- Whether Polymarket's commercial-display terms permit surfacing its on-chain data in our product. **requires founder + legal/ToS review.**
- Any go-live sequencing, jurisdiction, or regulatory-exposure question. **requires founder + legal/ToS review.**

Until such a review clears a specific provider in writing, the adapters remain live-disabled and this
subsystem remains FIXTURE_ONLY.

---

## Implementation gate (2026-07-23 · fail-closed)

Live adapters remain **DISABLED** in code until, **per provider**, ALL of the following are satisfied — encoded as a
per-provider `ProviderApproval` in `app/src/lib/event-markets/providers/adapters.ts` (`PROVIDER_APPROVAL`), which ships
all-false:

| Flag | Meaning |
|---|---|
| `enabled` | master switch — one flag per provider, `false` until a deliberate go-live |
| `founderApproved` | founder sign-off obtained |
| `tosReviewed` | provider / terms-of-service review completed |
| `attributionDocumented` | attribution requirements documented |
| `storagePolicyApproved` | caching / storage policy approved |
| `geoLimitsUnderstood` | geographic limitations understood |
| `readOnlyAccepted` | no-trading / read-only boundary accepted |

**Fail-closed by construction:** `assertProviderLiveAllowed(platform)` throws `LiveIntegrationDisabledError` unless
`isProviderLiveApproved` returns true — which requires `enabled` **and** every precondition above. Flipping `enabled`
alone is not enough, and every precondition met with `enabled:false` is still not approved. Any future live code path
must call this gate before touching a transport; with the default registry it always throws. Current status:
**polymarket = NOT APPROVED, kalshi = NOT APPROVED** (both fully disabled). Guarded by
`adapters.test.mjs` (tests 7–10: all-disabled, throws by default, partial approval still fails closed, fully-approved
is satisfiable).

---

*No code, data, money, or provider status was changed by this document. Read-only market data domain only —
no wallet, no trades, no orders, no balances.*
