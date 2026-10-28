# Provider integration: Claude Code, ChatGPT and Grok

**Status 2026-10-27:** built and tested locally (88/88, also offline). Nothing is connected to a new account, no
credential exists, nothing is billed. Prices below were read on the providers' pages today; your account pages are
the authority.

## What exists now

| Piece | Where |
|---|---|
| Provider catalog and onboarding status: per provider, each integration path with status, mode, billing, limits, your next action, last connection test, errors | `providers/catalog.mjs`, console **Team → Providers** |
| Execution label on every contribution, derived from the seat: REAL CONNECTED AGENT · MANUAL PROVIDER HANDOFF · SIMULATED AGENT OUTPUT · DETERMINISTIC AUTOMATION · UNAVAILABLE / NOT CONFIGURED | `executionOf()`; every chat card |
| OpenAI API adapter (Responses API, structured output) and xAI API adapter (Responses API + X Search), both behind: key present, monthly cap above $0, passed connection test; worst-case cost checked against the cap before every call; one retry on 429/5xx only; timeouts; keys never logged or stored | `providers/openai-api.mjs`, `providers/xai-api.mjs`, `providers/api-common.mjs` |
| Free connection tests (OpenAI `GET /v1/models`, xAI `GET /v1/api-key`), recorded in the ledger without the key | `testProvider()`; "Test connection" button |
| Two roles: **Social Intelligence (Grok)** and **Content Strategist (ChatGPT)** | `roles/roles.mjs` |
| Team workflows with one authoritative state (each step a ledger task; stateless resume on the web, the worker or the Mac) | `orchestrator/team-flow.mjs` |
| Contracts and deterministic checks between agents: X research (each finding must cite a specific `x.com/<handle>/status/<id>` post), evidence check, content proposals, content check (280 characters, no links, no betting language, every number traced to GameTimePicks facts or the cited finding, replies only to cited posts), weekly plan, Claude feasibility review | `contracts/team.mjs` |
| Decisions per proposal: approve (bound to the digest; records a draft, **publishes nothing**), reject, revise (with a note), defer | `decideProposal()`; Approvals |

**The two workflows**

- *"Team, analyze today's biggest NFL conversations on X and identify three opportunities…"*
  1. Verified GameTimePicks facts.
  2. Grok researches X.
  3. Evidence check.
  4. ChatGPT drafts three proposals.
  5. Content check.
  6. One decision per passing draft.
- *"Team, review GameTimePicks' current NFL social-content opportunities and propose an improved weekly X content plan."*
  1. Verified GameTimePicks facts.
  2. Grok researches X.
  3. Evidence check.
  4. ChatGPT writes the weekly plan.
  5. **Claude Code reviews how to automate it**: real CLI, read-only tools, $1 estimate cap, a throwaway working copy.
  6. One consolidated decision.

A provider that isn't available never falls back to simulated output. The step waits, or it is refused, and the report names the blocker.

## How each provider can take part (supported methods only)

| Provider | Path | Execution | Billing | Status today |
|---|---|---|---|---|
| Claude Code | CLI on the Mac, Max subscription | REAL | Max allowance; usage credits must stay OFF | Works (M2). Needs your billing confirmation in the console |
| | Hosted worker, `CLAUDE_CODE_OAUTH_TOKEN` | REAL | Max allowance | CP-H2 |
| | Anthropic API | — | Metered | **Deliberately not used** |
| ChatGPT | Your ChatGPT app, copy/paste | MANUAL | Your plan | Available now |
| | OpenAI API | REAL | API platform, **separate from ChatGPT Plus** (prepaid credits) | CP-O1 |
| | ChatGPT app → our connector (MCP) | REAL, started by you in the app | Your plan | Needs H1 + a connector endpoint; write tools on individual plans UNVERIFIED |
| Grok | Grok in the X app or on grok.com, copy/paste | MANUAL | Free tier with an X account (limits unpublished) | Available now |
| | xAI API with X Search | REAL | Prepaid credits | CP-X1 |
| | Grok app → our connector (MCP) | REAL, started by you in the app | No API billing ("available to all Grok users") | Needs H1 + a connector endpoint (must be reachable on the public internet) |

**Research is not publishing.** Grok researching X gives no right to post. Publishing stays at CP2: provider, cost, terms and an end-to-end test first. Today approval records a draft.

**Verification of X content.** The Command Center checks that every finding cites a specific post. It does not fetch the posts, because it has no X API access, and every report says so. You open the links before approving. Fetching cited posts independently needs X API read access, which is metered: a CP2 decision.

## Minimum founder actions

**For the first genuine three-provider run (3P-0): no accounts, no spend, Mac on**

1. Sign in to Grok (grok.com or the X app) with your existing X account. Check its free limits there.
2. In the console (`npm run console --prefix command-center`), go to Team → Controls → Claude Code. Confirm claude.ai usage credits are OFF, then run the preflight.
3. Send: *"Team, review GameTimePicks' current NFL social-content opportunities and propose an improved weekly X content plan."*
4. Paste the Grok prompt into Grok and paste its JSON back.
5. Do the same with ChatGPT.
6. Claude Code runs its read-only review on your subscription. You then decide on one consolidated plan.

**For automated providers (no copy/paste): each is a separate approval**

| Checkpoint | You do | Then set | Hard controls |
|---|---|---|---|
| **CP-X1 Grok API** | Create an xAI API account (console.x.ai). Buy a small prepaid credit, e.g. $5–10. Leave **auto top-up OFF** and the invoiced limit at $0 | `XAI_API_KEY`, `GTP_CC_XAI_MONTHLY_CAP_USD` | xAI rejects requests once prepaid credit is used up. Our cap refuses any call whose worst case would exceed it |
| **CP-O1 OpenAI API** | Create an API platform account (separate from ChatGPT Plus). Buy a small prepaid credit, with no auto-recharge. Pick a model and copy its prices | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_PRICE_IN_PER_M`, `OPENAI_PRICE_OUT_PER_M`, `GTP_CC_OPENAI_MONTHLY_CAP_USD` | Same two layers. Without prices the seat refuses, because it couldn't enforce the cap |
| Hosted (CP-H1/H2) | As in [h0-hosting-readiness.md](h0-hosting-readiness.md) | — | — |

Keys go in the hosted worker's secrets or your local environment, never in the browser or the ledger. They are entered only after you approve that checkpoint.

## Cost estimates (estimates, not guarantees)

**Grok via the xAI API.** grok-4.3 costs $1.25 / $2.50 per million tokens. X Search costs $5 per 1,000 posts fetched.

- **One research run:** about 6k input and 1.5k output tokens (≈ $0.01), plus 30–100 posts fetched (≈ $0.15–0.50). That is about **$0.16–0.51 per run**.
- **Light use** (3 runs a week): about **$2–7 a month**.
- **Moderate use** (2 runs a day): about **$10–31 a month**.
- The pre-call worst case budgets 100 posts.
- When the limit is reached, the call is refused before it is made, or xAI rejects it at zero credit. The step shows the reason and nothing is retried.

**ChatGPT via the OpenAI API.** About 8k input and 2k output tokens per Content Strategist call. With an illustrative $1 / $4 per million tokens (check your model's real prices), that is about $0.016 per call, under $1 a month at light use. The cost is set by the model you choose.

**Manual Grok and ChatGPT: $0 extra.** Claude Code: $0 cash on your Max allowance, with usage credits OFF.

## Not yet verified (tested at the named checkpoint)

- The exact xAI Responses + X Search request shape and how the response reports post counts (CP-X1). Costs are billed from citations and marked as estimates until then.
- Whether ChatGPT Plus and free Grok accounts can call **write** tools on a custom connector (H1.5).
- Free Grok usage limits (unpublished).

Sources (2026-10-27):
- [docs.x.ai models](https://docs.x.ai/docs/models)
- [docs.x.ai pricing](https://docs.x.ai/docs/pricing)
- [docs.x.ai billing](https://docs.x.ai/docs/key-information/billing)
- [docs.x.ai Grok connectors](https://docs.x.ai/grok/connectors)
- [OpenAI help: API usage and spend limits](https://help.openai.com/en/articles/9039756-troubleshooting-api-usage-and-spend-limits)
