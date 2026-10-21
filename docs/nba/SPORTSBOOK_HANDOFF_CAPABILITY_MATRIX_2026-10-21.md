# Sportsbook handoff capability matrix (2026-10-21)

**Owner:** Lane E (Smart Betslip and market connectivity). **Code that reads this:** `app/src/lib/slip/handoff-capability.mjs` (`CAPABILITY_MATRIX`, `handoffFor`).
**Builds on:** `docs/research/SMART_BETSLIP_FEASIBILITY_2026-10-18.md` and `SMART_BETSLIP_PREP_AND_OPERATOR_POLICY_2026-10-18.md` (branch `claude/launch-readiness-oct20`). Both concluded that public evidence does not support multi-leg prefill. This pass re-checked that and still finds nothing.

## Result

**Every eligible operator is `MANUAL_ENTRY`.** No operator publishes deep-link or betslip-URL documentation that could be fetched. No public document from an operator, aggregator or third party describes a working multi-leg prefilled betslip. The shippable handoff is the copyable leg-by-leg slip summary (`slipSummaryText`). It contains no link.

| Capability | Meaning | Required evidence | Operators today |
|---|---|---|---|
| `FULL_PREFILL` | Opens the sportsbook with every leg already on the slip | Operator-published multi-leg format, verified end to end with the provider | none |
| `PARTIAL_LINK` | Opens a market or a single-leg prefill | Operator-published format, verified end to end | none |
| `MANUAL_ENTRY` | The reader enters each leg using the copied summary | none | all 9 allowlisted keys |

### Two gates keep links OFF

Both are independent of this matrix.

1. **Legal.** The Terms (`app/src/lib/legal/texts.mjs`, "What the Site is") state that the Site does not "link to or partner with any sportsbook". Ask also refuses sportsbook links (`app/src/lib/ask/contract.mjs`, `ASK_LINK_PATTERNS`). `TERMS_PERMIT_SPORTSBOOK_LINKS` is the constant `false`. Only a founder/legal Terms change may flip it, and the flip belongs in the same commit as that change.
2. **Flag.** `NEXT_PUBLIC_SPORTSBOOK_HANDOFF_LINKS` must be exactly `"1"`. It defaults to OFF.

Even with both gates open, `handoffLinks` emits a link only from a verified `operatorTemplate`, and every row's template is `null`. Per the release owner (2026-10-21, PR 1130 still founder-gated), this PR ships the matrix and the copy fallback only. No URL template exists anywhere in the code.

## Legend

- **VERIFIED**: the claim was read on a fetched public page, and the URL is given.
- **VERIFIED (aggregator)**: the page fetched belongs to a third-party odds/data provider, not the operator. This never counts toward a capability.
- **UNVERIFIED**: no fetchable documented source. This includes URL patterns seen on blogs, forums, third-party code or aggregator examples. **A URL observed in the wild is UNVERIFIED here.**

Method: WebSearch and WebFetch of public pages only, all accessed 2026-10-21. No sign-up, no credentials, no sportsbook API call, no form submission. Cookie banners were declined. Many operator pages returned 403 to the fetcher; those are listed at the end.

## Per operator

### DraftKings (`draftkings`)
- **Market/event deep link: UNVERIFIED.** An aggregator documents deep links: VERIFIED (aggregator), SharpAPI deeplinks, https://docs.sharpapi.io/api-reference/deeplinks. DraftKings publishes no format.
- **Single-leg prefill: UNVERIFIED.** The same aggregator says its link "preselects" the selection. There is no DraftKings-published format.
- **Multi-leg prefill: UNVERIFIED.** No document found.
- **Affiliate requirement: UNVERIFIED.** The official affiliates page (draftkings.com/affiliates) returned 403. Only third-party directories describe the program.
- **Geo: VERIFIED.** DK Network, https://dknetwork.draftkings.com/2026/06/17/draftkings-is-now-available-nationwide-in-the-usa-read-more-inside/. Sportsbook play is state by state, and you must be physically located in a legal state when you bet. 21+ (18+ in some jurisdictions).

### FanDuel (`fanduel`)
- **Market/event deep link: UNVERIFIED.** The Odds API's release note shows an example event link: VERIFIED (aggregator), https://the-odds-api.com/releases/deep-links.html. FanDuel does not document it.
- **Single-leg prefill: UNVERIFIED.** The same release note shows an `addToBetslip`-style example with market and selection ids. FanDuel does not document it, and it has not been verified end to end. It is not reproduced in code.
- **Multi-leg prefill: UNVERIFIED.** Only third-party product claims exist (for example, a "QuickSlip" feature on a media site).
- **Affiliate requirement: UNVERIFIED.** partners.fanduel.com was unreachable (SSL failure).
- **Geo: VERIFIED.** FanDuel promo terms, https://www.fanduel.com/research/fanduel-nba-promo-50-profit-boost-for-nba-games-on-october-20-2026. 21+ (18+ D.C., WY) and present in select states.

### BetMGM (`betmgm`)
- **Market/event deep link: UNVERIFIED.** Aggregator docs only (SharpAPI). The link is state-specific.
- **Single-leg prefill: UNVERIFIED.** Aggregator docs only.
- **Multi-leg prefill: UNVERIFIED.** No document found.
- **Affiliate requirement: VERIFIED that a program exists.** https://www.betmgmpartners.com/. The page says nothing about deep links or linking terms.
- **Geo: VERIFIED.** https://sports.betmgm.com/en/blog/discover-betmgm-across-america/ and https://www.betmgminc.com/what-we-do/where-we-operate/. Listed states only, and you must be located in one.

### Caesars (`williamhill_us`, `caesars`)
- **Market/event deep link: UNVERIFIED.** Aggregator docs only. The link is state-specific.
- **Single-leg prefill: UNVERIFIED.** OpticOdds documents a `deep_link` object, and its example shows an `addToBetslip`-style URL: VERIFIED (aggregator), https://developer.opticodds.com/reference/get_fixtures-odds. It is gated by OpticOdds permissions and is not Caesars-documented.
- **Multi-leg prefill: UNVERIFIED.** No document found.
- **Affiliate requirement: UNVERIFIED.** No official page found.
- **Geo: VERIFIED.** https://www.caesars.com/sportsbook-and-casino has a jurisdiction selector and states 21+. https://newsroom.caesars.com/Property-Fact-Sheets/Caesars-Sportsbook/ gives the jurisdiction counts.
- The Odds API lists `williamhill_us` as available on paid subscriptions only.

### BetRivers (`betrivers`)
- **Deep link / single-leg prefill: UNVERIFIED.** Aggregator docs only. The link is state-specific.
- **Multi-leg prefill: UNVERIFIED.**
- **Affiliate requirement: UNVERIFIED.**
- **Geo: VERIFIED.** https://www.betrivers.com/ has a state selector listing AZ, CO, DE, IL, IN, IA, LA, MD, MI, NJ, NY, OH, PA, VA, WV.

### Fanatics (`fanatics`)
- **Deep link / single-leg prefill: UNVERIFIED.** The aggregator lists no deep link and marks single-leg prefill as not supported.
- **Multi-leg prefill: UNVERIFIED.**
- **Affiliate requirement: UNVERIFIED.**
- **Geo: VERIFIED.** Fanatics investor release, 2026-09-02, https://investor.fanatics.com/news/news-details/2026/Fanatics-Introduces-Fanatics-Sports--Casino-One-App-for-Fans-to-Bet-Trade-or-Play-2026-VUe73ivE2v/default.aspx. 23 states plus Washington D.C.
- The Odds API lists Fanatics as paid-only.

### ESPN BET / theScore Bet (`espnbet`, region `us2`)
- **Deep link / single-leg prefill: UNVERIFIED.** The aggregator lists no deep link. The brand is now theScore Bet (The Odds API: "Formerly ESPN Bet").
- **Multi-leg prefill: UNVERIFIED.**
- **Affiliate requirement: UNVERIFIED.**
- **Geo: UNVERIFIED.** The official pages (thescore.bet, PENN investor relations, Business Wire) returned 403.

### betPARX (`betparx`, region `us2`)
- **Deep link / single-leg prefill: UNVERIFIED.** Aggregator docs only.
- **Multi-leg prefill: UNVERIFIED.**
- **Affiliate requirement: UNVERIFIED.** The site's "Work With Us" link goes nowhere (`#`).
- **Geo: partially VERIFIED.** https://www.betparx.com/ names MD, MI, NJ and PA, and states 21+. Live status in each state is UNVERIFIED.

## Aggregator link features

All VERIFIED (aggregator). None counts toward a capability.
- **The Odds API.** `includeLinks` returns "bookmaker links to events, markets, and betslips if available". `includeSids` returns source ids. Sources: https://the-odds-api.com/liveapi/guides/v4/ and https://the-odds-api.com/releases/deep-links.html, which says "The availability of links will depend on the bookmaker". Any extra credit cost for these parameters is undocumented, so it is UNVERIFIED. We have never requested them; that would be a paid call.
- **SharpAPI.** A per-book deeplink redirect with a state parameter. It does not mention parlays. https://docs.sharpapi.io/api-reference/deeplinks
- **OpticOdds.** A `deep_link` object, otherwise `null`. https://developer.opticodds.com/reference/get_fixtures-odds
- **SportsGameOdds.** States that a per-leg link "isn't guaranteed to prefill a full multi-leg slip". https://sportsgameodds.com/use-cases/parlay-builder-api

## The Odds API facts the NBA adapter relies on

Source: https://the-odds-api.com/liveapi/guides/v4/

| Fact | Source wording | Used in |
|---|---|---|
| Event-odds cost | "[number of unique markets returned] x [number of regions specified]" | `credits.mjs` `eventOddsCostFromResponse` |
| Empty response cost | "Responses with empty data do not count towards the usage quota" | same |
| `/odds` cost and bookmakers rule | markets × regions; "Every group of 10 bookmakers is the equivalent of 1 region"; `bookmakers` takes priority | `regionUnits` |
| `/events` cost | "does not count against the usage quota" | plan, call 0 |
| Headers | `x-requests-remaining`, `x-requests-used`, `x-requests-last` ("The usage cost of the last API call") | `recordCall` |
| Event-odds response shape | `id, sport_key, sport_title, commence_time, home_team, away_team, bookmakers[].{key,title,markets[].{key,last_update,outcomes[].{name,description,price,point}}}`. The documented example has `last_update` on markets only. | `parse.mjs`, fixtures |
| Player props per event | "Player props can be accessed one event at a time using the /events/{eventId}/odds endpoint" (https://the-odds-api.com/sports-odds-data/betting-markets.html) | `planNbaPropCapture` |
| NBA prop keys | `player_points`, `player_rebounds`, `player_assists`, `player_threes`, `player_points_rebounds_assists`, plus PR / PA / RA combos and `_alternate` variants (same page) | `contract.mjs` `NBA_PROP_FAMILIES` |

The guide states the 10-bookmakers rule for `/odds` but does not restate it for event-odds. The worst case therefore takes the larger of the two readings.

`espnbet` and `betparx` are in region `us2`, so `regions=us,us2` doubles the cost. Naming the eight books through `bookmakers` counts as one region-equivalent.

Committed evidence that matches the formula: `app/public/data/nba/market-probe-latest.json` (2026-06-10). Each one-market, one-region probe cost exactly 1 credit, and the empty `player_turnovers` probe cost 0. This is pinned in `credits.test.mjs`.

## Pages that could not be read (403, SSL error or empty)

- sportsbook.draftkings.com (where-is-available and landing pages)
- draftkings.com/affiliates
- partners.fanduel.com
- sportsbook.fanduel.com
- fanduel.com state and FAQ pages
- account.sportsbook.fanduel.com (login page only)
- support.fanduel.com
- thescore.bet
- PENN investor relations
- Business Wire (theScore release)

## What would change a row

A row moves off `MANUAL_ENTRY` only when all four of these are true:
1. The operator itself, or its partner program under a signed agreement, documents the link format.
2. The format is verified end to end against that provider, including geo and age controls. Sportsbook controls are never bypassed.
3. The Terms change that permits sportsbook links has landed.
4. A founder/legal sign-off is recorded.

Until then the code holds no template, and `handoffLinks` returns nothing.
