# UFC grading readiness (June 9)

`gradingReady` is now **true** from free data — picks remain **LOCKED** (no
backtest). publicLevel advanced `projections-internal → grading-internal`.

## Shipped
- `build_results.py` → `results-latest.json` (3-yr window: 126 events, **1,519
  final bouts**, latest 2026-05-16; draws/NC handled; 764K, derived only).
- `grade_moneylines.py` → `graded-moneylines-latest.json` (h2h only; proven on
  real data: 1 win + 1 loss from a historical matchup, 8 pending for future
  fights — pending/unknown never counted as losses).
- `build_readiness.grading_gate`: flips gradingReady only with ≥100 final bouts,
  fresh, licensed, AND a grader that produced ≥1 decisive grade. Fail-closed.
- **derive_readiness fixed**: public projections now require a BACKTEST too, so
  grading alone stays internal (matches ufc-types.ts).
- `ufc-results-refresh.yml` (manual, derived-only, no raw CSV, no picks).

## Readiness
publicLevel=grading-internal; oddsReady/fighterStatsReady/gradingReady=true,
backtestReady=false → **projectionsReady=false, parlayReady=false**.

## Next gate — backtestReady
Build `build_backtest_dataset.py`: join historical results (full Greco history) +
pre-fight odds (forward OddsAPI snapshot logging, since historical odds aren't
cleanly free) → walk-forward Brier calibration of a moneyline model. Only then do
projections/parlays unlock.
