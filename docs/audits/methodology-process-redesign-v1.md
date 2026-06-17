# Audit — Methodology & Process Redesign v1

_Branch `methodology-process-redesign-v1` off main `3e2d3a8`. PR: "Methodology and process framework v1"._

## Objective
Codify a comprehensive, leakage-safe, sport-specific prediction methodology as the system's
**canonical methodology/process layer** — BEFORE any future slate generation. This PR builds the
docs, TS schema/contracts, sport registries, validation rules, confidence/risk scoring, the Bank
Builder V2 methodology writeup, and the public methodology UI section. It does **not** generate a
slate or launch a Bank Builder run.

## Non-negotiables honored
- **No June 17 slate generated** in this PR. No prediction/odds/data files written for any date.
- **No Bank Builder run launched.** Run #1 / #2 / #3 state untouched.
- **No fabrication.** Every defined feature carries an honest `ImplementationStatus`
  (implemented · partial · planned · not_available); unbuilt feeds are stubbed, never invented.
- **No banned copy** (lock, safe, safest, guaranteed, guarantee, sure thing, free money, risk-free,
  can't miss) in docs or UI.
- **History preserved** — Run #1 ($100→$10,376.17, 5–0, completed), Run #2 (settled/closed, 0/2),
  Run #3 (evaluating/not launched), World Cup June 16 settlement, UFC Freedom 250, 0-AB void rule,
  suspended/no-action rule — all unchanged.

## What this PR adds (methodology/process only)
- **Docs** — `docs/methodology/*` (overview, prediction-time & leakage rules, confidence & risk,
  data quality/freshness/missingness, market-aware modeling, per-sport MLB/NBA/UFC/World Cup,
  Bank Builder V2) + `docs/runbooks/*` (daily prediction, daily settlement, Bank Builder launch,
  data-quality gate).
- **TS schema/contracts** — `app/src/lib/methodology/*` (types, global-rules, validation,
  data-quality, confidence, risk, per-sport registries, sport-feature-groups, index) + tests.
- **UI** — a "Prediction framework (v1)" section on `/methodology` (additive; existing sections and
  `methodology-content.test.mjs` preserved).

## Verification (recorded at PR time)
`npx tsc --noEmit` · `npx tsx --test $(find src -name '*.test.mjs')` · `npm run build` · copy audit ·
secret audit · browser QA. Results captured in the PR description.

## Next task (separate PR)
Generate the next dated slate using these methodology gates (leakage validation, freshness,
confidence/risk, survival), then wire the registries into the pipeline output. Not done here.
