# Model Review — July 4, 2026 (why the success rate dropped)

All figures from the CANONICAL settled ledger / product ledgers — nothing sampled or estimated.

## Hit rates (settled only)
| Slice | Record | Note |
|---|---|---|
| Bank Builder (canonical) | 17–12 (58.6%) | The ONLY profitable product (+$19,165.40, compounding) |
| Moonshot | 0–5 | Longshots by design; $25 flat stakes |
| WC Specials | 0–17 | +700..+3000 longshots; honest tracker |
| Suggested-parlay optimizer | 7–12 | Stale-through Jun-18, banner-disclosed |
| **BB legs · double chance** | **8–0 (100%)** | The most reliable market, period |
| BB legs · moneyline | 8–2 (80%) | Both losses were knockout traps (Argentina −700 drew at 90'; Austria dog) |
| BB legs · totals | 10–6 (63%) | Every RECENT loss was a 90'-draw trap (O2.5 on Argentina 1–1; U2.5 on Belgium 2–2; O3 Jun-25) |
| BB legs · BTTS | 1–3 (25%) | Unreliable |
| BB legs · player props | 0–1 (~8% WC-wide) | Already banned from BB (bbPool player==null) |

## Recurring failure patterns
1. **Knockout 90'-draw trap** — heavy ML favorites drew at 90' (Argentina −700, Jul-3); knockout games cluster at 1–1. DC/DNB survive the draw; ML/totals don't.
2. **Totals in tight games** — the model's ~59% totals confidence repeatedly missed when the score lean was drawish. The selector trusted raw probability and walked into Over 2.5 on Jul-3 after the game's DC was juiced out.
3. **BTTS overconfidence** — 25% settled hit vs ~55% modeled.
4. **Payout-chasing filler** — historical (Switzerland +100 coin-flip); already fixed via approved-card lock + odds bands.

## Change implemented (tested, this commit)
**Market-reliability weighting in the survival-lane selector** (`bank-builder-proposal.ts`):
survivalScore = volScore **+0.25 if BTTS** (always demoted) **+0.15 if totals in a draw-risky game** (90' draw ≥ 26% — same threshold as knockoutRisk). Regression tests prove: the July-3 trap shape now selects DNB over the higher-probability total in a draw-risky game; totals are NOT nerfed in low-draw games; BTTS never leads a survival slot.

## Recommended next (documented, not yet implemented)
- Safety-first mode for ladder Steps 3+: prefer combined price BELOW the rung target over reaching it with a weak leg.
- Reliability weights table shared with WC Specials "Reliable" tier + Moonshot structured tiers.
- Require totals modelProbability ≥ 0.62 for any survival-lane totals leg.
