# Safest-Card + Daily-Refresh Mission — Final Report (June 24, 2026)

Money integrity held as the top invariant throughout. Canonical Bank Builder bankroll **$10,176.17** /
crown **$10,376.17** / record **12-2** / exposure **$0** were never moved — every product change is a
read-only reporting/selection layer, and settlement stays gated on the official seed-model path.

## Phase status

| Phase | Status | What shipped |
|---|---|---|
| **1 — Bank Builder rework** | ✅ DONE | Risk-tier framework + probability-fit cross-sport selector. (#595) |
| **2 — WC Specials daily refresh** | ✅ DONE | Team-model fallback + badge + daily refresh script. (#597) |
| **4 — Mr. Dub master ledger** | ✅ DONE | Authoritative cross-product ledger + render. (#596) |
| **5 — Daily product pipeline** | ✅ DONE | `daily-product-refresh.mjs` orchestration + consistency report. (this PR) |
| **6 — Staleness guards** | ✅ DONE | `lib/products/staleness.ts`, wired into the ledger. (#596) |
| **7 — Validation** | ✅ DONE | 1377 tests green, tsc + build clean, money frozen, this report. |
| **3 — Homer Nukes V2 (lanes)** | ⏳ REMAINING | Documented below — a product restructure deferred for safety/budget. |

## Phase 1 — Bank Builder probability-fit (highest priority) ✅

Replaced odds-fit with **probability-fit** optimization:
- `risk-tiers.ts`: Tier 1 (batter-hit, pitcher-K, double chance, DNB, team total O0.5), Tier 2 (BTTS,
  U3.5, O1.5, moneyline), Tier 3 (bare totals, exotics).
- `mlb-model-picks.ts`: cross-sport pool from the MLB board; probability anchored to the **de-vigged
  market** with the projection confirming the side (no fabrication).
- `selectSafestTargetFitCard`: among target-reaching distinct-game combos, maximizes **P(all legs land)**,
  tie-broken by safest tier / smallest overshoot / fewer legs; 2→3-leg escalation; cross-sport allowed.
- "Why this card" discloses estimated hit probability + market tier + confidence.
- Live: Lane A Step 5 cross-sport (+186 → $10,014); Lane B Step 3 MLB Tier-1 batter-hits ($1,400).

## Phase 2 — WC Specials daily refresh ✅

Fallback hierarchy **player props → team props**: when soccer player props are absent (Odds API exposes
none for the WC), it builds 5 cards from team models instead of 0, badged "Player props unavailable —
using team models". June 24 = 5 team-model cards; June 23 archived to history.

## Phases 4 + 6 — Master ledger + staleness ✅

Mr. Dub master ledger aggregates every product's settled history (record / ROI / P&L / exposure / overall
totals). Stale products (artifact older than the current slate) are flagged and contribute **no exposure**.
Explicitly separate from the canonical seed-model bankroll.

## Phase 5 — Daily pipeline ✅

`daily-product-refresh.mjs` runs: settle-check (fail-closed) → generate BB/Moonshot → refresh WC Specials →
rebuild master ledger → consistency checks → `daily-refresh-report.json`. All consistency checks pass:
canonical money frozen, open exposure = Σ active-lane seeds, available = active − exposure, no stale
product carries exposure.

## Phase 3 — Homer Nukes V2 (REMAINING)

Not implemented this pass (a product restructure that warrants its own careful increment). Plan:
- New `homer-nukes-active.json` with `laneA` / `laneB`, each a 3-leg $10 HR parlay (mirror the BB lane
  shape), independent records.
- A Homer Nukes settlement path (grade HR legs from MLB box scores — reuse `lib/mlb/mlb-settlement.ts`).
- Wire both lanes into the master ledger (the ledger already has a `homer-nukes` slot and reads
  exposure/date from the artifact, so V2 drops in).
- Tests: lane independence, settlement, ledger aggregation.

## Validation

- **1377 tests green**, `tsc --noEmit` clean, `npm run build` clean.
- Canonical money frozen ($10,176.17 / $10,376.17 / 12-2 / $0) across every change.
- Bank Builder: Lane A Step 5 + Lane B Step 3 generated (safest cross-sport). WC Specials: June 24 live (5
  cards). Mr. Dub master ledger: aggregated metrics visible. No bankroll/crown drift.

## Production readiness

**8.5 / 10.** Bank Builder uses the safest available markets, WC Specials refresh daily, and Mr. Dub is the
authoritative ledger. Remaining for 10/10: Homer Nukes V2 lanes (Phase 3); a cross-sport settlement
extension so cross-sport BB cards settle (today they fail closed in the WC-only settle path); and a
soccer player-prop data source to retire the team-model fallback.
