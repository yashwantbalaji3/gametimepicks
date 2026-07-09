# MLB Alternate-Line Ladders → Distributions — Audit (2026-07-09)

Phase 6 of the full-market build. **Verdict: feasible + affordable, but the distribution
derivation has a real tail subtlety — implemented rushed it would MISLEAD, so it is
documented + deferred to a careful build, not shipped.** Money untouched (`affe6b21…`).

## Availability (verified, DraftKings, one July-9 event, 3 credits)

| Market | Points | Range | Enough for a distribution? |
|---|---:|---|---|
| `alternate_totals` | 16 | 6.5 → 14.5 (half + whole steps) | yes (middle), tails thin |
| `alternate_spreads` | 18 | −5 → +5 in 0.5 | yes (margin) |
| `team_totals` | 1 | 4.5 | no ladder (single point) |

**Cost:** alternate markets are **event-level** (not on the bulk endpoint) → **3 credits/event
× 12 games = ~36 credits/slate**. Balance 18,703 — trivial. Available for all slate games.

## Derivation (validated on real data — the honest method, no Poisson)

De-vig each priced `(Over X, Under X)` pair → `P(total > X)`. This CDF was **monotonic
non-increasing** on real data (78.4% at >6.5 → 19.5% at >14.5) ✓. Then
`P(total = n) = P(>n−0.5) − P(>n+0.5)` (interpolated on the CDF). All bins ≥ 0 ✓.

## ⚠️ The subtlety that blocks a rushed ship

On the real ATL@PIT ladder, the integer bins 6…15 summed to only **0.59** — **41% of the
probability sits in the tails** (`P(≤6) ≈ 22%`, `P(≥15) ≈ 19.5%`) because the ladder starts at
6.5 and ends at 14.5. Worse, those **extreme alternate points come from thin two-sided
markets** — the least reliable de-vig. A histogram that silently drops 41% of the mass, or
renders `19.5% chance of 15+ runs` from a thin quote, is **misleading** — worse than an honest
"distribution unavailable".

## What a correct implementation MUST do (deriver spec)

1. **Explicit tail bins.** Render `≤ floor(minPoint)` = `1 − P(>minPoint)` and
   `≥ ceil(maxPoint)` = `P(>maxPoint)` as labelled tail buckets so the bins sum to 1.0.
2. **Thin-market guard.** Require ≥ N (e.g. 8) two-sided ladder points before rendering; else
   `unavailable: insufficient_ladder_points`.
3. **Monotonic enforcement.** Clamp any non-monotonic de-vigged CDF point (thin-market noise)
   to its neighbour; if clamping moves it materially, flag lower confidence.
4. **Validation gate.** Bins (incl. tails) sum to 1.0 ± ε and every bin ≥ 0, or render unavailable.
5. **Label** the tail buckets + the "thin extreme alternates" caveat; keep it market-implied,
   distinct from the model, not betting advice.

## Recommendation

**Feasible and worth building — but as a deliberate step with the spec above + tests, not a
session-end rush.** The main-line Game Center (win prob / total / run-line, shipped) already
gives the honest headline; the distribution is the depth layer. Ship it once the tail-handling +
thin-market guard are implemented and validated (bins sum to 1, sensible shape) on several slates.

Additive artifact plan: `ingest-mlb-alternate-ladders.mjs` (per-event, credit-guarded) →
`mlb/team-markets/<date>.json` gains `alternateTotals[] / alternateSpreads[]`; a
`buildTotalRunsDistribution()` deriver (with tail bins + guard) → a histogram module in the MLB
Game Center, gated + only when the guard passes.
