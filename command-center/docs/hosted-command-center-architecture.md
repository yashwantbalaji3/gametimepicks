# Hosted CEO Command Center: architecture

**Goal:** a private, secure, mobile-first Command Center for GameTimePicks that works from the iPhone with the Mac **off**:
- persistent conversations;
- task orchestration with G1–G3 gates;
- hosted Claude Code execution;
- ChatGPT, Claude and Grok seats.

It stays strictly isolated from the public site, its canonical forecasts and its Production deployments.

**Status (2026-10-27):** D1 (subdomain) and H0 approved; **H0 is built and tested locally** — see [h0-hosting-readiness.md](h0-hosting-readiness.md). Nothing has been hosted, bought or connected; DNS and the public site are unchanged. Where H0 changed the design, this document now describes what was built (§2, §6).

**Evidence labels:** **DOC** = checked in official docs on 2026-10-27; **UNVERIFIED** = confirm on your account.

---

## 1. The `/team` address and isolation (decision D1)

`https://gametimepicks.yashwantbalaji.com/team` is the public site's origin. Serving the Command Center at that path has two consequences:

1. It means editing the **public** project's `app/vercel.json`, a build input, with a rewrite or a multi-project routing rule. That is a public-site change and a Production build.
2. More importantly, it puts the CEO app **on the same origin as the public site**. Cookies, storage, service worker scope and any script that ever slipped into a public page would share a security boundary with your approval console.

| Option | Isolation | Public-site change | Verdict |
|---|---|---|---|
| **A. Subdomain `team.gametimepicks.yashwantbalaji.com`**, its own private Vercel project | **Full**: separate origin, cookies, CSP, service worker, deployments | **None.** One DNS record (CNAME) | **Recommended** |
| A + a later one-line redirect `/team` → subdomain on the public site | Full, since the redirect only moves the visitor | One redirect line, shipped in a normal batched release | Optional, later |
| B. Path `/team` via a rewrite to the private project | Shared origin with the public site | Edits public `vercel.json` plus a Production build | Not recommended |

The repo doesn't document who hosts DNS for `yashwantbalaji.com`. You'll need to add the CNAME, or confirm it's on Vercel DNS.

---

## 2. Components (lowest cost, no new vendors except a free database)

```
iPhone (installed PWA) / Mac browser
        │  HTTPS · passkey session cookie (__Host-, HttpOnly, SameSite=Strict) · step-up WebAuthn on approvals
        ▼
Vercel project "gtp-team" (private ops repo; production branch main only; On-Demand Concurrent Builds OFF)
  └─ one Function, api/index.mjs → hosted/app.mjs: static console + /api/* (stateless: open ledger session,
     orchestrator in "jobs" mode, one flush, then dispatch)
        │ SQL (role gtp_cc_app)                      │ workflow_dispatch (PAT: ops repo only, Actions r/w)
        ▼                                            ▼
Neon Postgres (free)                         GitHub Actions in the PRIVATE ops repo: cc-worker.yml
  ledger_entries / ledger_claims (append-only  ├─ job "work" (contents: read): worker/run-job.mjs → recap
    triggers; claims = first writer wins)      │    render, Claude Code plan/build (CLAUDE_CODE_OAUTH_TOKEN),
  stored_objects (media, run logs, G3 patches) │    Verifier; writes progress straight to the ledger
  auth_* (passkeys, sessions, challenges,      │    (role gtp_cc_worker), polls it for Pause
    recovery codes) — web role only            └─ job "push" (contents: write): only after G3 keep, pushes
                                                    exactly the kept cc/* branch from a git bundle
```

| Piece | Choice (as built in H0) | Why |
|---|---|---|
| Code | New **private** repo (`gtp-ops`) holding `command-center/` at its root | Logs, runner output and ledger code stay private. The public repo's own Actions logs are world-readable |
| Hosting | New Vercel project on your **existing Pro team**: one Node Function serving the console and the API (`deploy/vercel/`); deployments from `main` only; On-Demand Concurrent Builds **off** (it defaults on for new projects) | Separate project, deployments and env. No change to `gametime-picks`. No build step |
| Ledger and conversations | **Neon Postgres, free plan** via `ledger/sql-store.mjs`: sessions buffer writes and flush in one transaction; claims are `INSERT … ON CONFLICT DO NOTHING` (a lost race rolls back the whole request, which is retried once and becomes the idempotent duplicate); an advisory lock makes commit order equal sequence order | Real concurrency between the web app and runners. Append-only is enforced by triggers, and neither app role can change the schema (`deploy/sql/roles.sql`) |
| Media, run logs, G3 change sets | **The same database** (`stored_objects`, write-once, ≤ 8 MB each, run logs capped at 2 MB), served only through the authenticated `/media/` and `/runs/` routes | Replaces Private Blob: no second storage vendor, no Blob charges, one backup story |
| Orchestration | Light steps run in the request; heavy steps (recap facts/render, Claude Code plan/build/keep, verification) are recorded as **jobs** and dispatched only after the request's ledger write commits. A job can start once (claim); a duplicate dispatch is refused | Stateless Functions; minutes-long work on runners |
| Long-running work across runners | The build job stores the full change set (binary patch) and binds its sha256 into the G3 subject; the keep job re-creates the working copy and applies exactly that patch | Each Actions run is a fresh machine |
| Pause / Stop | A ledger row (no model call). Pause cancels the dispatched/started runs by run id (`…/cancel`); Stop uses `…/force-cancel`. A runner that starts while paused closes its job without working; engineering runs also poll the ledger and stop Claude Code. Resume re-requests cancelled recap drives | Works with every model provider down |
| Notifications | Web Push to the installed iPhone app (service worker in H0; subscription and sending in H1) | $0, no app store |

---

## 3. Agent execution with the Mac off

| Seat | Phase H | Later |
|---|---|---|
| **Claude Code** (engineering) | GitHub Actions in the ops repo: `claude -p` with **`CLAUDE_CODE_OAUTH_TOKEN`** from `claude setup-token`, which bills your subscription. It's valid one year, tied to you, and limited to model requests [DOC: code.claude.com/docs/en/authentication]. Same envelope as M2: allowlists, no Bash in builds, scope check, Verifier, G1–G3. Keep pushes `cc/*` to the **private** ops repo; nothing touches the public repo | Optionally, Claude Code routines (`/fire`) as a second path |
| **ChatGPT** (Prompt Architect / Product) | Manual seat. The prompt is shown in the hosted console; you paste it into the **ChatGPT iPhone app** and paste the reply back. $0 | OpenAI API seat, metered with a hard cap (CP5) |
| **Grok** (social research) | Manual seat via the Grok app. $0 | xAI API + X Search, metered with a cap (CP5). Results are always untrusted research notes |
| Deterministic (gate, renderer, verifier) | Actions runners | — |

**Billing guardrails carried over from M2:**
- The workflow refuses to run if an `ANTHROPIC_API_KEY` secret exists anywhere it could be read (it would outrank the subscription).
- Your usage-credits-off attestation is required.
- Estimated-usage caps stay $1 for plans, $3 for builds and $5 per command.
- Every run is recorded with model, effort, session id and estimated usage.

---

## 4. Security controls

1. **Passkey-only login (WebAuthn).**
   - User verification required (Face ID).
   - Exactly one account; your credential syncs across Apple devices through iCloud Keychain.
   - Add a second passkey and keep 10 single-use recovery codes, stored hashed.
   - No passwords and no email login.
2. **Sessions:** `__Host-` cookie, `Secure`, `HttpOnly`, `SameSite=Strict`. 12-hour idle and 7-day absolute expiry. Revocable from the console.
3. **Step-up confirmation:** a fresh passkey assertion for G1–G3, Keep, Resume, the billing attestation, seat changes, budget changes and credential changes. **Pause and Stop are one tap** while signed in. This closes the M2 finding that a local GitHub token could impersonate you: hosted approvals need your device.
4. **Request hardening:**
   - CSRF: SameSite=Strict, plus a custom header, plus an Origin check.
   - Strict CSP (self only, no third-party scripts), HSTS, `X-Frame-Options: DENY`.
   - Rate limits on auth endpoints.
5. **Least privilege:**
   - The database role cannot UPDATE or DELETE ledger rows.
   - The dispatch token is fine-grained to the **ops repo only**, with "Actions: read and write" and nothing else (no Contents: it cannot read code or push).
   - **No Vercel API token is created**: Vercel tokens are team-scoped and could reach `gametime-picks`.
   - **No write token to the public repo.**
6. **Secrets** live only in Vercel env and ops-repo Actions secrets, never in the browser bundle or logs. Runners need no callback: they write to the ledger with their own database role, which has no access to authentication tables.
7. **Untrusted content:** X/Grok text and pasted answers are data, never instructions. They go through the existing contract validation.
8. **Audit:** every login, step-up, gate, run, pause and stop is a ledger row.
9. **Preview deployments** of `gtp-team` get Vercel Deployment Protection.
10. **A security review before daily use (CP-H3):** headers, auth flows and the token inventory, checked on the live private deployment.

---

## 5. Isolation from the public platform (guarantees)

- **Separate:** repository, Vercel project, origin (subdomain), env vars, database and blob store.
- **Forecast data:** the Command Center reads canonical forecasts and settlements **read-only**, from the public repo at a pinned commit (the same Forecast Ledger and receipts as Track B). It never writes to `data/` or `app/`.
- **Deployments:** it has no access to the `gametime-picks` project, its deployments or its workflows. Engineering output lands only as `cc/*` branches in the private ops repo. Promoting anything into the public repo stays a separate, founder-approved step through the existing release process.
- **Release process:** public-site work (including any `/team` redirect) still goes through the integration coordinator and batched release vehicles.

---

## 6. Cost (incremental, monthly) — corrected in H0 after checking current terms

| Item | Expected | What the terms say / what to set |
|---|---|---|
| Vercel project `gtp-team` | **≈ $0–2** | Pro has no separate free function allowance: usage is drawn from the plan's included monthly usage credit shared with `gametime-picks`. Polling is throttled (3 s while active, 15 s idle, none when the app is hidden) to keep invocations small. **Turn On-Demand Concurrent Builds off** for the new project (it defaults on). **Don't** buy Password Protection; passkeys do that job |
| Neon Postgres | **$0** | Free plan: 100 CU-hours per project per month; storage limit per the current free plan (confirm on the signup page at CP-H1); scale-to-zero after 5 idle minutes cannot be disabled — first request after idle is slower. The polling design lets it sleep |
| Media storage | **$0** | In Postgres; a recap PNG ≈ 300 KB |
| GitHub Actions (private ops repo) | **$0 expected** | Private-repo minutes included: 2,000/month (Free) or 3,000 (Pro); Linux overage is billed per minute. Each job spends ~1–2 min installing. **With no payment method on file, usage simply stops at the quota**; with one, set an Actions budget with "stop usage" at $0 |
| Claude Code | $0 cash | Your Max allowance via `claude setup-token`; usage credits stay OFF (attested in the console) |
| ChatGPT / Grok (manual seats) | $0 | Your existing apps |
| DNS subdomain, Web Push | $0 | — |
| **Total** | **≈ $0–2** | Paid seats (OpenAI/xAI APIs) only at CP5, with caps you set |

**One-time setup you do (CP-H1/CP-H2):** about 45 minutes; exact steps in [h0-hosting-readiness.md](h0-hosting-readiness.md).

---

## 7. Phases and approval checkpoints

| Phase | Scope | Acceptance criteria | Accounts / spend | Effort |
|---|---|---|---|---|
| **H0: hosting-ready, still local** ✓ | Postgres `LedgerStore` adapter (tested against embedded Postgres, PGlite); passkey auth module and step-up, tested on localhost (WebAuthn allows it); Web-standard API handler; job dispatch (workflow_dispatch) and cancel with a local runner; media in Postgres behind an object-store interface | All M2 behaviour unchanged on the new store; append-only and claim races proven against Postgres; passkey login, step-up and session expiry tests; still no network writes | None | 3–5 days |
| **CP-H1 (you)** | Approve D1 domain, D2 repo move, D3 hosting choices. You create the private repo, Vercel project, Neon database and CNAME (I give exact steps) | — | Free tiers only | ~45 min |
| **H1: hosted dry run, Mac off** | Deploy `gtp-team`; register passkeys; conversations, manual ChatGPT/Grok seats, the NFL recap with the mock publisher, gates, Pause/Stop, Web Push | From the iPhone with the Mac **off**: log in, run a command, paste a ChatGPT spec, approve a gate with Face ID, pause/stop. Security headers pass. A forged approval without a passkey is refused. Public site and its deployments untouched | Free tiers | 3–4 days |
| **CP-H2 (you)** | Run `claude setup-token` and add it as an ops-repo Actions secret; confirm no API-key secrets; approve the Actions minutes budget | — | — | ~10 min |
| **H2: hosted engineering** | Claude Code plan and build plus the Verifier in Actions, driven by hosted G1–G3; Keep pushes `cc/*` to the private repo | One real delegated task end to end with the Mac off; usage logged; Stop cancels a running job within ~15 s | Max allowance only | 4–6 days |
| **CP-H3 (you)** | Security review sign-off; enable the Discord companion if wanted | — | — | — |
| **H3: operating rhythm** | Daily brief by Vercel Cron, Discord notifications, hosted recap pipeline | Brief arrives on the phone each morning; zero missed scheduled runs over a week | Free | 2–3 days |
| Later (CP5) | OpenAI/xAI API seats with caps; MCP access for Claude.ai/Grok | — | Your caps | — |

---

## 8. Decisions needed from you

| # | Decision | Recommendation |
|---|---|---|
| D1 | Address: subdomain `team.gametimepicks.yashwantbalaji.com`, or path `/team` | ✓ Subdomain approved; optional `/team` redirect later |
| D2 | Move `command-center/` into a new private repo (keeping history), or keep it in the public repo | Move to private |
| D3 | Hosting stack: new Vercel project on the existing Pro team + Neon free + GitHub Actions (media in Postgres; no Blob) | Yes |
| D4 | Discord as a companion, with publish/spend/keep only on the dashboard with a passkey | Yes, after H1 |
| D5 | Authorize **H0** (local only, no accounts) now | ✓ Approved 2026-10-27; built |
| D6 | Keep or delete the local branch `cc/4a57532d-mvreil4t` and its working copy now that the change is integrated | Delete the working copy; keep the branch until H1 |
