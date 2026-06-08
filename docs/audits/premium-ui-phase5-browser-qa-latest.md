# Premium UI Phase 5 — Browser QA (latest)

> Projections game-card sport accents + row hover; Results accuracy stat-bars.
> 1280 + 375.

## Projections /projections/
- Game cards (15, MLB slate): sport-accent left rail + sport label both render
  **sky-blue** (--sport-mlb) — computed rgb(86,194,240). NBA would be rose.
- Player rows carry `.gtp-proj-row` (subtle inset-ring hover); 38 rows render on
  game expand with **0 page overflow** at 375.
- 1280 overflow 0; 375 overflow 0; 0 console errors. Board hero + filters intact.

## Results /results/
- Model Projection Accuracy cards show accurate mini-bars (fill = hit rate):
  Overall **50.30%**, MLB **49.75%**, NBA **51.67%** (NBA green / above-50%,
  others gold), with a 50% reference tick. Settled-only; Published vs Generated
  clarity + "What the model is learning" intact.
- 1280 overflow 0; 375 overflow 0; 0 console errors.

## Compliance
Banned-copy scan of added rendered strings: clean. Accents/bars imply
sport/value only; no good/bad labels added beyond the pre-existing "above 50%".

## Tests/build
tsc clean · app tests 718/718 · build ✓.

## Verdict
Projections board reads as a sport-coded sportsbook board with interactive rows;
Results records gain honest visual weight. Layout-safe, data-driven.
