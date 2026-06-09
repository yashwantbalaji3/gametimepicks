# UFC launch stages (realistic, gate-driven)

- **Stage 0 — Public odds board:** schedule + h2h odds ready; no picks.
- **Stage 1 — Internal moneyline model (CURRENT):** + fighter stats + grading;
  internal projections generated; **public locked**.
- **Stage 2 — Public moneyline projections:** `backtestReady=true` (≥150 clean
  graded rows + acceptable calibration). No public parlays yet.
- **Stage 3 — Public moneyline parlays:** `parlaySimReady=true` + positive card
  simulation + leg/card constraints.
- **Stage 4 — Prop projections:** a real prop-odds provider connected +
  method/distance/round grading + prop backtest.

**Explicit:** UFC launches public **moneyline before props**. Props are blocked by
**provider coverage** (The Odds API MMA is h2h-only), not code effort. Current
stage = **1**, surfaced live via `ops-status-latest.json`.
