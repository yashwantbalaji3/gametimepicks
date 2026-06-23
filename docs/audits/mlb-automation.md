# MLB Daily Automation — ingest, Homer Nukes, settlement

_Phase H of the Master MLB + Product Polish sprint. Date: 2026-06-23._

This documents the end-to-end daily MLB pipeline: how the board, the Homer Nukes parlay, the player
headshots, and settlement are produced. The guiding rule is **never fabricate** — every artifact is a
real provider fetch or a derived view of one. The pipeline is **read-only to money**: it only ever writes
`app/public/data/mlb/**` and never touches bankroll / crown / exposure / `portfolio.json` / results /
settlement history.

## Pipeline at a glance

| # | Step | Script / source | Writes | Cost | Money-safe |
|---|------|------------------|--------|------|------------|
| 1 | Ingest slate + prop odds | `app/scripts/ingest-mlb-slate.mjs` → The Odds API | `mlb/schedule/<date>.json`, `mlb/player-props/<date>.json`, `mlb/home-run-props/<date>.json` | ~8 Odds credits/event | yes — only mlb artifacts |
| 2 | Enrich headshots + team | `app/scripts/enrich-mlb-headshots.mjs` → MLB Stats API | rewrites the two prop artifacts with `photoUrl`/`playerId`/`team`/`teamAbbr` | **free** (statsapi, no key) | yes — only mlb artifacts |
| 3 | Homer Nukes parlay | `app/src/lib/mlb/homer-nukes.ts` (`loadHomerNukes`) | nothing — **derived at render time** | none | n/a (pure read) |
| 4 | Settlement | `app/src/lib/mlb/mlb-settlement.ts` → MLB Stats API box scores | nothing by itself (pure grader) | free | yes — pure, no I/O |

### 1. Ingest — `ingest-mlb-slate.mjs`

Fetches the MLB slate (`/v4/sports/baseball_mlb/events`) and per-event prop odds
(`/events/{id}/odds?markets=batter_home_runs,batter_hits,batter_total_bases,batter_rbis,batter_runs_scored,pitcher_strikeouts,pitcher_outs,pitcher_earned_runs`).
Normalizers in `app/src/lib/mlb/ingest-normalize.ts` shape the response into the committed artifacts.

- **Key-gated and honest.** With no `ODDS_API_KEY` set it reports the blocker and exits 0 — it writes
  nothing and fabricates nothing.
- **`--dry-run`** fetches and reports byte counts without writing — used by the scheduled dry-run.
- The HR subset (`home-run-props/<date>.json`) is what Homer Nukes prefers.

```
ODDS_API_KEY=… npx tsx app/scripts/ingest-mlb-slate.mjs --date 2026-06-23            # write artifacts
ODDS_API_KEY=… npx tsx app/scripts/ingest-mlb-slate.mjs --date 2026-06-23 --dry-run  # report only
npx tsx app/scripts/ingest-mlb-slate.mjs --date 2026-06-23 --dry-run                 # no key → reports blocker, exits 0
```

### 2. Enrich — `enrich-mlb-headshots.mjs`

Joins each ingested prop to the **free** MLB Stats API to attach a real player headshot + team, with **no
Odds-API credits**:

- `https://statsapi.mlb.com/api/v1/sports/1/players?season=YYYY` → name → player id
- `https://statsapi.mlb.com/api/v1/teams?sportId=1` → team abbreviation
- headshot: `https://midfield.mlbstatic.com/v1/people/{id}/spots/120`

Matching is by normalized full name with a `First Last` fallback. On the 2026-06-23 slate this matched
**508/508 home-run props and 1463/1463 player props**. Unmatched players simply keep no headshot (the
`PlayerAvatar` falls back to initials) — never a wrong face. This is what feeds the headshots on the
Homer Nukes legs, the Featured/Pitcher lists, and every props-board row.

### 3. Homer Nukes — derived, not generated

There is **no separate Homer Nukes generation script** and therefore nothing that can fabricate a parlay.
`loadHomerNukes()` reads `home-run-props/<date>.json` at render time and:

- keeps only real, pre-event, provider-backed **anytime-HR** markets (the "Over 0.5" line) inside a sane
  longshot band, clearing an 8% model floor;
- ranks by Homer Score when Statcast inputs are present, else by **de-vigged market probability** (honest
  — no fabricated edge);
- takes one leg per game, up to 5 → the daily $20 paper parlay.

Because the parlay is a pure function of the posted board, **posting the board IS posting Homer Nukes** —
the automation never writes a parlay artifact.

### 4. Settlement — `mlb-settlement.ts`

A **pure grader**: it settles Homer Nukes legs and MLB props from **official box scores** (MLB Stats
API). `gradeProp()` maps each market key to its box-score stat; a player with no line (DNP) grades
**void**, never a loss. The module has **no I/O and no money mutation** — a separate, explicitly
operator-run step would write any Homer Nukes history, and only an additional gated step could ever touch
the protected bankroll (this module never does). Until that operator step runs, the board's
historical-performance slot honestly reads "Awaiting settled history."

## GitHub Actions — `.github/workflows/mlb-daily.yml`

A scheduled + dispatchable workflow that runs steps 1–2. **Dormant by default**, mirroring the
lineup-aware World Cup workflow:

- **`mode=dry_run` (default)** — ingest fetches and reports, writes nothing, commits nothing.
- **`mode=write_board`** — ingest writes the artifacts, enrich attaches headshots, and the commit step
  stages **only `app/public/data/mlb`** (money files are never in that path).
- Requires repo secret `ODDS_API_KEY`. Without it the ingest honest-no-ops. The schedule stays dry_run
  unless an operator sets repo variable `MLB_MODE=write_board`.
- Credit floor `ODDS_API_MIN_CREDITS_REMAINING=2000` protects the key budget.
- Settlement is **intentionally not auto-run** — grading writes nothing on its own and any history/bankroll
  write must remain an explicit operator action.

```
# Operator activation (one-time):
#   1. Add repo secret ODDS_API_KEY (paid plan with MLB player-prop coverage).
#   2. Dispatch with mode=write_board, OR set repo variable MLB_MODE=write_board to let the 15:10Z schedule post daily.
```

## What is NOT automated (by design)

- **Bankroll / crown / exposure / portfolio.json** — never written by any step here.
- **Homer Nukes settled history** — requires an explicit operator grading run; until then the UI shows the
  honest "Awaiting settled history" state.
- **Homer Score advanced inputs** (Barrel% / Hard-Hit% / xSLG / HR/FB / Pitcher HR/9 / Weather / Park) —
  no Statcast/weather feed is wired, so the model runs in **Partial Model** mode (market-probability
  ranking) and the UI labels it as such. This is the one external data dependency that remains open; see
  the public-release audit.

## Blockers / open dependencies

1. **Statcast + park + weather feed** for the full Homer Score (0/7 advanced inputs live today). Until
   wired, ranking is de-vigged market probability and the UI shows "Partial Model · … pending Statcast".
2. **Operator settlement run** to populate Homer Nukes history (grader is ready; the write step is gated).
3. **`ODDS_API_KEY` as a repo secret** to let the workflow post production boards on schedule.
</content>
