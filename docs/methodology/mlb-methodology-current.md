# MLB methodology — current (updated June 12, 2026)

## Model
Player-prop projections (pitcher strikeouts, batter hits, total bases, H+R+RBI) from recent
form + matchup baselines, compared against real posted lines; settled nightly against the
official MLB Stats API (free, box-score level).

## Settled-results calibration (8,814 decisive leans, 21 dates)
- batter_hits Overs: 57.3% (n=2,480) — the model's strongest signal.
- batter_total_bases Overs: 42.3% (n=1,443) and pitcher_strikeouts Overs: 44.7% (n=217) —
  over-projected; EXCLUDED from suggested mixed cards as of June 12.
- |edge| ≥20% legs hit 44.4% — large model-vs-market gaps are treated as model error, not
  value; such legs are EXCLUDED from suggested mixed cards.
- Confidence labels are not yet predictive (High 49.5% vs Low 50.9%) — shown for
  transparency, never as a trust cue.

## Availability
Postponed games / non-appearing players are never guessed: their leans stay ungraded
(June 11: ATL@CWS postponed → 52 leans correctly unsettled). Bank Builder MLB legs require
confirmed lineups/probables — stricter than public projection views.
