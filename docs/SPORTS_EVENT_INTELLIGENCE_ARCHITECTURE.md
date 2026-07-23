# Sports Event-Intelligence Architecture

_Design for a SEPARATE engine that handles sports EVENT/prediction contracts (Kalshi/Polymarket-style). It is not the
per-game prop simulator and must not reuse it. Read-only. No trading, no wallet, no order placement. No modeling
shipped — this is the architecture + the honest "NOT YET MODELED" default._

Current state per [docs/SPORTS_EVENT_MARKET_CAPABILITY_AUDIT.md](SPORTS_EVENT_MARKET_CAPABILITY_AUDIT.md):
**UNSUPPORTED** — nothing existed. This doc + the typed contracts under `app/src/lib/event-markets/` are the
foundation, not a live product.

## Why the prop simulator cannot be reused

| Prop simulator | Event contracts |
|---|---|
| Resolves same-day from an official **box score** | Resolves over weeks from **news + platform rules** |
| Binary over/under on a countable stat | **Multi-outcome**, often with a residual "field" |
| Feature = pregame player/team state | "Feature" = an **evidence timeline** with source reliability |
| Leakage rule = `capturedAt < first pitch` | Leakage rule = evidence/estimate must precede resolution + never use post-resolution info |

They share only the **discipline**: timestamped provenance, a market baseline, and no claim beyond what the data
supports.

## Domain model (`app/src/lib/event-markets/types.ts`)

- **EventMarket** — `marketId, platform, question, category, sport, league, entities[], outcomes[], opensAt, closesAt,
  resolutionDeadline, resolutionRules, resolutionSource, status, providerUrl`.
- **MarketSnapshot** — `marketId, capturedAt, outcomePrices{}, bidAsk?, volume, liquidity, source`. Point-in-time,
  stamped with when *we* captured it.
- **EvidenceItem** — `evidenceId, marketId, source, sourceUrl, publishedAt, capturedAt, reliabilityTier, entities[],
  claim, directionByOutcome{}, confidence, expiresAt`. `publishedAt` is required to use it as *timed* evidence;
  `directionByOutcome` is a signed lean in [-1,1], never a probability.
- **OutcomeEstimate** — `marketId, generatedAt, outcome, estimatedProbability(null until modeled), marketProbability,
  differencePts(neutral, never "edge"), evidenceCompleteness, forecastConfidence, contractConfidence, modelability,
  estimateStatus, explanationVersion`.
- **ResolutionRecord** — `marketId, resolvedOutcome, resolvedAt, source, ruleVersion`.

## Modelability gate (`modelability-contract.ts`)

Before any independent probability, a contract is scored on ten dimensions (outcome/rule clarity, evidence + structured
data, historical comparables, liquidity, time-to-resolution, private-information resistance, source diversity, outcome
exhaustiveness) and classified **HIGH / MEDIUM / LOW / INFORMATION_ONLY / UNSUPPORTED**. Only HIGH/MEDIUM may ever
carry an independent probability. Insider-driven contracts (next-team, coach-firing, retirement) default to
INFORMATION_ONLY — the honest product there is market data + evidence + rules, never a number.

## Product layers (the 10 the prototype demonstrates)

1. **Live market probabilities** — from `MarketSnapshot.outcomePrices` (the platform's own implied prob).
2. **Evidence timeline** — `EvidenceItem[]` ordered by `publishedAt`, tagged usable/unusable.
3. **Source reliability** — `reliabilityTier` (official → tier1_reporter → reputable_outlet → aggregator →
   social_unverified). Social/unverified never counts toward completeness.
4. **Contract-rule explanation** — `resolutionRules` + `resolutionSource` + `resolutionDeadline`, verbatim.
5. **Scenario tree** — per outcome, the supporting vs opposing evidence.
6. **Outcome-by-outcome reasoning** — the direction + confidence of each evidence item per outcome.
7. **Forecast confidence** — null until modeled (never faked).
8. **Contract confidence** — how well we understand the *rules/resolution* (independent of the outcome).
9. **Probability-change history** — `updateHistory` (snapshots + evidence, by `capturedAt`).
10. **Related markets** — same entities/tournament (future; not in the fixture prototype).

The assembler `preview-assembler.ts` produces this view-model. Its first useful state is market information + evidence
organization + rules + modelability — with `estimateStatus: "NOT_YET_MODELED"` and `estimatedProbability: null`. It
**never inserts an arbitrary percentage.**

## Data flow

```
provider adapter (read-only)  →  EventMarket + MarketSnapshot        ┐
news/press ingestion (future) →  EvidenceItem (timestamped, tiered)  ┼→ preview-assembler → internal view-model
modelability-contract         →  classification + may-show-prob      ┘        (estimate = NOT YET MODELED)
official transaction log       →  ResolutionRecord (settles it later)
```

## Internal-only

The prototype route is internal (fixture-backed) and must be pruned from the public export — a future thin display
route belongs under a path the `prune-internal-routes.mjs` sweep removes (extend `INTERNAL_ROUTES` before adding it).
Nothing here touches money, Bank Builder, Moonshot, or the public product.
