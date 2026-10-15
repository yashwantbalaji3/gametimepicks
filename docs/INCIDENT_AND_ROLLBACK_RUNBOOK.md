# Incident and rollback runbook

**Scope:** GameTimePicks Production (Vercel project `gametime-picks`, domain `gametimepicks.yashwantbalaji.com`).
**Status:** written 2026-09-29 for launch gate #780. Not yet rehearsed; see §10.

This page is the one place to start during an incident. It links to the detailed runbooks rather than repeating them:
- `RECOVERY_RUNBOOK.md`
- `VERCEL_CANONICAL_OPERATING_RUNBOOK.md`
- `P0_VERCEL_WEDGE_CONCURRENCY_2026-09-24.md`
- `GAMETIME_LIVE.md` §7
- `ASK_GAMETIME.md` §29
- `ENGINEERING_START_HERE.md` §5–§9
- the per-sport runbooks

`DAILY_OPS.md` and `AUTOMATION.md` are retired or stale. Don't follow their rollback steps.

## 0. Who can do what

| Action | Founder (Vercel owner, repo admin) | DP (repo Write) |
|---|---|---|
| Vercel Instant Rollback / Undo Rollback / Promote | ✅ | ❌ (no Vercel role) |
| Vercel env var change + forced redeploy | ✅ | ❌ |
| `gh workflow disable/enable` | ✅ | ✅ |
| Revert PR on `main` (merge, not rebase) | ✅ | ✅ |
| Force-push `main` | Admin only. **Don't.** The ruleset blocks everyone else. | ❌ |
| Paid-spend decisions, receipts, `reconcile-odds-charge --apply` | ✅ only | ❌ |

## 1. First five minutes

1. Open an incident log: create a GitHub issue titled `INCIDENT <YYYY-MM-DD>: <symptom>` (see §8) and write the time (ET) you noticed.
2. Record the **currently deployed SHA** (§2).
3. Decide which kind of incident it is:
   - **A code or build regression** (a merge broke pages): roll back (§3), then fix forward (§9).
   - **Bad data** (a bot wrote a wrong artifact): usually pause writers (§5) and fix the data forward. A rollback also works, but it freezes *all* data updates (§3, "what a rollback does").
   - **A paid workflow misbehaving**: go to §6 before anything else.
   - **A third-party outage** (StatsAPI, ESPN, Odds API, Gemini): usually no rollback. Use the feature kill switch (§6) and log it.
4. Don't hand-edit generated artifacts. Don't rebase or force-push `main`. Don't re-run paid workflows to "recover".

## 2. Which SHA is live

```bash
curl -sL "https://gametimepicks.yashwantbalaji.com/data/build-info.json?t=$(date +%s)" | jq '.commit, .builtAt, .environment'
```

- `commit.sha` is the commit this Production build was made from (`app/scripts/build-info.mjs`).
- If `curl` gets a Vercel bot challenge, open the same URL in a browser.
- The Vercel dashboard shows the same thing: `gametime-picks` → Overview → **Production Deployment** tile.
- A newer **bot** commit being live is normal. Bots push data commits to `main` continuously, and each one that touches `app/` builds.

## 3. Finding the previous known-good deployment

A known-good deployment is the **last Production deployment built before the bad change landed.** Every bot data build made *after* a bad code merge also contains the bad code, so it isn't known-good.

1. `git log --first-parent --format='%h %ci %s' origin/main | head -40` shows the merge that introduced the problem (`<bad>`).
2. Vercel → Deployments, filtered to branch `main` and Production. Pick the newest deployment whose commit is **older than `<bad>`**.
3. Confirm before rolling back. Every deployment has its own URL, and deployment protection is off:
   ```bash
   curl -sL "https://<deployment-url>/data/build-info.json" | jq .commit.sha
   ```
   Also open 2–3 affected routes on that URL.
4. Historic anchors: `git tag -l 'known-good-*'`. Only `known-good-2026-06-27` exists, which is too old to use for Production.

## 4. Vercel rollback

Founder only. From Vercel's documented flow:
1. Vercel → project **gametime-picks** → Overview → **Production Deployment** tile → **Instant Rollback**. Alternatively: Deployments → ⋮ on the chosen row → **Instant Rollback**.
2. Choose the known-good deployment from §3 ("Choose another deployment" on Pro; Hobby can only go back one deployment) → **Continue**.
3. Check that the listed domains include `gametimepicks.yashwantbalaji.com` and `gametime-picks.vercel.app` → **Confirm Rollback**.
4. The switch is instant.

CLI equivalent, with a founder-authenticated CLI: `vercel rollback <deployment-url>`. Not rehearsed.

**What a rollback does, which matters for this site:**
- **New pushes stop going live.** Vercel turns off auto-assignment of production domains, so bot data builds keep building but won't reach Production. The site's data freezes at the rolled-back build until you undo (§9). Decide how long that's acceptable; on a game day, aim for hours, not a day.
- **Env vars don't change,** so a rollback won't undo an env-var mistake. For that, fix the var, then force a rebuild (§6).
- **Vercel crons** (`/api/analytics-retention/`, `/api/morning-trigger/`) revert to the rolled-back deployment's config.
- **API functions** (`/api/live`, `/api/ask`, `/api/collect`) roll back together with the pages.

## 5. Validating the rollback

1. `build-info.json` `commit.sha` equals the known-good SHA (§2).
2. The broken routes now render. Check `/`, `/today/`, `/live/`, one sport hub, one game page, `/simulate/`, `/results/` at a phone width and a desktop width, and look for console errors.
3. Optional, from `app/`: `npm run verify:deployment`.
4. Log the time and the SHA in the incident issue.

## 6. Automated sports-data writers during an incident

Bots keep writing to `main` during an incident. That's harmless while Production is rolled back (they won't go live), and it's the cause when the incident is bad data.

**To pause writers,** disable the dispatchers first so nothing restarts the writers, then the writers:

```bash
# 1. Dispatchers (these start other workflows)
for w in cron-watchdog.yml publication-watchdog.yml mlb-afternoon-topup.yml nfl-kickoff-refresh.yml sport-schedules.yml; do gh workflow disable "$w"; done
# 2. Writers
for w in nightly-settle.yml morning-projections.yml mlb-daily-production.yml daily-products.yml auto-refresh.yml mlb-lineup-refresh.yml mlb-pregame-capture.yml nfl-event-window.yml epl-matchweek.yml epl-settle.yml ufc-fight-week.yml ufc-post-card.yml soccer-leagues.yml weather-capture.yml; do gh workflow disable "$w"; done
gh workflow list --all   # confirm: disabled_manually
```

- Copy the exact list you disabled into the incident issue. Re-enable in **reverse order** (writers first, then dispatchers) only after the fix is live.
- The Vercel cron `/api/morning-trigger/` can dispatch `nightly-settle` if `GTP_DISPATCH_TOKEN` is set in Vercel. Disabling `nightly-settle` covers it.
- Pause **only the affected sport** when you can. The morning chain is `nightly-settle → morning-projections → mlb-daily-production → daily-products`.
- Don't backfill a missed slate by hand. Past incidents (`AUG27_MISSED_SLATE_INCIDENT.md`, `AUG3_STALENESS_INCIDENT_ROOT_CAUSE.md`) deliberately left missed coverage marked as missed.

## 7. Paid workflow safety

**Paid workflows:**
- `morning-projections` and `mlb-daily-production`: the once-per-ET-day paid-run gate applies.
- `mlb-pregame-capture`: paid while `PREGAME_ARCHIVE_MARKETS` or `PREGAME_ARCHIVE_PLAYER_PROPS` is `true`.
- `nfl-event-window`, `epl-matchweek` and `ufc-fight-week`: each runs under its receipt in `docs/receipts/`.
- `nfl-live-props` (Phase H): **disabled**, and it stays disabled without founder authorization.

**Rules:**
1. **Never re-run a paid workflow to recover.** A crashed paid step may already have charged credits; that happened on 2026-09-27 (`incidents/2026-09-27-phase-h-unledgered-charge.md`).
2. **To stop paid spend quickly:**
   - `gh workflow disable` the paid workflow; or
   - set repo variables `PREGAME_ARCHIVE_MARKETS=false` and `PREGAME_ARCHIVE_PLAYER_PROPS=false`, and keep `ODDS_DRY_RUN=true`.
   - Last resort, founder only: remove the `ODDS_API_KEY` secret. The paid steps then skip without failing.
3. **After any paid failure:**
   - check the position with `node app/scripts/ops/odds-credit-position.mjs`;
   - compare it with the ledgers under `data/internal/research/odds/*/`;
   - reconcile with `app/scripts/ops/reconcile-odds-charge.mjs`, which is dry by default. `--apply` needs founder authorization.
4. **Runtime kill switches** are Vercel env vars, and env binds at build. After a change, set `VERCEL_FORCE_BUILD=1`, redeploy, then unset it.
   - Ask: `ASK_GAMETIME_ENABLED=0` → `/api/ask` returns 503 (Gemini spend stops).
   - Live: `LIVE_GATEWAY_ENABLED=0`.
   - Analytics: `ANALYTICS_COLLECTOR_ENABLED=0`.
   - A plain dashboard **Redeploy** of the same commit is skipped by `vercel-ignore-build.sh` unless `VERCEL_FORCE_BUILD=1`.

## 8. Communication and logging

- **One incident issue** is the log. Record: detection time, symptom (what visitors saw), live SHA, actions taken with times, workflows disabled, credits spent (if any), fix PR, recovery time.
- **Alerts** go to the ops webhook (`scripts/ops_alert.sh`, `OPS_WEBHOOK_URL`). Vercel emails the owner on deploy failures and promotions.
- **Commits** made to recover use the `RECOVERY:` prefix (`RECOVERY_RUNBOOK.md`).
- **Afterwards,** write `docs/incidents/<YYYY-MM-DD>-<slug>.md` in the existing format:
  - what visitors saw;
  - timeline;
  - cause (first broken edge);
  - money and credits;
  - defects in our own code;
  - recurrence guards;
  - what was deliberately not done.
- **Public messaging** is the founder's decision. Don't edit product copy to announce an incident without it.

## 9. Recovering back to `main` (undoing the rollback)

1. Fix forward on `main` with a PR:
   - usually `git revert -m 1 <bad-merge-sha>` on a branch;
   - update it by **merging** `origin/main`, never rebasing;
   - use explicit `git add`;
   - merge only on green exact-head CI.
2. Wait for Vercel to finish building the fixed `main` commit. It builds but **doesn't go live**, because auto-assign is off.
3. Check that deployment's own URL (§3, step 3).
4. Founder: Overview → **Undo Rollback** → select that deployment → **Confirm**. CLI: `vercel promote <deployment-url>`. This re-enables auto-assignment.
5. Validate (§5) that `build-info.json` shows the fixed SHA.
6. Re-enable any disabled workflows in reverse order (§6), and watch the next scheduled run complete.
7. Close the incident issue with the incident doc link.

## 10. Rehearsal (required before closing #780)

The founder performs this once, at a quiet time (not during a live NFL game or an MLB slate). It takes about 15 minutes.

1. Record the live SHA (§2).
2. Instant Rollback to the **previous** Production deployment (§4). This is normally a bot data build a few hours older, so there's minimal visitor impact.
3. Validate that `build-info.json` shows the older SHA (§5). Note the time it took.
4. Confirm that the next bot push does **not** go live: its deployment builds, but `build-info.json` stays on the older SHA.
5. **Undo Rollback**, promoting the newest `main` deployment (§9, step 4).
6. Validate that `build-info.json` equals the newest `main` SHA.
7. Post the times and SHAs from steps 1–6 on #780.

## 11. October 2026 addendum (written 2026-10-15 for the Oct 18–19 UAT rehearsal)

These add to §1–§10 with what the October incidents taught. Where they differ, the sections above still decide who does what (§0).

### 11.1 A failed build is not a Production outage
- **Signature of the Oct 13–15 failures:**
  - the build log's heartbeat shows `[phase] ALIVE next-build … mem ≈15.5G/16.00G` during "Generating static pages (~2,150/2,874)";
  - then silence until the build is killed at about 46 min;
  - GitHub shows the commit's `Vercel` status as "Deployment has failed".
- **Effect:** Production keeps serving the last READY build, so **no rollback is needed**. The next data push builds again.
- **Root cause and fix:** static-generation memory exhaustion. #1093 caps workers at 4 (`experimental.cpus`); the first capped build peaked at 14.82G/16G. Since then: 0 failures (72-hour watch, `~/gtp-evidence/deploy-watch/`).
- **Response:**
  - don't retry repeatedly; one failed build is cheap to ignore and expensive to repeat;
  - if two consecutive builds fail with this signature, open an incident (§1) and compare the newest successful log's `mem` line.
  - #1095 adds an `anon/file/peak` split to that line once merged.

### 11.2 Queue behaviour (not an incident)
- Production builds run one at a time per branch.
- A newer push supersedes queued ones. Superseded deployments show **"Canceled from the Vercel Dashboard"**; that is the queue, not a person or a failure.
- **"Canceled by Ignored Build Step"** means `vercel-ignore-build.sh` found no build-input change: `ops/` only, tests/e2e/CI-only (#1091), docs. That is expected and costs about 16 CPU-min.

### 11.3 Verifying without tripping Vercel's bot challenge
- Scripted polling of Production can get `x-vercel-mitigated: challenge` (seen 2026-10-15). Follow `docs/VERCEL_BOT_CHALLENGE_VERIFICATION_CONTRACT.md`.
  - Read deployment outcomes from GitHub commit statuses (context `Vercel`).
  - Read the live SHA from `/data/build-info.json` in a **real browser**.
- **Forecast Record integrity after any rollback or undo:** in the browser console on Production, hash each `/data/forecast-record/v1/*.csv` (sorted `forecastId|settlementState`). Compare with the ledger at the served SHA (`data/internal/forecast-ledger/v1/*.jsonl`). This is the check run after every October merge (25/25 files, 15,879 rows on 10-15).

### 11.4 Fixing forward: timing
- A `git revert -m 1 <merge>` of an `app/` change is a build input, so it builds. On the Enhanced machine with 4 workers that takes about **5–7 min end-to-end** (clone ≈1.5 min, `next build` ≈2–4 min, cache ≈40 s).
- During a rollback it builds but does not go live until **Undo Rollback** (§9).

### 11.5 UAT rehearsal window (Oct 18–19)
- Not during a live NFL window (Sunday 13:00–23:30 ET) or the MLB slate. Not between the MLB daily production run (≈10:15 ET) and its board publication.
- **Suggested:** Sunday 2026-10-18 08:00–09:00 ET, or Monday 2026-10-19 morning ET.
- Run §10 exactly, then add the §11.3 Forecast Record check after both the rollback and the undo. Record the times and SHAs.
