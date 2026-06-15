# UFC 250 Fight-Night — Expanded model-only projections + high-risk/longshot cards (June 14, 7:40 PM ET)

**Baseline SHA:** 9a22118 (incl. auto-cron). Bank Builder preserved: $10,376.17 / 5–0 / completed (untouched).
**Event:** UFC Freedom 250: Topuria vs. Gaethje — 2026-06-15T00:00Z (June 14 8 PM ET), 7 fights, ESPN MMA card.

## Paid odds refresh (Phase 2) — fail-closed, no degrade
- Schedule refresh (free ESPN MMA): SUCCESS, same 7-fight card.
- Odds refresh (The Odds API MMA, paid): **0 bouts** again — no markets posted at fetch time, 0 credits. `build_odds` is hardcoded to `markets="h2h"` (no totals/method/distance ingestion exists). Reverted to the stable Jun-9 dataset; UFC odds dir unchanged.
- **Conclusion:** expanded betting markets have NO sportsbook odds. Per the brief, they are delivered as **model-only** projections (real fighter stats), clearly labeled, never priced.

## What shipped
### 1. Expanded model-only fight projections (the main task)
New pipeline `pipeline/ufc/build_expanded_projections.py` → `expanded-projections-latest.json`. For each fight, derived from REAL fighter career data (`fighters-latest.json`: KO/sub/decision win splits, finish rate), win-prob-weighted:
- **Method of victory**: P(KO/TKO), P(submission), P(decision) + per-fighter method lean + topMethod.
- **Goes the distance**: yes/no probability from finish/decision blend.
- **Total rounds**: projected rounds + O/U reference line (2.5 for 3-round, 4.5 for the 5-round main event) + lean.
- **Moneyline**: the existing odds-backed leg.
- Every expanded market: `marketState: "model-only"`, `parlayEligible: false`. Fights with thin career data (1 of 7: Ruffy/Chandler) show an honest "limited data" state — no invented projection.
- Result: 6/7 fights with full expanded projections (e.g., Lewis 69% KO, Pereira 60% KO, Nickal 42% submission, Topuria 65% KO), 1 withheld.

### 2. Fight-by-fight expandable cards
`components/ufc/expanded-fight-cards.tsx` (client accordion). On `/ufc` (new **Expanded Projections** tab) and `/today` (UFC lead "tap a fight" dropdowns). Each row: collapsed moneyline pick; expanded → moneyline (ODDS-BACKED badge) + goes-distance / total-rounds / method (MODEL-ONLY · NOT PARLAY ELIGIBLE badges) + rationale.

### 3. Markets tab — now three states
Moneyline = ODDS-BACKED (parlay eligible); total-rounds / distance / method = MODEL-ONLY (insight only, not priced); falls to UNAVAILABLE if no model. No fabricated odds.

### 4. Suggested cards — risk lanes incl. high-risk + longshot
`build_v1` extended: Conservative (2-leg, 0.68), Balanced (2-leg, 0.63), **High-risk** (4-leg, 0.41), **Longshot** (5-leg, 0.30) — all REAL model-favorite moneylines. The model mirrors the market (no edge), so the risk is **leg count**, not underdog edge — labeled honestly, never a fabricated edge. No model-only props in priced cards. `/picks` risk-tier mapping fixed so High-risk → High.

### 5. Methodology
`/methodology` UFC section updated: expanded markets are model-only projections (from real fighter history) for insight, not parlay eligible.

## Integrity / preservation
- Bank Builder untouched (completed). No fabricated odds/markets/props. Expanded markets are model-only and never priced. Suggested cards use only real moneylines. No banned copy.
- 874 tests pass (+3 expanded/cards integrity tests), tsc + build clean, verified in-browser (accordion badges, /today dropdowns, /picks high-risk/longshot, no console errors, no overflow).

## Honest limitations / next step
- No sportsbook odds for totals/method/distance (feed is h2h-only) — these stay model-only until a real prop-odds feed connects; then the Markets tab + cards can promote them to odds-backed/parlay-eligible.
- The moneyline model shows no edge on this card; high-risk/longshot cards are high-variance plays, not edge plays — labeled as such.
- One fight (Ruffy/Chandler) has thin fighter data → expanded projection withheld.
