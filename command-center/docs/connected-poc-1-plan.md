# Connected PoC-1: execution plan (awaiting founder authorization)

**Status (2026-10-27): implemented, verified offline, and the real CLI path is proven. Ready for the founder demo.**

**Real smoke run, after the founder re-ran `claude auth login`:**
- Session `4cdac33a…` on `claude-opus-4-7`, Max subscription, no API key.
- 3 turns in 16 s; output passed the schema check; Read was the only tool used.
- About $0.19 estimated usage; $0 billed.
- No files changed and the founder checkout was unchanged.

The earlier 401 attempt is kept below for the record.

- Authorized by the founder; usage credits confirmed **Off** (founder, in chat); a read-only smoke run approved.
- **Offline verification:** 44 tests pass, including with network blocked. A full fake-`claude` walk-through ran on a throwaway console: spec → G1 → plan → G2 → build → verifier (43 tests, 3 screenshots) → G3 keep and discard, all on the real repository. Test branches were cleaned up afterwards.
- **Smoke run (real CLI 2.1.142, read-only):** preflight passed (claude.ai / firstParty / max, no API-key variables), but the first model request returned **"401 OAuth access token is invalid"**.
  - It used 0 tokens and billed nothing, and no files changed.
  - The CLI's saved login is stale, and `claude auth status` does not check it with the server.
  - **Fix (founder):** in Terminal, run `claude auth login` and sign in with your Max account. Then press "Run preflight now" in Controls before the demo.
  - The adapter now detects this case and shows that fix-it message instead of a generic failure.

**Original plan follows. The implementation matches it, with these deliberate deviations:**
1. Both runs use `--permission-mode dontAsk` with allowlists, rather than `plan` / `acceptEdits`, so nothing outside the list can run headless.
2. The build run has **no Bash**. Tests are run only by the Verifier, so Claude never executes code.
3. Keep requires passing tests, all changes in scope, and an unchanged founder checkout.
4. The working copy is a sparse checkout (about 11 MB) of a snapshot that includes uncommitted `command-center/` files.
5. Claude Code settings are limited to user settings with no MCP servers (`--setting-sources user --strict-mcp-config`).

**Base:** `claude/gametimepicks-ceo-agent-center-4d5fd3` @ `08e915d6a7`.

**Goal:** one real, bounded engineering task travels through the CEO console:

1. a real ChatGPT spec, pasted in through the manual seat;
2. **G1**: you approve the spec;
3. a real Claude Code plan;
4. **G2**: you approve the implementation;
5. a real Claude Code implementation in an isolated worktree;
6. tests and screenshots run by the orchestrator itself;
7. **G3**: you choose to keep or discard the changes.

You watch all of it in the same conversation.

---

## 1. Claude Code subscription auth: what was verified (2026-10-27, read-only checks)

| Check | Result | How |
|---|---|---|
| CLI on this Mac | `/Users/yashwantbalaji/.local/bin/claude`, **v2.1.142** | `which`, `--version` |
| Active credential | `loggedIn: true`, **`authMethod: "claude.ai"`**, `apiProvider: "firstParty"`, **`subscriptionType: "max"`** | `claude auth status` |
| API-billing overrides in the environment | **None.** No `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_*` or `CLAUDE_CODE_OAUTH_TOKEN` in this process or your login shell | env var names only; no values printed |
| `apiKeyHelper` or an `env` override in `~/.claude/settings*.json` | **None** | key names only |
| `ANTHROPIC_BASE_URL` | Set (not in your shell rc files) to the **default `https://api.anthropic.com`**, so there is no proxy or gateway | host only |
| Flags this plan needs | `--output-format`, `--json-schema`, `--permission-mode`, `--allowedTools`, `--disallowedTools`, `--max-budget-usd`, `--worktree` are listed in `--help`. `--max-turns` is accepted but hidden | `claude --help` |

**What the official docs say.** The credential precedence order is:

1. cloud provider;
2. `ANTHROPIC_AUTH_TOKEN`;
3. `ANTHROPIC_API_KEY`;
4. `apiKeyHelper`;
5. `CLAUDE_CODE_OAUTH_TOKEN`;
6. Anthropic profiles;
7. your `/login` subscription.

In `-p` mode, an `ANTHROPIC_API_KEY` that is present is always used, with no prompt
([authentication](https://code.claude.com/docs/en/authentication.md)). So the subscription is used **only when none of 1–6 is present**. That is true on this Mac today, and PoC-1 enforces it on every run (§4).

**The one way a Max plan can still cost money.** If **usage credits** ("extra usage") are enabled at claude.ai → Settings → Usage, any usage beyond your Max limits is "billed at standard API pricing rates … as additional charges"
([Claude support](https://support.claude.com/en/articles/11145838-claude-code-usage-and-permissions)). I cannot see this setting from the CLI.

**Founder check before M2:** open claude.ai → Settings → Usage and confirm usage credits are **off**, or capped at $0. With them off, hitting a limit stops the run (it fails closed) instead of billing you.

**Cloud runners (later milestones, not PoC-1):**
- **Claude Code cloud sessions** "always use your subscription credentials". An API key set in the cloud environment does not override them [DOC].
- **GitHub Actions** with `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) authenticates with your subscription [DOC]. But:
  - GitHub bills the runner minutes separately (included minutes first; your plan's allowance is UNVERIFIED);
  - any `ANTHROPIC_API_KEY` secret present in that job would take precedence and bill the API;
  - the same usage-credit overflow rule applies.
- **Agent SDK and Managed Agents** require an API key, which is billed. They are not used.

**PoC-1 itself runs only on this Mac, through your logged-in CLI.**

---

## 2. Scope

**Engineering task (bounded, inside `command-center/` only):** add a **"Copy caption" button** and a **live character counter (n / 280)** to each caption option in the Approvals card, on desktop and iPhone.

| Item | Rule |
|---|---|
| Paths Claude may edit | `command-center/surfaces/console/**`, `command-center/tests/**` |
| Everything else | Forbidden: `app/`, `data/`, `.github/`, root files, other `command-center/` code. The task is refused at G2 if the plan touches them, and discarded at G3 if the diff does |
| Out of scope | Push, PR, merge, deploy, Production, paid APIs, new accounts, Grok automation, hosted dashboard (still the next primary milestone, M3), Discord |
| Grok | Not part of PoC-1. Optional: you may paste one Grok note through the existing `manual:grok` seat |

---

## 3. The flow you will see in the console

| # | Conversation card | Seat (labelled on the card) | Gate |
|---|---|---|---|
| 1 | You type the command (§9) | — | — |
| 2 | Chief of Staff plan: Prompt Architect (ChatGPT) → **G1** → Engineering plan (Claude Code) → **G2** → Engineering build (Claude Code) → Verification → **G3** | orchestrator | — |
| 3 | **Prompt Architect, waiting for you.** A ready prompt holding the task, constraints, the relevant excerpt of `app.js` (the decisions card), and the required JSON shape. You paste it into **your ChatGPT**, then paste the answer back | **`manual:chatgpt` · "ChatGPT (your app, pasted)"** | — |
| 4 | **EngineeringSpec** card: format check result, content hash | — | **G1: Approve spec / Reject** (Approvals tab) |
| 5 | **Claude Code · plan run.** Live progress lines ("reading app.js…", "searching for renderDecisions…"), then an **ImplementationPlan** (files, approach, risks, test plan) with its session id and estimated cost | **`cli:claude-code` · "Claude Code CLI · your Max subscription"** | — |
| 6 | Path check on the plan: allowed or refused | orchestrator | **G2: Approve implementation / Reject** |
| 7 | **Claude Code · build run** in worktree `cc-<task>`, with live progress (edits, test runs) and an **EngineeringResult** (self-report) | same | — |
| 8 | **Verification** by the orchestrator, *not* by Claude: `git diff --stat` and an expandable diff, a path-scope check, `node --test command-center/tests/*.test.mjs` (exit code and output tail), and console screenshots at desktop, 390 px and 430 px | deterministic | — |
| 9 | Chief of Staff report: what ChatGPT specified, what Claude planned and changed, test and screenshot results, risks, time and estimated usage | orchestrator | **G3: Keep changes / Discard** |
| 10 | **Keep:** commit on the local branch `cc/<task>` only (no push, not merged into the command-center branch). **Discard:** remove the worktree and branch. Either way the result is recorded in the ledger | orchestrator | — |

**Pause** at any point stops the Claude process (SIGTERM, then SIGKILL after 10 s) and records `CANCELLED`. Gates can't be skipped: the build run refuses without a G2 approval tied to that exact plan's hash.

---

## 4. How Claude Code is executed (the safety envelope)

**Preflight, fail closed, before every run:**
1. `claude auth status --json` must show `loggedIn`, `authMethod: "claude.ai"`, `apiProvider: "firstParty"` and `subscriptionType ∈ {pro, max}`. Anything else refuses the run with `SUBSCRIPTION_AUTH_NOT_CONFIRMED`.
2. The child environment is built from an allowlist (PATH, HOME, USER, LANG, TMPDIR, SHELL). It explicitly drops `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_PROFILE`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_USE_*` and the federation variables. `ANTHROPIC_BASE_URL` is passed only if it is exactly `https://api.anthropic.com`.
3. The settings files are re-checked for `apiKeyHelper`; if it is present, the run is refused.
4. The CLI version and the preflight result are written to the ledger (not your email).

**Worktree:**
- The orchestrator runs `git worktree add <repo>/.claude/worktrees/cc-<taskId> -b cc/<taskId> <command-center branch HEAD>`.
- It links `app/node_modules` into the new worktree with a symlink (git-ignored), so tests and Playwright work there.
- Claude runs with that worktree as its working directory.
- Your current worktree is checked byte-for-byte before and after: `git status` and its hash.

**Plan run:**

```
claude -p <spec + constraints> --permission-mode plan --output-format stream-json --verbose
  --json-schema <ImplementationPlan> --allowedTools "Read,Grep,Glob"
  --disallowedTools "Bash,Edit,Write,WebFetch,WebSearch" --max-turns 20 --max-budget-usd 1
```

**Build run:**

```
claude -p <approved plan> --permission-mode acceptEdits --output-format stream-json --verbose
  --json-schema <EngineeringResult>
  --allowedTools "Read,Grep,Glob,Edit(command-center/surfaces/console/**),Write(command-center/surfaces/console/**),
                  Edit(command-center/tests/**),Write(command-center/tests/**),Bash(node --test *)"
  --disallowedTools "Bash(git *),Bash(curl *),Bash(npm *),WebFetch,WebSearch"
  --max-turns 40 --max-budget-usd 3
```

**Spawning:**
- The process is spawned with an argument array, never through a shell.
- Timeouts are 10 minutes (plan) and 15 minutes (build).
- `stream-json` events become throttled `progress` ledger records, which are what you see live.
- The final `structured_output` is validated against its schema; invalid output → `FAILED` with the raw tail kept.

**The budget flag is a client-side estimate.** On a subscription, `total_cost_usd` is an API-equivalent figure for usage, not a charge. It is recorded as "estimated usage", never as dollars spent.

**Defence in depth after the build:**
- `git status --porcelain` in the worktree is compared with the allowed paths; any file outside them flags the result `OUT_OF_SCOPE`, and only Discard is offered.
- Claude's own test claims are ignored. Verification reruns everything itself.

---

## 5. Contract and ledger additions

- **New artifact types:**
  - `engineering-spec`: objective, user stories, constraints, files in scope, tests, acceptance criteria, non-goals.
  - `implementation-plan`: files, steps, risks, test plan, estimate.
  - `engineering-result`: summary, files changed, the tests it ran, follow-ups, session id, estimated usage.
  - `verification`: diff stat, scope check, test exit and output tail, screenshot hashes.
- **New ledger kinds:** `progress`, `gate`.
- **New seat:** `cli:claude-code` (provider `anthropic`, labelled "Claude Code CLI · your subscription"). Free under the $0 budget because it is subscription-backed, with the preflight as the hard guard.
- **Gates:** each is a `decision-request` of kind `gate` (G1 / G2 / G3), tied to the exact hash of the spec / plan / verified diff. The existing pause, founder-only and idempotency rules apply unchanged.

---

## 6. Console additions (desktop and iPhone)

- **Provider badges:** ChatGPT (your app) · Claude Code CLI (subscription) · deterministic.
- A **live progress card** for Claude Code runs: rolling step list, elapsed time, a cancel note tied to Pause, and a session id.
- **Gate cards** in Approvals showing the spec, the plan (with files it may touch), and the verified diff (collapsible unified diff), tests and screenshots.
- The Tasks tab shows the gate state and run state. Activity shows every progress and gate record.

---

## 7. Tests (offline; no real Claude in the test suite)

1. A **fake `claude` executable** fixture emits recorded `stream-json` and `auth status` output. It is used to test the adapter, progress parsing, schema validation, timeouts and cancellation.
2. **Preflight refuses** when any of these is present: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `apiKeyHelper`, a non-default base URL, `authMethod ≠ claude.ai`, or not logged in.
3. The child environment **never contains** the dropped variables (asserted by the fake binary).
4. **Gate order:** a build run without a G2 hash-bound approval is refused; G3 isn't offered before verification.
5. **Scope guard:** a fixture diff touching `app/` → `OUT_OF_SCOPE`, Discard only.
6. **Pause** kills the fake process and records `CANCELLED`.
7. **Keep and Discard** both work on a throwaway git repo; the main worktree is unchanged.
8. The existing 31 tests stay green, including the no-network run.

The one real Claude Code run happens in the **founder demo** (§9), not in the test suite.

---

## 8. Acceptance criteria (all must pass for M2 sign-off)

1. **Real ChatGPT spec:** produced by you in ChatGPT, pasted back, passes the format check, labelled as such. G1 is tied to its hash.
2. **Real Claude Code execution:** the plan and build runs show a real `session_id`, preflight evidence (`claude.ai` / `max` / no API-key variables), CLI version, duration and estimated usage. Nothing simulated is labelled as Claude.
3. **The handoff is visible:** the spec feeds the plan prompt and the approved plan feeds the build prompt, by hash. All of it appears as cards in one conversation, with live progress during the runs.
4. **Independent verification:** the orchestrator's own test run (exit code and output tail) and screenshots at desktop, 390 and 430 px are shown. A test failure is reported, never hidden.
5. **Three gates enforced:** G1 spec → G2 implementation → G3 retention, each tied to its hash and founder-only. Skipping a gate is refused.
6. **Isolation:** every change is inside `command-center/surfaces/console/**` or `command-center/tests/**`, in worktree `cc-<task>`. The main worktree is byte-identical before and after; nothing is pushed, opened as a PR, merged or deployed.
7. **$0 extra:** no API key used (preflight evidence), no paid API calls, no new accounts. Usage credits are confirmed off by you beforehand.
8. **Pause works:** it cancels a live Claude run within 10 s and records `CANCELLED`.
9. **Tests:** the new offline tests plus the existing 31 all pass, also under the no-network guard.

---

## 9. Founder demo script for PoC-1 (after implementation)

> Team, add a "Copy caption" button and a live character counter to each caption option in the Approvals card. Have ChatGPT write the engineering spec, have Claude Code plan and implement it in an isolated worktree, verify it independently, and show me the result before anything is kept.

1. Paste the shown prompt into ChatGPT, then paste its answer back → **Approve spec (G1)**.
2. Watch Claude's plan run → review the files it will touch → **Approve implementation (G2)**.
3. Watch the build run, then the orchestrator's verification (diff, tests, three screenshots).
4. Read the Chief of Staff report → **Keep** or **Discard (G3)**.
5. Optionally press **Pause** during a run to see the cancellation.

---

## 10. Cost, usage and effort

- **Cash:** $0 (requires usage credits off).
- **Usage:** each PoC run draws on your Max allowance. Recorded estimates are expected around $0.5–4 API-equivalent per full plan-plus-build cycle (UNVERIFIED until the first run). Hard caps: $1 estimated for the plan run, $3 for the build run.
- **Engineering effort:** about 3–4 days.
- **New files** (all in `command-center/`):
  - `providers/claude-code-cli.mjs`
  - `providers/claude-preflight.mjs`
  - `orchestrator/gates.mjs`
  - `engineering/worktree.mjs`
  - `engineering/verify.mjs`
  - `contracts/engineering.mjs`
  - fixtures for the fake `claude`
  - tests
- **Updated files:** `orchestrator/orchestrator.mjs`, `orchestrator/intents.mjs`, `surfaces/console/*`, `README.md`.
- **No new dependencies.**

## 11. Risks

| Risk | Mitigation |
|---|---|
| Usage credits enabled → overflow billed at API rates | Founder check before M2. A run that hits the limit fails, and the failure is shown |
| CLI v2.1.142 is older than the docs read (for example, `-p` default permission mode) | Every mode and tool rule is passed explicitly; the version is recorded; upgrading is optional and needs your OK |
| Claude edits outside scope | Tool path rules, plus the post-run scope check, plus Discard-only |
| Long or stuck runs | Turn and estimated-budget caps, timeouts, Pause |
| Tests need `app/node_modules` in the new worktree | Git-ignored symlink; no install |
| The future hosted dashboard | Unchanged: **M3 remains the primary iPhone experience**, Discord the companion |

## 12. Founder checkpoints

| # | Your action | When |
|---|---|---|
| CP-M2a | Confirm claude.ai usage credits are **off** or capped at $0 | Before authorizing |
| CP-M2b | **Authorize M2** as written here | Explicit message |
| G1 / G2 / G3 | Approve spec, implementation and retention | During the demo |
| CP-M2c | Accept PoC-1, then choose M3 (hosted iPhone dashboard) as the next milestone | After the demo |
