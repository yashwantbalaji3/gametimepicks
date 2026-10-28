# CEO Command Center: CP1 walkthrough and connected-agent roadmap

**Date:** 2026-10-27 · **Branch:** `claude/gametimepicks-ceo-agent-center-4d5fd3` @ `08e915d6a7` (local, not pushed)

**Status:** assessment only.
- Nothing was implemented, pushed, deployed or connected.
- No accounts were created and no credentials connected.
- The only action taken was resetting the local demo ledger, so the walkthrough starts clean.

**Evidence labels:**
- **DOC**: official provider documentation, read today.
- **3P**: third-party source.
- **UNVERIFIED**: needs a test on your accounts.
- **REPO**: read in this repository.

---

## 0. Decision summary

1. **Every provider can collaborate for real.** The cheapest reliable route uses each provider's *supported* path and joins them through our own task ledger. None of them can join another provider's chat, so the shared state has to be ours.
   - **Claude Code** can do real engineering with your Mac off, on your Claude subscription, either through GitHub Actions (`claude-code-action` with `CLAUDE_CODE_OAUTH_TOKEN`) or through Claude Code scheduled cloud sessions ("routines", started by an HTTPS `/fire` call). [DOC]
   - **ChatGPT** cannot be driven unattended on a Plus or Pro subscription.
     - Write-capable MCP tools need Business, Enterprise or Edu. [DOC via search]
     - OpenAI recommends API keys for Codex automation. [DOC]
     - So ChatGPT joins today as a **manual seat**: you paste the prompt into the ChatGPT app, including on your iPhone. From Phase 3 it can join as a **metered API seat**, costing pennies per brief.
   - **Grok** joins as a manual seat now, and later through the xAI API (Grok 4.3 at $1.25 / $2.50 per million tokens) [DOC]. Grok Bot with our MCP plugin is an option if you already pay for SuperGrok.
2. **The next proof of concept is a real ChatGPT → Claude Code handoff, on your Mac, at $0 extra.**
   - A spec you get from your real ChatGPT is approved by you.
   - Claude Code (your subscription, headless) then plans and implements it in an isolated worktree.
   - The orchestrator runs the tests itself and shows the diff, test results and screenshots in the CEO conversation.
   - The target is a small change inside `command-center/` only, so no shared code is touched.
3. **Mobile with the Mac off (preferred design):**
   - a private hosted dashboard (installable on the iPhone home screen, with passkey login);
   - Discord as a companion;
   - a private GitHub "ops" repository that holds the ledger and runs the jobs.
   - Incremental hosting cost is about $0 on your existing Vercel Pro and GitHub plans (GitHub plan UNVERIFIED).
4. **Monthly cost, three modes:** manual about $0 · **hybrid (recommended) about $2–10** · fully connected about $60–150. §9 has the breakdown.
5. **X publishing (CP2) stays open.** No provider is chosen; the friend-interview checklist is in §10.

---

## 1. CP1 founder walkthrough (about 15 minutes)

**Open it.** The console is running now in the Terminal tab **"CEO console"** (127.0.0.1:4190). Open **http://127.0.0.1:4190** in Safari or Chrome on this Mac. I reset its demo data, so it starts empty.

If the console has stopped, run these two commands in Terminal:

```bash
cd ~/Downloads/gametimepicks/.claude/worktrees/gametimepicks-ceo-agent-center-4d5fd3
```

```bash
node command-center/surfaces/console/server.mjs
```

It only listens on this Mac, so your iPhone can't open it. That is deliberate in Phase 1 (see §7).

**Demo command** (it's also the first suggestion chip):
> Team, prepare GameTimePicks' NFL postgame recap content for last night's games. Identify content opportunities, draft graphics and captions, and report what needs my approval.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Send the command | The Chief of Staff's **plan** appears, followed by one card per role, about 0.6 s apart: Prompt Architect → Engineering → Integrity Reviewer → Creative Renderer → Social Strategy → Chief of Staff |
| 2 | **Inspect contributions** | Each card shows the role, its **seat tag** (amber "SIMULATED AGENT OUTPUT" for simulated text, green "DETERMINISTIC CODE" for real code) and its cost ($0). Expand "Artifact (…)" for the full typed JSON. The Prompt Architect's brief, Engineering's slate check (12 games gated), and Social Strategy's 3 angles plus caption tone are all there |
| 3 | **Graphic and captions** | In the Creative Renderer card, tap the thumbnail to enlarge it. Both captions sit beside it with their validator result. The file is at `command-center/out/console/media/nfl-recap-401873022.png` |
| 4 | **Consolidated report** | Green Chief of Staff card: what the team did, deliverables, what needs your decision, the LOOP_GUARD refusal, the two warnings, and cost $0 |
| 5 | **Approve** | Decisions panel: choose caption A or B, then **Approve & publish (mock)**. A green receipt appears (`PUBLISHED_MOCK`, digest, cost $0). Click again: nothing new is recorded |
| 6 | **Pause / Resume** | Click **Reset demo** and resend the command. Then **Pause all** → Approve shows "Approved, not sent: PAUSED". Then **Resume** → **Retry publish (mock)** shows the receipt |
| 7 | **Reject** | Reset demo and resend, then click **Reject**: it shows "Rejected by you". There is no "request changes" button yet |
| 8 | **History and tasks** | The **Tasks** panel shows the 6 tasks with their hand-off depth and seat. **Action history** lists every record in order, newest first |
| 9 | **A real ChatGPT contribution** | Under Team seats, set Prompt Architect to `manual:chatgpt`. Send "Team, what should our next product improvement be for the Results page?" Copy the prompt into **your own ChatGPT**, paste its answer back, and click **Record answer**. This is the only step that involves a real external AI, and you do the copy-paste |
| 10 | **Mobile** | Make the browser window narrower than 760 px, or use responsive mode (iPhone 390/430 px). The tab bar, top-bar Pause and pinned Approve buttons appear |

The same command is ignored if sent twice on the same day (deliberately), so use **Reset demo** between runs. The demo ledger and media live in `command-center/out/console/`, which git ignores.

**What to judge at CP1:**
- Is one conversation with role cards the right CEO experience?
- Is the report the right length?
- Are the decision cards clear?
- Would you use the phone tab layout?

---

## 2. Feature inventory: real vs simulated

| Feature | Status | Notes |
|---|---|---|
| Orchestrator: plan → tasks → hand-off checks (max 3 hops, max 8 tasks, allowed hand-offs) → report | **Functional** | Real code. Plans come from keyword rules, not a model |
| Task ledger (records are only ever added, never edited) and "first writer wins" claims | **Functional** | Concurrency tested with 12 processes; the atomic-write fix is in place |
| Integrity gate, fact bundle and caption validator | **Functional · deterministic** | Reads the Forecast Ledger and receipts only; 7 refusal cases tested |
| PNG renderer (template `nfl-recap@0`) | **Functional · deterministic** | Offline; byte-identical output on this Mac |
| Approvals bound to the exact content, Pause, idempotent sends | **Functional** | Console approvals are **demo-grade**: anything on the Mac could click them |
| Mock publisher | **Mock** | Has no network code at all |
| Chief of Staff, Prompt Architect, Product Strategist, Social Strategy text; Engineering's summary sentence | **Simulated** | Template text over real facts, labelled "SIMULATED AGENT OUTPUT". No model wrote it |
| Template captions | **Deterministic templates** | Labelled "template (fake seat)" |
| `manual:chatgpt` / `manual:claude` / `manual:grok` seats | **Manually operated** | A real AI answer, but you copy and paste it; checked against the same format |
| `api:openai` / `api:anthropic` / `api:xai` / `mcp:*` seats | **Not built** | Stubs with no network code; they refuse to run |
| Real Claude Code engineering, Grok research, Discord, hosted dashboard, X posting | **Not built** | This roadmap |
| iPhone 390/430 layouts | **Functional** | Tested in mobile Chromium; local only |

No contribution in Phase 1 came from ChatGPT, Claude Code or Grok unless you pasted it in step 9.

---

## 3. Connected multi-provider architecture

```
CEO (dashboard PWA · Discord · local console)
        │  one conversation
        ▼
Chief of Staff / Orchestrator ── policy: hand-off limit · task cap · budgets · approval gates · Pause
        │  writes everything to
        ▼
Task Ledger (typed, append-only records; commands, tasks, context packets, artifacts, approvals, receipts, costs)
        │
        ├─ Seat adapters (one contract, many providers)
        │    ChatGPT:  manual (now) · OpenAI API (metered) · MCP read-only (test)
        │    Claude:   CLI headless on the Mac (now) · GitHub Actions / cloud routines (Mac off) · API
        │    Grok:     manual (now) · xAI API + X Search (metered) · Grok Bot + our MCP plugin (optional)
        ├─ Deterministic tools: integrity gate · fact bundle · renderer · validator · test runner · screenshots
        └─ Publisher boundary (mock until CP2/CP6)
```

**Shared context: a "context packet" per task, so there are no unrelated conversations.** Every seat receives the same structure and must return the same kind of artifact:

```ts
ContextPacket {
  taskId, commandId, role, provider, seat,
  objective, constraints[],                     // e.g. "no edits under data/ or app/public/data/"
  inputs: [{ artifactId, type, digest }],       // earlier artifacts, by content hash; never paraphrased
  repo?: { name, baseRef, allowedPaths[], forbiddenPaths[] },
  budget: { maxTurns, maxUsd, timeoutSec },
  acceptanceCriteria[],
  outputSchema                                  // JSON Schema the answer must satisfy
}
```

Every artifact records its provenance: provider, seat, model, run id or session id, cost, and the founder approvals it depends on.

**Rules that stay as they are:**
- Roles never talk to each other directly.
- Every record is permanent and timestamped.
- Approvals are tied to the exact content.
- Facts come only from deterministic tools.
- Grok and X content is **untrusted**: it is stored as `research-note` and can never become a fact, a caption number, or an instruction to Claude Code without your approval.

---

## 4. ChatGPT → Claude Code handoff design

Worked example: your command *"Improve the NBA homepage…"*

| # | Step | Seat | Artifact or gate |
|---|---|---|---|
| 1 | The Chief of Staff plans: Prompt Architect (ChatGPT), Social research (Grok, run in parallel), then Engineering (Claude Code) | orchestrator | plan |
| 2 | ChatGPT writes the requirements and engineering prompt | `manual:chatgpt` now / `api:openai` later | **EngineeringSpec** (objective, user stories, constraints, files in scope, tests, acceptance criteria, non-goals) |
| 3 | Grok finds content opportunities | `manual:grok` / `api:xai` | **ResearchNote** (quarantined; links and claims only) |
| 4 | **Gate G1: you approve the spec** (tied to its content hash) | founder | approval |
| 5 | Claude Code inspects the repo in **plan mode** (read-only) | Claude Code | **ImplementationPlan** (files, approach, risks, test plan, estimate) |
| 6 | **Gate G2: you approve the plan** | founder | approval |
| 7 | Claude Code implements in an **isolated worktree or branch**, with restricted tools, no push and no merge | Claude Code | **EngineeringResult** (branch, diff summary, files, structured self-report, session id, estimated cost) |
| 8 | The orchestrator **independently** runs the tests and takes screenshots. Claude's own claim is not taken on trust | deterministic | **Verification** (test exit codes, output tails, PNGs at desktop/390/430) |
| 9 | The Chief of Staff reports the diff, tests, screenshots, risks and next decision | orchestrator | consolidated report |
| 10 | **Gate G3: you choose keep → open a draft PR, or discard** | founder | approval |
| 11 | The merge and the Production deploy are **not** done by the command center. They go through the existing release process (the integration coordinator and batched release vehicles). The command center only links to them | — | — |

**How Claude Code is called (verified flags, from the Claude Code CLI reference):**

```
claude -p "<context packet>" -w cc-<taskId> --permission-mode plan \
  --output-format json --json-schema '<ImplementationPlan schema>' --max-turns 25 --max-budget-usd 2
# after G2:
claude -p "<approved plan>" -w cc-<taskId> --permission-mode acceptEdits \
  --allowedTools "Read,Edit,Write,Grep,Glob,Bash(node --test *),Bash(git diff *),Bash(git status)" \
  --disallowedTools "Bash(git push *)" --output-format json --json-schema '<EngineeringResult schema>' \
  --max-turns 40 --max-budget-usd 3
```

**What comes back:** `structured_output` (checked against the schema), `session_id` and `total_cost_usd`. That cost figure is an estimate in API terms; on a subscription it is plan usage, not a charge.

**Caution:** if an `ANTHROPIC_API_KEY` environment variable is present, `claude -p` uses it ahead of the subscription. The orchestrator must remove it to guarantee $0. [DOC]

**Where Claude Code runs:**

| Mode | Runs on | Mac off? | Auth | Status |
|---|---|---|---|---|
| A. CLI headless | your Mac, in a worktree | No | your Claude subscription (CLI login) | Supported; **next PoC** |
| B. GitHub Actions `claude-code-action` in the private ops repo, checking out the public repo | GitHub runner | **Yes** | `CLAUDE_CODE_OAUTH_TOKEN` (your subscription, one-year token) or an API key | Documented. Still to test: triggering from `workflow_dispatch` / `repository_dispatch`, cross-repo checkout, and rejection of bot-triggered runs |
| C. Claude Code cloud session via a saved routine and HTTPS `/fire` | Anthropic cloud | **Yes** | subscription; a token per routine | Research preview. The saved prompt is fixed; only appended text varies. 30 fires per hour per routine. You can also start and steer sessions from the Claude iOS app |
| D. Managed Agents / Agent SDK | Anthropic cloud / our host | Yes | **API key only** (the Agent SDK must not use claude.ai login in third-party products) | Billed by usage; not needed |

**Recommendation:**
- A for the PoC.
- B as the Mac-off engineering path. Its logs are private, it is plain GitHub, and the same restrictions apply.
- C kept as a fallback; you can also use it by hand from the Claude app.

Whether a private orchestrator *you* run on *your own* subscription counts as a "third-party product" is not addressed in the docs (UNVERIFIED). B and C are first-party Claude Code surfaces, so they avoid the question.

**Approval safety:** gates G1–G3 must be confirmed with a factor no agent can reach: a passkey on the hosted dashboard, a signed Discord button, or a one-time code from your authenticator app. Agents on this Mac use your GitHub login (verified), so a GitHub click alone proves nothing.

---

## 5. Grok integration and limits

| Path | What it gives | Mac off | Cost | Limits |
|---|---|---|---|---|
| **Manual seat** (Grok app or X) | Real Grok research pasted back as a ResearchNote | n/a | $0 extra | You do the copy and paste |
| **xAI API + X Search tool** (recommended for automation) | The orchestrator asks focused questions, e.g. "what are fans asking about KC@SEA" | Yes | Grok 4.3 at $1.25 / $2.50 per MTok [DOC]. X Search tool about $5 per 1,000 calls [3P, UNVERIFIED] | Pay as you go, with an xAI spend cap |
| **Grok Bot + our MCP plugin + routine webhook** | Grok Bot pulls tasks from our ledger and writes ResearchNotes | Yes | SuperGrok about $30/month [3P] if you don't have it | The X connector is **read-only** [DOC]. Webhook triggers don't verify the sender [3P], so our MCP server must check its own token. Groups are Grok-only |

**Guardrails for every Grok path:**
- Grok's tools can only read briefs and add research notes. It has no tool that touches forecasts, captions or approvals.
- X content is treated as untrusted, as protection against prompt injection.
- Grok never posts.

---

## 6. One cohesive CEO conversation (what changes in the UI)

The same console gets four additions:
- **Provider badges** on each card: ChatGPT (manual or API), Claude Code (CLI, Actions or cloud), Grok (manual or API).
- **Live status** for long jobs: queued → running → verifying → done, with a link to the Claude Code session.
- **Gate cards** G1–G3 in the Approvals tab.
- **Per-run cost lines.**

Failures surface in the conversation and do not stop silently. Examples: a session timing out, tests failing, or a budget being hit. The Chief of Staff's report then offers retry, revise or cancel.

**Simplest viable versus more complex:**

| Level | What | Infrastructure added | When |
|---|---|---|---|
| 0 | Manual seats everywhere plus the local console | none | now |
| **1** | **Real Claude Code CLI seat plus manual ChatGPT/Grok on the Mac** | none | **next PoC** |
| 2 | Hosted dashboard plus private ops repo; Claude Code in Actions; Discord | 1 private repo, 1 small Vercel project, 1 Discord app | Mac-off milestone |
| 3 | Metered OpenAI/xAI seats; MCP access for Claude.ai and Grok Bot | an MCP endpoint in the same Vercel project | after CP5 |
| ✗ | Managed Agents, message queues, Kubernetes, separate agent servers | — | not needed |

---

## 7. Secure mobile and cloud architecture (Mac fully off)

| Option | Strength | Weakness | Verdict |
|---|---|---|---|
| **Private hosted CEO dashboard (installable on the home screen)** | The full experience; passkeys; reuses this UI | Needs hosting and auth work | **Primary** |
| Discord commands, notifications and approvals | Free; signed button clicks; push notifications built in | Not a full workspace | **Companion** |
| Inside ChatGPT / Claude / Grok (MCP) | Familiar apps | ChatGPT writes need Business; Claude.ai connectors are beta; inconsistent across apps | Read-only helper later |
| Hybrid dashboard + Discord | Both of the above | Two surfaces to keep in step | **Recommended** (both read the same ledger) |

**Recommended design:**

| Area | Design |
|---|---|
| **Hosting** | A new **private Vercel project** (for example `gtp-ceo`) deployed from the private ops repo. It is never the public site, and not `gtp-ops`, because that project's login wall blocks Discord's callbacks. It is static pages plus small server functions on the Standard build machine. Its builds are separate from the public site's |
| **Login** | **Passkey (WebAuthn)** for you only, with user verification required (Face ID). Register a second passkey as a backup and keep printed recovery codes |
| **Sessions** | Secure, HttpOnly, SameSite=Strict cookie; 12-hour idle and 7-day absolute expiry |
| **Step-up confirmation** | A fresh passkey check for approve, publish, spend, seat change, Resume and credential changes. **Pause is always one tap** |
| **State** | The ledger lives in the **private ops repo**, written only by server code through a GitHub App limited to that repo. Postgres comes later if needed. The single passkey's public key and the session-signing secret are server environment variables, so **no database is needed at first** |
| **Secrets** | Kept in Vercel and GitHub Actions secrets, never in the browser. Each job sees only its own secrets; for example, only the publisher job sees platform tokens |
| **Jobs with the Mac off** | A dashboard or Discord action → a server function calls `repository_dispatch` on the ops repo → Actions run the orchestrator steps and the provider seats (Claude Code via Actions, OpenAI and xAI via API) → results are committed to the ledger → you get a Web Push notification on the installed iPhone app (iOS 16.4+) and a Discord message |
| **Discord** | A private server or channel, with your Discord user ID on an allowlist. **Discord can Pause and approve drafts. Publishing, spending and merges require a passkey on the dashboard** (founder decision) |
| **Local console** | Stays a local developer tool. It is **never exposed** |
| **Cost** | About $0 extra (existing Vercel Pro and GitHub plans, Discord free). Check that the new Vercel project keeps On-Demand Concurrent Builds off |

---

## 8. Provider matrix (cost-first)

| Provider path | Subscription or API | Auth | Unattended | Mac off | Setup / ongoing | Risk | Your decision |
|---|---|---|---|---|---|---|---|
| ChatGPT manual seat | your ChatGPT plan | your app login | No | Yes (iPhone app) | none / $0 | none | Use now? |
| OpenAI API seat | API (prepaid, separate from Plus) | project API key | Yes | Yes | add a card / about $0.01–0.10 per brief | key handling | CP5 |
| Codex CLI on the Mac (ChatGPT sign-in) | Plus allowance | local login | Partly | No | none / $0 | OpenAI recommends API keys for automation | Optional |
| ChatGPT MCP write tools | **Business** ($20–25 per seat, 2 seats minimum) [3P] | OAuth | ChatGPT asks you to confirm | Yes | ≥ $40/month | plan cost | Not recommended |
| Claude Code CLI headless | your Claude plan | CLI login | Partly | No | none / $0 | `ANTHROPIC_API_KEY` override | **Next PoC** |
| Claude Code in GitHub Actions | your Claude plan via one-year token (or API) | `CLAUDE_CODE_OAUTH_TOKEN` | Yes | **Yes** | install the GitHub App / $0 + Actions minutes | broad GitHub App permissions; token tied to you | Mac-off milestone |
| Claude Code routines `/fire` | your Claude plan | token per routine | Yes | **Yes** | create the routine / $0 | research preview | Fallback |
| Grok manual | your Grok access | app | No | Yes | $0 | none | Use now? |
| xAI API + X Search | API | API key | Yes | Yes | add a card / about $1–5 per month | prompt injection from X | CP5 |
| Grok Bot + MCP | SuperGrok (~$30) | Grok account + our MCP token | Yes | Yes | plugin setup | sender not verified | Only if already subscribed |

Which subscriptions you hold today (ChatGPT plan, Claude plan, SuperGrok) is **unknown to me**; please confirm, since it changes the hybrid cost.

---

## 9. Cost comparison (monthly, incremental)

Assumptions: 20 engineering tasks, 30 ChatGPT briefs and 60 Grok research calls per month.

| Mode | What runs | Extra $/month | Founder time |
|---|---|---|---|
| **Manual** | Manual seats, local console; Claude Code by hand | **$0** | High: you copy and paste every hand-off |
| **Hybrid (recommended)** | Hosted dashboard + Discord; Claude Code in Actions on your plan; OpenAI API for unattended briefs (~$0.5–3); xAI API research (~$1–5); hosting $0 | **≈ $2–10** | Low: you approve gates only |
| **Fully connected** | Hybrid plus ChatGPT Business for MCP writes ($40–60); SuperGrok ($30) if not owned; Claude API key instead of your plan for CI engineering (~$20–60 on Sonnet 5.5) | **≈ $60–150** | Lowest |

**One-time effort:**
- next PoC: about 3–4 days;
- hosted dashboard and Discord: about 1–1.5 weeks;
- Mac-off engineering: about 3–5 days.

Your plan usage limits (Claude and ChatGPT) are the real ceiling in hybrid mode: heavy Claude Code use draws on the same weekly allowance you use interactively.

---

## 10. CP2 X publishing: kept open

`command-center/docs/x-publishing-evaluation.md` is unchanged. It still has: official X API (metered); third-party schedulers and connectors; manual posting ($0); Grok X research only, with no verified publishing; the friend's setup unverified; and the ten interview questions. **No provider has been selected or enabled.**

**Evidence to request from your friend (screenshots, with tokens hidden):**
1. **X Developer Console → Usage / Billing** for the last 30 days: spend, credits, and the app name.
2. **X → Settings → Security → Connected apps**, showing which app holds write access.
3. **Two or three of their automated posts**, showing the source/"via" line and whether the profile has the **Automated** label; at least one post with an image.
4. The **connector or plugin settings page** (Grok Bot plugin, Blotato, Postiz, Composio…), showing its permissions.
5. **That tool's plan and billing page.**
6. A **run history or log** showing unattended posts over at least 2 weeks, plus any lock, CAPTCHA or re-login events.
7. **What Claude actually is in their setup:** a Claude Code session, an API worker, or a chat app.
8. A one-paragraph **workflow description**: trigger → draft → approval → post.

**Red flags:**
- "logs in as me";
- "uses my browser" or a Chrome extension;
- "Grok uses the computer";
- cookies or session tokens;
- "unofficial API".

Any of these means the method is non-compliant and is excluded.

---

## 11. Revised roadmap (each milestone needs your authorization)

| M | Scope | Depends on | Acceptance criteria | Cap | Effort |
|---|---|---|---|---|---|
| **M2: Connected PoC-1** (Mac on) | Real Claude Code CLI seat; real ChatGPT spec via manual seat; optional Grok manual note; gates G1–G3 | CP1 ✓ | See §12 | **$0 extra** | 3–4 days |
| M3: Hosted control plane (dry run) | Private ops repo; `gtp-ceo` Vercel project; passkey dashboard; Discord companion; Web Push; dispatch → Actions → ledger | M2; **CP4 + CP8** (create the repo, Vercel project and Discord app) | Works with the Mac off; a forged approval without a passkey is refused; Pause works from the phone; the ledger matches across surfaces | $0 | 1–1.5 weeks |
| M4: Mac-off engineering | `claude-code-action` in the ops repo; draft PR only after G3 | M3; token choice (subscription vs API) | Settles the three open questions (dispatch trigger, cross-repo checkout, bot-actor rejection); no push to main; the branch never deploys | $0 + plan usage | 3–5 days |
| M5: Metered seats | `api:openai` Prompt Architect, `api:xai` research | M3; **CP5** | Hard caps enforced on both our side and the provider's; cost line per call | ≤ $10/month | 2–3 days |
| M6: MCP access | Read-only, plus a "submit research note" tool for Claude.ai and Grok Bot | M3, M5 | Capability matrix per app tested on your accounts | $0 | ~1 week |
| M7: Publishing pilot | The chosen adapter, one approved post | **CP2 + CP6** (Privacy/Terms) | One receipt, no duplicates, spend matches the provider | ≤ $5/month | 3 days |
| Later | NBA, live posts, Theater video, public-site work | **CP3 / CP7**, with Launch Readiness | — | — | — |

**Separation from Launch Readiness:**
- The command center only ever proposes code changes as PRs, which the integration coordinator merges.
- Public-site UI work (such as the NBA homepage) is limited to **specs and plans** until CP3 aligns it with the reassessment roadmap.
- Social content keeps using only frozen official forecasts and settled records.

---

## 12. Recommended next proof of concept: "Connected PoC-1"

**Command:**
> Team, add a "Copy caption" button and a live character counter to the Approvals card. Have ChatGPT write the spec, Claude Code plan and implement it in an isolated worktree, and show me the result before anything is committed.

**Flow:**
1. The Chief of Staff plans the work.
2. The **real ChatGPT** spec arrives via the manual seat (you paste it) and must match the EngineeringSpec format → **G1**.
3. **Real Claude Code** headless in plan mode returns an ImplementationPlan → **G2**.
4. Real Claude Code implements in worktree `cc-<task>`, branched from the command-center branch.
5. The orchestrator runs `node --test command-center/tests/*.test.mjs` itself, takes desktop and iPhone screenshots, and records the diff.
6. The report shows everything → **G3**: keep (commit on the local branch) or discard.

**Acceptance criteria:**
1. The Claude Code `session_id`, structured output (schema-valid) and estimated cost are stored on the card, labelled "Claude Code CLI · your subscription".
2. `ANTHROPIC_API_KEY` is removed from the child process environment, so there is no API billing.
3. All work happens in a separate worktree: the main worktree's `git status` is unchanged, and nothing is pushed.
4. Claude's tools are restricted (no push, no network-capable shell); it gets at most 40 turns, a 15-minute timeout, and a $3 estimated-budget cap.
5. **Pause** stops the running Claude process and records the cancellation.
6. Tests and screenshots come from the orchestrator, not Claude's own claims. A failing test is reported, never hidden.
7. Changes stay inside `command-center/`. If the plan touches anything else, it is refused at G2.
8. The ChatGPT contribution is labelled "ChatGPT (your app, pasted)". Nothing simulated is shown as real.

**Cost:** $0 extra; it uses your existing Claude and ChatGPT plan allowances.

---

## 13. Founder decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | CP1 accepted? | Your review (§1) |
| D2 | Authorize **M2 Connected PoC-1** (local, $0) | Yes |
| D3 | Which subscriptions you hold: ChatGPT (Plus / Pro / Business), Claude (Pro / Max), SuperGrok | Needed for the costs |
| D4 | Mac-off engineering token: your Claude subscription via a one-year token, or a separate API key with a cap | Subscription first |
| D5 | Discord approval scope: Pause and drafts only, with publish, spend and merge needing a passkey | Yes |
| D6 | Hosting: a new private Vercel project vs another host | New Vercel project (existing plan) |
| D7 | Grok automation: xAI API (metered) vs Grok Bot (subscription) | xAI API, later, at CP5 |
| D8 | Run the friend interview (§10) | Yes, before CP2 |

---

## Sources (read 2026-10-27)

**Claude Code:**
- headless mode: https://code.claude.com/docs/en/headless.md
- CLI reference: https://code.claude.com/docs/en/cli-reference.md
- authentication: https://code.claude.com/docs/en/authentication.md
- GitHub Actions: https://code.claude.com/docs/en/github-actions.md
- on the web: https://code.claude.com/docs/en/claude-code-on-the-web.md
- Remote Control: https://code.claude.com/docs/en/remote-control.md
- routines: https://code.claude.com/docs/en/routines.md
- Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview.md

**Anthropic platform:**
- Managed Agents: https://platform.claude.com/docs/en/managed-agents/overview.md
- pricing: https://platform.claude.com/docs/en/about-claude/pricing.md
- Claude Tag: https://claude.com/docs/claude-tag/overview.md

**OpenAI:**
- Codex non-interactive mode: https://developers.openai.com/codex/noninteractive
- Codex authentication: https://learn.chatgpt.com/docs/auth
- ChatGPT developer mode and MCP: https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta (via search)
- Codex usage limits: https://help.openai.com/en/articles/11369540-codex-usage-limits

**xAI:**
- models and pricing: https://docs.x.ai/docs/models
- custom connectors: https://docs.x.ai/grok/connectors
- Grok Bot overview: https://docs.x.ai/grok-bot/overview
- Grok Bot and X: https://x.ai/news/grok-bot-and-x
- Grok Bot routines and webhooks (3P): https://hookdeck.com/webhooks/platforms/using-hookdeck-with-grok-bot-reliable-webhook-triggers

**ChatGPT plan pricing (3P):** https://krater.ai/blog/chatgpt-pricing

**X:** API pricing: https://docs.x.com/x-api/getting-started/pricing
