# Premium UI Phase 4 — Browser QA (latest)

> Projections board hero + Bank Builder target-path strip. 1280 + 375.

## Projections /projections/
- Board hero renders: H1 "Today's projections board."; scoreboard tiles
  **Active slate Jun 7** (emerald) · **Games 15** (sky-blue) · **Projections 632**
  (gold) · **Sports 1 / MLB** (violet). Real payload counts.
- 1280 overflow 0; 375 overflow 0; 0 console errors.
- Game grid + per-sport pills below render unchanged.

## Bank Builder /bank-builder/
- Target-path strip renders (2×4 desktop / 2×2 mobile): **Start $100** / **Step
  target ~2× (≈ +100 odds)** / **Current step 1 / 5 ($100)** / **On a loss Reset
  (to $100)**, colored rails. Ladder tower + Daily Pick + disclaimers intact.
- 1280 overflow 0; 375 overflow 0; 0 console errors.
- "PAPER ONLY · Educational only … We do not take real money." preserved.

## Compliance
Banned-copy scan of added rendered strings: clean. No safe/safest/lock/
guaranteed/risk-free/sure thing/new model/shadow. "~2×" is an honest target, not
a promise; loss reset shown openly.

## Tests/build
tsc clean · app tests 718/718 · build ✓.

## Verdict
Projections now reads as a premium board; Bank Builder as a polished, honest
progression module. Layout-safe, multi-surface, data-driven.
