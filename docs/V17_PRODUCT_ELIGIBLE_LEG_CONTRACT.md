# Product Eligible Leg — contract v1 (v1.7 Phase C)

**Owner:** `app/src/lib/products/eligible-leg/contract.mjs` · **Normalizers:** `normalize-{mlb,nfl,ufc,epl}.mjs`
**Builder:** `app/scripts/products/build-product-eligible-legs.mjs --date D --now ISO [--write]`
**Artifacts:** `data/internal/products/eligible-legs/<date>.json` (+ `.manifest.json`, internal) ·
`app/public/data/products/availability/<date>.json` + `latest.json` (public-safe counts and plain reasons)
**Tests:** `contract.test.mjs` (14 mutation probes)

## 1. Why one contract

Bank Builder and Moonshot selected from a pool that was MLB-shaped by accident, with a `modelProbability`
field that was the de-vigged market price wearing a model's name. This contract makes the product-facing
leg a typed record whose eligibility is **derived**, whose rejections are **explainable**, and whose sport
gate is the **capability registry read at both the build and the read boundary**.

## 2. Schema (v1)

| Field | Rule |
|---|---|
| `schemaVersion` | 1 |
| `legId` | `${sport}:${eventId}:${marketKey}:${side}[:${line}]` |
| `sport` | lower-case registry key; unknown → `SPORT_UNKNOWN` |
| `eventId` | the sport's canonical event id (MLB `gamePk` via the StatsAPI schedule bridge; NFL `nfl-<espn id>`; EPL `soccer:epl:<slug>:<kick>`; UFC `boutId`) |
| `eventStartUtc` | ISO; unparseable → `MISSING_IDENTITY` (a leg with no start cannot be time-locked) |
| `entityIds[]` | teams / players / fighters the leg depends on |
| `marketFamily` / `marketKey` / `side` / `line` | owner's words, verbatim; `line` is null only when not applicable — never a string, never a default |
| `forecastOwner` / `forecastId` | owner artifact family and version; missing → `MISSING_OWNER_REF` |
| `forecastClass` | `VALIDATED_MODEL` · `EXPERIMENTAL_MODEL` · `MARKET_IMPLIED_NO_FORECAST` · `PRIVATE_OR_SHADOW` |
| `modelStatus` | owner's status word; any of REJECTED / STOP / PAUSED / HOLDING / PRIVATE / SHADOW / HISTORICAL_ONLY / UNSUPPORTED → `MODEL_STATUS_BLOCKED` |
| `probability` | **only** from a `VALIDATED_MODEL` owner, and only if 0 < p < 1 |
| `marketImpliedProbability` | the de-vigged price when a price exists |
| `oddsForSide` | `{american, bookmaker, capturedAt, receipt}` — all four or `PRICE_UNAVAILABLE`; captured after first pitch → `PRICE_CAPTURED_AFTER_START`; captured after the as-of instant → `PRICE_CAPTURED_AFTER_AS_OF`; older than 12 h → `STALE`; outside −650..+400 → `PRICE_OUT_OF_RANGE` |
| `publishedAt` / `asOf` | owner's generatedAt / the publication instant the leg was evaluated at |
| `productEligible` | **derived**: no refusing reason code |
| `eligibilityReasonCodes[]` | every reason, refusing and informational |
| `correlationKeys[]` | `sport:` `event:` `entity:` `family:` `start:<30-min bucket>` — only what the leg names |
| `sourceReceiptRefs[]` | artifact paths read |

## 3. Rules that have a probe

1. `productEligible` is derived, never set by a normalizer; the read-time guard re-derives it.
2. Missing data is null. A missing price refuses; it is not a 0% leg. A `"8.5"` line is not a line.
3. No probability unless a validated owner defines it; an experimental owner's number is not carried.
4. No synthesized odds. The price must carry bookmaker, capture time and receipt.
5. The side is never transformed.
6. Every leg links to its owner and its source artifact.
7. Every rejection is a reason code; public copy maps codes to plain words and never echoes them.
8. The read-time guard (`guardLegs`) refuses a leg an artifact calls eligible when the registry no longer
   agrees, a schema mismatch, and a leg whose event has started at the caller's clock — the NBA lesson.

## 4. Product policy on market-priced legs — founder gate F1 (open)

`MARKET_PRICED_LEG_POLICY = ADMITTED_PENDING_FOUNDER_DECISION`. The live products have only ever placed
market-priced legs; refusing them outright empties both products on the contract's first day. Until the
founder decides, a `MARKET_IMPLIED_NO_FORECAST` leg from a registry-eligible sport is admitted with the
informational code `MARKET_PRICED_NO_FORECAST` on the leg, the manifest reports `marketPricedNoForecastCount`,
and the public availability artifact reports `marketPricedOnly: true` for the sport. The alternative —
`REFUSED` — is one constant away and every consumer already reads the flag.

## 5. Manifest — "owner produced nothing" vs "nothing qualified"

Per sport and day: `registryState`, `registryPermitsProductLegs`, `rawForecastCount`, `publicForecastCount`,
`eventCount`, `marketFamilyCount`, `eligibleLegCount`, `rejectedLegCount`, `rejectedByReason{}`, `staleCount`,
`noPriceCount`, `marketPricedNoForecastCount`, `ownerNote`, `sourceReceiptRefs[]`.

## 6. Time-lock

`--now` is the publication instant. MLB prices are per-game `capturedAt`; NFL forecasts are the newest dated
file generated ≤ now and NFL prices the newest `capture-*.json` ≤ now; UFC and EPL have only file-level
capture times (a coverage limit the manifest reports as `STALE` / `PRICE_CAPTURED_AFTER_AS_OF`). A replay
therefore cannot see a price the original publication could not.

## 7. Consumers

Phase E selectors read `data/internal/products/eligible-legs/<date>.json` through `guardLegs`. Ask GameTime
does **not** read this artifact in v1.7 (its `getParlayCandidates` stays MLB-only on the optimizer owner per
the v1.6.1 boundary); a later bounded change may point it here once the selectors are public.
