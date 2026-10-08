# COST-001 — Vercel cost control: measured causes, deployment strategy, local-first gate

**Date:** 2026-10-07/08 · **Roadmap task:** `COST-001` (GAMETIMEPICKS_MASTER_ROADMAP_V2.md §3A)
**Base:** `origin/main` = `6f913e67eb` · **Branch:** `claude/cost-001-vercel-cost-control`
**Evidence sources (all read-only):** Vercel REST API with the local CLI token — `/v1/billing/charges`
(FOCUS billing rows), `/v2/teams/{id}` (plan, cycle, price matrix), `/v9/projects/{id}` (settings),
`/v6/deployments` (4,000 deployments, 2026-08-23 → 10-08), `/v13/deployments/{id}` (per-deployment
`duration.cpuTimeForBilling` for all 1,777 deployments since 09-25), `/v3/deployments/{id}/events`
(build logs). Git history of `main`. Vercel docs: pricing, managing builds, build queues, git
configuration (fetched 2026-10-07). Re-run any of the numbers with `scripts/vercel-cost-report.mjs`.

---

## 1. The bill, measured

| | |
|---|---|
| Plan | Pro, 1 seat. Billing cycle **2026-09-09 07:00Z → 2026-10-09 07:00Z** |
| Cycle to date (to 10-07) | **$315.52**, of which **Build CPU Minutes $315.16 (99.9%)** |
| Projected cycle total | **$339.62** (matches the founder's "$339.09 Build CPU" screenshot) |
| Everything else | Observability $0.26, Functions/Fluid/Blob/CDN < $0.10 combined |
| Current run-rate (09-25 → 10-06) | **$18.7–19.4/day ≈ $570–585/month** |
| Same period of the previous regime (09-13 → 09-22) | **$3.7–7.5/day ≈ $150/month** |

Every other Vercel meter is negligible. **This is a Build CPU problem and nothing else.**

### 1.1 Why the daily cost tripled on 2026-09-24 — the machine class, not the build count

Build volume did not change on 09-24 (≈ 75–100 builds/day before and after), and **CPU-minutes per
build did not change either** (≈ 35–47 before on Standard, ≈ 35–49 after on Enhanced: half the wall
time on twice the cores). What changed is the **price per CPU-minute actually billed**:

| billing day | effective $/CPU-min |
|---|---|
| 09-13 → 09-22 (Standard, 4 vCPU) | $0.0013–0.0019 |
| 09-23 / 09-24 (transition) | $0.0025 / $0.0028 |
| **09-25 → 10-06 (Enhanced, 8 vCPU)** | **$0.0035 flat** |

Vercel's pricing page: *"Builds on Standard build machines are only billed when on-demand
concurrency is enabled or Elastic build machines are selected"*, and on Pro *"the first build slot is
included, and standard build minutes within it are not billed."* The team price matrix confirms an
`included` dimension at $0.00. On Standard, only builds that overflowed the first slot (via on-demand
concurrency) were billed — roughly half. **Enhanced has no included slot: every minute bills.**

The switch to Enhanced (`buildMachineType: standard → enhanced`, 2026-09-24T14:46Z, founder-authorised,
docs/P0_VERCEL_WEDGE_CONCURRENCY_2026-09-24.md §7d) was a reliability fix: Standard's 8 GB wedged
14% of builds at the 45-minute ceiling (memory exhaustion during static generation). It worked —
**zero production build failures since 09-25** — but it roughly tripled the bill.

⚠ **Reverting to Standard today is NOT safe.** Recent Enhanced builds report peak container memory
**7.1–12.9 GB** (`[phase] ALIVE … mem` heartbeat, deployments of 10-08 00:37–00:46Z). Standard has 8 GB.
The obvious fix would bring the wedges back. See §5 Phase 2 for the safe route to the included slot.

Also: `elasticConcurrencyEnabled` is **true** today. The P0 doc records it being turned **off** on
09-24T14:00Z; there is no repo record of it being turned back on. Under Enhanced it does not change
the price per minute, but it does allow parallel builds of `main` (§2.3).

## 2. Where the money goes (2026-09-25 → 10-06, 12 billing days, exact billed CPU-minutes)

Per-deployment `cpuTimeForBilling` summed per billing day reconciles to the invoice within 2–5%
(API slightly higher). Window total **66,640 CPU-min = $233.24**.

| Trigger category | Deployments | Share of cost | ≈ $/month |
|---|---:|---:|---:|
| **Preview builds** — pushes to PR/work branches | 572 | **37.3%** | **$218** |
| **Production — bot data commits** that change build inputs | 574 | **36.3%** | **$211** |
| Production — PR merges (code) | 204 | 12.8% | $75 |
| **Production — redundant**: own diff had *no* build input, built only because a parallel build had not finished yet (§2.3) | 99 | 6.3% | $37 |
| Production — direct human/other commits | 56 | 3.6% | $21 |
| Production — **ignored** builds (Ignored Build Step skip) | 136 | 3.3% | $19 |
| Preview ignored + manual redeploys | 17 | 0.4% | $3 |

### 2.1 Previews (37%) — nobody consumes them

- 632 previews in 13 days across **299 distinct branches**; 483 authored by `gtp-ops[bot]`/Claude
  sessions, 28% of them pure *"Merge origin/main into <branch>"* refreshes.
- **No consumer:** no workflow listens for `deployment_status`; `main` has no branch protection and the
  only ruleset forbids force-push/deletion; no required check names Vercel. `quality-gate` already runs
  the identical `npm run build` (+ tests, typecheck, e2e) on every PR on GitHub Actions — which is
  **$0** because the repo is public. **Every preview is a duplicate of a free CI build.**

### 2.2 Production bot data commits (36%) — real, but frequent

~61 bot pushes/day change files the static export bakes into HTML (`mlb lineup refresh` 118/12d,
`nfl settlement receipts` 80, `nfl event window` 78, `daily products` 60, `mlb daily production
slate` 56, …). Path-level spot checks show these paths **are** read at build time
(`reconciliation` 68 readers, `player-board` 23, `end-zone-vault` 11, `live-props` 11, …). **Path
exclusion is therefore a weak lever here** and would risk stale pages; the cost is structural —
every data refresh is a full 2,760-page rebuild (~4 min wall, ~42 CPU-min on Enhanced).

### 2.3 Parallel builds of `main` (6% redundant + coalescing lost)

With on-demand concurrency in "run all builds immediately" mode, each push to `main` starts its own
build immediately. The ignore script diffs against `VERCEL_GIT_PREVIOUS_SHA` = the last **successful**
deployment, which lags while builds are in flight, so a push that touches only
`data/internal/research/` (e.g. `nfl sim v2 shadow receipts`) re-detects the in-flight commit's
changes and builds again. Measured: **250 of 568 production builds in the last 7 days overlapped
another production build**; 99 builds in 12 days had an empty own-diff.

### 2.4 Ignored builds are not free

An Ignored Build Step skip still provisions the machine and clones the 400+ MB repo (~50–70 s), billed
rounded up: **16 CPU-minutes ($0.056) per skip** on Enhanced (deployment
`dpl_9EcCHy8Ksr2WYDpoCe45tiEox9Gy` CANCELED: `timeForBilling 120000`, `cpuTimeForBilling 960000`). Skipping via the script saves
~60% of a build, not 100%. **`git.deploymentEnabled` saves 100%** — no deployment is created.

## 3. Deployment-trigger inventory

| Trigger | Creates a Vercel deployment? | Notes |
|---|---|---|
| Push to `main` (bots ~65/day, merges ~17/day, humans) | **Yes → Production** | then `app/scripts/vercel-ignore-build.sh` decides build vs skip (skip still bills 16 CPU-min) |
| Push to **any other branch** | **Yes → Preview** (until this change) | `gitProviderOptions.createDeployments: enabled`; no branch filter existed |
| Opening/updating a PR | Only via the branch push above | no separate trigger |
| `[skip ci]` in a commit message | **No effect on Vercel** | GitHub Actions convention only (proven 2026-07-31) |
| Deploy hooks | None configured (`link.deployHooks: []`) | the old `daily-rebuild` hook secret was never set |
| CLI / dashboard redeploy | Yes, manual | 3–10 in the 45-day window |
| Vercel Crons (`/api/analytics-retention`, `/api/morning-trigger`) | **No** — invoke functions on the current deployment | not builds |
| GitHub Actions workflows | Only by pushing to `main` | none call Vercel directly |
| Duplicate project `gametimepicks` (no dash) | No deployments since 2026-07-31 | Git disconnected; $0 |
| `gtp-ops`, `prarthana-v1-preview` projects | Not Git-linked | $0.01 total |

**Separate freshness incident found during the audit (not a cost issue):** 2026-10-07 17:40Z → 23:58Z,
**21 production deployments were BLOCKED** (`seatBlock.blockCode: TEAM_ACCESS_REQUIRED`). `gtp-bot`
commits as `bot@users.noreply.github.com`, which GitHub resolves to an unrelated real GitHub user `bot`
(id 58210622); Vercel's Pro team-access check intermittently refused that author. Bot data reached
production only when another author's commit happened to build. Raised as a separate task (bot commit
identity); out of COST-001 scope. *(2026-10-08, OPS-002: not intermittent — the block applied exactly while the repo was private, 10-07 17:09Z → 10-08 00:08Z; see docs/OPS_002_BOT_COMMIT_IDENTITY.md §1.)*

## 4. Options weighed

| Lever | Saves (≈/month at current volume) | Freshness / reliability impact | Who changes it |
|---|---|---|---|
| **A. Previews opt-in only** (`git.deploymentEnabled`: `main` + `preview/**`) | **~$215** | none for production; remote preview needs a `preview/` branch | repo (`app/vercel.json`) — **implemented, tested locally** |
| **B. On-demand concurrency → "one build per branch"** (`WAIT_FOR_NAMESPACE_QUEUE`) | **~$70** (−21% production builds; removes the 99 redundant builds; intermediate queued commits are skipped, not built — per Vercel changelog) | data lag median +4 min, max ~11 min (simulated on 12 days of real pushes); a 45-min wedge would now block `main` (none since 09-25) | **project setting — needs founder approval** |
| C. More ignore-script path exclusions | small (most bot paths are real build inputs; each skip still costs 16 CPU-min) | risk of stale pages if a reader is missed | not recommended now |
| **D. Standard machine + on-demand OFF** (the included slot) | **most of the remaining ~$290 → ≈ $10–40/month** | **memory wedge risk** (peak 7.1–12.9 GB vs 8 GB) — must be proven safe locally first | project setting + possibly `next.config` worker cap — **Phase 2, needs local proof + approval** |
| E. Coalesce bot data deploys (publisher every W min; `main` auto-deploy off) | W=30: production ≈ $137; W=60: ≈ $80 | data lag p95 33 / 62 min; depends on a reliable scheduler (GitHub crons are known to drop/delay) | workflow + project change — **founder freshness decision** |
| F. Runtime data delivery (high-frequency JSON fetched, not baked) | removes most data-driven builds | app architecture change | future roadmap task |
| G. Spend alerts (dashboard Spend Management, notify-only) | none directly; detection | a hard **pause** would stop data publication — rejected | **founder, dashboard** |

Rejected as unsafe or ineffective now: reverting to Standard without proof (wedges); a hard spend cap
that pauses deployments (stops data delivery); excluding bot data paths wholesale (stale pages);
relying on `[skip ci]` (Vercel ignores it).

## 5. Recommended deployment strategy

**Phase 1 — now (low risk, reversible in minutes).** Expected: **~$585 → ~$300/month** (−48%).
1. **A** — merge `app/vercel.json` `git.deploymentEnabled` (this branch). Production unchanged.
2. **B** — set On-Demand Concurrent Builds to **"Run up to one build per branch"** on `gametime-picks`
   (Settings → Build and Deployment, or `PATCH /v9/projects/{id}` `resourceConfig.buildQueue.configuration:
   WAIT_FOR_NAMESPACE_QUEUE`). Rollback: set back to "Run all builds immediately".
3. **G** — Spend Management notifications at founder-chosen thresholds (suggest $75 / $100 / $150 for
   the cycle), **notification only, no pause**.

**Phase 2 — prove the free slot locally, then decide.** Expected: **≈ $10–40/month**, no freshness loss.
Emulate Vercel Standard locally (Docker, 4 CPU / 8 GB, Linux, Node 24, `npm run build`) and measure
peak memory with Next's static-generation worker count capped (`experimental.cpus`). Only if repeated
builds stay well under 8 GB, propose: `buildMachineType → standard`, on-demand concurrency **off**
(Git branch queue still skips intermediate commits), with Enhanced as the one-click rollback. Builds
get slower (~2× wall), so measure production lag as well.

**Phase 3 — only if Phase 2 fails.** Founder chooses a data-freshness SLO for bot data, then either
**E** (publisher at that cadence) or **F** (runtime data delivery) as a roadmap task.

## 6. Local-first development and controlled-deploy gate (adopted)

1. Reproduce and fix on localhost: `cd app && npm run dev`; targeted tests
   `npx tsx --test <files>`; full suite `npx tsx --test $(find src -name '*.test.mjs')` (read `# fail`);
   `npm run build` (local production export) when routes/data/config change; desktop + mobile check.
2. Commit locally as often as useful. **Pushing a work branch no longer creates a Vercel deployment**
   (after Phase 1A is on the branch's base). GitHub `quality-gate` (free) is the remote CI.
3. **Remote preview only on request:** push the same commit to `preview/<task-id>` — the only
   non-`main` branches Vercel deploys. Record why it was needed and the build count in the roadmap
   Session Log. Delete the `preview/` branch afterwards.
4. **Production = merge to `main`.** One coherent, locally verified, CI-green PR per integration;
   avoid merge bursts (each merge is a full build); avoid `Merge origin/main into <branch>` pushes
   unless needed to resolve a conflict or re-run CI.
5. Record counts: `node scripts/vercel-cost-report.mjs --cli-auth --days 1` before and after a release.
6. Env-var changes need a real build: `VERCEL_FORCE_BUILD=1` + redeploy (see the ignore script).

## 7. Measurement and the next-cycle comparison

`scripts/vercel-cost-report.mjs` (read-only) prints cycle-to-date by service, trailing daily build
cost, projected cycle total, deployments by category with billed CPU-minutes, and overlapping
production builds; `--budget N` exits 2 when the projection exceeds $N.

Baseline (2026-10-08 01:13Z, 7-day window): production built **81/day**, previews built **50.3/day**,
production ignored 10.1/day, overlapping production builds **250/568**, trailing build cost
**$19.41/day**, cycle projection **$339.62**.

Compare the cycle starting 2026-10-09 against: preview builds/day (target ≈ 0–2), overlapping
production builds (target ≈ 0 after B), production builds/day, $/day. **No saving is claimed until it
is observed in that report.**

## 8. Local verification done on this branch

- `app/src/lib/vercel-preview-gating.test.mjs` evaluates the committed `git.deploymentEnabled` with
  Vercel's documented semantics (minimatch, any matching `true` deploys): `main` deploys; `claude/…`,
  `s12-…`, nested and dependabot branches do not; `preview/…` does; near-misses (`mainline`,
  `previews/x`) do not. **Mutation-probed**: `**`→`*` (2 fail), dropping `main` (1 fail),
  `preview/**`→`preview/*` (1 fail), `deploymentEnabled: false` (3 fail).
- Existing `vercel-canonical-project.test.mjs` still passes (11/11 across both files).
- `scripts/vercel-cost-report.mjs` run against live billing (output above).

**Not verifiable locally:** that Vercel reads `git.deploymentEnabled` from `app/vercel.json` (Root
Directory `app`) for branch pushes. The first push of this branch is the proof: it should create
**zero** deployments. If it creates one preview, the rule is not being read and the cost of finding
out is one build (~$0.15).

---

## 9. Phase 1 execution record (founder-approved 2026-10-07)

| Step | Evidence | Result |
|---|---|---|
| Push `claude/cost-001-vercel-cost-control` @ `5b8a5bff` (01:27:46Z) | Vercel API polled 184 s for any deployment of that ref/SHA | **0 deployments.** Control: `claude/mlb-playoff-slate-receipts`, pushed in the same window without the rule, **did** create a Preview. `git.deploymentEnabled` in `app/vercel.json` is honoured with Root Directory `app`. |
| PR [#1017](https://github.com/yashwantbalaji3/gametimepicks/pull/1017) exact-head CI | run 37713335118 on `5b8a5bff` | `python` pass (1m28s), `quality` pass (20m8s) |
| Queue setting (01:31:41Z) | before/after `resourceConfig` re-read via API | only `buildQueue` changed: none (= run all immediately) → `{"configuration":"WAIT_FOR_NAMESPACE_QUEUE"}`; `buildMachineType: enhanced`, `elasticConcurrencyEnabled: true`, regions, fluid unchanged |
| Merge (01:52:28Z) `gh pr merge --merge --match-head-commit 5b8a5bff…` | merge commit `f1f46556` | **exactly 1** Production deployment `dpl_FTMcpA7YhM77nrSHTde2h3X6yhxj`, READY 01:57:05Z (4m33s), billed 6 min × 8 cores = **48 CPU-min ≈ $0.17** |
| Production acceptance | `/data/build-info.json` | serves `f1f46556`, built 01:53:53Z; `/`, `/mlb/`, `/nfl/`, `/results/`, `/today/`, `/markets/`, `/live/`, `/bank-builder/` all 200; `/ops/` still pruned (404) with `X-Robots-Tag: noindex` from `vercel.json` |
| Smoke test (`app/scripts/smoke-test-production.mjs`, run from the exact merged tree) | 8/9 pass | ✗ "home does not reflect canonical money" — **pre-existing**: the same check fails on every Production build sampled back to `53a05d95` (10-06), and the merged build's home HTML is the same size (241,533 B) as the build before it. The check appears stale against the current homepage; follow-up, not a COST-001 regression. |

### Rollback procedures
- **Preview gating:** revert `git` block in `app/vercel.json` (or set a branch key to `true`); takes effect for the next push that carries the file.
- **Queue mode:** Vercel → `gametime-picks` → Settings → Build and Deployment → On-Demand Concurrent Builds → **Run all builds immediately**; or `PATCH /v9/projects/prj_qaHS65v4G30tTy1s6MYbsLbKYvbh` with `resourceConfig.buildQueue.configuration = SKIP_NAMESPACE_QUEUE` (send the full existing `resourceConfig` so no other field resets). Original value recorded above.

## 10. Spend notifications — founder dashboard steps (not configurable via API from here)

Vercel's Spend Management uses **one** "On-Demand Budget" per billing cycle and notifies at fixed
**50% / 75% / 100%** of it; arbitrary dollar thresholds are not supported. It counts metered usage
beyond the Pro monthly credit. ⚠ Vercel now enables **Pause Production Deployments by default**, and
a budget set **below current cycle spend triggers its actions on the next check (minutes)** — this
cycle is already ≈ $315, so a $150 budget with pause on would take the site offline (503).

1. Vercel dashboard → team **yashwantbalaji33-7164's projects** → **Settings** → **Billing** → **Spend Management**.
2. Toggle Spend Management **on**; set **On-Demand Budget = $150** → notifications at **$75 (50%)**, **$112.50 (75%)**, **$150 (100%)**.
3. **Before saving, confirm "Pause Production Deployments" is OFF.** If the toggle is on, switch it off. Leave the webhook empty.
4. Settings → **My Notifications** → Team → **Spend Management**: enable Web + Email for 50/75/100% (SMS optional, 100% only).
5. Expect immediate notifications this cycle (spend > $150). Cycle resets **2026-10-09 07:00 UTC**; setting it after the reset avoids that noise.
6. For an exact **$100** checkpoint, run `node scripts/vercel-cost-report.mjs --cli-auth --budget 100` (exits 2 when the projected cycle total exceeds $100).
7. Afterwards, check **Activity** (team sidebar) shows the spend-amount creation, and send a screenshot of the Spend Management panel so COST-001 can record it as configured.

## 11. Phase 2 — local memory-constrained build test (2026-10-08)

**Question:** can the build run on Vercel **Standard** (4 vCPU / 8 GB), whose first build slot is
free on Pro? **Method:** Docker Desktop Linux VM (4 CPUs, 7.67 GiB), container `--cpus=4
--memory=7600m --memory-swap=7600m` (no swap), `node:24-bookworm-slim` (Vercel uses Node 24.x), clean
`git archive` of `origin/main` @ `9d1db18468`, `npm install`, `npm run build` with
`CI=1 VERCEL=1 VERCEL_ENV=production`; cgroup `memory.current`, `memory.stat anon` and
`memory.events oom_kill` sampled every 2 s. The VM is ~0.3 GiB smaller than Standard, so this is a
slightly **stricter** test.

| Run | Config | Result | Wall | Peak anon | OOM kills | Restarted page |
|---|---|---|---|---|---|---|
| A | default (Next picks workers from 4 CPUs) | rc 0 after recovery | 362 s | **7.36 GiB (ceiling)** | **1** | `/simulate/d/2026-10-12` |
| B | `experimental.cpus: 2` | rc 0 after recovery | 344 s | **7.36 GiB (ceiling)** | **2** | `/simulate/d/2026-10-15` |

Both runs hit the memory ceiling during static generation (~2,070–2,550 of 2,760 pages), had a
static worker **OOM-killed**, stalled ~60–90 s, then Next SIGTERMed and restarted one page — the
same last-quarter signature as the September wedges. They completed here; on Vercel the same event
has historically wedged to the 45-minute ceiling.

**Conclusions:**
- **Do not move to Standard.** Peak demand is at the 8 GB ceiling, not near it.
- **Capping static workers does not help** (B was no better than A), so the memory is driven by
  what certain pages load, not by parallelism.
- **Candidate (not proven):** `/simulate/d/<date>` pages were the restarted page in both runs. Each
  exported page is small (~168 KB), so the cost is likely in what they load during render; the
  restart list can also name a victim rather than the culprit
  (docs/P0_VERCEL_WEDGE_CONCURRENCY_2026-09-24.md §4). Next step: profile per-route render memory
  for `/simulate/d/*` and the other last-quarter routes, then reduce it (tracked as `COST-002`).
- Only when repeated constrained builds show **no OOM kill and ≥ 1.5 GiB headroom** should a
  Standard + on-demand-off trial be proposed.

Harness note: copying a macOS tree into Linux with `tar` adds `._*` AppleDouble files (109,084 here)
that break `.gz` readers — use `COPYFILE_DISABLE=1 tar …` or `git archive` piped straight into the
container.
