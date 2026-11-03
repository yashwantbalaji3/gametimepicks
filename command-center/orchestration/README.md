# Orchestration core (provider-neutral, multi-agent)

Status: **MOCK-only on this branch.** No provider has been called. The live path exists and is gated behind
configuration that isn't present (see "Going live").

```
node command-center/orchestration/demo.mjs                                  # pipeline (a), MOCK, temp store
node command-center/orchestration/demo.mjs --pipeline research-verify-visual  # pipeline (b), MOCK
node command-center/orchestration/demo.mjs --rounds 1                       # review loop limit 1 → ESCALATED
node command-center/orchestration/demo.mjs --live --objective "…"           # refuses unless all 3 providers + caps
node --test command-center/orchestration/tests/*.test.mjs                   # 52 tests, network blocked
```

| File | What it is |
|---|---|
| `task-ledger.mjs` | Task events on the existing LedgerStore; states, validated transitions, replay, optimistic concurrency, idempotency, approval levels A/B/C |
| `pipelines.mjs` | Pipelines as data (a) and (b), `withOrder`, the runner (handoffs, notify, bounded review loop, escalation, blocker classes), `approve()` |
| `budgets.mjs` | Per-provider and per-agent daily/monthly caps, task hard stop, retry budget, circuit breaker. Every cap defaults to $0 |
| `adapters.mjs` | `liveAvailable()` (checks variable names only), MOCK adapters, live adapters that reuse `providers/openai-api.mjs`, `providers/xai-api.mjs`, `providers/anthropic-api.mjs` (hosted Claude) and `providers/claude-code-cli.mjs` (local Claude only) |
| `views.mjs` | Text views: task tree, handoffs, attributed outputs, audit. Every output line is tagged `[MOCK]`/`[LIVE]` from the ledger |
| `demo.mjs` | The CLI |
| `handoff-loop.mjs` | Command Center V3: completion reports, claim verification, the evaluator/planner, brief checks, routing (API / queue / manual), loop bounds, V3 statuses, founder decisions, small views |
| `project-facts.mjs` | The standing GameTimePicks rules a brief carries (tag-selected, ≤ 4 KB) |
| `handoff-demo.mjs` | MOCK acceptance run of the 12-step handoff, with scripted stand-in agents |

## Design

**Storage.** Each event takes the create-only claim `cc-orch/v1/<ledgerId>/seq/<n>` on the existing store
(`store.claim`). The claim has exactly one winner, so it doubles as the optimistic-concurrency check: a writer
passing `expectedSeq` that no longer matches the head, or losing the race for slot n+1, gets `CONCURRENCY_CONFLICT`
and writes nothing. Idempotency keys use a second claim (`…/idem/<key>` → seq). If a key is reused with the same
content, the first event comes back. If it's reused with different content, the write is refused. Events are
hash-chained (`prev`, `digest`). This works on the file store and on the Postgres session store, which have the
same synchronous claim API.

**State is derived by replay.** `replay(events)` runs the same validation as `append`, so the same events always
produce the same state, byte for byte. If someone edits, reorders or hand-writes an event that breaks a rule, replay
throws instead of quietly producing a different state.

**Task fields:** taskId, parentProject, parentTaskId, runId, stepKey, round, objective, assignedAgent
{provider, seat, role}, sourceDocuments, tools, permissions, requiredInputs, expectedOutputs, deadline, costBudget
{usd, hardStop}, state, approvalLevel, approvalRequirement, inputs (artifact digests), outputs, evidence (sha256),
costUsd, attempts, blocker, escalation, approvals, outcome, history.

**States:** PLANNED, IN_PROGRESS, NEEDS_REVIEW, BLOCKED, READY_FOR_APPROVAL, APPROVED, DONE, FAILED, CANCELLED.
A task can reach APPROVED only through an `approval.granted` event, never through a plain transition. A Level B or
C task can't reach DONE without first being APPROVED. A move to BLOCKED must carry a blocker class: AGENT (the
agent's output was unusable), TOOL (the provider or tool failed, the retry budget ran out, or the breaker is open)
or FOUNDER (budget, credentials, or an escalation).

**Approval levels:**
- **A:** routine. The orchestrator may approve it.
- **B:** needs an authenticated human approver, or an `approve` verdict from a review run by a *different provider*.
  That review must be of the task itself or a later revision of it.
- **C:** founder only. The approver must have `role: founder` and `authenticated: true`, must not come from an
  automatic surface, and must name the exact artifact digest. The lineage must contain no MOCK output. An
  `autoApprove` flag is refused, and a reviewer verdict can't stand in for the founder. The `authenticated` flag
  has to be set by the hosted route from the passkey session. This module can't verify identity itself.

**Handoffs.** A `handoff {fromTaskId, child, artifactDigest, context, instructions}` event creates the child task,
whose inputs are the referenced digests. A `notify` event then tells the next agent. In the bounded review loop,
`changes` sends the findings to the fixer step, which is followed by a re-review. After `maxRounds` rounds, the
work is `review.escalated` with the named decider and moves to BLOCKED/FOUNDER.

**MOCK can't be laundered:**
- Only `createLiveAdapters()` brands an adapter as live (a private WeakSet).
- `task.output` can be written only through `recordOutput()`, which sets the mode itself.
- An output is LIVE only when its adapter is live *and* every input is LIVE.
- A `mock-*` model can never be recorded as LIVE.
- No event type changes a mode.
- Views read the mode from the ledger and print a MOCK banner.
- The runner never calls a live agent on MOCK inputs.

**Pipelines.** Both are defined as data in `PIPELINES`. `withOrder(def, keys)` reorders them and `validatePipeline`
enforces the rules: brief first, every review after its subject and by a different provider, every Level B work step
reviewed, and a Level C founder approval step. The runner stops at the approval step (AWAITING_FOUNDER_APPROVAL).
Re-running with the same run key resumes the run. It writes nothing twice and calls no agent twice.

## What is MOCK

- Every output in `demo.mjs` without `--live`: the CEO brief (a canned demo objective), Claude implementation and
  remediation, ChatGPT review, Grok research, Claude verification, visual QA, and the release gate's result. The
  gate's checks are real code, but they run on MOCK inputs, so its output is MOCK and reports `releasable: false`.
- Live visual QA isn't wired. The live `deterministic` adapter returns `NOT_WIRED` for it, so pipeline (b) can't run
  fully live yet.
- The live Claude adapter runs Claude Code **read-only** (Read/Grep/Glob) and returns a structured proposal. Real
  implementation in a working copy stays in `orchestrator/engineering-flow.mjs`. Wiring that in is a follow-up.
- Tests marked "all-LIVE lineage" use the real live code path over a **stubbed fetch**. No provider is reached, and
  the no-network guard is loaded.

## Going live (founder setup)

`--live` refuses until **all** of the following are present. `liveAvailable()` checks only the credential variable
names. The cap values are read as numbers because they aren't secrets.

| Provider | Credentials and config (names) | Caps (USD, must be > 0) |
|---|---|---|
| Claude, hosted (Anthropic Messages API) | `ANTHROPIC_API_KEY` (a Console API key with prepaid credits, not a Claude subscription), optional `GTP_CC_ANTHROPIC_MODEL` (default `claude-opus-5-5`, $4 / $20 per M), `GTP_CC_ANTHROPIC_EFFORT` (default `high`), `GTP_CC_ANTHROPIC_PRICE_IN_PER_M` / `_OUT_PER_M` for a model without a known price | `GTP_CC_ANTHROPIC_DAILY_CAP_USD`, `GTP_CC_ANTHROPIC_MONTHLY_CAP_USD`. Requests opt into `fallbacks: "default"`, so the worst case is priced at the $5 / $25 fallback ceiling |
| Claude, local only (subscription via Claude Code) | used only when `ANTHROPIC_API_KEY` is absent: `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`), `claude` on PATH or `GTP_CC_CLAUDE_BIN`, optional `GTP_CC_CLAUDE_MODEL` | same caps, checked against Claude Code's API-equivalent *estimate*. Not usable Mac-off, and never treated as an API credential |
| OpenAI (Responses API) | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_PRICE_IN_PER_M`, `OPENAI_PRICE_OUT_PER_M` | `GTP_CC_OPENAI_DAILY_CAP_USD`, `GTP_CC_OPENAI_MONTHLY_CAP_USD` (the monthly name is the existing Providers-panel cap) |
| xAI (Responses API + `x_search`) | `XAI_API_KEY`, optional `XAI_MODEL` (default grok-4.3, with known prices) | `GTP_CC_XAI_DAILY_CAP_USD`, `GTP_CC_XAI_MONTHLY_CAP_USD` (existing monthly name) |
| Every agent | — | `GTP_CC_AGENT_DAILY_CAP_USD`, `GTP_CC_AGENT_MONTHLY_CAP_USD` |
| Optional | `GTP_CC_ORCH_MAX_ATTEMPTS` (default 2, range 1–5), `GTP_CC_ORCH_BREAKER_FAILURES` (default 3; cooldown 15 min) | |

Where to set them:
- **Mac, one-off live demo:** export them in the shell that runs `demo.mjs --live --objective "…"`. Don't commit them.
- **Hosted worker:** put the keys in GitHub `gtp-ops` Actions **secrets** and the caps in Actions **variables**.
  The workflow also has to pass them through (see below).
- **Never on Vercel.** The web app refuses to boot with model keys (`deploy/vercel/api/index.mjs`,
  `deploy/preflight.mjs`).
- Keep xAI on prepaid credit with auto top-up OFF, and OpenAI on prepaid credit, so the provider side has a hard
  ceiling as well.

### Estimated cost per run

- MOCK demo: **$0.** No network.
- Live pipeline (a): two or three Claude Code runs, each capped at $1 (an API-equivalent estimate on the
  subscription, not a charge), plus one or two OpenAI review calls. The OpenAI worst case per call is
  `prompt_tokens × OPENAI_PRICE_IN_PER_M/1e6 + 4000 × OPENAI_PRICE_OUT_PER_M/1e6`. For example, a ~5k-token prompt at
  an illustrative $1.25 in / $10 out per million comes to about $0.05 per review. The real figure depends on the
  model and prices the founder configures, and OpenAI pricing wasn't re-verified for this note.
- Live pipeline (b): Grok research worst case is about $0.51 per call: 100 X posts × $0.005 plus tokens at grok-4.3
  $1.25/$2.50 per million (docs.x.ai, 2026-10-27).

## Exact changes needed outside `orchestration/` (owned by another session, not made here)

1. **`contracts/index.mjs`**, `LEDGER_KINDS`: add `"task-event", // orchestration: a mirror of one task-ledger event`.
   Once that's there, every event is also appended as a `task-event` ledger entry, which ledger sync and the console
   pick up. No code change is needed here.
2. **`worker/run-job.mjs:44`**, `env: { GTP_CC_BUDGET_USD: "0" }`: the worker forces the budget to $0 and passes
   no other variables to the job. For orchestration jobs, pass the caps and the provider variables:
   `env: { GTP_CC_BUDGET_USD: "0", ...pick(env, [the names in the table above]) }`. Keep `GTP_CC_BUDGET_USD` at 0
   for the existing flows.
3. **`deploy/github/cc-worker.yml`**, step "Run the job" `env:`: add `OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}`,
   `XAI_API_KEY: ${{ secrets.XAI_API_KEY }}`, `OPENAI_MODEL`, `OPENAI_PRICE_IN_PER_M`, `OPENAI_PRICE_OUT_PER_M`, and
   every `GTP_CC_*_CAP_USD` from `${{ vars.… }}`. Today only `CLAUDE_CODE_OAUTH_TOKEN` reaches the worker.
4. **`deploy/env.example`**, GitHub section: list the names above, with OpenAI and xAI keys as secrets and caps as
   variables. Keep the "Must NOT exist on Vercel" line.
5. **`orchestrator/team-flow.mjs`**: `TEAM_WORKFLOWS` fixes step order in code. To make it configurable, express each
   workflow as a `PIPELINES` entry and have `advance()` read the step list from the pipeline definition. Until then
   the two systems run side by side.
6. **Hosted console**: build the approver actor `{ role: "founder", id, surface: "console", authenticated: true }`
   only from a verified passkey session (step-up), then call `approve(ledger, taskId, actor, { artifactDigest })`.

## Command Center V3 — the handoff loop

`node command-center/orchestration/handoff-demo.mjs` runs the whole loop in MOCK:

1. The founder's request is planned by ChatGPT.
2. Claude, as a queue worker, claims the assignment and submits a completion report.
3. Our claim verifier checks the commits, tests, stage and sources.
4. ChatGPT evaluates the report, finds a defect, and writes a fix brief for Claude and a research brief for Grok.
5. Both are routed and run.
6. Both are verified and accepted.
7. A founder decision waits in CEO Home.

- **A report is a claim.** A task is COMPLETED only after verification and an accept from a different provider. A fix SUPERSEDES the original.
- **Briefs are checked before routing** (`checkBrief`). Generic, incomplete or test-less engineering briefs are refused. One retry is allowed, then the request escalates.
- **Bounds that escalate rather than loop:**
  - the same finding repeated (`maxFindingRepeats` 2);
  - tree depth (4);
  - tasks per request (16);
  - a cost ceiling per request ($5) on top of the provider and agent caps;
  - task deadlines (6 h);
  - worker leases (30 min, then requeued).
  Duplicate briefs are skipped and recorded.
- **Workers:**
  - `api` runs here through the adapters: structured output only, no repository writes.
  - `queue` is claimed by a worker process through `claimNext` and `submit`.
  - `manual` covers seats with no supported interface. An interactive Claude Desktop / Code session (the Program Director) can't be posted into by a server, so it is BLOCKED `NO_WORKER` with that limitation named.
- **The hosted engineering worker** is headless Claude Code (`claude -p`, or the Agent SDK) on the GitHub Actions runner. It uses `ANTHROPIC_API_KEY`, `--permission-mode dontAsk`, an exact `--allowedTools` list and `--max-budget-usd`. It claims queued tasks and submits reports. The subscription token is for the founder's own use, not this service.
- **V3 statuses** are derived from the ledger by `v3Status` and never stored: QUEUED, ASSIGNED, RUNNING, SUBMITTED, VERIFYING, COMPLETED, BLOCKED, FAILED, NEEDS_FOUNDER_APPROVAL, CANCELLED, SUPERSEDED.
- **Founder decisions:** approve (Level C, exact digest; refused on any MOCK lineage), reject (closes the request), or redirect (new instructions, planned again).
