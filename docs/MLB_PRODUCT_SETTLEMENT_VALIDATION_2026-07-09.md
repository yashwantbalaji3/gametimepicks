# MLB Product Settlement Validation (2026-07-09)

**Validating team-market settlement from official StatsAPI final scores across 5 completed MLB dates.
Internal ledger only — no official money/record/exposure change.**

Money md5 `affe6b21071f2b3be96bb2774eb347c3` — unchanged before, during, and after every run.

---

## Method

For each date: fetch the official StatsAPI schedule → cache final scores
(`data/internal/mlb/linescores/<date>.json`) → run the internal ledger
(`build-mlb-product-settlement.mjs`), which grades team moneyline from the official score (join by
`gamePk`) and player props from the committed `settled_leans` actuals. Team moneyline outcomes are then
cross-checked independently against the linescore (home ML wins ⇔ homeRuns > awayRuns).

## Results

| Date | Games | Team legs | Team graded | Player graded | Pending | Unavailable | ML mismatches | Money changed? |
|---|---|---|---|---|---|---|---|---|
| 2026-07-04 | 15 | 15 | 15 | 292 | 0 | 18 | **0** | No (affe6b21) |
| 2026-07-05 | 15 | 5 | 5 | 0 | 0 | 0 | **0** | No (affe6b21) |
| 2026-07-06 | 8 | 8 | 8 | 325 | 0 | 16 | **0** | No (affe6b21) |
| 2026-07-07 | 16 | 10 | 10 | 121 | 0 | 6 | **0** | No (affe6b21) |
| 2026-07-08 | 15 | 15 | 15 | 586 | 0 | 58 | **0** | No (affe6b21) |

Plus the live slate:

| Date | Games | Team legs | Team graded | Player graded | Pending | Notes |
|---|---|---|---|---|---|---|
| 2026-07-09 | 13 (5 final) | 36 | 0 | 0 | 51 | linescore not committed (volatile, games in progress) → all pending. Correct — nothing graded early. |

## Findings

- **Every final game's team moneyline graded from the official score** — 53 team moneyline legs across
  the 5 completed dates, **0 pending on final games, 0 mismatches** vs the official StatsAPI linescore.
- **Player props still match the committed pipeline** exactly (the over/under core reproduces the
  pipeline outcome on all committed rows; voids → unavailable, never loss).
- **No non-final game was graded** — the live July-9 slate is entirely `pending`.
- **No money file changed** on any run — md5 held at `affe6b21` throughout.
- Notes: 2026-07-05's board mapped only 5 of 15 games (sparse board) and carried no settled player
  props; the ledger honestly graded the 5 it could map. Total/run-line did not grade on these dates
  because their committed lines exist only for the current slate (not yet final) — they are wired +
  fixture-tested and will grade live once the slate finalizes.

## Verdict

Team-market **moneyline** settlement from official final scores is validated and clean on 5 dates.
Total / run line are wired and tested but await a date where both the committed line and the final score
co-exist. **Not** claimed production-ready for money activation — the rollout stays founder-gated
(`docs/MULTI_SPORT_PRODUCT_ENGINE_ROLLOUT_PLAN_2026-07-09.md`).
