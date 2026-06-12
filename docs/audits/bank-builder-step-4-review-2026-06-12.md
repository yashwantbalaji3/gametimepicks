# Bank Builder Step 4 review — 2026-06-12 (post props-refresh)

State: bankroll **$1,423.64** · Step 4/5 · record 3–0 · floor **$3,500** (needs combined
≥ 2.459× ≈ **+146** at the full stake). Reviewed per the owner's expanded openness:
WC-only, MLB-only, mixed WC+MLB, higher-odds allowed if strong.

## Candidates evaluated (real June-12 artifacts)

**World Cup-only** — 5 legs pass the per-leg gates (model ≥55% AND market ≥50%):
Canada-or-Draw −550 (77/79), Canada-or-Bosnia −340 (73/73), Under 2.5 CAN-BIH −145
(57/57), US-or-Draw −390 (74/75), US-or-Paraguay −290 (73/70). Best cross-match pair
(Under 2.5 × US-or-Paraguay) ≈ 2.273× → **$3,236 — $264 short of the floor**. A 2-match
slate caps cross-match cards at 2 legs. **Does not clear.**

**MLB-only and mixed WC+MLB** — the optimizer leg pool (463 MLB legs) carries
projection/edge/legScore but **NO model-probability fields**, so the ladder's
model-support gate (≥55%) is unverifiable from the artifact; additionally most pool legs
are plus-money (market <50%). The arithmetic-best mixed combo (Under 2.5 −145 + Gage
Jump K Under 5.5 −133 → ~$4,214 at +196) has combined MARKET probability ≈ 32% — far
below the ~41% an honest +146 card implies — and its MLB leg's model support cannot be
verified. Batter legs additionally carry midday pre-lineup risk. **Does not clear.**

**WC player props (new, 215)** — all `pre_lineup`; never ladder-eligible by methodology.

## Decision: **DECLINED — Step 4 stays pending.**
No candidate clears the $3,500 floor with verifiable model+market support and acceptable
correlation/lineup risk. Nothing was forced; no artifact was mutated.

## Owner option on the table (not taken silently)
Strongest honest card: **Under 2.5 goals (CAN–BIH, −145, model 57%/market 57%) +
United States or Paraguay DC (−290, model 73%/market 70%)** → +127, $1,423.64 →
**$3,236.04** (+$1,812.40), combined model ≈ 42%, cross-match, fully verifiable. Publishing
it requires explicitly accepting a lowered Step-4 target (~$3,236 < $3,500) — owner
decision, per bank-builder-methodology-current.md.
