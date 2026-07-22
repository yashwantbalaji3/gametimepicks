# MLB Pregame Collection — Operating Plan (2026-07-21)

Daily operating plan for the forward-only, internal-only MLB pregame research archive. **Collection is ENABLED** (scheduled workflow, non-blocking). No modeling, no public change, no money/settlement/product change.

## Daily cadence (GitHub Actions, UTC)

`.github/workflows/mlb-pregame-capture.yml` runs the capture at these fixed UTC times (≈ pregame progression across the slate):

| cron (UTC) | ≈ ET | window purpose |
|---|---|---|
| `0 11 * * *` | 07:00 | T‑24h schedule / probables / weather shell |
| `0 15,17,19,21,23 * * *` | 11:00–19:00 | probables → lineups → confirmed lineups + umpires |
| `30 22 * * *` | 18:30 | T‑30m final for ~19:00 ET first pitches |
| `0 1 * * *` | 21:00 | late / West-coast games |

≈ **8 runs/day.** Plus `workflow_dispatch` for manual/ad-hoc captures and event-driven refreshes.

**GitHub cron is approximate** — runs can be delayed or skipped under load, and there is no sub-hour precision guarantee. **Correctness does not depend on exact firing:** the per-game eligibility gate (`capturedAt < eventStartTime`) makes any post-start capture ineligible, and multiple daily runs capture the information progression (early runs get probables/weather; later runs get confirmed lineups). A missed run only lowers coverage for that window, never admits bad data.

## Data families + sources

| family | source (implemented) | typical coverage | notes |
|---|---|---|---|
| pitcher_status | StatsAPI probablePitcher | ~100% | projected pitch count = INTERNAL_ESTIMATE only |
| environment (weather+roof) | StatsAPI game feed | ~100% | pregame condition/temp/wind + roof; never observed postgame weather |
| umpire | StatsAPI boxscore.officials | grows toward game time | never the final box-score umpire |
| confirmed_lineup | StatsAPI boxscore.battingOrder | low early, high near first pitch | multi-snapshot cadence is what raises this; never final box-score lineup |
| markets | the-odds-api (paid) | 0 — **not fetched** | founder must approve a paid source + storage terms |
| bullpen / opportunity | derived / markets | 0 | builders pending |

## Provider limits

- **StatsAPI (statsapi.mlb.com)** — free, no key, generous. One capture run = 1 schedule fetch + ~15 game-feed fetches; ~8 runs/day ≈ **~130 fetches/day**. Well within reasonable use. Retries use bounded backoff + a 15s timeout; failures are recorded, not fatal.
- **the-odds-api** — paid, credit-metered; **not called** by this pipeline. Enabling markets requires a founder-approved key + a documented credit budget.

## Persistence

Two layers, both non-blocking:

- **Large payloads → workflow artifacts.** Every run uploads `data/internal/mlb/pregame-archive/` as a 90‑day artifact, including the large raw/normalized market payloads (`normalized.json` ≈ 1 MB, `raw.json` ≈ 150–340 KB), which are **gitignored** and never committed.
- **Small metadata → in-repo commit (ENABLED 2026‑07‑22, `PREGAME_ARCHIVE_COMMIT=true`).** A hardened, path-scoped commit step durably accumulates only the small archive metadata so the repo becomes the progress ledger toward the 30-date gate. What it commits: manifests, `status/latest.json` + `status/monitor.json`, per-game StatsAPI snapshots + freezes, and the root summaries (schema / source-registry / settlement-join-plan) — all ≈ 4–6 KB each.

The commit step is **money-safe by construction**:
- **Path-scoped** — `git add data/internal/mlb/pregame-archive/` only; never `git add -A`/`.`, never money/public/settlement/product paths.
- **Size-guarded** — a 128 KiB (`MAX_FILE_BYTES=131072`) cap unstages any oversized file (backstop if a large payload ever slipped past `.gitignore`). The cap sits cleanly between metadata (≤ ~6 KB) and market payloads (≥ 148 KB).
- **Safety-asserted** — before committing, any staged path outside the archive dir (or matching `portfolio|public/data|mr-dub|out/|settled_leans|bank-builder|moonshot|settlement`) aborts the step with nothing committed.
- **Rebase-safe** — the archive-only commit is rebased onto the latest origin before push (`git pull --rebase --autostash`), so a concurrent money/nightly-settle push is **never reverted**. No force push. `[skip ci]` prevents commit loops.
- **Non-blocking** — `continue-on-error`, never on `pull_request`; if anything fails the artifact upload still preserves the run.

## Safety guarantees

The workflow is `continue-on-error` (non-blocking), never runs on `pull_request`, is concurrency-guarded, and **does not** affect the public build, settlement, Bank Builder, Moonshot, money, the official record, or product eligibility. It is a shadow pipeline: if the scheduler or a source is unavailable, official product behaviour is unchanged.

## Daily status

`node app/scripts/audit-mlb-pregame-archive.mjs` → `data/internal/mlb/pregame-archive/status/latest.json`:
dates collected · games captured · snapshots before first pitch · post-start rejected · coverage by family · lineup/umpire/weather coverage · freeze completeness · research-gate progress.

## CI enablement status (2026-07-21 — LIVE)

Repo variables **set** (GitHub → Settings → Variables) + `ODDS_API_KEY` secret **present** → the scheduled workflow now captures team markets **and** capped player props:

| variable | value | effect |
|---|---|---|
| `PREGAME_ARCHIVE_MARKETS` | `true` | team markets (h2h/spreads/totals) captured each run |
| `PREGAME_ARCHIVE_PLAYER_PROPS` | `true` | player props captured each run (separate toggle) |
| `PREGAME_ARCHIVE_PLAYER_PROP_MAX_EVENTS` | `3` | **conservative cap — 3 events/run** (workflow also hard-defaults to 3) |
| `ODDS_API_MIN_CREDITS_REMAINING` | `2000` | script stops before the balance drops under 2,000 |

**Expected daily credit cost:** team ~3/run + player props ~3 events × 9 markets = ~27/run ⇒ **~30 credits/run × ~8 runs/day ≈ ~240 credits/day**. At 15,379 remaining with a 2,000 floor, runway ≈ **~55 days** (the floor auto-stops capture before exhaustion). To spend less: lower the cap, reduce the market list, or capture props on fewer cron times.

**CI validation run (2026-07-21, `workflow_dispatch` for 2026-07-22):** all steps executed and the run **succeeded** (non-blocking design held). StatsAPI capture ✓ (17 games, all pregame). The opt-in commit step correctly **skipped** (`PREGAME_ARCHIVE_COMMIT` unset). **BLOCKER:** both paid steps **aborted safely** with `credit guard: remaining 0 < floor 2000` — the **GitHub `ODDS_API_KEY` secret returns 0 credits remaining**, while the local `.env` key (last4 `2a97`) has ~15,379. **Founder action:** update the repo secret `ODDS_API_KEY` to the credit-funded key (the one in `.env`) so CI paid capture can run — e.g. `gh secret set ODDS_API_KEY --repo yashwantbalaji3/gametimepicks` (paste the funded key). Until then, CI captures only the free StatsAPI families; paid capture works locally.

**Monitor:** `node app/scripts/monitor-mlb-pregame-archive.mjs` → `status/monitor.json` (daily status: team/prop capture, events/markets/records/eligible/paired-vs-over-only/de-vig/est+actual credits/remaining/skipped/provider_unavailable; 7-day progress: dates, market/prop dates, avg eligible records/day, days-to-30-date-gate).

## Research gate (before any future modeling)

```
minDistinctDates: 30
minSettledEligibleObs: 500   (populated only by a later settlement-join mission)
minFeatureCoveragePct: 80
minTimestampProvenPct: 90
+ founder approval
```

**Current progress (2026-07-21):** dates 1/30 · settled-eligible 0/500 · weather 100% · pitcher 100% · umpire 26.7% · lineup 6.7% · freeze 100%. **Gate NOT met — expected; collection just started.**

## Next modeling date estimate

**Not promised** — it depends on future slate volume and how many dates clear the gate. At ~15 games/day with daily runs, reaching **30 distinct dates ≈ ~30 days** of continuous collection (≈ late-Aug 2026 if collection runs uninterrupted from 2026‑07‑22). The **500 settled-eligible-row** threshold is only measurable after a separate settlement-join mission runs, and depends on per-family coverage (lineup coverage in particular rises only with the mid/late-day snapshot runs). No modeling begins until the gate is met **and** the founder approves.

## Settlement-join plan (no execution)

See `data/internal/mlb/pregame-archive/settlement-join-plan.json`. In brief: after a game settles, official box-score outcomes (from `settled_leans.jsonl`, joined by gamePk/id) attach to the immutable `FINAL_PREGAME_FREEZE` in a **separate** research-join record — never mutating the pregame snapshot. A family contributes to a row only if the freeze marked it `researchEligible`. The market remains the benchmark; no family is "incremental" unless it later beats the de-vigged market out of sample.
