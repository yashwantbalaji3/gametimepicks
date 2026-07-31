# GitHub Actions Resource Optimization (2026-07-31, Program 088-091)

$0 billing (public repo, standard runners) — the optimized resources are wall-clock, queue
health, signal quality, and artifact hygiene. Baseline defect inventory:
`VERCEL_GITHUB_COST_AUDIT.md` (084-087).

## Workflow census after this program

9 scheduled workflows (~26 invocations/day) · 13 dispatch-only dormant. All generated-data
writers still share the single `gtp-generated-artifacts` queue (serialization preserved).

## Fixed this program

1. **auto-refresh silent exit-1 (NEW ROOT CAUSE, fixed).** The 084-087 timeout fix worked —
   runs stopped hanging at 25 min — but exposed a latent `set -e` kill: for a unittest-style
   suite (`enrich_board_test` prints `Ran 9 tests … OK`), the summary-extraction
   `last=$(… | grep "assertions passed" …)` returned 1 and killed the script **silently, with
   zero output**, right after `simulation_test`. Every post-fix run (17:42, 19:39, 21:09 UTC)
   failed there. Fixed with `|| true` on both extraction substitutions
   (`scripts/automation_refresh.sh`); the fixed loop was replayed verbatim over
   `simulation_test` + `enrich_board_test` and survives both output styles. auto-refresh should
   now complete end-to-end for the first time in its observable history — verify on its next
   scheduled run.
2. **npm caching parity**: `mlb-daily-production` and the first setup-node in `nightly-settle`
   now use the lockfile-keyed `cache: npm` the other daily workflows already had (saves a full
   `npm ci` download on every cache hit; measured value visible in run timings).
3. **Credit-budget observability step** added to `mlb-daily-production` (never fails the run).

## Verified retained from 084-087

- `daily-refresh` cron stays removed (dispatch only) — no duplicate full-suite runs.
- Pregame artifact retention 7d for new uploads; old 90d artifacts age out through late October
  (~48 GB standing shrinks to ~3–4 GB steady-state; current API sample: 159 artifacts,
  ~0.8 GB/100 newest).
- `daily-lifecycle` wired to the shared alerter (failures no longer silent).
- `mlb-daily-production` chain requires upstream success (no paid double-ingest after a failed
  morning run).
- Duplicate `npm ci` in nightly-settle stays removed.

## Test tiering (5.2) — current state and boundary

Full serial suite + typecheck + build already run **only** in scheduled data workflows (there is
no push/PR CI at all), so "skip full suites on docs-only commits" is structurally satisfied —
docs commits trigger nothing. The remaining tiering question is auto-refresh's 9×/day
full-suite+build habit: with the hang fixed this is real validation at ~8–12 min/run. Reducing
its cadence or splitting fast/full tiers is a **service-level change → founder approval**
(30/60/90 plan item, with a measured week of green runs as the evidence base). No test was
removed or weakened.

## Cron reliability (5.5)

GitHub crons remain best-effort (documented skips). The existing remedies stand: manual
dispatch + shared queue means a late run is a late writer, never a duplicate writer; the
backstop cron on `mlb-daily-production` covers a skipped morning chain, and its success-guard
now prevents the failure-double-spend. A staggered second cron was evaluated and rejected for
now: it would add duplicate paid ingests in the common (on-time) case to insure against the
rare (skipped) one — wrong trade at current credit headroom.

## Remaining open items (30/60/90)

- `daily-lifecycle` vs `nightly-settle` settlement overlap — founder decision.
- `daily-rebuild`: still a dead no-op daily green run until `VERCEL_DEPLOY_HOOK_URL` exists or
  the workflow is deleted (founder).
- Repo/data growth (339 MB build input, ~16 MB/day) — retention design program, not a quick fix.
- `git gc` hygiene pass (37 packs) — safe anytime, low value, unscheduled.
