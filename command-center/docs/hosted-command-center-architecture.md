# Hosted CEO Command Center: architecture (proposal, awaiting approval)

**Goal:** a private, secure, mobile-first Command Center for GameTimePicks that works from the iPhone with the Mac **off**:
- persistent conversations;
- task orchestration with G1–G3 gates;
- hosted Claude Code execution;
- ChatGPT, Claude and Grok seats.

It stays strictly isolated from the public site, its canonical forecasts and its Production deployments.

**Status:** design only. Nothing has been hosted, bought or connected; DNS and the public site are unchanged.

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
iPhone (installed PWA) / Mac browser / Discord (companion)
        │  HTTPS, passkey session
        ▼
Vercel project "gtp-team"  (private, separate from "gametime-picks"; from a PRIVATE repo)
  ├─ static UI (today's console, already 390/430 px ready)
  ├─ /api/*  orchestrator steps (Vercel Functions): commands, plans, gates, manual seats, pause/stop, state
  ├─ /api/jobs/callback  ← signed results and progress from runners
  ├─ /api/discord  (signed interactions; companion, later)
  └─ Vercel Cron → daily brief (Vercel cron, not GitHub cron, which drops slots in this org)
        │                               │
        ▼                               ▼
Neon Postgres (free)            Vercel Private Blob (GA): screenshots, graphics, raw run logs
  ledger_entries (append-only), claims (unique key), sessions, passkeys, push subscriptions
        │
        ▼  repository_dispatch (fine-grained token, ops repo only)
GitHub Actions in the PRIVATE ops repo: long jobs
  ├─ Claude Code plan/build runs (`claude -p`, CLAUDE_CODE_OAUTH_TOKEN = your Max subscription)
  ├─ Verifier (tests + Playwright screenshots), recap rendering
  └─ posts progress/results to /api/jobs/callback (per-job HMAC token)
```

| Piece | Choice | Why |
|---|---|---|
| Code | New **private** repo, e.g. `gametimepicks-ops`, holding `command-center/` (moved out of the public repo, history kept) | Logs, runner output and ledger code stay private. The public repo's own Actions logs are world-readable |
| Hosting | New Vercel project on your **existing Pro team**: static files plus plain Node functions (the same style as `app/api/*.mjs`), Standard build machine, On-Demand off | Separate project, deployments and env. Small, fast builds. No change to `gametime-picks` |
| Persistent conversations and ledger | **Neon Postgres, free plan**: 0.5 GB and 100 CU-hours per project, scales to zero after 5 minutes [DOC: neon.com/pricing] | Real concurrency (`INSERT … ON CONFLICT` claims) and queries. The `LedgerStore` interface already isolates callers. The app's database role gets **INSERT/SELECT only** on `ledger_entries`, so append-only is enforced by the database |
| Media | **Vercel Private Blob** (GA): URLs aren't public, served through an authenticated route [DOC: vercel.com/docs/vercel-blob/private-storage] | No public links to drafts or screenshots |
| Orchestration | Short steps in Vercel Functions. Long steps (Claude Code, verification, rendering) in GitHub Actions | Functions handle seconds-long work. Claude runs and Playwright take minutes |
| Pause / Stop | A control row in Postgres, checked before every step and inside runners. Stop also cancels the Actions run through the API | Works with every model provider down: it's a database write, not a model call |
| Notifications | **Web Push** to the installed iPhone app (iOS 16.4+, home-screen PWA), plus an optional Discord webhook | $0, no app store |

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
   - The dispatch token is fine-grained to the **ops repo only** (Actions plus Contents).
   - **No Vercel API token is created**: Vercel tokens are team-scoped and could reach `gametime-picks`.
   - **No write token to the public repo.**
6. **Secrets** live only in Vercel env and ops-repo Actions secrets, never in the browser bundle or logs. Runners get per-job HMAC tokens for callbacks.
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

## 6. Cost (incremental, monthly)

| Item | Expected | Notes |
|---|---|---|
| Vercel project `gtp-team` | **$0** | Included in your existing Pro plan. Small function usage; Standard builds with On-Demand off (keep it off) |
| Neon Postgres | **$0** | Free plan: 0.5 GB, 100 CU-hours, scale to zero [DOC]. Whether limits differ when provisioned through Vercel Marketplace is UNVERIFIED |
| Vercel Private Blob | **$0** expected | Within Pro's included storage and transfer (UNVERIFIED for your usage) |
| GitHub Actions (private ops repo) | **$0** expected | About 300–600 runner minutes a month (≈20 engineering tasks at ~10–15 min, plus recaps), inside the included private-repo minutes. Your GitHub plan and overage rate are UNVERIFIED |
| Claude Code | $0 cash | Your Max allowance; usage credits off |
| ChatGPT / Grok (manual seats) | $0 | Your existing apps |
| DNS subdomain, Web Push, Discord | $0 | — |
| **Total** | **≈ $0** | Paid seats (OpenAI/xAI APIs) only at CP5, with caps you set |

**One-time setup you do:** create the private repo, the Vercel project, the Neon database and the DNS record (about 30–45 minutes), and register your passkeys.

---

## 7. Phases and approval checkpoints

| Phase | Scope | Acceptance criteria | Accounts / spend | Effort |
|---|---|---|---|---|
| **H0: hosting-ready, still local** | Postgres `LedgerStore` adapter (tested against embedded Postgres, PGlite); passkey auth module and step-up, tested on localhost (WebAuthn allows it); Vercel-style API handlers; job dispatch and callback contract with a local runner; Private-Blob media adapter behind an interface | All M2 behaviour unchanged on the new store; append-only and claim races proven against Postgres; passkey login, step-up and session expiry tests; still no network writes | None | 3–5 days |
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
| D1 | Address: subdomain `team.gametimepicks.yashwantbalaji.com`, or path `/team` | Subdomain now; optional `/team` redirect later |
| D2 | Move `command-center/` into a new private repo (keeping history), or keep it in the public repo | Move to private |
| D3 | Hosting stack: new Vercel project on the existing Pro team + Neon free + Private Blob + GitHub Actions | Yes |
| D4 | Discord as a companion, with publish/spend/keep only on the dashboard with a passkey | Yes, after H1 |
| D5 | Authorize **H0** (local only, no accounts) now | Yes |
| D6 | Keep or delete the local branch `cc/4a57532d-mvreil4t` and its working copy now that the change is integrated | Delete the working copy; keep the branch until H1 |
