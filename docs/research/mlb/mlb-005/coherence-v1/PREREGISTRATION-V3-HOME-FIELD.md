# MLB-005 · `mlb-coherent-worlds-v3` (home field): preregistration, 2026-10-10

**Registered:** before v3 is computed on any season. The commit of this file is the registration.

**Exposure, disclosed:**
- This is a **third look at 2024**, development only.
- It was designed after v1/v2 showed mean P(home) = 0.500 against 0.527 actual.
- It can earn only a place in a later forward registration. 2025 is not used.

## The only change from v2 (substitution): home and away batting rates

**League multipliers:** for each outcome X in {K, BB+HBP, HR, non-HR hits}, from earlier games of the season only:
- home multiplier `m_home,X` = (home batters' X per PA) / (all batters' X per PA);
- away multiplier `m_away,X` likewise;
- each shrunk toward 1 with a prior of 20,000 PA.

**Applying them:** every home batter's PA distributions (against the starter and the bullpen) are multiplied by `m_home`. Strikeouts use `m_home,K`, walks `m_home,BB`, home runs `m_home,HR`, and singles, doubles and triples `m_home,H`. Field outs take the remainder. Away batters use `m_away`.

**Unchanged:** everything else is v2 as registered (inputs, workload, substitution, rules, 2,000 worlds, seeds).

## Decision (development)

- **Game level, primary for this version:** winner log loss of engine v3 minus engine v2, on identical games. 95% interval resampling dates.
  - `PROCEED_TO_FORWARD_SHADOW` if the upper end < 0.
  - Also reported: mean P(home) against the actual home-win rate, and total-runs log score and CRPS.
- **Players:** non-inferiority to v2 analytic is re-checked in all 7 markets (upper end ≤ +0.005). A market that fails is reported.
