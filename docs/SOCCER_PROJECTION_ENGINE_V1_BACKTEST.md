# Soccer Projection Engine V1 — Backtest (2026-07-14)

The internal FIFA-Poisson soccer engine, evaluated against finished World Cup matches. **Status: internal-only,
`insufficient_sample`.** This documents what the harness measured and, bluntly, why it is not yet enough to go
public.

## The engine (what's being tested)
Rating-driven **bivariate Poisson** (`app/src/lib/world-cup/internal-soccer-projection-engine.ts`):
- Supremacy from the FIFA-points gap (`~0.35 goals per 100 points`, capped at ±2.6).
- Scoring volume anchored to a WC base (2.6) or the market total when present (supremacy stays rating-driven).
- Scoreline matrix → 1X2, total, BTTS, double chance, DNB, correct score.
This is an **independent** projection in the honest sense — it uses ratings, **not** the book's price — but it is
labelled `internal_soccer_projection_v1`, never "independent/validated", because those are earned by *this*
document showing out-of-sample skill, which it does not yet.

## Sample
Committed settlement artifacts cover the **knockout window only**, re-fetched daily → **5 unique finished
matches** with a clean team↔FIFA join:

| Match | Score | Actual | Model 1X2 (H/D/A) | Top pick |
|---|---|---|---|---|
| Mexico – South Africa | 2-0 | home | correct |  ✓ |
| South Korea – Czechia | 2-1 | home | correct | ✓ |
| France – Senegal | 3-1 | home | correct | ✓ |
| Iraq – Norway | 1-4 | away | correct | ✓ |
| Argentina – Algeria | 3-0 | home | correct | ✓ |

## Metrics (N=5)
| | mean Brier ↓ | mean RPS ↓ | top-pick acc |
|---|---|---|---|
| **Model (FIFA-Poisson)** | **0.342** | **0.141** | **100% (5/5)** |
| Baseline: uniform 1/3 | 0.667 | 0.278 | — |
| Baseline: FIFA favorite | — | — | 100% (5/5) |

The model beats the uniform baseline on Brier and RPS, and nails all 5 top picks.

## Why this is NOT a pass (be blunt)
- **N=5 is not a backtest, it's an anecdote.** No calibration, no confidence interval worth quoting.
- **4 of 5 were heavy favorites** (Mexico, France, Argentina, Norway over weak sides). Getting those right is
  table stakes — the "FIFA favorite" baseline also went 5/5. The engine has not been tested on close matches,
  where it would actually earn its keep.
- **It ties, not beats, the trivial FIFA-favorite baseline on accuracy.** The Brier edge over uniform is real but
  uniform is a strawman.
- Leakage is controlled (FIFA points are pre-tournament static; final scores used only in evaluation), so the
  numbers are honest — there just aren't enough of them.

## Model-vs-market divergence on the live semifinals (interesting, not validated)
On France v Spain and England v Argentina the model leans toward the higher-rated side vs the book:

| Match | Model (H/D/A) | Market (H/D/A) | Δ away |
|---|---|---|---|
| France – Spain | 36/27/37 | 41/30/29 | **+7.4pp Spain** |
| England – Argentina | 32/27/41 | 36/33/31 | **+9.9pp Argentina** |

The engine systematically thinks the market underprices the higher-FIFA side. That is a *hypothesis*, not an
edge — it's exactly the claim a real backtest would confirm or kill. We are NOT trading it and NOT showing it
publicly.

## Gate to go public (unchanged from the internal-first rule)
1. Backtest on the **2022 WC (64 matches)** via API-Football (`PROVIDER_AND_MODELING_ROADMAP.md`).
2. Model Brier/RPS **beats the closing-market baseline** out-of-sample (not just uniform), with calibration.
3. Founder approval.
Until all three: `public:false`, and the public WC report stays market-implied.
