# UFC End-to-End FreeSim Experience — Final (2026-07-10)

Consolidates the gap audit, prediction-table + simulation-animation implementation, and the
method/round/distance limitations for UFC 329. **Market-implied predictions live; model picks still gated.**

## What existed before → what shipped

| target | before | now |
|---|---|---|
| Fight-night hero | ✅ octagon hero | ✅ |
| Animated simulation graphic | ❌ (static bars only) | ✅ **`UfcSimulationAnimation`** — octagon scan + probability bars that animate 50/50 → de-vigged, market pulse, locked prop chips |
| Whole-card prediction summary | ❌ (only per-fight report cards) | ✅ **`UfcPredictionTable`** — every fight, honest columns |
| Expandable FreeSim report per fight | ✅ | ✅ (table rows expand to the shell) |
| Advanced odds board | ✅ | ✅ (secondary, below sims) |
| Provider-needed prop roadmap | ✅ chips | ✅ + explained in the table |
| Model validation/gating | ✅ | ✅ (0/150 strip + gate panel) |

## Prediction table (`lib/ufc/prediction-table.ts` + `components/ufc/ufc-prediction-table.tsx`)

One row per scheduled fight (all 14). Columns: **Fight · Moneyline prediction · Win probability · Odds ·
Rounds · Goes distance · Method · Status**, plus a Details expansion to the full `MultiSportReportShell`.

Honest per-column behavior:
- **Moneyline** — MARKET-IMPLIED where two-sided odds exist ("Market-implied lean: X" at ≥58% de-vig, else
  "No clear market lean"); **"Odds pending"** otherwise. Never a model pick.
- **Win probability** — de-vigged two-sided split for odds-backed fights; "—" when pending.
- **Odds** — real American prices for both sides (odds-backed only).
- **Rounds / Goes distance / Method** — **"Provider needed"** locks. Never a fabricated number.
- **Status** — "Odds-backed" or "Odds pending".

Join is by normalized fighter-name set (ESPN schedule and Odds-API projections use different boutId
date-prefixes). A permanent note explains *why* columns are locked.

## Method / round / distance limitations

The connected feed (The Odds API MMA) is **h2h (moneyline) only**, and the internal model is **unvalidated**
(`cleanGradedRows 0/150`). So method / round / distance are **provider-needed** in the table and the
animation — shown as locks, never as public predictions, never as model numbers. (Model-only estimates for
these live in the Expanded tab and are already hidden while unvalidated, per the prior pass.)

## Simulation animation (`components/ufc/ufc-simulation-animation.tsx`)

Original CSS/SVG only. An octagon with a scan sweep, fighter-initial corners, and probability bars that
animate from 50/50 to the de-vigged market split; a locked prop row; and the honest caption *"Real moneyline
odds → no-vig probabilities. Not an independent 10,000-run UFC model. Paper-only."* Reduced-motion rests to
the final state. No images, no logos, no fake outcome, no "winner".

## `/ufc` overview order
Octagon hero → status strip (0/150) → **prediction table** → featured fight (**animation** + full report) →
fight-card simulations → suggested-cards gate → **Advanced odds board** (secondary). The raw odds table is
no longer the main event.

## Guardrails
No money/formula/settlement change (md5 `affe6b21…`, 19-14, $0). No fake fights/odds/props/stats/photos. No
model pick/edge/EV/best-bet public. No external images. Model picks gated (0/150). UFC creates no exposure.
