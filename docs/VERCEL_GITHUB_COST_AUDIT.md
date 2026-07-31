# Vercel & GitHub Cost Audit — Program 084–087 (2026-07-31)

## 1. Vercel

**Verdict: UNKNOWN plan — likely RIGHT_SIZED on usage, with one measured inefficiency now fixed
in-repo.** No dashboard access this session; the plan tier (Hobby $0 vs Pro $20/mo) is the single
biggest unknown in the whole cost baseline. Founder: one redacted screenshot closes it.

Measured from the repo + production:

- **Every push to `main` triggered a build.** Proven empirically: commit `7fea87a1` (touching only
  repo-root `scripts/` and `.github/` — nothing under `app/`) was built and serving 24 s after
  push. `[skip ci]` in bot commit messages does NOT stop Vercel (production served `23e32c1f`,
  a `[skip ci]` commit, built 24 s after it was pushed).
- **Volume: ~601 commits to main in 30 days ≈ 20 builds/day**, each checking out a **424 MB** tree
  (339 MB of it `app/public/data`) and producing a **~812 MB pre-prune** export (473 MB after the
  prune sweep, which removes the entire `out/data` mirror except `build-info.json` — measured: the
  built site concretely references **zero** loose data files; everything is inlined into HTML).
- **No serverless functions, edge, KV, Blob, image optimization, or Vercel Analytics** — pure
  static export. Bandwidth at beta traffic is trivially small.
- **Fixed this program:** `app/vercel.json` + `app/scripts/vercel-ignore-build.sh` — the Ignored
  Build Step now skips any build where nothing under `app/` changed since the **last deployed SHA**
  (`VERCEL_GIT_PREVIOUS_SHA`-based, so a push batch can never strand an app change; every doubt
  path exits toward BUILD). Expected effect: docs/scripts/workflow-only pushes (~25–35% of all
  pushes in the last 30 days) stop consuming builds; every data commit still deploys.
- Also fixed the in-repo invisibility the audit flagged: deployment skip logic now lives in git,
  reviewable, instead of only in dashboard settings.

Founder evidence needed (redacted screenshot/CSV): plan + seats, build minutes last 30/90 days,
bandwidth, whether a second Vercel project exists for `gametime-picks.vercel.app` (or it is the
same project's default domain — expected), and whether any paid add-on is enabled.

## 2. GitHub

**Verdict: RIGHT_SIZED at $0 — verified.** The repository is **PUBLIC**, so Actions minutes on
standard `ubuntu-latest` runners and Actions artifact storage bill **$0** regardless of volume.
The findings below are therefore about reliability, queue health, and the latent bill if the repo
ever went private — not current dollars.

- **Run volume:** 535 workflow runs in July; ~26 scheduled invocations/day across 9 active
  workflows (13 of 22 are dormant dispatch-only).
- **Measured waste (last ~3.7 days): 1,044 runner-minutes, 83% produced nothing.**
  - `auto-refresh`: 29/29 runs hit the 25-min timeout (hung offseason `nba_api` hydrate) — 736
    min, zero commits, and it held the shared `gtp-generated-artifacts` queue, evicting real
    writers. **Fixed** (timeout + fail-soft in `automation_refresh.sh`).
  - `daily-refresh`: same hang, and even healthy it duplicates `auto-refresh` (identical script,
    17 Python suites + typecheck + full Next build). **Cron removed; dispatch kept.**
  - `daily-lifecycle`: failed 6 consecutive days at its quality gate, silently (not alerter-wired).
    **Now wired** to the shared alerter. Its gate failure root-cause is the morning-slate timing
    issue (see `API_USAGE_AND_CREDIT_AUDIT.md` §3).
  - `daily-rebuild`: daily green no-op — its `VERCEL_DEPLOY_HOOK_URL` secret was never configured.
    Left scheduled (0.2 min/day) — **founder decision**: set the secret (its freshness purpose is
    real) or delete the workflow.
- **Artifact storage: ~48 GB standing** from one step — `mlb-pregame-capture` uploaded the full
  77 MB pregame-archive tree (10,311 files) on every run (7–8×/day), unique names, **90-day**
  retention, `if: always()` — while the same tree is also durably committed to the repo.
  **Reduced to 7-day retention.** (Free on public repos; ~$0.008/GB/day ≈ $12/mo latent if ever
  private.) Caches: 195 MB / 14 caches — negligible.
- **Repo growth is the real GitHub cost surface:** 249 MB `.git`; **5.4 GB of raw blob content
  written in 30 days** (77% from `auto:` slate commits rewriting multi-MB JSONs), delta-compressed
  to ~140 MB. 37 packs + 197 prune-packable objects — a `git gc` is overdue locally. GitHub-side
  `diskUsage` ≈ 212 MB. No LFS, no Packages.
- **No `push:`/`pull_request:` CI exists at all** — the test suites run only inside scheduled data
  workflows. Docs-only commits trigger nothing on the Actions side (the `[skip ci]` markers are
  inert future-proofing). This is a coverage observation, not spend.
- Duplicate `npm ci` inside `nightly-settle` **fixed** (verify-then-install).

Founder evidence needed: account plan (Free vs Pro — affects nothing measured here), and
confirmation no other private repos share a paid plan attributed to this project.
