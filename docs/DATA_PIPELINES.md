# Data Pipelines

How data flows from public feeds to the published product, and the
boundaries that keep it honest.

## 1. Schedule ingestion (schedule-only sports)

- Baked, hand-verified point-in-time snapshots in
  `app/src/lib/event-schedules.ts` from **public ESPN scoreboard** feeds
  (WNBA `basketball/wnba`, UFC `mma/ufc`, MLS `soccer/usa.1`, FIFA
  `soccer/fifa.world`), plus the official 104-match World Cup schedule in
  `app/public/data/world-cup/`, and NHL/IPL via their own hubs.
- Each snapshot carries `source`, `url`, `retrievedAt`, `rangeStart`,
  `rangeEnd`, and a schedule-only `note`. **No live frontend fetches.**
- EPL: no sourceable fixtures → **coming soon**, no fabricated schedule.

## 2. Projection / odds generation (`morning-projections`, 9:30 AM ET)

- NBA: `pipeline/generate_daily_board.py`; MLB:
  `pipeline/mlb/generate_mlb_board.py` (+ `mlb_model.py`).
- Inputs: player stats, **recent-form** (`recent10` / `recentSeries`, with
  DNP guards), **odds/lines from The Odds API** (paid, credit-guarded), and
  per-market consensus + a calibration factor.
- Outputs per leg: `projection`, `edgePct` (= model probability − market
  implied probability, in pp), `confidence` tier (binned from `edgePct`),
  `oddsForSide`. The optimizer then assembles parlays + `publicRiskSections`.
- **Honest empty / clock-gated behavior:** the run is scheduled for 9:30 AM
  ET; before it fires, today's board legitimately does not exist. The
  product shows `0/0` "board posts each morning" and falls back to the
  latest available slate. **Never fabricate early data; never dispatch the
  paid run early just to fill the page.**

### 2.1 Persisted `recentSeries` contract (recency window)

- **Order:** per-game values are **oldest → newest** everywhere — NBA
  `recent10` (`recent10_extractor.extract_recent10`) and MLB `recentSeries`
  (`mlb/mlb_model.py`). `recentGames` metadata is the same order + 1:1 aligned.
- **Window:** the persisted leg field (optimizer legPool / snapshot /
  `publicRiskSections` / graded) carries the **MOST RECENT** games — at most
  **10**, sliced from the **tail** (`series[-10:]`). L5 = `recentSeries[-5:]`;
  L10 = `recentSeries[-10:]` (or the whole field when length ≤ 10).
- **`recent10Count`** is the FULL count of valid recent games (may exceed 10);
  it is **not** the persisted window length.
- **Implementation:** `pipeline/parlay_optimizer.py::last_n_recent_values`
  (used by `normalize_lean` + `_lean_from_payload`). It is **input-order
  normalized, not sport-aware**: because both sports are oldest→newest, the
  recent window is always the tail. NBA `recent10` is already ≤10 (the
  extractor tail-slices), so it is a no-op there; MLB passes the full season
  series, so the tail slice is the fix.
- **History (the bug fixed by `fix/optimizer-recentseries-recency`):** the
  prior code sliced the **head** (`series[:10]`), persisting the player's
  **oldest** 10 games for the ~88% of MLB legs with >10 games. See
  `SUGGESTED_PARLAY_METHODOLOGY_V2_2026-06-02.md` §6 / `MODEL_AND_OPTIMIZER.md`.
  **Committed artifacts generated before that fix still carry the stale
  (oldest-10) window** until a separate, approval-gated one-time regeneration
  runs; forward generation is correct.

## 3. Auto-refresh (periodic)

- Props-only refresh of the boards; commits generated data to `main` with
  `[skip ci]`. Does not settle and does not generate full new slates.

## 4. Settlement + grading (`nightly-settle`, 3 AM ET)

- `settle_results.py` (NBA: ESPN summary + nba_api + manual override
  fallback) and `mlb/settle_mlb_results.py` (MLB Stats API). **In-progress
  games are refused at the source layer** — a non-final game's legs stay
  **pending**, never a loss.
- Leg grading key: exact `(playerId, market, side, line)` match → win / loss
  / push / unresolved.
- **Slip grading (all-must-win):** any leg loss ⇒ slip loss; any unresolved
  leg (and no losses) ⇒ **pending** (never forced to loss); any push (and no
  losses) ⇒ push. Pushes + pendings are **excluded from the hit-rate
  denominator**.
- Graders: `grade_optimizer.py` (the public slips + `publicRiskSections`),
  `grade_parlays.py`, `grade_curated.py`. Then `export_results.py`,
  `model_audit.py`, `audit_daily.py`, `audit_signal_policy.py`.
- **Idempotent:** re-running a date rewrites that date's rows; summaries
  regenerate from all dates on disk. Settlement **never** writes back into
  projections or the optimizer (zero model feedback loop today).
- Markets settled: NBA `PTS/REB/AST`; MLB `batter_hits / batter_total_bases
  / batter_hits_runs_rbis / pitcher_strikeouts`.

## 5. Public-era boundaries (critical)

- **Public era starts `2026-05-27`** (`PUBLIC_PARLAY_RESULTS_START_DATE` in
  `app/src/lib/public-parlay-era.ts`).
- `optimizer-summary.json` may physically contain May 25/26 rows, but the
  **reader filters them out** — **May 25/26 must never appear as public
  performance** on `/results` or anywhere user-facing.
- **No same-slate contamination:** a slate's own results are never used to
  alter that slate's pregame picks. The learning audit uses only prior
  settled slates (rolling window excludes the same day by construction).
- **No backfill of empty slates** (e.g. May 31 had no slate — it stays
  empty; never invented).

## 6. Data freshness / clock-gating

- The active slate = the latest optimizer snapshot on disk; the latest
  settled = the max optimizer-graded date. When the active slate is settled
  and no newer slate exists, the product honestly shows the settled slate +
  a "view on Results" pointer; Bank Builder shows its honest empty state.
- After the 9:30 AM ET morning run, today's pregame slate appears and the
  active slate advances.

## 7. Unsupported sports

- No ingestion of odds/projections for NHL/WNBA/UFC/FIFA/IPL/MLS/EPL.
  Schedule-only data is attribution-stamped; coming-soon sports get nothing.
  See `SPORTS_COVERAGE_POLICY.md`.
- The optimizer/snapshot/grading wiring is **NBA + MLB only** (sport-agnostic
  core, but `snapshot_optimizer` loads only `load_nba_leans` + `load_mlb_leans`;
  `grade_optimizer._SPORTS = ("nba","mlb","multi","all")`;
  `settle_results.SUPPORTED_MARKETS = PTS/REB/AST`). A new sport reaches
  Projections+Parlays only after a real `pipeline/<sport>/` (ingestion + model
  + grader + tests) ships — never by UI/flag alone. Frontend capability gates
  that mirror this live in `app/src/lib/sport-capabilities.ts`; the staged
  rollout is in `SPORTS_PROJECTIONS_EXPANSION_PLAN_2026-06-02.md`.
