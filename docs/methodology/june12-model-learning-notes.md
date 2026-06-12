# Model-learning notes — June 12, 2026 (from settled results only)

Every number below is computed from settled artifacts (official box scores / official
90′ finals). Nothing is projected, assumed, or smoothed. Sources:
`pipeline/validation/mlb_settled_leans.jsonl` (8,814 decisive MLB leans, 21 dates),
`app/public/data/results/lifetime_summary.json` (3,175 decisive NBA leans, 15 dates),
`app/public/data/world-cup/settlement/2026-06-11.json`, the public Bank Builder ledger.

## World Cup (June 11 — first settled day)

| Item | Result |
|---|---|
| Bank Builder Step 3 (Mexico ML −235 64% model + SK/CZ DC −270 71% model) | **WON** ($728.76 → $1,423.64) |
| SK or Czechia DC −270 (model 71% / market 68%) | win |
| Over 2.5 +125 (SK-CZE) | win |
| South Africa or Draw +195 (model-favored side was Mexico) | **loss** |
| Suggested cards | 2 won / 3 lost — every loser carried the SA-or-Draw leg |

Findings (n=3 picks — directional, not statistical):
- **Model+market agreement favorites delivered; the model-disfavored plus-money DC did not.**
  Mexico ML: model 63.9% vs market 67.0% — both firmly favored; won in regulation.
- The Over 2.5 won but was correctly excluded from the Bank Builder card (same-match
  correlation with the DC leg + lower model probability).
- Player props remain UNSETTLED — no official per-player stat lines were available. Until a
  per-player stat source exists, player props stay out of the official ladder entirely.

**Guardrail applied:** the official Bank Builder candidate generator now requires BOTH
model probability ≥55% AND market probability ≥50% per leg (model+market agreement),
cross-match legs only, team markets only.

## MLB (8,814 decisive settled leans, 21 dates — June 11: 314 decisive, 47.1%)

By market + side (all-time settled):

| Market · side | W | n | Hit % |
|---|---|---|---|
| batter_hits · Over | 1,422 | 2,480 | **57.3%** |
| batter_total_bases · Under | 132 | 242 | 54.5% |
| batter_hits_runs_rbis · Under | 260 | 494 | 52.6% |
| pitcher_strikeouts · Under | 119 | 233 | 51.1% |
| batter_hits_runs_rbis · Over | 1,134 | 2,314 | 49.0% |
| batter_hits · Under | 659 | 1,391 | 47.4% |
| pitcher_strikeouts · Over | 97 | 217 | **44.7%** |
| batter_total_bases · Over | 610 | 1,443 | **42.3%** |

By |model-vs-market edge| bucket (all-time settled):

| Bucket | Hit % | n |
|---|---|---|
| 0–5% | 51.4% | 4,543 |
| 5–10% | 51.5% | 2,110 |
| 10–20% | 47.3% | 1,837 |
| **20%+** | **44.4%** | 324 |

Findings:
1. **Overs on total bases and strikeouts are over-projected** (42.3% / 44.7%) — the model's
   power/K projections run hot relative to lines.
2. **Large "edges" are miscalibrated, not opportunities**: the bigger the claimed edge, the
   worse the result. A ≥20% model-vs-market gap is evidence of a model blind spot
   (lineup/usage/park noise), not value.
3. Confidence labels are currently non-predictive (High 49.5% vs Low 50.9%) — do not gate on
   them publicly until recalibrated.
4. Non-appearing players are handled correctly at settlement (52 unavailable on June 11,
   zero misgrades on the postponed ATL@CWS), but publication-time availability gating would
   reduce ungraded exposure.

**Guardrails applied (suggested-card layer only — public projection views unchanged):**
the mixed-card leg pool now excludes (a) batter_total_bases Overs, (b) pitcher_strikeouts
Overs, and (c) any leg with |edge| > 20% — each cited to the table above.

## NBA (3,175 decisive settled leans, May 15 – June 10: 50.1%)

- The settled June 10 Finals card hit (Castle REB o4.5 → 5; Anunoby PRA o23.5 → 38), both
  official-box-score confirmed. REB/PRA remain the strongest recent markets.
- ESPN remains the settlement provider; no changes. Out-of-season days generate nothing.

## UFC

Moneyline-only remains correct — no real prop provider exists; no expansion.

## Bank Builder (after Step 3)

Record 3–0 ($100 → $1,423.64), every step settled from official sources. Step 4 target:
$1,400 → $3,500 (combined ≈ +146 at the full $1,423.64 stake). The official-candidate gates
are codified in `bank-builder-methodology-current.md`. A card is published only when it
clears every gate — "no card today" is always an acceptable outcome.
