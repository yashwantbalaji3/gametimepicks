# Event-Market Provider Audit (READ-ONLY data access)

**Date:** 2026-07-23
**Scope:** A read-only, artifact-backed audit of *legitimate, read-only* data access for
sports EVENT / prediction-market contracts (Kalshi / Polymarket-style multi-outcome
event contracts), plus the one market-data source already wired into the repo (The Odds
API). It determines, per provider, whether GameTimePicks could later point a
**fixture-first, read-only `MarketDataAdapter`** at a real endpoint — and what blocks it.

**No code or data was modified. This document is the only file written.**

## Absolute boundaries (restated, non-negotiable)

- **Read-only market data only.** No wallet, no trades, no orders, no order placement, no
  order cancellation, no funds movement, no user balances, no positions — ever. The
  `MarketDataAdapter` contract ([app/src/lib/event-markets/types.ts](../app/src/lib/event-markets/types.ts))
  has **no write methods**, and none may be added.
- **No scraping, no ToS violation.** Only official APIs, used within their terms. If a
  platform's terms forbid programmatic access, redistribution, or public display, we do
  **not** integrate it without explicit written permission / a data license.
- **Fields a platform does not expose are returned `null`, never faked.**
- **Nothing here touches money, Bank Builder, Moonshot, or the public product.** This is a
  planning/compliance audit only.

## What was verified vs. reported

- **Verified from official sources:** Polymarket API base URLs + "fully public, no auth"
  for the Gamma/Data APIs and the geoblock policy (docs.polymarket.com); the **Kalshi Data
  Terms of Use** (extracted verbatim from Kalshi's own public S3-hosted PDF); the repo's
  own credential state and existing adapter contract.
- **Reported (multiple corroborating 2026 developer guides, not the official reference
  page):** Kalshi's exact public-read endpoint paths, current base URL, and per-tier rate
  limits. Kalshi's official landing page routes these to sub-pages that could not be
  fully machine-read; the values below are cross-checked across several guides and marked
  *reconfirm at integration*. Where a specific detail could not be verified, it is called
  out rather than invented.

---

## 1. Repository state (evidence)

| Check | Finding | Evidence |
|---|---|---|
| Kalshi credential present? | **ABSENT** | `grep -riE "kalshi\|polymarket" .env` → **0 matches**. No `KALSHI_*` key anywhere in repo. |
| Polymarket credential present? | **ABSENT** (and not needed for public reads) | Same grep → 0. No `POLYMARKET_*` key. Polymarket public reads are keyless anyway. |
| The Odds API credential present? | **PRESENT** | `ODDS_API_KEY` set in repo-root `.env` (value not printed). Used by `pipeline/providers/odds_api_provider.py` (`API_BASE = https://api.the-odds-api.com/v4`), free tier ~500 credits/mo. |
| Existing event-market client code? | **NONE (contract only)** | `app/src/lib/event-markets/` contains `types.ts`, `modelability-contract.ts`, `preview-assembler.ts`, and one synthetic fixture (`fixtures/star-player-next-team.ts`). **No live adapter implementation exists** for any platform. |
| Adapter contract already models these platforms? | **YES** | `types.ts` → `type Platform = "kalshi" \| "polymarket" \| "internal_fixture" \| "other"`; each adapter must declare `capabilities: { priceHistory, orderBook, resolutionRules, requiresAuth, notes }`. |
| Prior capability finding | **UNSUPPORTED** | [docs/SPORTS_EVENT_MARKET_CAPABILITY_AUDIT.md](SPORTS_EVENT_MARKET_CAPABILITY_AUDIT.md) — no live event-market price capture exists today. |

The only *approved market-data source already in the repo* is **The Odds API** — a
sportsbook-odds aggregator, **not** an event/prediction-market exchange. It is included
below for completeness because the task requires reporting on it.

---

## 2. Summary classification table

Each provider is classified as **exactly one** of:
`INTEGRATION_READY` / `METADATA_ONLY` / `REQUIRES_CREDENTIALS` / `LEGAL_REVIEW_REQUIRED` / `UNSUPPORTED`.

Conservative rule applied: **INTEGRATION_READY requires verifying BOTH (a) unauthenticated
read access AND (b) permissive public-display terms from official docs.** If either is
unverified or restrictive, the provider drops to `LEGAL_REVIEW_REQUIRED` (or
`REQUIRES_CREDENTIALS`).

| Provider | Unauth. read? | Display terms | Repo credential | **Classification** | Single biggest blocker |
|---|---|---|---|---|---|
| **Kalshi** | Reads reported public (reconfirm) | **Restrictive — verified** | Absent | **LEGAL_REVIEW_REQUIRED** | Data Terms: "personal use for non-commercial purposes" only; public display / redistribution / derivative products need **prior written consent** from Kalshi. |
| **Polymarket** | **Public — verified (Gamma/Data, no auth)** | Not verified permissive for commercial display | Absent (not needed for reads) | **LEGAL_REVIEW_REQUIRED** | ToS confirmation for **commercial public display** of otherwise-globally-viewable on-chain data. **Not** credentials, **not** geo (reads are not geoblocked). |
| **The Odds API** | No (API key) | N/A for this domain | **Present** | **UNSUPPORTED** *(as an event/prediction-market provider)* | Wrong domain — it is a sportsbook-odds aggregator, not an event-contract exchange (no order books, no oracle/rulebook resolution, futures are book-priced proxies). |

**No provider qualifies as `INTEGRATION_READY`.** This is the conservative, correct outcome.

---

## 3. Per-provider detail

### 3.1 Kalshi — `LEGAL_REVIEW_REQUIRED`

Kalshi is a **US, CFTC-regulated** event-contract exchange (binary Yes/No contracts).

| Dimension | Finding |
|---|---|
| **Official API availability** | Yes. REST + WebSocket + FIX. Base URL reported as `https://api.kalshi.com/trade-api/v2` (the host has moved over time — also seen historically as `api.elections.kalshi.com/trade-api/v2` and `trading-api.kalshi.com`); **reconfirm the exact host against the official docs at integration**. |
| **Authentication** | Trading/portfolio calls require an **API key pair + a per-request RSA-PSS signature** (`KALSHI-ACCESS-KEY` / `-TIMESTAMP` / `-SIGNATURE`). No login/JWT. |
| **Public (unauthenticated) market-metadata access** | *Reported* public/keyless for market data — `GET /markets`, `GET /markets/{ticker}`, `GET /series/{series_ticker}`. Corroborated across multiple 2026 guides but not machine-verified from the official reference page → treat as **reported; reconfirm**. Even where technically keyless, use is still governed by the Data Terms below. |
| **Price / history access** | Current prices exposed on market objects; historical/candlestick data reported available. Bulk historical/archived data is **restricted by the Data Terms** (see legal). |
| **Order-book access** | `GET /markets/{ticker}/orderbook` reported public. Redistribution of that depth is restricted by the Data Terms. |
| **Rate limits** | Reported tiered (Basic default ≈ **20 read req/s, 10 write req/s**; higher paid tiers). Unauthenticated reads subject to global per-IP limits. `429` on breach. Cache snapshots; do not poll aggressively. |
| **Market-rules access** | Yes — Kalshi contracts have precise, machine-readable rules; well-suited to `resolutionRules: true` and verbatim capture into `EventMarket.resolutionRules` / `resolutionSource`. |
| **Resolution data** | Yes — settlement `result` (`yes` / `no` / unresolved) exposed; supports a later `ResolutionRecord`. |
| **Sports discoverability** | Kalshi has a Sports category; markets are grouped under **events / series tickers**. Discover via `/series` + `/markets` filtered by series/category. (Could not verify the exact sports series taxonomy from the official page — reconfirm.) |
| **Binary vs multi-outcome** | **Binary Yes/No** at the contract level; multi-outcome questions are represented as a **set of related binary markets grouped under one event/series** (each candidate/outcome = its own Yes/No market). |
| **Geographic limitations** | Trading is US-regulated / restricted to eligible persons — but that gates *participation*, which we never do. For *reading* data, geography is **not** the binding constraint; the Data Terms are. |
| **Repo credential** | **Absent.** |
| **Legal / terms uncertainty** | **This is the blocker.** See below. |

**Legal (verified verbatim from the Kalshi *Data Terms of Use*, Kalshi's public S3 PDF):**
- **Permitted use is narrow:** access is "only… for your personal use for non-commercial
  purposes," and non-commercial use *excludes* using the data (without prior written
  consent) in "the development of any software program" or "providing archived or cached
  data sets… to another person or entity."
- **Prohibited uses** (without prior written authorization) explicitly include
  "reproducing, downloading (other than to view only where a link is provided)…
  distributing, disseminating, publicly displaying, publishing… creating derivative
  works… compiling… scraping," and using the data to "create… support or develop any…
  products, services… or any other derivative works."
- **AI/ML use is expressly prohibited.**
- Automated access via "scripts, software, spiders, robots… crawlers" to
  "access, copy in bulk, retrieve, harvest, index, search or analyze" the site is
  prohibited without prior written permission.

**Conclusion:** A public, commercial GameTimePicks surface displaying Kalshi prices/rules
would implicate the Data Terms' non-commercial and public-display restrictions. Integration
requires **prior written consent / a commercial data license from Kalshi**, and a
reconciliation of the Data Terms with the separate **API Developer Agreement** (which one
must accept to use the API at all). → **LEGAL_REVIEW_REQUIRED** (hard blocker).

### 3.2 Polymarket — `LEGAL_REVIEW_REQUIRED`

Polymarket is an **on-chain** (Polygon) prediction market; outcome tokens trade on a
central-limit order book (CLOB) with **UMA optimistic-oracle** resolution.

| Dimension | Finding |
|---|---|
| **Official API availability** | Yes. Verified base URLs: **Gamma API** `https://gamma-api.polymarket.com`, **Data API** `https://data-api.polymarket.com`, **CLOB API** `https://clob.polymarket.com`. |
| **Authentication** | **Gamma API and Data API are "fully public — no authentication required" (verified, official).** CLOB **read** endpoints (orderbook, prices, midpoint, spread, price history) are public; only **order placement/cancellation** (which we never do) needs auth. |
| **Public (unauthenticated) market-metadata access** | **Yes — verified.** Gamma serves markets, events, tags, series, **sports**, and search — "the primary API for discovering and browsing market data." This is the genuinely usable keyless metadata surface. |
| **Price / history access** | **Yes — public.** CLOB exposes live prices, midpoints, spreads, and **price history**, keyed by a market's `clobTokenIds`. |
| **Order-book access** | **Yes — public** CLOB order book (read). WebSocket available for live streaming. |
| **Rate limits** | Not stated on the official intro page. Community-reported ≈ **60 req/min** for unauthenticated Gamma/Data; CLOB has documented per-endpoint limits; WebSocket for live data. Cache; prefer WebSocket for realtime. *(reconfirm exact numbers)* |
| **Market-rules access** | Yes — market objects carry a description / resolution text; capture `resolutionSource` + rule/`ruleVersion` verbatim. On-chain/UMA resolution differs from a regulated rulebook — document the mapping, don't equate it with Kalshi. |
| **Resolution data** | Yes — resolution via UMA oracle is on-chain and readable; supports a later `ResolutionRecord`. |
| **Sports discoverability** | Strong — Gamma has an explicit **sports** surface (tags/series/events). Discover via tags/series → events → per-market `clobTokenIds`. |
| **Binary vs multi-outcome** | Each market is a **binary Yes/No token pair**; multi-outcome questions are modeled as an **event grouping N binary markets**. `liquidity`/`volume` derive from AMM/order-book state — semantics differ from a regulated book; document, don't pretend they're identical. |
| **Geographic limitations** | **Trading** (order placement) is geoblocked in restricted jurisdictions — **verified that this does not restrict READ access**: "the API itself is not restricted" for reads, and per Polymarket's ToS "data and information is viewable globally." Geo is **not** a read blocker. |
| **Repo credential** | **Absent** — and none is needed for public reads. |
| **Legal / terms uncertainty** | Read access is public and globally viewable; however, **explicit permissive terms for *commercial public display / redistribution*** were not verified verbatim from the official ToS (only a third-party paraphrase). Per the conservative rule, that unverified display term keeps it out of `INTEGRATION_READY`. |

**Conclusion:** Technically the strongest candidate — a fully public, keyless,
non-geoblocked read surface covering metadata, prices, history, order book, sports
discovery, and resolution. The **only** gate to readiness is a **light, targeted ToS
confirmation** that commercially displaying this (publicly viewable, on-chain) data is
permitted. → **LEGAL_REVIEW_REQUIRED** (light blocker; blocker = **ToS**, not credentials,
not geo).

### 3.3 The Odds API — `UNSUPPORTED` *(as an event/prediction-market provider)*

| Dimension | Finding |
|---|---|
| **Official API availability** | Yes — `https://api.the-odds-api.com/v4`, already integrated in `pipeline/providers/odds_api_provider.py`. |
| **Authentication** | **API key required** (`ODDS_API_KEY`, present in repo). Credit-metered (free tier ~500 credits/mo; cost scales with markets × regions). |
| **Public (unauthenticated) market-metadata access** | No — key required for all data. |
| **Price / history / order-book access** | Provides **bookmaker odds** (h2h/spreads/totals/player props and `outrights`/futures). **No order book** (sportsbooks don't expose one); historical odds is a separate paid endpoint. |
| **Market-rules / resolution data** | **No** event-contract rulebook or oracle resolution — it is book-posted odds; settlement in this repo comes from official box scores, not the provider. |
| **Sports discoverability** | Strong for **sportsbook** markets, but these are game lines, not event contracts. |
| **Binary vs multi-outcome** | `outrights`/futures (e.g., championship winner) are multi-outcome and *overlap* the `tournament_winner` category — but they are **book-priced proxies**, lacking event-contract IDs, order books, and rulebook/oracle resolution. |
| **Geographic limitations** | None material for reads. |
| **Repo credential** | **Present.** |
| **Recommended status** | **UNSUPPORTED for the event/prediction-market domain.** It remains the repo's sportsbook-odds source and could, at most, feed **book-implied outright/futures proxies** under the adapter's `"other"` platform slot — explicitly *not* a Kalshi/Polymarket-style event-contract exchange, and out of scope for this subsystem. |

---

## 4. Proposed `capabilities` blocks (documentation only — not implemented)

If/when legal review clears a provider, the read-only adapter would declare (per the
`MarketDataAdapter` contract):

- **Kalshi (pending written consent):** `{ priceHistory: true, orderBook: true, resolutionRules: true, requiresAuth: false*, notes: "*reads reported keyless but reconfirm; Data Terms restrict public/commercial display — written consent/data license required before any surface." }`
- **Polymarket (pending ToS confirmation):** `{ priceHistory: true, orderBook: true, resolutionRules: true, requiresAuth: false, notes: "Gamma/Data public, no auth; CLOB read public; reads not geoblocked; on-chain/UMA resolution — confirm commercial-display ToS before shipping." }`
- **The Odds API:** not modeled here — sportsbook odds, out of domain.

No adapter is built. These are target shapes only.

---

## 5. Recommendation

**Polymarket's Gamma API (`https://gamma-api.polymarket.com`) is the single provider with a
genuinely usable, unauthenticated, read-only public market-metadata endpoint** that a
future **fixture-first** adapter (`platform: "polymarket"`) could later target — paired with
`https://clob.polymarket.com` for keyless prices/history/order book. Reads are public,
keyless, and **not geoblocked**, and sports markets are discoverable via Gamma's sports
surface.

- **The one blocker is ToS, not credentials and not geo:** a light, targeted confirmation
  that *commercial public display* of Polymarket's (globally viewable, on-chain) market
  data is permitted. Until that confirmation, it stays **LEGAL_REVIEW_REQUIRED**.
- **Kalshi is blocked harder** — its Data Terms restrict use to personal/non-commercial and
  prohibit public display, redistribution, derivative products, and AI/ML use without prior
  **written consent**. Do not integrate Kalshi data into any public surface without a
  written license from Kalshi.
- **The Odds API** is the wrong domain for event contracts and stays **UNSUPPORTED** here
  (it remains the repo's sportsbook-odds source).

**Concrete next step (no code):** if the product wants to move, the cheapest safe path is a
**fixture-first Polymarket adapter** — build and test the `MarketDataAdapter` entirely
against local fixtures (the existing `internal_fixture` pattern), and **gate the first live
Gamma/CLOB read call behind a one-line ToS confirmation** for commercial display. No wallet,
no trades, no orders, no balances — read-only market data only.

---

## 6. Sources

Official (verified):
- [Polymarket API — Introduction](https://docs.polymarket.com/api-reference/introduction)
- [Polymarket API — Geographic Restrictions](https://docs.polymarket.com/api-reference/geoblock)
- [Kalshi Data Terms of Use (PDF)](https://kalshi-public-docs.s3.amazonaws.com/kalshi-data-terms-of-service.pdf)
- [Kalshi API — Introduction](https://docs.kalshi.com/welcome)
- [Kalshi Developer Agreement (PDF)](https://kalshi-public-docs.s3.amazonaws.com/Kalshi-Developer-Agreement.pdf)

Third-party developer guides (reported / corroborating — endpoint paths + rate limits,
reconfirm at integration):
- [Kalshi API Guide — pm.wiki](https://pm.wiki/learn/kalshi-api)
- [Kalshi API: The Complete Developer's Guide — Zuplo/DEV](https://dev.to/zuplo/kalshi-api-the-complete-developers-guide-1fo4)
- [Kalshi API Rate Limits — botforkalshi](https://www.botforkalshi.com/blog/kalshi-api-rate-limits)
- [Polymarket API for Developers — Chainstack](https://chainstack.com/polymarket-api-for-developers/)
- [Polymarket US API availability (2026) — QuantVPS](https://www.quantvps.com/blog/polymarket-us-api-available)

Repository evidence (paths, relative to repo root):
- `app/src/lib/event-markets/types.ts` (the `MarketDataAdapter` contract)
- `app/src/lib/event-markets/{modelability-contract,preview-assembler}.ts`, `fixtures/star-player-next-team.ts`
- `docs/{SPORTS_EVENT_MARKET_CAPABILITY_AUDIT,EVENT_MARKET_PROVIDER_ADAPTERS,SPORTS_EVENT_INTELLIGENCE_ARCHITECTURE}.md`
- `.env` (`ODDS_API_KEY` present; no Kalshi/Polymarket keys), `.env.example`, `pipeline/providers/odds_api_provider.py`

*No code or data was modified during this audit. Read-only market data only — no wallet, no
trades, no orders, no user balances.*
