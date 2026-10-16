# Production build baseline and churn sources, measured 2026-10-16

**Scope:** what GitHub's records show about Production deployments over 7 days (2026-10-09 00:00Z → 2026-10-16 ~20:30Z). This is a **baseline for measuring the COST-001/002 changes**, not a billing statement.

**Not measured here:**
- Vercel CPU-minutes;
- the machine class actually used;
- billed dollars.

Those need the Vercel API (`cpuTimeForBilling`) or the usage page, and remain a founder-provided input (OPS-002 token or screenshots). Before 10-07 that API showed ≈ 35–49 CPU-min per build at $0.0035/CPU-min on Enhanced (COST-001 §1–2). Any conversion of the counts below to dollars is an **estimate**.

## Method (reproducible, read-only)
1. List the Production GitHub deployments written by vercel[bot]: `GET /repos/{repo}/deployments?environment=Production` (800 records back to 10-06).
2. For each deployed SHA since 10-09, read the final `Vercel` commit status (`GET /commits/{sha}/statuses`): first and last status time, state and description.
3. Classify each commit's changed files with the deploy trigger's own build-input rule. That is `vercel-ignore-build.sh` on `origin/main`, parsed by `buildInputPredicate` from `lib/ops/stamp-only-gate.mjs` (#1088).
4. Stamp-only test: parse both sides of each changed build-input JSON and compare after removing these keys: `generatedAt`, `ledgerGeneratedAt`, `observedAt`, `checkedAt`, `builtAt`, `lastRunAt`, `updatedAt`, `asOf`, `capturedAt`, `computedAt`, `refreshedAt`.
   - This set is **broader** than any shipped gate, so it gives an **upper bound** on what a gate could suppress.
   - Some keys, such as `observedAt` on live props, can be reader-visible and would need a reader trace before being allowlisted.

## 1. Deployment outcomes per day

| Day (UTC) | Completed | Canceled | Failed | Median end-to-end min | p90 | Sum min (queue + build) |
|---|---:|---:|---:|---:|---:|---:|
| 10-09 | 70 | 11 | 0 | 4.8 | 7.6 | 368 |
| 10-10 | 62 | 15 | 1 | 4.2 | 7.0 | 298 |
| 10-11 | 74 | 16 | 1 | 4.1 | 7.5 | 363 |
| 10-12 | 57 | 8 | 2 | 4.7 | 8.9 | 266 |
| 10-13 | 60 | 14 | 0 | 5.7 | 9.0 | 368 |
| 10-14 | 47 | 21 | 2 | 7.8 | 12.4 | 415 |
| 10-15 | 45 | 19 | 5 | 5.8 | 12.0 | 330 |
| 10-16 (partial) | 46 | 10 | 0 | 4.8 | 7.9 | 230 |

- **Completed** = description "Deployment has completed".
- **Canceled** = "Canceled from the Vercel Dashboard"; the description does not separate a manual cancel, a superseded cancel or an Ignored Build Step cancel.
- **Failed** = "Deployment has failed".
- The 10-15 failures include the #1093 merge window (a cancel plus the memory-exhaustion era). No failure has been recorded on 10-16 so far.
- End-to-end minutes include queue time, so they are **not** build CPU time.

## 2. Completed builds by trigger (7 days)

| Trigger | Completed | Sum min |
|---|---:|---:|
| mlb lineup refresh | 68 | 337 |
| nfl settlement receipts | 63 | 333 |
| daily products | 51 | 340 |
| mlb daily production slate | 49 | 268 |
| nightly settle | 35 | 183 |
| PR merges | 34 | 183 |
| nba results capture | 27 | 125 |
| nfl sim v2 shadow receipts | 17 | 138 |
| epl matchweek refresh | 17 | 87 |
| pregame weather capture | 15 | 109 |

## 3. Churn sources

### 3a. MLB stamp-only commits: #1088 (approval package posted)
- The replay over 10-15 12:00Z → 10-16 20:01Z covers 24 MLB commits.
- Build-triggering commits: **24 → 7**.
- An independent check found 91/91 suppressed gated changes stamp-only.
- **Postseason only:** the value ends with the World Series.

### 3b. NFL settlement receipts: new candidate (proposal only, not implemented)
- 69 commits in 7 days. Every one changed a build input; **37 (54%) changed build inputs only in stamp keys** (upper bound, broad stamp set).
- The latest two (`86e0c82e38` 18:19Z, `566b7e16d3` 18:44Z on 10-16) changed three public files only in `generatedAt`/`ledgerGeneratedAt`: `nfl/interval-calibration.json`, `nfl/reconciliation/<wk>.json` and `reconciliation/index.json`. The content changes were in `data/internal/nfl/world-model-v2/grades/latest.json`.
- When content does move, it is in reconciliation, live-props and interval calibration. Those must keep publishing.
- **Next step:** a #1088-style allowlist gate for the NFL receipts writer.
  - It is a protected-workflow change and needs a reader trace for each stamp (especially live-props `observedAt`) and founder approval.
  - Upper-bound effect: about 5 builds a day on NFL days.

### 3c. Commits with no build input that still built: 49 of 461 completed (10.6%, ≈ 7/day)

| Trigger | Completed builds with **no** build-input change |
|---|---:|
| nfl sim v2 shadow receipts | 17 |
| nba pre-tip forecast window | 7 |
| cron-slot coverage | 7 |
| mlb pregame archive metadata | 10 |
| soccer Dixon-Coles v2 shadow | 4 |
| other | 4 |

- **Cause:** COST-001 §2.3 ("redundant" builds). The ignore step diffs HEAD against the **last successful** Production deployment. While an earlier commit's build is still running, a later commit with no inputs inherits that diff and builds too.
- **Fixing it safely is not a path-rule change.** Skipping on "my own diff has no inputs" is wrong if the in-flight build later fails or is canceled.
- **Options** (each needs founder review):
  - (i) Batch shadow and research writers onto fewer commits, e.g. fold `nfl sim v2 shadow receipts` into the next substantive NFL commit, or commit it only every N runs. This needs no deploy-trigger change.
  - (ii) Let the ignore step consult the Vercel API for an in-flight build of an ancestor. This needs a token in the build environment and fail-open handling.

### 3d. Daily products: mostly real content
- 62 commits; only 2 were stamp-only for build inputs.
- `admin/status.json` (55) and the projection receipts (48) move every run.
- #1088 already makes `admin/status.json` a non-input (it is read only by pruned internal routes).
- The `data/*-projection/v1/receipt.json` and `readiness.json` files merit the same reader trace.

## 4. What "savings" will mean once changes land
1. Avoided Git commits: the workflow logs a gate verdict.
2. Avoided deployment attempts: GitHub deployments per day (this table).
3. Avoided completed builds: the "Completed" column.
4. Reduced build duration: the end-to-end minutes columns. A local or Vercel phase log is needed for build-only time.
5. Reduced build CPU: Vercel `cpuTimeForBilling` (**not available without the token**).
6. Billed savings: the Vercel invoice or usage page (**founder**).

Re-run the method above after each merge and compare day for day. A smaller HTML export (#1096–#1100) reduces bytes; its effect on build minutes must be measured, not assumed.

## 5. Build reliability after the worker cap (#1093, merged 2026-10-15T14:27Z)
All 7 failed Production deployments in the window are ~46–55-minute kills between 10-14 13:45Z and 10-15 15:00Z (the last one started before the cap reached Production). Since then: **0 failed of ~110 deployments** (to 10-16 ~20:30Z), median 4–5 min end-to-end. This supports the memory diagnosis behind the cap, but it is **not** proof of a memory margin: peak-memory figures need the Vercel build logs (`[phase] ALIVE … mem` heartbeat, or #1095's anon/file/peak split), which need the Vercel token. #1094 (workers 4 → 3) stays on hold until those logs show the margin is needed.
