# Operations Runbook

Day-to-day operation of GameTime Picks. Repo path:
`/Users/yashwantbalaji/Downloads/gametimepicks`. See also
[`DATA_PIPELINES.md`](./DATA_PIPELINES.md) and
[`runbooks/`](./runbooks/README.md) for the in-place operational docs
(`AUTOMATION.md`, `SETTLEMENT_GUIDE.md`, `TROUBLESHOOTING.md`, `deploy.md`,
`ODDS_API_ACTIVATION.md`).

## Daily cadence

| Time (ET) | Cron (UTC) | Workflow | Effect |
|-----------|-----------|----------|--------|
| 3:00 AM | `0 7 * * *` | `nightly-settle` | settle prior slate, grade, audit; commit data |
| 9:30 AM | `30 13 * * *` | `morning-projections` | generate today's boards/optimizer (paid Odds API) |
| periodic | — | `auto-refresh` | props-only board refresh |

> **Do not change these schedules** without an operator decision: moving
> settlement to 2 AM ET risks unfinalized late West-Coast games; 8 AM ET
> projections is too early for reliable MLB lineups/lines.

## Settlement (the official path)

```bash
# verify state first
git -C /Users/yashwantbalaji/Downloads/gametimepicks rev-parse HEAD
# dispatch the OFFICIAL workflow (free public APIs, no secrets, auto-commits):
gh workflow run nightly-settle.yml --field settle_date=2026-06-01 --field dry_run=false
```

- Only settle a date whose games are **all final** (settlement refuses
  in-progress games at source, so it won't fabricate — but verify finality
  first, e.g. via the MLB Stats API `/schedule`).
- Re-runs are idempotent. After it commits, `git pull` and verify
  `optimizer-graded/<date>.json` + `optimizer-summary.json`.
- The script `scripts/automation_settle.sh` (env `SETTLE_DATE=...`) is the
  same logic for local runs; the script does not commit — the workflow does.

## Morning projections

- Scheduled at 9:30 AM ET. **Do not dispatch early** before the official
  window unless lines are confirmed available — pre-line data is stale and
  burns paid Odds API credits. If it's before the window, the honest state
  ("board posts each morning", `0/0`) is correct, not a bug.
- After it runs: `git pull`, then verify the active slate advanced, the
  Projections + Parlay Lab show the new slate, and Bank Builder picks a
  fresh pending slip (or honest empty state).

## Checking GitHub Actions / Vercel

```bash
gh run list --workflow nightly-settle --limit 8
gh run list --workflow morning-projections --limit 8
gh run list --workflow auto-refresh --limit 8
gh pr view <PR> --json state,mergeStateStatus,statusCheckRollup,files
```

## PR merge requirements

1. Branch off latest `main` (never commit on `main`).
2. Verify locally: `cd app && npx tsx --test src/lib/*.test.mjs &&
   npx tsc --noEmit && npm run build`.
3. Open a focused PR; wait for **real `Vercel – gametimepicks` = SUCCESS**
   **and** `mergeStateStatus = CLEAN` (re-poll through transient
   UNKNOWN/UNSTABLE). A red **duplicate** `gametime-picks` is OK only if the
   real `gametimepicks` is green — document the exception.
4. **Squash-merge**, delete branch, **sync `main`** (`git checkout main &&
   git pull origin main`).
5. Commit-message trailer: `Co-Authored-By: Claude Opus 4.8
   <noreply@anthropic.com>`.

## Handling failed workflows

- Inspect logs (`gh run view <id> --log`); diagnose; fix only if safe +
  testable. **Never fabricate missing output.** A timed-out/cancelled
  morning run means **no slate for that day** — leave it empty, do not
  backfill.

## Latest-settled vs active-slate rules

- Active slate = latest optimizer snapshot; latest settled = max
  optimizer-graded date. When the active slate is already settled and no
  newer slate exists, the product honestly shows the settled slate. Results
  always shows the latest **settled** slate (currently `2026-06-01`), never a
  future/in-progress one.

## Bank Builder operational behavior

- Paper-only. Picks a pending, fully-unsettled ~+100 slip from the published
  pool; shows an honest empty state when none qualifies; never shows a
  settled slip as today's pick. No operator action required.

## What must NEVER be done

- Fabricate schedules/odds/projections/parlays/results/recent-form/hit-rates.
- Settle a future/in-progress slate; backfill an empty slate (e.g. May 31).
- Leak May 25/26 public hit rates.
- Use a slate's own results to change that slate's pregame picks.
- Add odds/projections/parlays/results to unsupported sports.
- Make Bank Builder real-money.
- Consume `audit/policy.json` into the optimizer without explicit approval.
- Merge/edit preview branches **#213/#214/#215**; close stale PRs
  **#1/#2/#4/#5**.
- Use banned betting copy (see `PROJECT_OVERVIEW.md`).
