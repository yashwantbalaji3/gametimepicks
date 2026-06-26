# GameTime Picks — Daily Operations Runbook

The autonomous daily cycle, the order it must run in, and the one thing currently blocking full
hands-off operation. Money integrity is the hard invariant: **no bankroll movement without an official
settled result.**

## One command: `scripts/roll_to_next_day.sh` (the orchestrator)

The full chain is now a single, settle-first, money-gate-guarded, idempotent orchestrator (PHASE 2):

```
bash scripts/roll_to_next_day.sh --to <YYYY-MM-DD>                  # dry-run (plan only, default)
bash scripts/roll_to_next_day.sh --to <YYYY-MM-DD> --apply          # settle prior day + generate (no deploy)
bash scripts/roll_to_next_day.sh --to <YYYY-MM-DD> --apply --deploy # full autonomous roll + push + verify
OFFICIAL=/tmp/official.json  bash scripts/roll_to_next_day.sh --to <D> --apply   # operator results bundle
```

It runs: money-gate → settle PRIOR day (`settle_soccer_day.sh`, official-gated) → **settle-first HALT
guard** (refuses to generate if a prior-day Bank Builder lane is still ACTIVE/unsettled) → fetch WC odds +
build projections → promote `latest.json` → activate Bank Builder next rung + Moonshot → refresh WC
Specials → ingest+enrich Homer Nukes → capture benchmark → **money-gate** → tests → build →
[push+verify production]. Dry-run writes nothing and never deploys. The money-integrity gate aborts the
roll at any hinge if the bankroll doesn't reconcile; tests/build failures block the deploy. Invariants
pinned in `app/src/lib/roll-forward-orchestrator.test.mjs`. **Do NOT `--apply` mid-slate — it will refuse
to roll over the live, unsettled day (settle-first).**

## The daily chain (settle-first, by design)

```
02:00 ET  ── verify finals ──► settle ──► reconcile ──► archive ──► [model learning]
                                                                          │
          ── fetch fresh odds ──► build projections ──► generate products ──► QA ──► build ──► deploy
```

Settlement runs **first**. Generation must not roll the site to a new day until the prior day is
settled, because a Bank Builder Step-N card, once its games kick off, is a committed pending wager —
regenerating would silently abandon it and the daily-portfolio loader (`fromPersisted` returns null on
date mismatch) would make the pending lane vanish. So if settlement is blocked, the chain correctly
halts and the live site stays on the last settled day.

### Step-by-step

| Step | Command | Money? | Safe-by-design |
|---|---|---|---|
| 1. Settle (official-gated) | `bash scripts/settle_soccer_day.sh --date <D> --apply` | yes | NO-OP if 0 official FT matches; idempotent; crown immutable |
| 2. Reconcile | (run inside step 1) `build-mr-dub-ledger.mjs` | derived | pure rebuild from artifacts |
| 3. Archive | dated files are append-only (`<D>.json` never overwritten) | no | history immutable |
| 4. Model learning | `lib/learning/calibration.ts` over settled obs | no | empty input → null metrics, never fabricated |
| 5. Benchmark capture | `npx tsx app/scripts/capture-market-benchmark.mjs --date <D+1>` | no | snapshots already-fetched odds; no new credits; idempotent per hour bucket |
| 6. Fetch odds | `python -m pipeline.world_cup.odds_api --date <D+1> --markets h2h,totals` | no (credits) | reads live Odds API |
| 7. Build projections | `python -m pipeline.world_cup.build_odds_only_projections --date <D+1>` | no | de-vigged market-implied only |
| 8. Generate products | WC Specials / Homer Nukes (`enrich-mlb-headshots.mjs`) / Moonshot / BB next-rung | no ($0 paper) | BB advances only after step 1 settles the prior rung |
| 9. QA → build → deploy | `tsc` · `tsx --test` · `next build` · merge | — | deploy only if money reconciles + tests green |

## Phase 4 — Market Benchmark Engine (v1, shipped)

Pre-kickoff line-movement tracking, so movement becomes a **model feature** (never a follow-the-steam
signal).

- **Capture:** `app/scripts/capture-market-benchmark.mjs` appends one timestamped snapshot per run to
  `world-cup/benchmark/<date>.json` (real Odds-API consensus price + implied prob per market line).
  Run on the schedule **02:00 / 06:00 / 09:00 / 11:00 / 13:00 / 15:00 ET + final pregame**.
- **Movement:** `app/src/lib/benchmark/market-movement.ts` derives opening→current, net move, implied-prob
  delta, % move, direction (shortening/drifting), a consistency-weighted confidence score, and per-line
  series. 8 unit tests.
- **Honest by construction:** one capture = `opening-only`, score 0, no invented trend. Steam/velocity
  become meaningful once ≥2 real captures accrue across the day. We never fabricate intermediate points.
- **v1 scope vs full vision:** v1 stores consensus price + implied prob per market and computes movement.
  Per-book hold, multi-book consensus spread, and sharp/public splits require the raw per-book feed and
  several days of accrued captures — additive next steps, not faked now.

## Phase 5 — Model Learning (v1 foundation, shipped, awaiting data)

`app/src/lib/learning/calibration.ts` — Brier score, log loss, and a reliability (calibration) table +
expected calibration error, over `{ predictedProb, outcome }` pairs built from the model's **pre-kickoff**
projection and the **official** result (no post-kickoff leakage). 6 unit tests. Returns `n:0` / null on
empty input. It has **no observation set to score until games settle officially** — it is the ready
foundation, not a claim that learning has happened.

## ⛔ The one blocker to full autonomy: official-results coverage

`pipeline/fetch_official_soccer.py` (API-Football v3 `/fixtures`) returns **`NOT_FOUND`** for the World
Cup fixtures we track (verified June-25: all 4 BB-leg games NOT_FOUND; same as June-24). So
auto-settlement cannot grade them, and the chain halts at step 1. **Resolution paths:**

1. **Operator official bundle** (proven on June-24): drop a `{matches:[{home,away,status:"FT",homeGoals,
   awayGoals}]}` file and run `OFFICIAL=/path bash scripts/settle_soccer_day.sh --date <D> --apply`.
   The grading engine + reconciliation are tested and automatic from there.
2. **Fix the fixture mapping** so API-Football resolves these fixtures (league/season id + team-alias
   join), making step 1 fully hands-off.

Until one of those lands, settlement is **operator-gated** — which is the correct, money-safe default.

## Schedulers already in the repo

`.github/workflows/nightly-settle.yml` (wraps `settle_soccer_day.sh`), `mlb-daily.yml`,
`daily-refresh.yml`, `morning-projections.yml`, `lineup-aware-refresh.yml`. They are **dormant /
dry-run by default** and require operator-set repo secrets (`ODDS_API_KEY`, `API_FOOTBALL_KEY`) +
mode vars to write production — intentional, so nothing auto-publishes or auto-moves money unattended.
