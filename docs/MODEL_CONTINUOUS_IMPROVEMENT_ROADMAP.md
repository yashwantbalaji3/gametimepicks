# Model Continuous Improvement — Roadmap

**Standing policy:** historical sportsbook-beating optimization is SUSPENDED by a preregistered stopping rule (w=0 three times). Improvement means better inputs, provenance, calibration *diagnostics* and honesty now — and any parameter change only under a new forward-only protocol.

## Allowed every day (no approval needed)
Freshness/coverage completeness · identity + native provenance (PROVEN_STAMPED growth) · settlement quality and gap-0 accounting · calibration diagnostics without parameter changes · per-market + disagreement-bucket tracking · drift/missingness/timing monitors · leakage-safe input completeness · uncertainty presentation · reliability/alerting.

## Not allowed without a new protocol
Weight changes after a bad day · retuning on the frozen corpus · model selection on recent outcomes · edge claims from short windows · features without provable pregame availability · reactivating batter_total_bases.

## The forward-only protocol (recommended, not implemented)
Preregister (immutable doc, dated) → forward collection start (earliest 2026-08-15, after ≥14 natively-stamped settled slates) → candidate frozen before outcomes → primary metric: Brier vs de-vigged market on identical PROVEN_STAMPED rows → per-market + aggregate stopping rules → minimum n≈5,000 decisive over ≥30 calendar days → no peeking → independent test window → promotion/rollback gates → founder checkpoint. Prerequisite that now exists: native per-row provenance, which the old corpus never had.

## Ranked opportunities

| Rank | Opportunity | Status |
|---|---|---|
| 1 | Pregame lineup availability (archived lineup feed, timestamp-proven) | buildable — capture infra exists dormant; prove `capturedAt < firstPitch` from day one |
| 2 | Market-movement features (multiple stamped captures/day already flowing) | buildable — leakage-safe by construction now; vendor-rights check |
| 3 | Starting pitcher workload/rest (StatsAPI, free) | buildable |
| 4 | Hierarchical per-market calibration | scientifically premature until the forward corpus exists |
| 5 | Simulation variance redesign at the simulator level (k 1.85–3.81 heterogeneity) | premature — only under the new protocol |
| 6 | Weather/park/umpire | vendor/archive-quality blocked |
| 7 | Provider redundancy | reliability value only; no predictive claim |
