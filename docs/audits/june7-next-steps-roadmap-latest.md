# June-7 Next-Steps Roadmap (prioritized)

> State at this checkpoint: June 7 live + validated (first reliability-nudged
> slate); three learning signals on main (market reliability — live; recent-form
> + confidence compression — take effect June-8 generation). Site-wide QA clean.
> No paid credits. The list below is prioritized; nothing here is started.

## P0 — validate what just shipped (next 24h, free)
1. **June-7 settlement** (tonight → tomorrow AM): when all June-7 games are final,
   settle via the free path (like June 5/6) if `nightly-settle` hasn't, then
   re-check Results projection accuracy + parlay records. Watch for any postponed
   games → leave pending/ungraded (as BOS/NYY on June 6).
2. **June-8 generation** is the FIRST slate to carry ALL three signals (reliability
   + recent-form + confidence compression). Validate its market/odds/L5
   distribution, exposure, Low conservatism, and Bank Builder against the June-7
   baseline — confirm the changes help, not just don't harm.

## P1 — refine the learning loop (evidence-gated)
3. **Leg-level reliability conditioned on recent form** — the current nudge uses
   the market *average*; a strong-form leg in a weak market (e.g. Total Bases
   Under with 5/5 L5) is better than the average implies. Condition reliability on
   (market × recent-form bucket) once samples allow; replaces the blunt market
   nudge. Keep shrinkage + sample floors.
4. **Confidence**: if June-8+ confirms the label stays non-predictive, consider
   reducing its weight further (toward flat) — validated per slate, not in bulk.
5. **Odds-band reliability** is computed (heavy_fav 67.5% → high_plus 34.2%) but
   not yet wired into scoring; it's largely captured by the risk-bucket bands, so
   evaluate marginal value before adding.

## P2 — transparency / UX
6. **Per-leg "why this leg" reason chips** in the modal (recent trend, odds band,
   market reliability, edge) — surfaces the methodology that's already driving
   selection. Honest, no new claims.
7. Extend the "What the model is learning" panel with a small per-sport settled
   sparkline once enough dates exist.

## P3 — prop / sport expansion (research only; implement only if data exists + safe)
8. **MLB:** pitcher outs, walks allowed, earned runs, hits allowed; batter runs,
   RBIs, stolen bases — add only markets with stable settled grading + sufficient
   sample; downweight high-variance ones (HR) to High/Longshot.
9. **NBA:** 3PM, PRA, stocks — same reliability gating.
10. **NFL / World Cup:** receptions/rec-yds/rush-yds/anytime-TD; goalscorer/shots/
    SOT/cards/saves — roadmap only; no paid data subscription tonight.

## Honesty guardrails (unchanged)
No "guaranteed/lock/safe/risk-free" copy; V2 stays internal until corrected gates
pass; settled-only Results; no target-game leakage; no padding; bounded,
shrunk, sample-floored learning signals — associations, not guarantees.

*Roadmap doc. No code/data/model change.*
