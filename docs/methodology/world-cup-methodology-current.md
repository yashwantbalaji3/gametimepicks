# World Cup methodology — current (updated June 12, 2026)

## Model
Ensemble: de-vigged market prior + FIFA-ranking team-strength layer + opponent-adjusted
recent national-team form → Poisson goal model → Home/Draw/Away, double chance, totals.
90-minute regulation ONLY: Draw is a real third outcome; extra time/penalties never settle
these markets.

## Markets published
Moneyline (90′, 3-way), double chance, total goals, total corners (when priced), player
shots / shots on target / assists / anytime scorer (pre-lineup labelled; auto-gated).

## Settlement
Official FT regulation scores only (API-Football, or an operator-verified official-scores
artifact from the ESPN scoreboard family). Double chance loses on a draw unless the draw is
covered. Player props settle ONLY when official per-player stat lines exist — otherwise they
stay pending (June 11 precedent).

## What June 11 taught us (first settled day)
- Model+market agreement favorites (Mexico ML, SK/CZ DC) won; the model-disfavored
  plus-money DC side (South Africa or Draw +195) lost, and every suggested card carrying it
  lost. Speculative plus-money DC legs are now downweighted for official-ladder use.
- Same-match legs (DC + Over) stay excluded from the official ladder card (correlation).

## Bank Builder eligibility (World Cup legs)
Team markets only · model ≥55% AND market ≥50% · cross-match legs only · real posted odds ·
clear 90′ settlement rule. Pre-lineup player props are never ladder-eligible.
