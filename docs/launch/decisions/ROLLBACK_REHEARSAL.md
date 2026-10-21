# Decision package 4: safe rollback rehearsal (F-4, FD-9, matrix O-07 / UAT O-05)

**Prepared:** Sat 2026-10-17, about 01:30–02:40Z, by a read-only Claude Code session.

**Sources:**
- `docs/INCIDENT_AND_ROLLBACK_RUNBOOK.md` on `origin/main` (`8433d82bd9`), §0–§10;
- the October addendum §11 in #1110 (`claude/runbook-october-addendum`, `e877e38cef`, unmerged);
- `docs/launch/UAT_OCT18_19_PLAN.md` O-05 and D-05.

**Checks run in this pass:**
- `gh api …/deployments?environment=Production`: read-only, GitHub only.
- An **offline** ledger append-only comparison, `39df089d02` → `8433d82bd9`: 15,879 → 15,957 rows, **0 violations**. This proved the §3.4 script below works.

> **The design goal is that this rehearsal never moves Production.** Every step stops at Vercel's confirmation dialog and presses **Cancel**. A live switch is offered only as an explicit, separate founder choice (§6).

**ID note:**
- The UAT plan calls this **O-05**. The matrix calls it **O-07** (FD-9, F-4).
- Matrix **O-05** is a different row (Vercel credentials; token expired). Because the token is expired, the rehearsal uses the **dashboard**, not `vercel rollback` / `vercel promote`.

---

## 1. What the runbook says (summary)

| Topic | Runbook | Note |
|---|---|---|
| Method | §1: for a code or build regression, Instant Rollback first (§3–§5), then fix forward with a revert-merge (§9). For bad *data*, pause writers and fix forward (a rollback freezes all data) | Founder-only, per the §0 permissions table |
| Known-good | §3: the newest Production deployment **built before** the bad merge. Confirm via `https://<deployment-url>/data/build-info.json` (deployment protection off) | The only tag, `known-good-2026-06-27`, is too old |
| Switch | §4: Overview → Production Deployment → **Instant Rollback** (or Deployments → ⋮ → Instant Rollback) → choose → **Continue** → check the domains `gametimepicks.yashwantbalaji.com` and `gametime-picks.vercel.app` → **Confirm Rollback** | The dry run stops at this dialog |
| Side effects | §4: auto-assignment of production domains turns **off**, so bot builds keep building but do not go live until Undo. Env vars unchanged. Crons and `/api/*` revert with the pages | This is why timing matters (§4 below) |
| Undo | §9: **Undo Rollback** → select the newest READY `main` deployment → Confirm. This re-enables auto-assignment | Validate the SHA afterwards |
| Rehearsal | §10: about 15 min, quiet time; record SHAs and times | Status line: "Not yet rehearsed" |
| Addendum (#1110) | §11.1 a failed build ≠ an outage. §11.2 queue cancellations. §11.3 bot-challenge-safe checks + Forecast Record hash. §11.4 revert rebuild about 5–7 min. §11.5 window guidance | Unmerged; docs only |

## 2. Why a static export makes rollback safe for frozen records

**How the site is built:**
- `app/next.config.mjs:35` sets `output: "export"`. Every deployment is an immutable bundle; data is baked in at build (`vercel-ignore-build.sh:89-91`).
- The public Forecast Record CSVs (`/data/forecast-record/v1/<sport>-<family>.csv`) are **generated at build** by `app/scripts/results/emit-forecast-record-assets.mjs` from the committed ledger `data/internal/forecast-ledger/v1/*.jsonl`. They are gitignored.

**What a rollback can and cannot do:**
- It **cannot** change the ledger in git, or any deployment's files.
- It **only** changes which immutable deployment the domain serves.
- Rows appended after the known-good build are **hidden, not deleted**, until Undo.
- **Before rollback, the served Forecast Record must equal the ledger at the served SHA.** "Served SHA" means the target's SHA, never `main` HEAD.

**One real hazard: publication evidence.**
- The forecast-of-record evidence scripts treat a READY Production deployment as "serving": `app/scripts/ops/capture-github-production-deployments.mjs`, `scripts/capture-vercel-production-deployments.mjs` and `app/scripts/mlb/shadow-served-forecast-of-record.mjs`.
- None of them knows about rollbacks.
- **Bot builds that go READY between rollback and Undo are not actually served.** The rollback interval must be logged so it can be excluded from Option B evidence.
- In the dry run (§3) this interval does not exist.

## 3. The safe rehearsal (default; Production is never switched)

**Time:** Mon 2026-10-19, start **07:00 ET (11:00Z)**, about 45 min. See §4 for the window. The dry run needs no kickoff protection, but it keeps the same slot so it can roll into §6 if the founder chooses.

**Roles:**
- **Founder:** Vercel dashboard steps.
- **Eng:** GitHub and offline steps, and Production checks in a real browser (§11.3). No scripted polling.

**Evidence folder:** `~/gtp-evidence/uat-2026-10-18/rollback/`.

### 3.1 Record the current state (Eng; 5 min)
1. In a real browser, open `https://gametimepicks.yashwantbalaji.com/data/build-info.json`. Record `commit.sha` (**SHA A**), `builtAt` and the time. Take a screenshot.
2. Cross-check on GitHub, read-only:
   ```bash
   gh api "repos/yashwantbalaji3/gametimepicks/deployments?environment=Production&per_page=10" \
     --jq '.[] | [.id, .sha[0:10], .created_at] | @tsv' > deployments-before.tsv
   ```
   The newest row's SHA should equal SHA A, or be a newer READY build that the alias has not reached yet. Note: at 01:09Z on 10-17 the newest was `8433d82bd9`, status `success` "Deployment has completed".

### 3.2 Identify the last-known-good candidate (Eng; 10 min)
**Rule (runbook §3):**
- The candidate is the newest Production deployment **before the most recent code merge**.
- Bot data builds after a code merge carry that code, so they are not "previous" in the sense that matters.

**Steps:**
1. List the code merges:
   ```bash
   git fetch -q origin && git log --first-parent --format='%h %ci %an | %s' origin/main | grep -v '| auto' | grep 'Merge pull request' | head -3
   ```
   As of 10-17 01:20Z the last code merge is #1114 → `2cb1ba3920` (Vercel skipped its build). The UAT plan's tabletop target, #1091 → `39df089d02`, is older. Recompute on Monday, because #1118, #1117, #1119, #1101 or #1088 may merge first.
2. Take the newest `deployments-before.tsv` row whose SHA is an ancestor of the chosen bad merge's parent: `git merge-base --is-ancestor <sha> <merge>^1`. That row is **SHA K**, and its `environment_url` comes from `gh api …/deployments/<id>/statuses --jq '.[0].environment_url'`.
3. **For the rehearsal itself**, "previous deployment" in Vercel's dialog is usually just the previous bot build. Record **both**:
   - what Vercel *offers* (SHA B);
   - the true last-known-good (SHA K).

   If they differ, that is a finding: on a real incident the founder must use "Choose another deployment" (Pro). If the plan is Hobby, only one step back is possible, and the runbook's §3 rule cannot always be followed.

### 3.3 Verify the candidate's build integrity (Eng; 10 min, offline + one browser tab)
1. Open `<K deployment URL>/data/build-info.json` in a browser:
   - `commit.sha` = SHA K;
   - `environment` = `vercel`;
   - `builtAt` is after the commit time.
2. **Forecast Record on K equals the ledger at K.** Run D-05 against the deployment URL instead of the domain:
   - in the browser console on `<K URL>`, hash each `/data/forecast-record/v1/*.csv`, rows sorted by `forecastId|settlementState`;
   - compare with `git show K:data/internal/forecast-ledger/v1/*.jsonl`.

   **Expected:** every file matches and 0 settlement mismatches (the last recorded result was 25/25 files, 15,879 rows at `39df089d02`).
3. **Ledger manifest at K** (offline): `git show K:data/internal/forecast-ledger/v1/manifest.json | jq '.totals.rows, (.sports|map_values(.contentHash))'`. Record it.
4. Spot-check 3 routes on the K URL (`/`, `/results/`, `/nfl/`) in the browser, at phone and desktop widths.

### 3.4 Prove a rollback cannot alter frozen records (Eng; 2 min, offline)
Run the append-only comparison from SHA K to SHA A. It is the same check nightly-settle enforces (`app/src/lib/forecast-ledger/append-only.mjs` `compareLedgers`).
- **Expected:** `violations: 0`, and rows(A) ≥ rows(K).
- The difference is exactly the rows a rollback would *hide*, and Undo would restore.

```bash
cat > /tmp/ledger-diff.mjs <<'EOF'
// node /tmp/ledger-diff.mjs <repo> <shaBefore> <shaAfter> — read-only; uses the comparator at <shaAfter>
import { execFileSync } from "node:child_process"; import path from "node:path";
const [repo, a, b] = process.argv.slice(2);
const show = (sha, p) => execFileSync("git", ["-C", repo, "show", `${sha}:${p}`], { encoding: "utf8", maxBuffer: 1 << 30 });
const tmp = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
for (const f of ["append-only.mjs", "contract.mjs"]) execFileSync("sh", ["-c", `git -C "${repo}" show ${b}:app/src/lib/forecast-ledger/${f} > ${tmp}/${f}`]);
const { compareLedgers } = await import(path.join(tmp, "append-only.mjs"));
const rows = (sha) => { const m = JSON.parse(show(sha, "data/internal/forecast-ledger/v1/manifest.json"));
  return Object.values(m.sports).flatMap((s) => show(sha, `data/internal/forecast-ledger/v1/${s.file}`).split("\n").filter(Boolean).map((l) => JSON.parse(l))); };
const A = rows(a), B = rows(b), v = compareLedgers(A, B);
console.log(JSON.stringify({ before: { sha: a, rows: A.length }, after: { sha: b, rows: B.length }, violations: v.length,
  kinds: v.reduce((o, x) => ((o[x.kind] = (o[x.kind] ?? 0) + 1), o), {}) }));
EOF
node /tmp/ledger-diff.mjs ~/Downloads/gametimepicks <SHA_K> <SHA_A> | tee ledger-K-to-A.json
```
**Dry run on 10-17:** `{"before":{"sha":"39df089d02","rows":15879},"after":{"sha":"origin/main","rows":15957},"violations":0,"kinds":{}}`.

### 3.5 Dry-run the Vercel steps, up to the confirmation dialog (Founder; 10 min)
**Never press Confirm, Promote or Undo in this part.**
1. Vercel → project **gametime-picks** → Overview → Production Deployment tile. Screenshot it: the commit shown should be SHA A.
2. Click **Instant Rollback**. The dialog opens.
   - Screenshot the offered target (SHA B, time) and whether "Choose another deployment" is available. This tells you Pro vs Hobby.
   - If it is available, select SHA K and screenshot.
3. Click **Continue** to reach the final dialog that lists the domains. Screenshot it. **Both** of these must be listed:
   - `gametimepicks.yashwantbalaji.com`;
   - `gametime-picks.vercel.app`.
4. **Press Cancel.** Record the time.
5. Deployments → ⋮ on SHA K's row: screenshot the menu (Instant Rollback / Promote / Redeploy) and close it. Do not choose an item.
6. **Confirm nothing moved.** Reload the Overview: the Production tile still shows SHA A. Eng re-opens `/data/build-info.json` once in the browser: still SHA A.

### 3.6 Tabletop the fix-forward (Eng; 5 min, local only)
- `git switch -c rehearsal/revert-tabletop origin/main && git revert -m 1 --no-commit <last code merge>`, then `git status` (screenshot), then `git revert --abort && git switch - && git branch -D rehearsal/revert-tabletop`. **Nothing is pushed.**
- Rebuild estimate per §11.4: about 5–7 min to READY. During a real rollback it does not go live until Undo.

### 3.7 Write the record (Eng; 5 min)
Post to `SESSION.md` and the UAT evidence:
- SHA A, B and K;
- K's `environment_url`;
- the integrity results (3.3, 3.4);
- the dialog screenshots;
- each step's start and end time;
- "Production never switched: build-info SHA A before and after".

Then mark matrix O-07 per the founder's §7 answer.

## 4. Timing constraints

| Constraint | Source | Effect |
|---|---|---|
| Sun 10-18: HOU @ JAX (Wembley) **13:30Z = 09:30 ET**; seven games 17:00Z; ARI@LAR 20:05Z; LAC@KC and BUF@LV 20:25Z; SNF DAL@GB 00:20Z (10-19) | `app/public/data/nfl/schedule/latest.json` | No Sunday slot. #1110 §11.5's Sun 08:00–09:00 ET runs into the London pregame, and a *live* switch could stop the final pregame revision being served (Option B) |
| Mon 10-19: nothing kicks off before **15:00 ET** (EPL 19:00Z). MLB CLE@TB 20:00 ET. **MNF WSH@SF 20:15 ET** (00:15Z 10-20). No NBA | MLB/NBA/NFL schedule files | A Monday-morning live switch carries no kickoff risk if Undo completes by about 09:00 ET |
| **The morning data chain lands earlier than "≈10:15 ET".** nightly-settle → morning-projections → mlb-daily-production → daily-products landed 12:01–12:14Z on 10-16 (08:01–08:14 ET), 12:14–12:27Z on 10-15, 12:30–12:44Z on 10-14, and 09:25–09:39Z (05:25 ET) plus 13:14Z on Mon 10-12 | First-parent `main` history (bot commits) | It overlaps the second half of the proposed 07:00–08:30 ET window. The `auto: forecast ledger` commit is a build input (`vercel-ignore-build.sh:133`). The UAT plan's "must finish before ≈10:15 ET" premise is out of date |
| Crons that push builds inside Mon 11:00–12:30Z | `.github/workflows/*` | `mlb-pregame-capture` 11:00, `results-top-boards` 11:15/11:45/12:15, `daily-products` 11:41, `nba-results-refresh` 11:41, `auto-refresh` 12:00 (GitHub crons run late, median about 204 min per morning-projections.yml) |
| Vercel crons | `app/vercel.json` | 07:17Z and 09:20Z; neither is inside the window |

**Proposal:**
- Keep **Mon 10-19, 07:00 ET start** for the dry run (§3), which is unaffected by pushes.
- **If** the founder also chooses the live switch (§6), run it **first, at 07:00–07:30 ET (11:00–11:30Z)**, Undo by 07:30 at the latest, and do the slower §3 checks after.
- **Abort rule for a live switch:** if any `auto: nightly settle` / `forecast ledger` / MLB slate commit appears on `main` while rolled back, Undo immediately.

## 5. Recovery: if Confirm is pressed by mistake, or a live switch goes wrong
1. **Undo at once:** Overview → **Undo Rollback** → select the newest READY `main` deployment → Confirm (runbook §9.4). That deployment's SHA must equal `main` HEAD or the newest bot build (GitHub statuses).
2. **Validate** in a browser: `/data/build-info.json` = that SHA. Run D-05 against the ledger at that SHA.
3. **Check that auto-assignment came back.** After the *next* bot commit's GitHub `Vercel` status reads "Deployment has completed", open build-info once. It should show that commit. If not, open Deployments → ⋮ on the newest READY build → **Promote**, and re-check once.
4. **Log the interval** (rollback time → Undo time). Note it in `SESSION.md`, so publication evidence excludes READY-but-not-served builds in that interval (§2).
5. **Never** force-push `main`, re-run paid workflows (runbook §7), or redeploy with `VERCEL_FORCE_BUILD=1` as part of recovery.

## 6. Optional live switch (only if the founder explicitly chooses it)
This is the existing UAT O-05 steps 1–6, at 07:00–07:30 ET:
1. Record SHA A.
2. Instant Rollback to SHA B; record the time.
3. Validate build-info = B, and run D-05 on B against the ledger at B.
4. Note bot builds READY-but-not-live, from GitHub statuses vs build-info.
5. **Undo** by 07:30 ET.
6. Validate the newest SHA, then D-05.

It is the only way to exercise the alias switch, the auto-assignment behaviour, and Undo. Everything else in it is covered by the dry run.

## 7. Evidence checklist

| # | Evidence | Who |
|---|---|---|
| 1 | build-info screenshots before and after (SHA A both times, dry run) | Eng |
| 2 | `deployments-before.tsv`; the SHA K selection with its `merge-base` proof | Eng |
| 3 | K: build-info screenshot, D-05 console output (files matched, mismatches), manifest totals | Eng |
| 4 | `ledger-K-to-A.json` (0 violations) | Eng |
| 5 | Vercel screenshots: Production tile; rollback dialog (offered target, choose-another availability); domain list; ⋮ menu on K; Overview after Cancel | Founder |
| 6 | Revert tabletop `git status` screenshot | Eng |
| 7 | A timeline with UTC times for each step | Eng |
| 8 | Founder's written statement: "dry run accepted as rehearsal for F-4", or "live switch performed: rollback HH:MM, Undo HH:MM" | Founder |

## 8. Exact founder questions
1. **FD-9 (revised):** Do you approve the **dry-run rehearsal** (§3) on **Mon 10-19 from 07:00 ET**, with you doing the Vercel steps up to the confirmation dialogs and pressing Cancel?
2. Does the dry run satisfy F-4, or do you **also** want the live switch (§6) at 07:00–07:30 ET with Undo by 07:30? If not, will you waive the live part in writing?
3. Is the Vercel plan Pro, so that "Choose another deployment" is available? On Hobby, a real incident can only go back one deployment.
4. If a code merge lands before Monday (#1118, #1117, #1119, #1101 or #1088), confirm the last-known-good is recomputed against that merge (§3.2).

---

## 9. Scenario coverage check (added Sat 2026-10-17 ~07:00Z)

**Read:** runbook §0–§10 on `origin/main` (`2c617c780c`) and §11 on #1110 (`e877e38cef`). Nothing was run. The rehearsal stays a **dry run** on Mon 10-19 07:00 ET, and no rollback is performed by this session.

| Scenario | Runbook | This rehearsal | Verdict |
|---|---|---|---|
| Failed Vercel builds | #1110 §11.1 (signature, "not an outage", two-in-a-row rule) | Not exercised (nothing to fail) | **Covered**, but only once #1110 merges |
| Stalled deployments (a build that neither finishes nor fails, and blocks the queue) | Not covered. §11.1 describes the 46-min memory kill only after it ends | — | **Missing**: added as §10.1 |
| Superseded queued deployments | #1110 §11.2 | — | **Covered** (#1110). Evidence impact added in §10.1 |
| Forecast-data integrity | #1110 §11.3 (Forecast Record = ledger after rollback and undo) | §3.3 (on K) | **Covered** |
| Ledger preservation | Implicit only: a rollback cannot touch git | §2, §3.4 (append-only K→A, 0 violations on 10-17) | Rollback **covered**. The **revert-merge** path (§9) has no ledger check: added as §10.2 |
| UI regressions | §1 "code or build regression", §3–§5, §9 | §3.3 step 4, §3.5, §3.6 | **Covered** |
| Stale or broken data feeds | §1 "bad data" and "third-party outage"; §6 pausing writers; §7 kill switches | — | **Partial**: no decision table for live-feed vs published-data staleness. Added as §10.3 |
| Account and auth failures | Not covered | — | **Missing**: added as §10.4 |
| Provider configuration failures | §4 ("env vars don't change"), §7.4 kill switches | — | **Partial**: the env-dependent legal hash and #1121's fail-closed behaviour are not described. Added as §10.5 |
| Rollback intervals in "served" evidence | Not covered | §2 (hazard noted), §5.4 | **Gap in the evidence scripts**: §10.6 |

## 10. Proposed runbook additions (text for the founder to accept into §12 of the runbook; not applied to `docs/INCIDENT_AND_ROLLBACK_RUNBOOK.md`)

### 10.1 Stalled deployments and the queue
- **Detect:** the newest `main` commit's GitHub `Vercel` status stays **pending** more than **20 min** after the push. A healthy build is about 5–7 min end-to-end (#1110 §11.4); the Oct 13–15 memory kills ran about 46 min before failing.
- **Effect:** Production keeps serving the last READY build. Newer pushes queue behind the stalled one, and only the newest queued push builds when it clears (§11.2). On a game day, published data stops advancing.
- **Forecast-of-record consequence (Option B):** the forecast of record is the revision **served** by a READY deployment before start. If a stall holds a pregame revision back past kickoff, the earlier served revision is the record. That is correct by design. **Record the stall window** so nobody later treats the held-back revision as served.
- **Action** (founder only, Vercel dashboard): cancel the stalled deployment (Deployments → ⋮ on the building row). The queue proceeds with the newest push. **Do not** redeploy with `VERCEL_FORCE_BUILD=1` repeatedly, and do not roll back: a rollback freezes data further.
- **Superseded deployments** ("Canceled from the Vercel Dashboard") never became READY, so they were never served. Evidence must not count them, and the capture scripts already count READY only.

### 10.2 Ledger preservation on the fix-forward path
A rollback cannot change the ledger. A **revert-merge** can, if the reverted merge's diff includes ledger files.

**Before pushing any revert:**
1. Run `git diff --name-only <merge>^1 <merge> -- data/`. It must be empty. If not, revert only the `app/` paths, never `data/internal/forecast-ledger/`. The last five code merges (#1114, #1091, #1093, #1089, #1087) touch 0 `data/` files.
2. Run §3.4's append-only comparison from `origin/main` to the revert branch: expect `violations: 0` and equal row counts.
3. If the revert changes ledger-building code, the builder's own guard (`build-forecast-ledger.mjs:223`, `compareLedgers`) refuses a non-append change on the next settle run. Treat that refusal as a stop, never as something to bypass.

### 10.3 Stale or broken data feeds (decision table)
**General rule:** a rollback never fixes stale data. It freezes all data at an older build.

| Symptom | Where it comes from | Action |
|---|---|---|
| **Live scores** stale or missing during games | `/api/live` (server-side ESPN/MLB). Freshness bands: < 45 s fresh, < 120 s delayed, ≥ 120 s stale (`lib/live/freshness.mjs:21-23`) | No rollback. If the provider is down, the labelled delayed or stale state is the designed behaviour. This behaviour is **fixture-tested only**, not yet observed live (matrix O-15). If the gateway itself misbehaves: `LIVE_GATEWAY_ENABLED=0` + forced build (runbook §7.4) |
| **Published boards and forecasts** not refreshing | Scheduled writers (GitHub cron, often late) | Check `publication-watchdog` and `cron-watchdog`. Fix the writer forward. Do not backfill by hand (§6). Never re-run a paid workflow (§7) |
| **Wrong** published data (a bad artifact on `main`) | A writer bug | §1 "bad data": pause that sport's writers (§6) and fix forward. Roll back only if the bad artifact is user-harmful **and** a fix is more than hours away, accepting that all data freezes |

### 10.4 Account and auth failures
The Supabase database is **not** part of a deployment, so a rollback changes nothing about stored data or its policies.

| Failure | User sees | Action |
|---|---|---|
| Magic link opens a non-site URL | The sign-in panel's own hint (`sign-in-panel.tsx` "If the link opens a page that is not this site…") | Founder: Supabase → Authentication → URL Configuration (Site URL and redirect allow-list = `/account/`) |
| Supabase outage | `/account/` stuck on "Checking your session…" or Supabase error text; the rest of the site unaffected (static export) | None; note it in the incident log |
| **Cross-user read or write (RLS leak), P0** | Another reader's data | (1) Disable accounts: remove **both** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then a forced build (about 5–7 min). Every Production build since accounts launched contains them, so **no rollback target is free of accounts**. (2) Founder re-applies `db/accounts-schema.sql` (idempotent) in the SQL editor. (3) Re-run package 2 Tiers A–C before re-enabling. Revoking all invites (`update public.beta_access set revoked_at = now()`) stops **writes** only; reads are still governed by the select policies |
| Shipped key turns out to be service-role | — | Treat as a P0 leak: rotate the key in Supabase, then the steps above |

### 10.5 Provider configuration failures
- **A rollback does not undo an env change** (§4). Fix the variable, then a forced build.
- **Ask:**
  - After #1121, an unset `ASK_MODEL_PROVIDER` makes Production refuse Ask (503 `PROVIDER_NOT_CONFIGURED`). Before #1121 it silently falls back to Anthropic.
  - Rolling back to a build **older than #1121** restores that silent fallback.
  - What users see per failure: package 3 §7.
- **Legal pages are env-dependent.** Once Privacy and Terms are published, their approved hash covers text rendered from `NEXT_PUBLIC_ANALYTICS_ENABLED`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT` and the `GTP_SUPPORT_*` variables (package 1 §2). Changing or removing any of them makes the next build's hash differ from the approval, and `/privacy/` and `/terms/` go back to **404** silently. **Treat those variables as frozen** after approval; any change goes through counsel re-approval.
- **Accounts:** removing only the anon key yields MISCONFIGURED ("Accounts are temporarily unavailable") with the nav link still shown. Remove both variables to disable cleanly (package 1 §9).

### 10.6 Evidence-script gap: rollback intervals
- **The gap:**
  - Three scripts treat every READY Production deployment as served:
    - `app/scripts/ops/capture-github-production-deployments.mjs`;
    - `scripts/capture-vercel-production-deployments.mjs`;
    - `app/scripts/mlb/shadow-served-forecast-of-record.mjs`.
  - Each has **0** references to rollback, promote or alias (grep at `2c617c780c`).
  - During a rollback, bot builds go READY but are **not** served, so these scripts would credit a pregame revision that no visitor could see.
- **Until fixed:**
  - Any rollback (real, or a live rehearsal switch) must log `rollback_at`, `undo_at` (UTC) and the served SHA in `SESSION.md` and the incident issue.
  - Option B evidence for any game whose last pregame revision falls inside that interval is adjudicated by hand.
  - The dry run (§3) creates no interval.
- **Proposed fix** (engineering, post-launch, not built): an append-only, hand-written interval log that the three scripts read. A READY deployment created inside an interval counts as served only if it is the rollback target. Founder approval needed, because it changes forecast-of-record evidence.
