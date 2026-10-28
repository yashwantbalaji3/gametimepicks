# H0: hosting-ready Command Center (complete, local only)

**Date:** 2026-10-27 · **Branch:** `claude/gametimepicks-ceo-agent-center-4d5fd3` (uncommitted on top of `7d3ca44696`)
**Boundaries kept:** no accounts, no paid services, no DNS, no pushes or PRs, no deployments, no live credentials or subscription tokens, no change to the public site. Every change is under `command-center/`.

## What H0 delivers

| H0 item | Built | Where |
|---|---|---|
| 1. Hosted deployment preserving M2 | The orchestrator runs **stateless**: each request opens a ledger session, works, flushes once; heavy steps become **jobs** run by a worker. Runs are rebuilt from the ledger. The local console and the M2 inline flow are unchanged | `orchestrator/orchestrator.mjs`, `orchestrator/engineering-flow.mjs` |
| 2. Mobile-first dashboard, persistent | The same console (390/430 px) on a Postgres ledger: conversations, tasks, approvals, agent activity and audit survive restarts. Installable PWA (manifest, icons, service worker for Web Push) | `surfaces/console/*`, `ledger/sql-store.mjs` |
| 3. Auth | Passkeys only (WebAuthn, user verification required), one-time setup token for the first passkey, 10 hashed recovery codes, `__Host-` session cookie (12 h idle / 7 d absolute, revocable), **step-up bound to session + action + exact payload** for approve, keep, resume, attest, seat changes and new passkeys. **Pause and Emergency stop need no prompt.** Every auth event is in the ledger without secrets | `auth/auth-service.mjs`, `hosted/app.mjs`, `surfaces/console/webauthn.js` |
| 4. Storage and jobs for Mac-off | Postgres ledger (append-only and no-truncate triggers, first-writer-wins claims, advisory lock so readers never skip a row, failed flushes retried not lost), three least-privilege database roles with **row-level security: the worker can never append a founder action**, write-once object store for media/logs/patches (served with fixed types and a sandbox CSP), job dispatch after commit, job start committed before work, Pause/Stop cancel runner jobs, Resume re-requests cancelled recaps | `ledger/*`, `jobs/dispatchers.mjs`, `worker/*` |
| 5. Claude Code on GitHub Actions | Subscription only (`CLAUDE_CODE_OAUTH_TOKEN`; every API-billing source refused; the web app refuses to boot with any model key). Workflow with two jobs, main only: **work** (read-only repo token; Claude with M2's tool allowlists plus denied reads of `/proc`, `/sys`, `/dev`; the code Claude writes — tests, the console for screenshots — runs as a **no-sudo sandbox user with an empty environment**, tests with **no network**, after a canary self-test proves that user can't read the worker's environment) and **push** (the only write permission; checks the bundle against the founder's G3 keep in the ledger with a read-only role, then pushes exactly that new `cc/*` branch). Build→keep across machines via a stored patch whose sha256 is part of the G3 approval. M2 caps unchanged ($1 plan, $3 build, $5 command) | `deploy/github/cc-worker.yml`, `worker/run-job.mjs`, `providers/claude-preflight.mjs`, `engineering/workcopy.mjs` |
| 6. ChatGPT / Grok | Manual seats unchanged and fully usable from the phone (copy prompt → paste answer). Direct integration later through the existing `api:*` / `mcp:*` seat contracts (CP5) | `providers/*` |
| 7. Hosting assumptions | Checked and folded into the architecture doc §6 (see "Verified vs to confirm" below) | `docs/hosted-command-center-architecture.md` |
| 8. Isolation | Separate origin, repo, Vercel project, database and secrets; public repo read-only via sparse checkout; nothing writes `app/` or `data/` | §"Isolation" below |
| 9. Tests + report | **78/78 pass, also with all network blocked** (27 hosted-mode tests, incl. a real-WebAuthn iPhone E2E and the exact production role SQL) | `tests/*` |

## Verification

- `npm test` and `npm run test:offline` in `command-center/`: **78 pass, 0 fail** each.
- New tests:
  - `auth.test.mjs` (7): setup token dies after the first passkey; challenges are single-use, origin-bound, expiring; idle and absolute session expiry; step-up refuses a different payload, a different action, another session, and replay; recovery revokes every session and only allows a replacement passkey; backup passkeys need step-up; no secret reaches the audit records.
  - `hosted-store.test.mjs` (4): Postgres store concurrency, append-only, refresh; stateless recap and engineering flows through G1→G2→G3 with every step in a fresh session; racing decisions.
  - `hosted-app.test.mjs` (6): security headers; Origin + console header + JSON required on every POST; cookie attributes; logout kills the session server-side; dispatch to a stubbed GitHub API only after commit with run ids recorded; approve refused without step-up and with a step-up for a different caption; Pause cancels the run, Resume needs step-up and re-dispatches, Stop force-cancels; two racing approvals give one receipt.
  - `hosted-e2e.test.mjs` (1): the real `@simplewebauthn/server` with a Chromium virtual platform authenticator at iPhone 390 px — setup token, recovery codes, recap via the worker, Pause with **no** assertion, Resume and Approve with **exactly one** assertion each, sign out, sign in with the passkey, service worker registered, **zero console errors or CSP violations**.
  - `db-roles.test.mjs` (2): runs `deploy/sql/roles.sql` itself; the worker role is refused every founder kind and non-job claim, nobody can update, delete or truncate the ledger, auth tables are app-only; a full recap job runs **as the worker role**.
  - `sandbox.test.mjs` (1), plus review-fix cases in the auth, store and app tests (8).
- **Independent security review** (a separate reviewer reading the code cold) found 2 serious and 4 medium issues, all fixed and covered by tests:
  1. *Critical:* test code Claude writes ran as the worker's user and could have read its secrets → sandbox user, empty environment, no network, canary self-test, and a ledger check before any push.
  2. *High:* the worker's database login could have appended founder approvals → row-level security per role.
  3. Resume without step-up via a typed "resume" or a non-boolean → refused.
  4. Login/recovery lock-out by spamming → eviction and per-client limits.
  5. Unauthenticated failures growing the permanent ledger → only successes are recorded.
  6. Ledger rows lost on a transient flush error → retried, and visible while in flight.
  Plus: a production worker bug (an un-awaited connection), recovery-code and first-passkey races, a crash on a malformed setup hash, and smaller hardening (TRUNCATE triggers, 15-minute recovery sessions, sign out everywhere, numbers never interpolated raw).
- **The reviewer re-checked the fixes** and found one new high issue, now fixed: tests ran on the real working copy, so a test could alter the change set after the G3 diff was taken. The patch is now fixed *before* any Claude-written code runs, the sandbox user's processes are reaped after every step, and Keep is withdrawn if the working copy changed (tested). Also from the re-check:
  - the sandbox user is limited to loopback by an iptables owner rule, proven by the workflow's self-test;
  - loopback is brought up in the tests' network namespace;
  - the push job proves the bundle is **exactly the G3-approved patch** through rows the worker cannot write: the founder's decision → the G3 subject digest → the verification digest → the patch sha256 → `git diff base tip` (tested, including a tampered tip);
  - the push job keeps its write token out of `.git/config` and installs with `--ignore-scripts`;
  - a retried commit whose acknowledgement was lost is now idempotent;
  - the first-passkey setup is a single transaction;
  - per-client limits use Vercel's own client-address header with IPv6 /64 buckets, and the global recovery cap is gone;
  - a `writer` column records the database role behind every ledger row.
- Bugs found and fixed on the way: concurrent cache refreshes in one process could duplicate history rows (now serialized and deduplicated); a slower transaction could commit a lower sequence number after a reader had moved past it (now an advisory lock makes commit order = sequence order).

## Verified vs to confirm

| Assumption | Status |
|---|---|
| WebAuthn on `localhost` and an exact-subdomain RP ID | Verified (spec; E2E passes on localhost) |
| Neon serverless driver against a real Neon database | **To confirm at CP-H1** (the adapter is written to the pg-compatible Pool; all logic is tested on PGlite, which is real Postgres) |
| Vercel Node Function exporting `{ fetch }` with the `includeFiles` config | **To confirm at CP-H1** with the first deployment |
| `workflow_dispatch` returning the run id (`return_run_details`) | Per GitHub's current API; handled either way (no id → the worker sees Pause in the ledger before starting) |
| What `claude auth status` reports for a `setup-token` login | **To confirm at CP-H2**; the CI preflight accepts `claude.ai` or `oauth_token` and records the plan as reported |
| The sandbox user on a GitHub-hosted runner has no sudo and can't read runner processes' environments | Enforced by the workflow's canary self-test before any secret loads (the job fails otherwise); **first real run at CP-H1** |
| Claude's own read tools cannot reach `/proc/*/environ` | Denied by rule; confirmed in the first hosted engineering run (CP-H2) |
| Free-tier limits (Neon, Actions minutes) on your accounts | **To confirm at CP-H1** on the signup/billing pages |

## Isolation from the public platform

- **Origin:** `team.gametimepicks.yashwantbalaji.com`, its own cookies, CSP and service worker; `noindex`.
- **Code:** a new private repo; the public repo is only read (sparse, read-only checkout of the forecast ledger, receipts, brand and render helpers).
- **Vercel:** a new project; no Vercel API token is created, so nothing can reach `gametime-picks`. Deployments only from the ops repo's `main`.
- **Writes:** Claude's work lands only as `cc/*` branches in the private repo. Moving anything into the public repo stays a separate, founder-approved release.
- **Forecasts:** the Command Center never writes `data/` or `app/`; recaps use frozen, settled, published records only (the Phase 1 integrity gate).

## Known limits (deliberate, for H1+)

- Web Push: the service worker is in place; subscribing and sending land in H1 (needs VAPID keys, created at CP-H1).
- Discord companion: not built (D4, after H1).
- Object retention: stored objects are write-once with no deletion path; at ~300 KB per recap that is years of headroom on the free plan.
- One founder account by design.
- Login-challenge flooding: challenges are evicted, not locked, but a sustained flood could still race the founder's Face ID prompt; CP-H1 adds a Vercel firewall rate-limit rule on `/api/auth/` (step 8).
- A compromised runner can still write misleading *agent output* (contributions, reports) — never a founder action; everything it writes is shown to you as agent output before any gate.
- Deferred from the review: a passkey list with revoke (today: add a passkey or use a recovery code, either of which signs every session out, plus "Sign out everywhere"); passing secrets by file instead of environment (the sandbox makes the environment unreadable to Claude-written code); a GitHub Environment for the secrets (needs a paid plan on a private repo; the workflow refuses non-main refs instead).

**Runbook: revoke a lost or compromised passkey** (until the in-app list exists; from the Mac, owner role). A synced iCloud passkey survives "sign out everywhere", so if your Apple ID may be compromised, delete the passkey itself:

```sql
SELECT credential_id, label, created_at, last_used_at FROM auth_passkeys;   -- find it
DELETE FROM auth_passkeys WHERE credential_id = '<id>';                     -- revoke it
UPDATE auth_sessions SET revoked_at = now()::text WHERE revoked_at IS NULL; -- end every session
```

Then register a new passkey with a recovery code (or, if none is left, reset `auth_setup` and use a fresh setup token).

## CP-H1: founder setup steps (≈ 45 min, free tiers only)

Nothing below is done yet. Steps marked **you** need your accounts or devices; steps marked **me** need your go-ahead because they push or deploy.

1. **You — GitHub repo.** github.com → New repository → name `gtp-ops`, **Private**, no README/template. Then Settings → Billing → Actions: note your included minutes; if a payment method is on file, add an Actions budget of **$0 with "Stop usage"**.
2. **You — Neon.** neon.com → sign up (Free plan) → New project `gtp-cc`, Postgres 17, region **AWS us-east-1** (next to Vercel's default). Copy the **owner** connection string (pooled). Keep it on the Mac only; it is never stored in Vercel or GitHub.
3. **Me (needs your OK to push) — the private repo.** Commit H0 here; split `command-center/` into `gtp-ops` with its history; add at the repo root `api/index.mjs` and `vercel.json` (from `deploy/vercel/`), an empty `public/`, and `.gitignore` (from `deploy/ops-repo.gitignore`); pin every action in `cc-worker.yml` to a commit SHA and add it as `.github/workflows/cc-worker.yml`; push `main` to `gtp-ops`. The public repo is not touched.
4. **You, in a Mac Terminal tab — database.** One command creates the tables and the three least-privilege roles and prints their connection strings once:
   ```bash
   DATABASE_URL_OWNER='<owner string>' node command-center/deploy/migrate.mjs --roles
   ```
   Paste them in steps 7 and 8, then clear the terminal.
5. **You — setup token.**
   ```bash
   node command-center/deploy/new-setup-token.mjs
   ```
   Keep the printed token for step 9; the `GTP_CC_SETUP_TOKEN_SHA256=…` line goes to Vercel.
6. **You — dispatch token.** GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Repository access: **Only `gtp-ops`**. Permissions: **Actions: Read and write**, nothing else. Expiry: 90 days.
7. **You — GitHub secrets.** `gtp-ops` → Settings → Secrets and variables → Actions → New repository secrets `CC_WORKER_DATABASE_URL` and `CC_READER_DATABASE_URL`. Do **not** add `CLAUDE_CODE_OAUTH_TOKEN` yet (CP-H2). Confirm there are no `ANTHROPIC_*` secrets at repo or account level.
8. **You — Vercel.** On your existing Pro team: Add New → Project → import `gtp-ops`, Framework **Other**, root `./`. Environment variables (**Production only**), per `deploy/env.example`: `DATABASE_URL` (app string), `GTP_CC_ORIGIN`, `GTP_CC_RP_ID`, `GTP_CC_SETUP_TOKEN_SHA256`, `GH_DISPATCH_TOKEN`, `GH_OPS_OWNER`, `GH_OPS_REPO`, `GH_WORKER_WORKFLOW`. Then Settings → Build and Deployment: **On-Demand Concurrent Builds OFF**; Deployment Protection: standard protection for previews (free); Firewall → add a rate-limit rule for path prefix `/api/auth/` (e.g. 30 requests per minute per IP, then deny; confirm rate limiting is within your Pro plan's inclusion before saving). **Don't** buy Password Protection. Deploy. Then Domains → add `team.gametimepicks.yashwantbalaji.com` and create the CNAME it shows at your DNS host (automatic if the domain is on Vercel DNS). This is the only DNS change; the public site is untouched.
9. **You — iPhone.** Safari → `https://team.gametimepicks.yashwantbalaji.com` → enter the setup token → **Create passkey** (Face ID) → save the 10 recovery codes in your password manager → Share → **Add to Home Screen**. On the Mac, open the same address → sign in with the synced passkey → Team → **Add a backup passkey** if you want a non-iCloud one. Then delete `GTP_CC_SETUP_TOKEN_SHA256` from Vercel (it is already useless).
10. **Me, with you watching — smoke test with the Mac able to be off.** Headers and 401s from outside; a status command; a recap (worker on Actions, no Claude — this also runs the sandbox self-test); Pause with no prompt; Resume and Approve with Face ID; a manual ChatGPT paste on the phone; minutes and Neon usage noted. Any failure stops here.

## Remaining checkpoints

| CP | You decide or do | Then I build |
|---|---|---|
| **CP-H1** | Steps 1–9 above; OK to push the private repo and deploy `gtp-team` | **H1**: hosted dry run from the iPhone with the Mac off; Web Push subscribe and notify (VAPID keys at this step); acceptance per the architecture doc §7 |
| **CP-H2** | `claude setup-token` on the Mac → add `CLAUDE_CODE_OAUTH_TOKEN` as a `gtp-ops` Actions secret; re-confirm claude.ai usage credits OFF (re-attest in the console); approve one hosted delegated task | **H2**: Claude Code plan/build/verify/keep on Actions, Claude run as a separate Linux user, CLI version pinned, a test that it cannot read the worker's environment, Stop within ~15 s |
| **CP-H3** | Security sign-off on the live deployment; Discord companion yes/no | **H3**: daily brief (Vercel Cron), notifications, hosted recap rhythm |
| CP2 | X publishing provider (friend evidence) | Real publisher adapter, still behind approval |
| CP3 | Roadmap alignment (template, terminology, NBA/Theater/live scope) | More sports and formats |
| CP5 | API seats for ChatGPT/Grok/Claude with caps; MCP tests | Direct integrations replacing manual paste |
