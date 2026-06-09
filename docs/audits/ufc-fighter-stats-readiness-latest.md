# UFC fighter-stats readiness (June 9)

`fighterStatsReady` is now **true** from a real, free, attributed source — picks
remain **locked** (no grading/backtest).

## What shipped
- `pipeline/ufc/providers/ufcstats_csv.py` — consumes the Greco1899 committed CSVs
  (GPL-3.0; we do NOT scrape ufcstats.com, do NOT republish raw CSVs).
- `pipeline/ufc/build_fighter_stats.py` — derives per-fighter SUMMARY features →
  `app/public/data/ufc/fighters-latest.json`.
- `build_readiness.py` — `fighter_stats_gate` flips `fighterStatsReady` only with a
  real artifact (>=200 fighters, fresh latest fight, license metadata, enough
  fighters with stat rates). Fail-closed otherwise.
- `ufc-fighter-stats-refresh.yml` — manual, derived-only, no raw CSV, no picks.

## Verified (real data)
- **2,695 fighters · 17,402 fight-appearances · latest 2026-05-16 (fresh).**
- Spot-checks: Pereira 10-2 (0.80 finish rate), Makhachev 17-1, Jones 22-1.
- Missing fields (e.g. "--" reach) → `null`, never faked; `dataCompleteness` per fighter.

## Readiness state
`publicLevel = projections-internal`; oddsReady=true, **fighterStatsReady=true**,
gradingReady=false, backtestReady=false → **projectionsReady=false, parlayReady=false**.

## Compliance
GPL-3.0 attribution carried in the artifact (`sourceAttribution`, `sourceRepo`,
`sourceLicense`) + docs. Only DERIVED features published; raw CSVs not committed.

## Next gates
- `gradingReady`: settle real fights (ESPN MMA + CSV history), idempotent.
- `backtestReady`: results history + forward OddsAPI snapshots → walk-forward Brier.
