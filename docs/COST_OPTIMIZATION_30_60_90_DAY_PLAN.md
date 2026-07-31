# Cost Optimization — 30/60/90-Day Plan (Program 084–087, 2026-07-31)

Baseline: most-likely burn ≈ **$30/mo** (The Odds API), $0 verified elsewhere; see
`CURRENT_COST_BASELINE.md`. The plan therefore optimizes for **reliability-per-dollar and
scale-readiness**, not for cutting an already-small bill.

## Day 0 (shipped this program — no approval needed, all reversible in git)

- auto-refresh offseason hang: `timeout` + fail-soft (recovers ~2 h/day runner time + unblocks the
  shared writer queue).
- daily-refresh cron removed (duplicate of auto-refresh; dispatch kept).
- Pregame artifact retention 90 → 7 days (~48 GB → ~4 GB standing).
- Vercel Ignored Build Step in-repo (`app/vercel.json`): skip builds when nothing under `app/`
  changed since the last deployed SHA (~150–200 needless builds/mo eliminated; fail-toward-build).
- `mlb-daily-production` chain now requires upstream success (stops paid double-ingest after a
  failed morning run; backstop cron unchanged).
- `daily-lifecycle` wired to the shared alerter (6 silent failure days ended).
- `nightly-settle` duplicate `npm ci` removed.

## 30 days (August)

1. **Verify** — with founder screenshots (see `FOUNDER_BILLING_EVIDENCE_CHECKLIST.md`): Vercel
   tier, Odds API tier, API-Football/balldontlie tiers. Update the baseline; kill any idle paid tier.
2. **Watch the shipped fixes**: auto-refresh completes and commits again; Vercel deployment list
   shows skipped builds for docs-only pushes AND a build for every data commit (this validates
   `VERCEL_GIT_PREVIOUS_SHA` behavior in production); daily-lifecycle failures now alert.
3. **Credit anomaly line**: add a >500-credit/day + floor-projection warning through the proven
   ops webhook (small change to the existing credit ledger read; no secrets).
4. **Retire dead code**: cricket/IPL pipeline (zero callers), OpticOdds/SportsData stubs,
   `.env.example` placeholder keys, `THE_ODDS_API_KEY` alias — one cleanup PR.
5. **Founder decisions**: `daily-rebuild` (set `VERCEL_DEPLOY_HOOK_URL` or delete), analytics
   endpoint option, auto-refresh cadence during NBA offseason (9×/day is refresh-theater until
   preseason; 2×/day suffices — cadence change needs approval).

## 60 days (September)

1. **Public-data retention design** — the biggest structural item (waste register #10): 339 MB of
   dated JSON (80% of the tracked repo) is checked out and mirrored on every build while the built
   site references 512 bytes of it. Design (as a reviewed program, NOT a quick fix — it touches
   settled-history surfaces and md5-pinned money files): dated-artifact archive branch or
   `git`-external store for boards/parlays older than N days, keeping every public surface's data
   contract intact. Target: <50 MB build input, ~70% less git write-amplification.
2. **NBA preseason cost rehearsal**: measure real credit burn for one NBA slate via the probe path;
   decide 20K vs 100K tier with data (decision point ≈ +$29/mo).
3. **Settlement-writer consolidation** per founder's daily-lifecycle decision.
4. **EPL results provider** decision closes; wire settlement only per its package.

## 90 days (October)

1. **Analytics measured baseline** (if endpoint chosen): first real cost-per-measured-active-day
   line; Option A keeps it $0 incremental.
2. **NBA live promotion** with the tier decision from day-60 measurements.
3. **Repo hygiene**: `git gc` locally (37 packs, 197 prune-packable objects, one stray tmp pack);
   re-measure `.git` and GitHub diskUsage after the retention program lands.
4. **Re-run this audit's baseline** (the inventory/waste docs are structured for diffing): burn
   should read ≈ $30–59/mo with NBA live, every line either verified or founder-confirmed, zero
   UNKNOWN rows left in the vendor inventory.

---

## Update 2026-07-31 (later same day, Program 088-091) — progress against this plan

Completed early: duplicate Vercel project neutralized (skip guard + founder Git disconnect;
quiet window → Aug 7), deployment email matrix mapped to Vercel's actual native events
(founder toggles = 3 min), credit budget/anomaly alerting wired into the production slate,
npm caches added, auto-refresh's SECOND root cause (silent `set -e` grep kill) fixed —
first-ever green run expected on tonight's schedule.

Adjusted 30-day items: (a) Vercel billing screenshot is now the single remaining dollar
unknown (Pro badge observed, unverified); (b) NEW decision — afternoon top-up ingest for
lean-less evening games (+20–60 credits/day, clears the morning invariant reds); (c) verify
one measured week of ignored-build ratios + auto-refresh greens before the cadence review.
Trackers: `RESOURCE_EFFICIENCY_SCORECARD.md`, `VERCEL_DUPLICATE_QUIET_WINDOW_LOG.md`.
