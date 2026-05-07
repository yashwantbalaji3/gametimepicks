# GametimePicks — Troubleshooting

When something on the live site doesn't look right, **start here**. Most issues fall into one of three buckets:

1. **Trend graphs aren't showing** (UI shows "no recent log data" everywhere)
2. **Site shows demo / sample / outdated language** (data inconsistency)
3. **Daily refresh ran but nothing changed** (workflow / deploy issue)

Each section below is a flowchart with concrete commands to run.

---

## 1. Trend graphs aren't showing on `/board`

Symptom: every player card shows "no recent log data" when you click "Show last 10 trends", even though the daily refresh workflow keeps running green.

### Run this first

```bash
python -m pipeline.inspect_trends
```

Output looks like:

```
  ────────────────────────────────────────────────────────────
  board                     leans  with   cov   pids  zero attached_at
  ────────────────────────────────────────────────────────────
  2026-05-05.json              24     3   12%      2     1 2026-05-07T03:53:31

  Overall coverage: 3/24 leans = 12%

  ⚠  Low coverage (12%). Likely cause:
     1 player(s) have playerId=0 in board JSON — these can't be matched.
```

The diagnostic interprets the result for you. Match what you see to a row below.

### Diagnosis flowchart

| Coverage | Most likely cause | Fix |
|---|---|---|
| 0% AND `attached_at = NEVER` | The workflow never wrote `recent10` to any board | Trigger the workflow manually (Actions → daily-refresh → Run workflow) and watch the run logs |
| 0% AND `attached_at` is recent | Workflow ran but every fetch failed | Check workflow log for `nba_api provider chain import FAILED` (Phase 11 prints this loudly) |
| Low (1–30%) AND `zero` column high | Most players have `playerId=0` in board JSON | Regenerate the daily board with the real `nba_api` schedule provider so playerIds are real (manual operator step — see "Manual board regen" below) |
| Low AND `zero` column = 0 | nba_api returns empty logs for many players | Try `python -m pipeline.attach_recent10 --all --verbose` — see per-player reasons. Players with `no_logs` reason genuinely have no recent NBA games (rookies, recently traded, injured) |
| Healthy (≥50%) but board still shows "no trend" everywhere | UI is not reading the updated board JSON | The push step in the workflow is failing silently (workflow permissions) OR Vercel hasn't redeployed since the data was pushed |

### Verify the fix worked

After making any change, **always** re-run:

```bash
python -m pipeline.inspect_trends --players
```

The `--players` flag shows you the per-player breakdown so you can confirm specific stars (e.g., Donovan Mitchell, Nikola Jokic) got data.

If the diagnostic shows healthy coverage but the live site doesn't, the issue is downstream of the data attachment:

```bash
# Check what's actually committed in the public data
git log --oneline -- app/public/data/boards/*.json | head -10

# Check what Vercel deployed
# (visit your project → deployments tab → click the most recent deploy)
```

### Workflow permissions checklist

If the workflow runs green but the commits never appear:

1. Repo → **Settings → Actions → General**
2. **Workflow permissions** → must be set to **"Read and write permissions"**
3. Save
4. Trigger the workflow again — this time the "Commit and push if data changed" step should succeed

The workflow log will say `Pushed: auto: Phase 10 daily refresh ...` if it worked, or it'll fail with a permissions error you can see in the Actions log.

### Manual board regen (when needed)

If `inspect_trends` shows most players have `playerId=0`, the board itself was generated without proper player IDs — `attach_recent10` cannot fix this on its own. Regenerate the board:

```bash
# 1. Make sure nba_api is the active schedule provider
cat pipeline/config.py | grep -A2 SCHEDULE_PROVIDER

# 2. Regenerate today's board (uses Odds API credits — be deliberate)
python -m pipeline.generate_daily_board --date $(date +%Y-%m-%d)

# 3. Now re-attach recent10 against the regenerated board
python -m pipeline.attach_recent10 --all --verbose

# 4. Verify coverage improved
python -m pipeline.inspect_trends

# 5. Commit + push
cd app && npm run build && cd ..
git add app/public/data/boards/*.json
git commit -m "Manual board regen + recent10 attach"
git push
```

This step does spend Odds API credits (one full board regeneration), so be deliberate about when you run it.

---

## 2. Site shows demo / sample / outdated language

Symptom: pages show labels like "sample hit rate" or "demo data" even though `meta.json` reports `dataMode: "Live"`.

### What changed in Phase 11

The home page used to read `app/public/data/hit_rates.json` (a legacy demo-data file). Phase 11 replaced this with `app/public/data/results/lifetime_summary.json` (real settled data, written by `pipeline.export_results`).

Now the home page KPIs show:

- **leans today** / **high confidence** — real counts from today's board
- **settled hit rate** — computed from your real settled slates; shows "—" with sub "no settled slates yet" until you settle one
- **settled wins / losses** — same source

If you still see legacy "sample hit rate" language, you may not have applied the Phase 11 update yet. Rerun the apply script.

### How to populate the settled hit rate

The home page tile shows "—" until at least one slate is settled. To populate it:

```bash
# 1. Fill final stats in the override file
$EDITOR pipeline/overrides/results_overrides.json

# 2. Settle the date (writes to pipeline/validation/)
python -m pipeline.settle_results --date 2026-05-05 --manual-only

# 3. Export to public/data/results/
python -m pipeline.export_results

# 4. Confirm the lifetime summary now has data
cat app/public/data/results/lifetime_summary.json

# 5. Build + commit + push
cd app && npm run build && cd ..
git add app/public/data/results/
git commit -m "Settle slate <date>"
git push
```

After Vercel redeploys, the home page tiles will show real numbers.

---

## 3. Daily refresh ran but nothing on the live site changed

Symptom: GitHub Actions shows green run, but `/board` looks identical.

### Three things to check, in order

**(a) Did the workflow actually push?**

Open the most recent successful run → expand "Commit and push if data changed" step. Look for one of:

- `No data changes — nothing to commit.` → expected if recent10 was already up-to-date
- `Pushed: auto: Phase 10 daily refresh ...` → push succeeded
- `Permission denied` / `403` → workflow permissions need fixing (see section 1)

**(b) Did Vercel redeploy?**

Vercel auto-deploys on push to main. Check your Vercel dashboard → Deployments. The newest one should have a commit message starting with `auto: Phase 10 daily refresh`.

If Vercel didn't pick up the commit, you may have a webhook issue. Trigger a manual redeploy from the Vercel dashboard.

**(c) Did the data actually change?**

Run locally:

```bash
git pull origin main
python -m pipeline.inspect_trends
```

If coverage is the same as last week, the workflow's `attach_recent10` calls are succeeding but returning the same data (no new games, off-season, etc.). This is expected during gaps in the NBA schedule.

---

## 4. Filters break / cards don't group / hydration warnings

Symptom: clicking a date tab does nothing, or DevTools console shows hydration mismatches.

### Run the test suite

```bash
bash scripts/run_all_tests.sh --python-only
```

All 7 suites should pass with 340+ assertions. If anything fails, the package you applied last didn't land cleanly. Roll back:

```bash
git log --oneline -5
git revert <bad-commit-hash>
git push
```

For console hydration warnings specifically, the Phase 8 viewer-ready package fixed all known sources (`<div>` inside `<p>`, `Math.random()` in render). If new ones appear, they were introduced after that — check what's in the most recent commits.

---

## 5. Quick-reference commands

| What you want | Command |
|---|---|
| See trend coverage | `python -m pipeline.inspect_trends` |
| See per-player breakdown | `python -m pipeline.inspect_trends --players` |
| See machine-readable output | `python -m pipeline.inspect_trends --json` |
| Hydrate trends manually | `python -m pipeline.attach_recent10 --all --verbose` |
| Run full automation locally | `bash scripts/automation_refresh.sh` |
| Run all tests | `bash scripts/run_all_tests.sh` |
| Settle a date | `python -m pipeline.settle_results --date YYYY-MM-DD --manual-only` |
| Export settled data | `python -m pipeline.export_results` |
| Regenerate a board (uses Odds API!) | `python -m pipeline.generate_daily_board --date YYYY-MM-DD` |
