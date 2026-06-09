# MLB methodology weaknesses (June 9)

Direct answers, brutally honest, from the code + settled outcomes.

1. **Projection basis?** Recent-form + season-average blend (0.5/0.5 batters,
   0.55/0.45 pitchers) → Normal-CDF vs line. Not odds-implied, not a trained model.
2. **Overfitting to L5/L10?** Partial risk: last-10 is 50% of the batter
   projection with only a stdev-floor guard; no shrinkage toward a stable prior.
3. **Opponent/pitcher context?** NOT used (no opposing-pitcher quality).
4. **Handedness splits?** NOT used.
5. **Lineup position / PA expectation?** NOT used (PA is only a games-played gate).
6. **Confirmed starters / rest?** NOT used (probable pitchers only; no scratch check).
7. **Ballpark factors?** NOT used (flagged pending).
8. **Weather/wind/temp?** NOT used (flagged pending).
9. **Pitch-count / bullpen?** NOT used.
10. **Batter K/contact profile?** NOT used.
11. **Market-specific variance?** Partially — per-market sigma floors + market
    reliability weights, but no per-market calibrated probability model.
12. **Correlated legs overused?** Bounded by same-game/same-team penalties + caps,
    but High/Longshot still stack many legs by odds-band necessity.
13. **Same player/market across cards?** Bounded by recurrence penalties; #324
    did not yet add hard per-player-market caps (staged for PR B).
14. **Edge still harmful?** No longer — edge is clipped (≤15 in scoring), penalized
    above 10pp, and hard-excluded ≥15 (Low/Med) / ≥20 (all). It never promotes.
15. **Confidence misleading?** It's non-predictive (48/48/51); no longer used to
    rank, but still *labeled* on cards (honest framing only).
16. **High/Longshot low-hit by design?** Yes — odds-band lanes (must reach
    +600/+1000), structurally lottery; honest copy required.
17. **Plus-money hurting Low/Bank?** Yes historically (35% hit); Low gate already
    restricts plus-money; PR B proposes hard no-plus-money Low/Bank.
18. **total_bases / HRR too volatile even gated?** total_bases yes (42%/29% —
    effectively disabled). HRR borderline (48%) — restricted-with-consistency.
19. **Pitcher Ks salvageable?** Only with better data (K-rate, pitch count,
    opposing-lineup K%); currently 46% universe → restricted/disabled.
20. **batter_hits carrying the signal?** Yes — it's the one market >50% (53%);
    the product is effectively a batter_hits engine plus gated extras.

**Bottom line:** the model is honest and conservative but **context-blind**. The
ceiling with current data is ~batter_hits 53–58% legs; meaningful gains need
matchup/lineup/park features and per-market calibration.
