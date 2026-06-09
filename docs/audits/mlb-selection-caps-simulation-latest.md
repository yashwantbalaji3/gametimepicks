# MLB selection-caps simulation + decision (June 9)

Simulator: `app/scripts/simulate-selection-policy.mjs` (settled June 1–8,
restrict-only, reliability-ranked). Decision per policy below.

## Policy results (card hit rate)
| Policy | Overall card | Low card | Low leg | Cards | Decision |
|---|---|---|---|---|---|
| baseline (as published) | 10% | 26% | 56% | 157 | — |
| low-strict-2 | 22% | 37% | 56% | 137 | **shipped #324** |
| edge-cap-low-med | 13% | 25% | **65%** | 71 | **shipped #324** |
| odds-band (no-plus-money Low) | 18% | 25% | 57% | 120 | already enforced* |
| exposure-caps | 12% | 19% | 61% | 59 | card-rate-NEUTRAL → only risk-mgmt parts |
| proposed-combined | 18% | 36% | **68%** | 44 | core (Low2+edge) shipped; rest mixed |

\*Low already excludes plus-money (>+100) via `low_risk_leg_eligible` odds bands;
Bank Builder is heavy-favorite-only (≤−150). No change needed.

## What ships in this PR (and why)
**Cap volatile MLB legs to 1 per public card** (`_PUBLIC_SECTION_MAX_VOLATILE_LEGS=1`):
total_bases / HRR / strikeouts. The public-section builder enforced a same-game cap
but NOT a volatile cap, so cards could stack 2+ high-variance legs. The June
postmortem showed these markets are net-negative (total_bases 42%/29%); stacking
compounds correlation + variance. This matches the legacy conservative/balanced
`mlb_max_volatile_legs=1`. **Risk-management cap** (a card takes a non-volatile leg
instead) — simulator shows exposure caps keep leg quality (~61%) while reducing
concentration. Verified on real June-8/9 legPools: max volatile legs/card = 1.

## What is NOT shipped (simulation did not support / already covered)
- **No-plus-money Low/Bank:** already enforced (above) — no-op change avoided.
- **Hard per-player-market / per-player card caps:** the diversity selector's soft
  recurrence penalties already spread exposure; a hard cap mainly cut coverage
  (exposure-caps card rate 12% < baseline 26%) with no clear hit-rate gain → not
  shipped (mission rule: don't ship unsupported).
- **Low 2-leg + edge cap:** already live (#324).

## Net
The clear hit-rate wins were already shipped (#324). This PR adds the one safe,
net-new risk-management cap (≤1 volatile leg/card). Coverage impact: minimal
(a volatile leg is replaced by a non-volatile one, not dropped).

_Caveat: ~40 cards/lane → wide Wilson; direction robust, magnitudes noisy._
