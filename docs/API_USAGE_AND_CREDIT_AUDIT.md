# API Usage & Credit Audit — Program 084–087 (2026-07-31)

## 1. The Odds API — the only metered spend

**Measured from the credit ledger every generated board carries** (`credits.before/after/spent`,
written by the ingest itself — first-party evidence, not an estimate):

| Date (July) | Balance before board gen | Board spend | Notes |
|---|---|---|---|
| 07-01 | 19,982 | 46 | balance consistent with a 20,000/mo quota reset |
| 07-05 | 19,518 | 12 | |
| 07-11 | 18,437 | 57 | |
| 07-22 | 15,162 | 62 | pregame player-prop archive vars ON around this window |
| 07-28 | 11,716 | 61 | |
| 07-31 | 10,300 | 0 (cache) | |

- **July consumption ≈ 9,700 credits** (19,982 → 10,300), ~**48% of a 20K monthly quota**.
- Board generation itself is cheap (12–62 credits/slate; often **0 on cache hits** — the 120-min
  `ODDS_CACHE_TTL_MINUTES` is demonstrably working). The larger share was the between-board burn:
  pregame market/player-prop archive ingests during the capture-window experiment (~200–300/day in
  the 07-21..28 window), which are **currently gated off** (`PREGAME_ARCHIVE_MARKETS` /
  `PREGAME_ARCHIVE_PLAYER_PROPS` unset ⇒ `mlb-pregame-capture` paid steps skip).
- **Current steady-state burn**: `morning-projections` (1×/day, `MAX_PER_RUN=75`, floor 300) +
  `mlb-daily-production` (1–2×/day, 2 ingests, floor 2000) ≈ **60–130 credits/day** ⇒ ~2–4K/month,
  comfortably inside quota with ~5× headroom for NBA revival.

## 2. Credit governance (verified live)

| Control | Where | State |
|---|---|---|
| Credit floor (production slate) | `ODDS_API_MIN_CREDITS_REMAINING=2000` repo var; exposed as both env names the ingests read (`mlb-daily-production.yml`) | LIVE |
| Credit floor (projections) | `MIN_REMAINING` (default 300) | LIVE |
| Cache TTL | `ODDS_CACHE_TTL_MINUTES=120` — July boards show real `after: "cache", spent: 0` hits | LIVE + PROVEN |
| Dry-run default | `ODDS_DRY_RUN=true` repo-wide — `auto-refresh` cannot spend despite `ENABLE_ODDS_REFRESH=true` | LIVE |
| Per-run cap | `ODDS_MAX_EVENTS_PER_RUN=2` (legacy var), `MAX_PER_RUN=75` | LIVE |
| Spend ledger | `credits` block in every board — auditable trail | LIVE |

## 3. Duplicate / wasted calls found & fixed this program

1. **Failed-upstream double ingest (FIXED).** `mlb-daily-production` chained on *any* completion of
   morning-projections, so a failed upstream still ran two paid ingests — and the 14:15 UTC backstop
   cron then ran them again. The chain now requires `workflow_run.conclusion == 'success'`; the
   backstop cron is unchanged, so slate coverage is preserved.
2. **Repeat identical calls within a cycle** are already suppressed by the 120-min cache (proven by
   the `spent: 0` cache entries); no further duplicate paid path was found — settlement
   (`automation_settle.sh`) is credit-free by construction.
3. **Calls before markets open** — the morning board generates at ~11:52 ET when evening games'
   markets aren't posted, which is why the two live-slate invariant tests (sim-orphans /
   prop-resolution) go red every morning and the `daily-lifecycle` quality gate refuses. This wastes
   **runner minutes, not credits** (the later ingest fetches what's new). Flagged in the waste
   register; the invariant-vs-slate-timing adjudication is tracked separately (Program 080–083
   spawned task).

## 4. Free-API volume (no cost, but reliability posture)

- MLB StatsAPI: ~13 fetch steps × 7–8 pregame-capture runs/day plus settlement — highest volume,
  throttled, free.
- `stats.nba.com` via `nba_api`: the offseason hang made every `auto-refresh` run hit its 25-min
  timeout (9×/day). **Fixed** with the same `timeout` + fail-soft-to-cache guard
  `morning-projections` already used (`scripts/automation_refresh.sh`).

## 5. Budgets & anomaly watch (recommended wiring, no secrets involved)

- The board `credits` block already gives a daily spend line; a >500-credit day or a balance
  projected to cross the 2,000 floor before month-end is the anomaly signature worth alerting on
  via the (now proven) ops webhook. Recorded in `COST_OPTIMIZATION_30_60_90_DAY_PLAN.md` (30-day
  item) rather than shipped blind this session.
- Pregame timestamp integrity is untouched by all of the above: caching reuse remains limited to
  the provider layer's TTL window; `capturedAt < eventStart` guards are unchanged.
