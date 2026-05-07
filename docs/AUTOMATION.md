# GametimePicks — Automation

This page documents the GitHub Actions automation that keeps the site fresh without manual operator commands. **It also documents what's intentionally NOT automated, and why.**

---

## TL;DR

- **One workflow runs daily** at 13:00 UTC (9 AM ET / 8 AM EDT): `.github/workflows/daily-refresh.yml`
- **Same workflow can be triggered manually** from the Actions tab → "Run workflow"
- **Zero Odds API credits used** by the daily automation
- **Real `recent10` trend data** gets refreshed from free `nba_api` so player cards' expandable trend graphs stay current
- **No secrets required** for the daily refresh (uses default `GITHUB_TOKEN`)
- **Vercel auto-redeploys** when the workflow pushes data updates to `main`

---

## Workflows

### `daily-refresh.yml`

| Property | Value |
|---|---|
| Schedule | `0 13 * * *` (13:00 UTC = 9 AM ET / 8 AM EDT, daily) |
| Manual trigger | Yes — Actions tab → "Run workflow" |
| Permissions | `contents: write` (so it can push commits) |
| Required secrets | None (uses `GITHUB_TOKEN`) |
| Calls Odds API | **No** (`ODDS_DRY_RUN=1` is set as a defensive guard) |
| Estimated runtime | 5–10 minutes |
| Concurrency | Single — won't run two refreshes at once |

**Steps:**

1. Checkout repo
2. Set up Python 3.11 + install `pipeline/requirements.txt`
3. Set up Node 20 + install `app/node_modules`
4. Run `bash scripts/automation_refresh.sh`:
   - `python -m pipeline.attach_recent10 --all --verbose` (free `nba_api`)
   - `python -m pipeline.export_results` (no network)
   - All 7 Python test suites
   - `npm run typecheck && npm run build`
5. Diff check on `app/public/data/`
6. If changes: commit + push to `main` with message `auto: Phase 10 daily refresh ($timestamp) [skip ci]`

The `[skip ci]` tag is defensive — schedule triggers ignore commit messages, so this is just to prevent recursion if anyone adds a `push:` trigger later.

### Manual trigger inputs

When triggering manually, you can set:

| Input | Default | Effect |
|---|---|---|
| `skip_build` | `false` | Skip `npm run build` for a faster sanity-only run (no Vercel preview will deploy from the resulting commit) |

---

## Credit safety — Odds API

**The daily refresh never calls The Odds API.** Here's why:

- Refreshing odds means calling `pipeline.fetch_odds_data` or `pipeline.generate_daily_board`, which spends Odds API credits per event/market.
- The Odds API free tier is ~500 credits/month; daily auto-refresh would burn through that in a few days.
- Lines and projections from the existing daily board are still useful 24+ hours after generation — the model's *projection vs line* analysis doesn't need new odds every hour.
- Hydrating `recent10` (sparkline data) does NOT need the Odds API; it uses free `nba_api` only.

**If you ever want to enable scheduled odds refresh**, it should:

1. Live in a SEPARATE workflow (don't entangle with the daily refresh)
2. Require an explicit input flag like `confirm_odds_credits: true`
3. Set `ODDS_MAX_EVENTS_PER_RUN` (a credit cap)
4. Honor `ODDS_CACHE_TTL_MINUTES` to skip if data is fresh
5. Log estimated and actual credit usage every run

Building this is **explicitly deferred** until you've decided you want to pay for a higher Odds API tier OR you have proven you'll use the credits efficiently.

For now, **regenerate the daily board manually** from your Mac when you want fresh odds:

```bash
# Manual board regen (uses Odds API credits — be deliberate)
python -m pipeline.generate_daily_board --date $(date +%Y-%m-%d)
cd app && npm run build && cd ..
git add app/public/data/boards/*.json
git commit -m "Manual board refresh"
git push
```

---

## What gets committed by automation

Only files in these paths can be committed by the bot:

- `app/public/data/boards/*.json` (recent10 attachment may have updated these)
- `app/public/data/results/*` (export_results may have written new files)
- `app/public/data/meta.json` (timestamps and counters only)

**Files automation will NEVER commit:**

- Any `.py`, `.ts`, `.tsx`, `.js`, `.css` file (no code changes from automation)
- `pipeline/cache/*` (excluded by `.gitignore` already; just in case)
- `.env`, `.env.local`, secrets of any kind
- `pipeline/validation/leans_log.jsonl` (kept local-only — this is your operator log)
- `app/public/data/board.json` / `slate.json` (these are the legacy single-day files; touched only by the manual board regen flow)

If automation ever stages an unexpected file, the workflow's "Show diff stat" step will show it in the Actions log before commit. You can rollback with `git revert HEAD` (see Rollback below).

---

## GitHub setup

You need to do this **once** before the workflow can push commits:

1. Go to your repo → **Settings → Actions → General**
2. Scroll to **Workflow permissions**
3. Select **"Read and write permissions"**
4. Save

That's it. No secrets to add for the daily refresh.

If branch protection is enabled on `main`, you may also need to:
- Allow the GitHub bot to bypass branch protection, OR
- Disable "Require pull request" for `main`, OR
- Create a deploy key with write access and use it instead of `GITHUB_TOKEN`

For a portfolio project, the simplest setup is no branch protection.

---

## Manual trigger

To run the daily refresh on demand:

1. Go to the repo → **Actions** tab
2. Click **"daily-refresh"** in the left sidebar
3. Click **"Run workflow"** (top right of the workflow runs list)
4. Optionally toggle `skip_build`
5. Click the green **"Run workflow"** button

You'll see a new run appear within a few seconds. Click into it to watch live logs.

---

## How to verify the first automated run

After applying Phase 10, the workflow's first run will be either:

- **At the next 13:00 UTC tick** (whatever that maps to in your timezone)
- **Right now**, if you trigger it manually via the Actions tab

To verify it worked:

1. Check the Actions tab — the run should be green ✓
2. Click into the run and confirm:
   - "Run automation refresh" step prints `recent10 attachment completed` and shows player counts
   - "Run automation refresh" step ends with `Odds API credits used: 0`
   - "Commit and push if data changed" step either says `No data changes` OR pushes a commit with a `[skip ci]` tag
3. If it pushed: check the repo's commit history — the new commit's author is `GametimePicks Bot`, message starts with `auto: Phase 10 daily refresh`
4. Check Vercel deployments — a new deploy should be in progress
5. Once Vercel finishes, open the live `/board` and click "Show last 10 trends" on a player card — sparklines should now show real game-log values for matched players

---

## How to inspect logs

### From the Actions tab

Each workflow run has expandable log sections:

- **"Run automation refresh"** — full output of `automation_refresh.sh` including which players got recent10 attached and which didn't
- **"Show diff stat"** — exactly which files changed
- **"Commit and push if data changed"** — the commit message and push result

### From your Mac

The `automation_refresh.sh` script writes per-step logs to `/tmp/`:

- `/tmp/gtp_recent10.log`
- `/tmp/gtp_export.log`
- `/tmp/gtp_test_*.log` (one per test suite)
- `/tmp/gtp_typecheck.log`
- `/tmp/gtp_build.log`

Run the script locally to test the end-to-end flow:

```bash
bash scripts/automation_refresh.sh
```

This is the same code the workflow runs, so if it works on your Mac it'll work on GitHub.

---

## How to disable automation

### Temporarily

Comment out the `schedule:` block in `.github/workflows/daily-refresh.yml`:

```yaml
on:
  # schedule:
  #   - cron: "0 13 * * *"
  workflow_dispatch:
```

Push the change. The workflow stays available for manual triggering but no longer runs on schedule.

### Permanently

Rename the file:

```bash
mv .github/workflows/daily-refresh.yml .github/workflows/daily-refresh.yml.disabled
git add -A && git commit -m "Disable Phase 10 automation"
git push
```

GitHub only loads `.yml` and `.yaml` files; the `.disabled` extension makes the workflow inactive without deleting the file.

---

## Rollback

If an automated commit causes a problem on the live site:

```bash
git pull origin main
git revert HEAD  # creates a "Revert auto: Phase 10 ..." commit
git push origin main
```

Vercel will redeploy from the reverted state within a few minutes.

For a more aggressive rollback (lose the auto commit entirely):

```bash
git pull origin main
git reset --hard HEAD~1
git push --force-with-lease origin main
```

Avoid `--force` unless you're sure no other commits sit on top of the auto commit.

---

## How to run everything locally

The workflow is just a thin wrapper around scripts you can run yourself. To do a full dry-run on your Mac:

```bash
cd ~/Downloads/gametimepicks

# 1. Same as the workflow's "Run automation refresh" step
bash scripts/automation_refresh.sh

# 2. Inspect what changed
git status
git diff --stat

# 3. If you're happy, commit + push manually
git add app/public/data/boards/*.json app/public/data/results/ app/public/data/meta.json
git commit -m "manual refresh ($(date +%Y-%m-%d))"
git push
```

This is useful for:

- Testing changes before scheduling
- Refreshing right after settling a slate (the daily run might be hours away)
- Verifying the script behaves correctly before relying on it

---

## What's NOT automated (and why)

| Operation | Status | Why deferred |
|---|---|---|
| Daily board regeneration (with new odds) | Manual | Burns Odds API credits |
| Settlement | Manual | Requires you to enter final stats in `results_overrides.json` (no reliable free stat-final API) |
| Confidence threshold calibration | Manual | Needs ≥50 settled picks first; calibration is judgment-driven |
| Push to social/X | Manual | Out of scope until model is validated against many slates |

Each of these can become its own future phase once the prerequisites exist.

---

## Future phases

- **Phase 11**: Brand redesign across all pages
- **Phase 12**: Confidence threshold calibration (after enough settled slates)
- **Phase 13**: Settlement automation (once a free, reliable final-stats API is identified)
- **Phase 14**: Optional opt-in Odds API refresh workflow with strict credit guards
