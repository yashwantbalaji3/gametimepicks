# Parlay Construction Root-Cause (latest)

Answers to the Phase-3 questions, grounded in settled leg-level data.

1. **Too many legs from poor markets?** YES — `batter_total_bases` (~42%),
   `pitcher_strikeouts` (~47%), `AST` (~41%) were freely used. **Fixed:** market
   quarantine gates them out of Suggested (disabled / high-risk-only).
2. **Over-weighting recent form?** No — recent form is *predictive* and is now a
   primary driver (was a weak ±3 tiebreaker).
3. **Under-weighting odds/market implied probability?** YES at the market level —
   reliability was a ±1.2 nudge dwarfed by edge. **Fixed:** reliability weight
   12→25 and a hard quarantine; odds-band reliability documented (favorites
   55.8% vs plus-money 41.5%) and Low stays negative-odds-only.
4. **Line movement / book consensus?** Not modeled; flagged as a feature gap (no
   provider wired). Not added now.
5. **Too correlated (game/team/player/market)?** Exposure caps already exist;
   with the pool collapsing to `batter_hits`, market diversity is intentionally
   low — correlation is now mostly same-market. Acceptable given only one market
   clears 50%; monitor.
6. **Over-trusting model probability?** YES — see edge below.
7. **Longshot/High getting bad legs?** They did (total_bases). **Fixed:** disabled
   markets never publish; high-risk-only confined to High/Longshot.
8. **Markets to disable from Suggested?** `batter_total_bases`, `AST` (disabled);
   `pitcher_strikeouts` (high-risk-only); `batter_hits_runs_rbis` (downweighted).
9. **Risk by per-leg quality, not just odds?** Partially — Low now requires an
   allowed (reliable) market + negative odds + non-stale ≥80% L10. Full
   multi-factor risk SCORE is the next step (documented).
10. **Minimum per-leg probability/reliability by risk?** Implemented for Low
    (allowed markets only). Medium excludes high-risk-only; High/Longshot exclude
    disabled.

## The core inversion (why 0-23)
`_sgp_leg_quality` was `edge × confidence + …`. Settled data: **edge is
negatively predictive above ~10% (44.9% / 41.2%)** and **confidence is inverted
(High 48.1% < Medium 51.2%)**. So the ranker preferred the worst legs. **Fixed:**
score = reliability + recent-form + recent10 fullness − overprojection(edge>10%)
penalty − insufficient-data penalty − downweighted-market penalty. Confidence
label no longer rewarded.
