# MLB Full-Game Sim — Rolling Backtest (2026-07-09)

**Verdict: `insufficient_sample`.** The market-anchored simulation tracks the market baseline (as
designed). The new SHADOW-ADJUSTED variant (bounded park + strictly-earlier run rates) is pure noise on
this tiny sample — marginally better on moneyline Brier, marginally *worse* on totals. Nothing here
justifies public rollout, product use, or even a non-driving signal.

Money md5 `affe6b21071f2b3be96bb2774eb347c3` — unchanged (read-only backtest). Supersedes the prior
single-date report + the `rolling-backtests/` artifact.

Artifact: `data/internal/mlb/full-game-sim-backtests/rolling-latest.json` (internal-only, not web-served).

---

## What it grades

Every date with BOTH committed team-market lines AND official finals, three ways head-to-head:

1. **Market baseline** — de-vigged moneyline / total / run line.
2. **Market-anchored sim** — the pure engine (point estimates = the market by construction).
3. **Shadow-adjusted sim** — market anchor + *bounded* independent nudges (park factor ±3% of total;
   strictly-earlier run-rate gap ±0.3 runs of margin; pitcher strength neutral).

## Sample (2026-07-09)

| item | value |
|---|---|
| dates with committed team-market lines | **1** (2026-07-09) |
| games graded (final + committed line) | 10 (partially-live slate — count moves as finals accrue) |
| skipped | 0 |
| engine mode | `market_anchored_with_independent_adjustments` (park factor present for every game) |
| finals source | StatsAPI schedule (free) |

## Metrics

| metric | market | market-anchored sim | shadow-adjusted sim |
|---|---|---|---|
| moneyline Brier | **0.2325** | 0.2325 | 0.2316 |
| moneyline accuracy | 0.60 | 0.60 | 0.70 |
| projected-total MAE | 4.70 (line) | 4.69 | **4.80** |
| over/under Brier | — | 0.253 | 0.269 |
| run-line cover accuracy (sim) | — | 0.50 | — |

## Reading (blunt)

- The pure sim's moneyline Brier (0.2325) **equals** the market's — expected, it is market-anchored.
- The shadow-adjusted variant is **noise on 10 games**: a hair better on moneyline Brier (0.2316) and
  accuracy (0.70), a hair **worse** on totals (MAE 4.80 vs 4.70) and O/U Brier (0.269 vs 0.253). A ±0.3
  ML-Brier wobble on ten games is meaningless. It does **not** establish that park/run-rate inputs help.
- **The sample is one date / 10 games** — far below the ≥50-game / ≥5-date floor. `insufficient_sample`.

## Leakage protection (proven, not asserted)

- Team run rates use **only committed linescore dates strictly earlier** than the graded date.
- Park factors are **static structural constants** (date-independent).
- Pitcher strength is **neutral (0)**.
- The final score enters **only the evaluation phase** — never an input.
- The engine has **no learned parameters**; any future fitted parameter must be fit from strictly-earlier
  dates only (documented invariant). Enforced by a test.

## Why not ready + what's needed

- **Not ready:** market-anchored (no independent edge), tiny sample, and the independent inputs are thin
  (approximate park factors; neutral pitcher strength; no bullpen/lineup/weather).
- **Unlock:** run `ingest-mlb-team-market-lines-daily.mjs` each slate (now wired into
  `refresh_daily_products.sh`, money-guarded + non-fatal) until ≥50 graded games / ≥5 dates exist, then
  re-run this harness. Only if the shadow-adjusted Brier/calibration then beats the market baseline does
  the verdict move to `candidate_for_shadow_review` — and even that is internal, founder-gated.

## What stays blocked

Public rollout, Bank Builder / Moonshot use, product-card eligibility, any non-driving product signal,
and any "beats the market" claim — all blocked. The engine + artifacts stay internal.
