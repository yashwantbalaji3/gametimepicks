# Backtest Plan — Honest Roadmap to Out-of-Sample Validation

**Status:** 2026-05-22 · written during the overnight product overhaul.
**Audience:** future maintainers (human or LLM) who will be tempted to
claim "we backtested" the projection model. **Read this first.**

This document exists because the most important model claim a sports
projection site can make is *"we tested this against historical data
the model never saw."* GameTimePicks **cannot make that claim yet**.
This file is the path from where we are to where we could honestly
make it.

---

## 1. What we already have

| Asset | Path | What it gives us |
|---|---|---|
| NBA settled rows | `app/public/data/results/settled_leans.jsonl` | 677 graded rows across 6 playoff dates (May 15 → May 21) |
| MLB settled rows | `app/public/data/mlb/results/settled_leans.jsonl` | 582 graded rows across regular-season MLB |
| Per-date audit | `app/public/data/audit/model_audit.json` | Aggregates by market / confidence / edge band / date / bookmaker |
| Calibration report CLI | `pipeline/calibration_report.py` | Re-runs configurable filters across the rows above |

That's a **forward audit**, not a backtest. Every row above was a real
pick the model emitted in real time and was then graded — we never
"replayed" the model on historical data it didn't see.

## 2. Why "forward audit" is not a backtest

A real backtest must satisfy **all** of these:

1. The model is frozen at version V.
2. Inputs (lineups, recent form, lines) are reconstructed from data
   that was available *before* the game tipped.
3. The frozen model is run on those reconstructed inputs.
4. Its projections are compared to final box scores.

We currently fail step 2. Specifically:

- **We do not store historical lines.** The Odds API responses are
  cached for ~60 minutes; once that window expires the line is gone
  from our cache forever. Reconstructing a 2024 line is not possible
  from anything on disk today.
- **We do not snapshot the model version per pick.** All settled rows
  share whatever version of `score_model.py` was running on the day
  of the pick. There's no way to rerun a 2024 row through the 2026
  guardrails without contaminating the test.
- **Recent-form inputs are mutable.** `attach_recent10.py` reads
  current nba_api / balldontlie data; the "last 10 games" window
  moves with the calendar. A May 2024 backtest would pull May 2026's
  view of "last 10 games before May 2024" — which is fine for any
  game that ended before the cache hardened, but we don't have a
  hardened cache.

## 3. The honest path to a real backtest

Three options, in increasing order of cost and accuracy:

### Option A — Subscribe to The Odds API historical endpoint

- The same provider already wired up via `pipeline/fetch_odds_data.py`.
- They sell a historical-lines product that returns the actual closing
  line for any past game on supported markets.
- **Estimated cost:** ~\$100/month for the historical tier (rate
  card varies — check their billing page when this is greenlit).
- **Coverage:** good for NBA + MLB regular season + playoffs back
  several years; thinner for niche markets (assists, total bases).
- **Build effort:** 1-2 days. We already speak Odds API.
- **Output:** an opening-window backtest for any sport whose market
  we already model.

### Option B — Scrape a sportsbook archive

- Sites like SportsBookReview have historical line databases.
- **Risk:** terms-of-service violations. Many of these sites
  explicitly forbid programmatic access. Even if the data is legal
  to obtain, redistributing it can be sketchy.
- **Build effort:** 2-3 weeks per source.
- **Output:** potentially deeper coverage than The Odds API at the
  cost of legal ambiguity.
- **Recommendation:** skip unless legal review explicitly clears it.

### Option C — Use SportsData.io / Stathead historical exports

- Provides static CSV / parquet snapshots of historical lines.
- **Estimated cost:** ~\$50-200/month depending on tier.
- **Gaps:** some markets (esp. player props) are partial.
- **Build effort:** 3-5 days to wire a loader + reconciliation
  against ESPN box scores.

## 4. What we should build BEFORE paying for any of the above

Even before historical lines arrive, we can prepare the infrastructure
so the backtest run itself is one CLI invocation away.

### Phase 1 — Lock the model version per pick (1-2 days)

- Stamp every settled row with `modelVersion` (a short SHA of the
  scoring path: `score_model.py` + `confidence_guardrails.py` +
  `attach_recent10.py`).
- Update `pipeline.settle_results` and `pipeline.mlb.settle_mlb_results`
  to read the in-effect `modelVersion` from a tracked manifest and
  attach it to each settled row.
- This unlocks honest "v1 backtest" framing later — we can say
  "v1 hit X% on Y games" without ambiguity.

### Phase 2 — Recent-form snapshotting (3-5 days)

- Cache the recent10 game-log payload pulled by `attach_recent10.py`
  at pick time. Without this, a "replay" of a past pick uses today's
  view of "last 10 games" which is contaminated by games that didn't
  exist yet.
- Store under `app/public/data/recent10/<date>/<playerId>.json` so
  it's deterministic + diffable.

### Phase 3 — Historical-lines loader (3 days post Option A)

- Once historical lines are sourced, write
  `pipeline/historical_lines.py` that exposes `get_line(playerId,
  market, gameId)` deterministically.
- Wire it as the data source instead of the live cache.

### Phase 4 — The backtest itself (2 days)

- `pipeline/historical_backtest.py` that:
  1. Iterates a date range.
  2. For each date, reconstructs the slate from historical lines.
  3. Runs `score_model.score_prop` against the frozen recent-form
     snapshots.
  4. Grades against ESPN box-score endpoints (already supported).
  5. Writes the results to a versioned `backtest_<rangeStart>_<rangeEnd>.json`.

## 5. What we MUST NOT do until the above lands

- **Do not claim "the model is 60% accurate"** on the forward audit.
  Forward auditing tells us a record, not a calibration.
- **Do not retrain on the 677 NBA / 582 MLB settled rows.** Six
  playoff dates plus a regular-season MLB sample is **not** enough
  data to train on without massive overfitting risk, especially
  given the playoff-vs-regular-season variance.
- **Do not promise a future hit rate.** Anything that reads
  "we expect 80%" is a forbidden claim until step 4 lands AND the
  backtest sample is N >= 500 across multiple seasons.

## 6. What is safe to do tonight (no historical lines required)

- **Run `pipeline.calibration_report`** to test counterfactual filters
  (market floors, confidence cuts, anomaly exclusion). This shows
  what filter shapes *would have* improved the forward audit; it is
  not evidence of future performance, but it's honest data.
- **Add per-market edge floors as configuration only.** A `config.py`
  constant like `MIN_EDGE_PP_PTS = 5.0` that gates which leans pass
  the guardrails. Keep it OFF by default; flip on once the
  calibration report shows the filter survives across multiple
  weak-market dates.
- **Add OT-detection flags** to settled rows. Tag each row's parent
  game as `wentToOT: true | false` so we can audit OT-driven variance
  separately. No model logic change; just an extra field.
- **Add usage-shift suppression** — when a star is projected at
  >25% usage, downgrade confidence one tier. This is a tiny patch
  that respects the "no scoring changes without tests" rule
  because it lives in `confidence_guardrails.py` and only widens
  the variance band; it never invents a number.

## 7. Honest framing the UI must keep

Until step 4 lands and N >= 500 across multiple seasons:

- "Track record" (the forward audit) — yes
- "Calibration analysis" (the report) — yes
- "Counterfactual" (the report's filters) — yes
- "Backtest" — **no, not yet**
- "Backtested to X%" — **no, not yet**
- "Validated against historical data" — **no, not yet**

---

*If you are an LLM continuing this work in a future session: the
hardest part of this plan is not the code, it's the temptation to
skip the model-version snapshot and call a re-aggregation a backtest.
Don't.*
