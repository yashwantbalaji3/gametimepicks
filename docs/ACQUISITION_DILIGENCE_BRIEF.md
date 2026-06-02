# Acquisition Diligence Brief

Plain-English, evidence-backed summary for a prospective buyer or partner.
**No performance or hit-rate claims are made.** Pair with
[`KNOWN_LIMITATIONS_AND_RISKS.md`](./KNOWN_LIMITATIONS_AND_RISKS.md).

## Company / product summary

GameTime Picks is an **educational sports-statistics web product** that
publishes NBA + MLB player-prop projections and model parlays, tracks every
published pick against official box scores, and presents a transparent
public track record. It is honesty-first: it never fabricates data, never
makes guaranteed-outcome claims, and shows schedule-only information for
sports it does not model.

- **Live:** https://gametimepicks.yashwantbalaji.com (Vercel static export).
- **Stack:** Next.js (static export) frontend + Python data pipeline +
  GitHub Actions automation + Vercel hosting.

## Technical asset summary

- **Frontend:** mature, componentized Next.js app; gold/vault design system;
  mobile-first; ~590 passing lib unit tests; type-checked; static-exportable.
- **Pipeline:** projection generation (NBA/MLB), a correlation-aware parlay
  optimizer with public risk sections, idempotent settlement/grading against
  free public APIs, and an observational learning-audit loop.
- **Automation:** scheduled settlement (free), morning projections
  (credit-guarded paid Odds API), props auto-refresh.
- **Documentation:** this canonical `/docs` system + a full PR ledger
  (`release/PR_LEDGER.csv`, #1 → current) for traceability.

## Operational maturity

- Daily automated settlement + projection cadence with explicit merge gates
  (real `Vercel – gametimepicks` green + CLEAN).
- Strong guardrails: no fabrication, public-era boundary, no same-slate
  leakage, paper-only Bank Builder, schedule-only unsupported sports.

## Model maturity — **stated honestly**

- The model produces projections + an "edge"/"confidence" signal, but the
  2026-06-02 calibration audit shows **those signals are not predictive of
  outcomes** (edge is anti-predictive). The product therefore makes **no**
  edge or hit-rate claim and currently leans on **discipline + transparent
  tracking**, not demonstrated edge.
- The realistic path to a predictive product is a **projection→probability
  recalibration** project (scoped, not yet started).

## Data / deployment maturity

- **Data:** generated JSON artifacts in-repo; attributed schedule snapshots;
  free settlement feeds + one paid odds dependency.
- **Deployment:** Vercel static export; reproducible; no server runtime to
  operate.

## What IS validated

- Honest, idempotent settlement against official box scores (0 pending /
  fabricated on June-1; verifiable).
- Transparent public-era results with correct May 25/26 exclusion.
- Schedule-only coverage with real source attribution.
- A reproducible offline calibration + shadow-audit toolchain.

## What is NOT validated

- Any predictive edge over the market; any target hit rate.
- Long-horizon results; third-party model audit; real-money operations.

## Risk register

See [`KNOWN_LIMITATIONS_AND_RISKS.md`](./KNOWN_LIMITATIONS_AND_RISKS.md)
(model, coverage, operational, compliance, diligence caveats).

## Buyer diligence checklist

1. Read `PROJECT_OVERVIEW`, `ARCHITECTURE`, `DATA_PIPELINES`,
   `MODEL_AND_OPTIMIZER`.
2. Review `MODEL_AUDITS_INDEX` + run
   `app/scripts/model-calibration-analysis.mjs` to reproduce the calibration
   finding.
3. Review `release/PR_LEDGER.csv` for full change history.
4. Verify live state: `git rev-parse HEAD`, `gh run list`, `/results`.
5. Confirm guardrails hold (no banned copy, no unsupported-sport picks,
   paper-only Bank Builder) via `PRODUCT_REQUIREMENTS` +
   `SPORTS_COVERAGE_POLICY`.
6. Read `KNOWN_LIMITATIONS_AND_RISKS` in full before assigning model value.

*No statement in this brief should be read as a performance guarantee. The
public-era hit rate is weak and tracked openly.*
