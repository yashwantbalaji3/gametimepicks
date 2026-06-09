# UFC free-source ingestion plan

## Selected sources
- **Primary fighter stats + history + results:** Greco1899/scrape_ufc_stats CSVs
  (GPL-3.0, daily). Download committed CSVs at build time (CI) — no scraping by us.
- **Live results/schedule:** ESPN MMA API (free).
- **Historic odds (backtest):** forward OddsAPI snapshot logging (clean);
  jansen88/Kaggle only as an unlicensed/one-time reference, not republished.

## Pipeline (fail-closed, mirrors existing UFC scaffolding)
- `pipeline/ufc/providers/ufcstats_csv.py` — fetch + parse the Greco1899 CSVs
  (cached; tolerate "--"/missing → fail-closed; map name+ufcstats-id).
- `pipeline/ufc/build_fighter_stats.py` → `fighters-latest.json` (derived
  per-fighter features; NOT the raw CSV — attribution + GPL respected).
- `pipeline/ufc/build_results.py` → `results-latest.json` (ESPN live + CSV history).
- `pipeline/ufc/build_backtest_dataset.py` → `backtest-dataset-latest.json`
  (results + forward odds snapshots).

## Compliance
- GPL-3.0: consume CSVs as model INPUT, attribute the source, and publish only
  DERIVED features/projections — do not republish the raw dataset in our public
  artifacts. Respect low request rates (CSV download is a single GET).
- No direct ufcstats.com scraping; no betmma.tips redistribution.

## Gate flips (fail-closed, via build_readiness)
- `fighterStatsReady=true` when `fighters-latest.json` has real per-fighter
  features for the slate's fighters (fresh + complete enough).
- `gradingReady=true` when `build_results` can settle real fights idempotently.
- `backtestReady=true` when the backtest dataset has enough graded fights + odds
  and a walk-forward calibration passes (Brier).
- Until all pass, projections/parlays stay locked (unchanged).

## What remains manual / pending
- Fighter↔odds ID canonicalization (name normalization across OddsAPI ↔ ufcstats).
- A licensed historic-odds source if we want backtest faster than forward logging.
