# Premium UI Phase 3 — Browser QA (latest)

> Home command-center hero + Parlay Lab hero band. Desktop 1280 + mobile 375.

## Home `/`
- Hero renders: bold H1 "Today's board, ranked by the model."; paper-only pill;
  gold + ghost CTAs; **scoreboard tiles** Active slate **Jun 7** (emerald) ·
  Latest settled **Jun 6** (sky-blue) · Tracked accuracy **50.3% (4543/9031
  legs)** (gold). All real loader data.
- 1280 overflow 0; 375 overflow 0 (tiles stack 3-across, values fully legible,
  labels truncate gracefully). 0 console errors.

## Parlay Lab `/parlay-lab/`
- Header now a premium gradient hero band (border 1px, gradient bg, radius 14px,
  gold top accent rule) around "Today's suggested parlays."
- 1280 overflow 0; 375 overflow 0. 0 console errors.
- Slate chip / PREGAME banner / tabs / filters / "15 published cards" / honest
  "No NBA games" pool-availability / risk lanes all intact.

## Compliance
Banned-copy scan of added rendered strings: clean (no safe/safest/lock/
guaranteed/risk-free/sure thing/new model/shadow). Copy stays neutral +
educational; hero says "not betting advice".

## Tests/build
tsc clean · app tests 718/718 · build ✓.

## Verdict
Bold, visible, multi-surface premium upgrade (home + Parlay Lab), layout-safe,
honest, data-driven. No data/model/grading/workflow change.
