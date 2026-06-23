# MLB Data Pipeline — Complete Machinery + the Exact External Blocker

**Date:** 2026-06-23. **Scope:** Phase 1/4/5/9 — build the full daily MLB pipeline (ingest → generate →
settle) and state precisely why live data is not flowing.

## TL;DR — the exact blocker
Live MLB data is **not flowing for one concrete, external reason**: there is **no `ODDS_API_KEY`** in
this environment (no `.env` file exists, and `process.env.ODDS_API_KEY` is unset). The ingestion pipeline
is **built and verified** — running it without a key prints the blocker and writes nothing:

```
$ npx tsx app/scripts/ingest-mlb-slate.mjs --date 2026-06-23 --dry-run
[ingest-mlb] BLOCKED: ODDS_API_KEY is not set. The MLB board cannot be ingested without Odds API credentials.
[ingest-mlb] Set ODDS_API_KEY (paid plan with MLB player-prop coverage) and re-run. No artifacts written; nothing fabricated.
```

To make MLB go live, the **operator** must provide a paid Odds API key with MLB player-prop coverage and
run the ingest (locally or in CI). Nothing in the app changes — the products read the artifacts the
ingest writes and light up automatically. We will **not** fabricate a board.

> Secondary note: this app runs on a fixed simulated June-2026 slate fed by committed snapshots. A live
> Odds API key returns markets for the real-world current date, so an operator wiring this up would point
> the date at the live slate the key actually serves.

## The pipeline (all built this sprint)
1. **Ingest** — `app/scripts/ingest-mlb-slate.mjs` (key-gated, `--dry-run`). Fetches the slate + prop
   odds and writes read-only artifacts. **Never touches** bankroll / crown / exposure / portfolio.json /
   results. Pure transforms in `app/src/lib/mlb/ingest-normalize.ts` (unit-tested).
   - Writes: `mlb/schedule/<date>.json`, `mlb/player-props/<date>.json`, `mlb/home-run-props/<date>.json`.
2. **Generate** — `app/src/lib/mlb/diamond-specials-generator.ts` (pure, tested). Prop pool → 5 Diamond
   Specials cards (Homer · Hits · Bases · Pitching · Longshot), $20 each, max 1 leg/game. A thin script
   reads `player-props` and writes `mlb/diamond-specials/<date>.json` (what `loadDiamondSpecials` reads).
3. **Settle** — `app/src/lib/mlb/mlb-settlement.ts` (pure, tested). Official box scores → Homer Nukes
   accuracy + Diamond Specials record/ROI/P&L. DNP → **void** (never a loss). **No money mutation**: it
   returns graded results; writing histories is a separate operator step, and updating the protected
   bankroll/exposure is an additional gated step this module never performs.

## Data sources (documented)
| Source | Endpoint | Used for |
|---|---|---|
| The Odds API | `GET /v4/sports/baseball_mlb/events` | daily schedule (game ids, teams, commence time) |
| The Odds API | `GET /v4/sports/baseball_mlb/events/{id}/odds?regions=us&oddsFormat=american&markets=…` | prop odds |
| — markets ingested | `batter_home_runs, batter_hits, batter_total_bases, batter_rbis, batter_runs_scored, pitcher_strikeouts, pitcher_outs, pitcher_earned_runs` | HR · hits · bases · runs · pitchers |
| MLB Stats API | `statsapi.mlb.com` (schedule + box scores) | settlement (official finals) — operator-run |
| Statcast / park / weather | (separate enrichment, not yet wired) | Homer Score modeling inputs; engine edge-ranks until wired |

## What's NOT the blocker
- Not the loaders: `loadHomerNukes` + `loadDiamondSpecials` already read the exact artifact shapes the
  ingest writes, and the Homer Score engine ranks the moment inputs exist.
- Not the UI: every MLB surface renders honest empty states today and the products auto-populate.
- Not market mappings: the ingest covers HR/hits/bases/runs/pitcher markets; the settlement maps each to
  its box-score stat.

## How to run it (operator)
```
# 1. Ingest the slate (writes mlb/schedule + player-props + home-run-props)
ODDS_API_KEY=… npx tsx app/scripts/ingest-mlb-slate.mjs --date <live-date>

# 2. (generate Diamond Specials from the props — generateDiamondSpecials)
# 3. After finals, settle from box scores — settleHomerNukes / settleDiamondSpecials
```

## Verification
- Pipeline transforms/generator/settlement covered by `app/src/lib/mlb-pipeline.test.mjs` (7 tests).
- Ingest dry-run with no key: honest no-op, exit 0, nothing written (confirmed).
- Bankroll/crown/exposure/settlement untouched; no MLB data files committed (nothing fabricated).
