# Event-Market Research Validation Plan

_How a sports event-market forecast would EVENTUALLY be validated before any independent probability is shown. Nothing
here is live: no provider is INTEGRATION_READY (both LEGAL_REVIEW_REQUIRED — see
[EVENT_MARKET_PROVIDER_AUDIT.md](EVENT_MARKET_PROVIDER_AUDIT.md)), so there is no forecast to validate yet. This is the
validation contract, mirroring the discipline of the MLB research gate. Profit is NEVER the primary metric._

## The required historical archive (per market)

Before any event-market model may be called predictive, we must have accumulated, leakage-safe:

- market definition + **rules version** (contract text can change; version it);
- the full **outcome set** (with a residual "other" when the platform's set isn't exhaustive);
- **price snapshots over time** (each stamped with our `capturedAt`);
- **liquidity + spread** at each snapshot;
- the **evidence available at each forecast timestamp** (EvidenceItems with `publishedAt` strictly before the forecast);
- the **model estimate version** at each forecast;
- the **final resolution** + `resolvedAt`;
- the **resolution source** + `ruleVersion` used;
- **time-to-resolution** at each forecast;
- **category** + **rule ambiguity** + **private-information susceptibility** (from the modelability contract).

Leakage rule (mirrors MLB): a forecast may only use evidence with `publishedAt` before `generatedAt`, and
`generatedAt` before resolution. Post-resolution information never enters a forecast row.

## Evaluation metrics

- **multiclass Brier score** (primary);
- **log loss** (primary);
- **calibration** (reliability curve across probability bins);
- **market baseline** — the platform's own implied probability at the same `capturedAt`, de-vig'd (the model must beat
  THIS out-of-sample before anything is called predictive, exactly like the MLB de-vig baseline);
- performance **by category** (award vs qualification vs player_movement …);
- performance **by time-to-resolution** (near-close vs far-out);
- performance **by liquidity band** (thin markets carry weaker market signal);
- **probability-revision quality** after new evidence (did updates move toward the truth?);
- **abstention quality** on low-modelability markets — a good system says NOT YET MODELED on INFORMATION_ONLY
  contracts and is scored on *not* forecasting them, not on forcing a number.

## Gate (before any independent probability is public)

A category graduates from INFORMATION_ONLY only when, on a chronological out-of-sample test set, its model:
1. beats the de-vig market baseline on Brier AND log loss;
2. is calibrated (no systematic over/under-confidence);
3. has enough resolved comparables per category to bound uncertainty;
4. abstains correctly on low-modelability markets;
5. carries a full explainability record ([PROBABILITY_EXPLAINABILITY_STANDARD.md](PROBABILITY_EXPLAINABILITY_STANDARD.md)).

Until then every `OutcomeEstimate` stays `NOT_YET_MODELED` with `estimatedProbability: null`.

## Current status

`NOT_READY` — no live market data is legally cleared to ingest, so the archive is empty and there is nothing to
validate. The foundation exists (schemas, modelability, discovery, evidence store, source reliability, disabled
adapters); the first step is a founder-approved ToS review for Polymarket's public read-only APIs, then fixture→live
snapshot capture, then archive accumulation, then this evaluation. No profit metric is used at any stage.
