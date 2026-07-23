# Probability Explainability Standard

_What an independent probability MUST carry before it can be shown to anyone — for game props and for event contracts
alike. If a probability cannot meet this bar, it is not shown; the honest state is `NOT YET MODELED` (event markets)
or a market-context-only read (props). No "edge"/"best bet" language. No money._

This is a gate, not a feature. It applies the moment GameTimePicks would surface its OWN number next to a market
number — which today it does not (public props are market-comparison + simulation reads; event markets are
INFORMATION_ONLY). It exists so that when a validated model does exist, its output is explainable and leakage-safe by
construction.

## Required fields on every explainable probability

| Field | Meaning |
|---|---|
| `generatedAt` | when the estimate was produced |
| `inputSnapshotTime` | the timestamp of the inputs it used (must be **before** the event/resolution) |
| `modelVersion` | the exact model + version that produced it |
| `marketProbability` | the market's implied probability at `inputSnapshotTime` |
| `independentProbability` | our estimate (or `null` if NOT YET MODELED) |
| `probabilityDifference` | neutral difference in points — **never** labelled edge/value |
| `evidenceUsed` | the timestamped inputs/evidence that fed it (ids + `publishedAt`/`capturedAt`) |
| `evidenceExcluded` | relevant inputs deliberately left out, and why |
| `strongestSupportingFactors` | the top few inputs pushing the estimate up |
| `strongestOpposingFactors` | the top few pushing it down |
| `unresolvedQuestions` | what we still don't know |
| `sensitivity` | how the estimate moves under plausible input changes (scenario deltas) |
| `forecastConfidence` | confidence in the estimate itself (requires an evidence-completeness metric) |
| `contractConfidence` | confidence we understand the market's own resolution rules |
| `updateHistory` | every prior value + when it changed (versioned, never silently overwritten) |
| `knownLimitations` | the honest caveats (small sample, demoted market, etc.) |

## Hard rules

1. **No probability without timestamped inputs.** Every input carries a time, and `inputSnapshotTime <` the event /
   resolution. (Mirrors the research eligibility gate: `capturedAt < eventStartTime`.)
2. **No explanation generated from post-resolution information.** An explanation may only cite evidence with
   `publishedAt` before the outcome was known.
3. **No source without `publishedAt`/`capturedAt`.** An untimed claim is not usable as evidence.
4. **No confidence without an evidence-completeness metric.** `forecastConfidence` requires `evidenceCompleteness`.
5. **No "edge" / "best bet" / "value" / "lock" / "guaranteed" / "beat the market" terminology by default.** Differences
   are neutral magnitudes.
6. **No silent probability overwrite.** Every change is versioned into `updateHistory`.
7. **All changes versioned** via `explanationVersion` + `modelVersion`.
8. **Modelability gate first.** Only a HIGH/MEDIUM modelability classification
   ([modelability-contract.ts](../app/src/lib/event-markets/modelability-contract.ts)) may carry an
   `independentProbability`; everything else stays `NOT YET MODELED`.

## Relationship to what exists today

- **MLB props**: the public modeled markets are DEMOTED (they lose to the market on Brier/logloss). Under this standard
  their `independentProbability` may be shown only as a market-context read with `knownLimitations` stating they are
  not market-proven — never as an advantage. The research engine that could change that stays BLOCKED (gate + founder).
- **Event contracts**: currently INFORMATION_ONLY/UNSUPPORTED → `independentProbability: null`, `NOT YET MODELED`.
- **The record families never mix** (see `record-families.ts`): a public-sim number, a research number, and the
  official paper record are separate and separately explained.
