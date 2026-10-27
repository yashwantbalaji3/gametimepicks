# Architecture (Phase 1, and how it grows)

```
CEO ──► Surface (console │ Discord, Phase 2 │ MCP, Phase 3)
            │  handleCommand · decide · submitManual · setSeat · state
            ▼
      Orchestrator ── policy: hop ≤ 3 · ≤ 8 tasks/command · allowed delegations · founder-only · budget
            │                 (roles never call each other; proposals go through policy)
            ├── Seats: fake │ manual:{chatgpt,claude,grok} │ api:{openai,anthropic,xai} (CP5) │ mcp:* (Phase 3)
            ├── Deterministic tools: inspectSlate → integrity gate → fact bundle → render → captions → validator
            └── Publisher boundary: pause → approval → exact digest → budget → idempotency claim → provider
            ▼
      LedgerStore (append-only records + create-only claims)
        Phase 1: local files (temp + link) · Phase 2: same layout in the private ops repo · later: Postgres
```

## Why it is shaped this way

- **One dispatcher, one ledger.** Duplicated work, endless agent chatter and contradictory orders all come from
  agents talking to each other. Here roles return typed artifacts and *propose* next steps, and the orchestrator
  alone dispatches. A refused proposal (for example `LOOP_GUARD` on Creative Renderer → Engineering) is written to
  the ledger and shown to the CEO.
- **Deterministic facts, model-written words.** No seat can change a number. The integrity gate, the fact bundle
  and the caption validator are plain code, and any caption from any seat must pass the validator.
- **Provider-neutral by contract.**
  - The Prompt Architect's brief has the same shape whether it comes from `fake`, a ChatGPT answer pasted back,
    or (at CP5) the OpenAI API.
  - ChatGPT and OpenAI are included from day one as `manual:chatgpt`, `api:openai` and `mcp:chatgpt`.
  - Only `manual:chatgpt` runs in Phase 1; the other two are stubs with no network code.
- **Event-sourced.** The console renders `state()`, which is rebuilt from the ledger. That makes the action history
  complete by construction: every command, plan, task transition, contribution, refusal, deliverable, decision,
  receipt, seat change and pause is one immutable record.

## Integrity gate (Track B)

A game becomes content only if all of the following hold:

- Every row it uses is `PUBLISHED`, not withdrawn, and carries the forecast of record that
  `app/src/lib/results/forecast-of-record.mjs` already selected into the ledger.
- The receipt the row names exists, is for this event, shows the same probability as the ledger, and was frozen
  before kickoff.
- Every row is settled `CANONICAL` with no corrections.
- No source is under `data/internal/research/` or tagged `PRIVATE_RESEARCH`.
- Every printed family is cleared for template `nfl-recap@0` (game-level families only; player families such as the
  uncleared `player_pass_yds` are refused).

Warnings travel with the decision instead of being dropped:

- `SERVED_REVISION_NOT_CHECKED`: the Option B deployment evidence in
  `app/src/lib/publication-evidence/served-revision.mjs` is not consulted offline.
- `MODEL_EXPERIMENTAL`: the forecast was published under a `PUBLIC_EXPERIMENTAL` model status.

## What changes in later phases (each behind its checkpoint)

| Phase | Change | Checkpoint |
|---|---|---|
| 2 | `LedgerStore` commits to the private ops repo. Workflows on fixed daily slots, `concurrency: {group: ops-ledger, queue: max}`. Discord webhook previews, then a Discord bot (signed interactions). TOTP approvals | CP4 |
| 3 | `api:*` seats with per-call cost lines and hard caps. A read-only MCP facade tested on ChatGPT, Claude.ai and Grok | CP5 |
| 4 | One real publisher adapter, chosen from evidence ([x-publishing-evaluation.md](x-publishing-evaluation.md)) | CP2 + CP6 |
| 5–6 | NBA recap, live score-change candidates, Theater video | CP3 + CP7 |
| 2b | **Remote iPhone access with the Mac off** (see below) | CP8 |

## Mobile (Phase 1 acceptance) and remote iPhone access (later)

**Now (Phase 1, local only).** Below 760 px the console switches to a phone layout:

- one section at a time: Chat · Approvals · Tasks · Activity · Team, behind a bottom tab bar;
- badges on the Approvals tab (open decisions) and the Tasks tab (work in flight);
- **Pause / Resume always in the top bar**;
- Approve and Reject pinned above the tab bar;
- touch targets ≥ 44 px, 16 px inputs (so iOS does not zoom), and safe-area insets.

`tests/console-mobile.test.mjs` drives the whole flow at 390 × 844 and 430 × 932 and fails on any horizontal page
overflow. It is still loopback-only, so it works on an iPhone only if you open it on the Mac itself; nothing is
exposed to the network.

**Later: manage the team from an iPhone with the Mac off (CP8, after CP4).** "Mac off" means the orchestrator, the
ledger and the surface must all run somewhere else, so this builds on Phase 2's hosted control plane:

| Option | How | Mac off? | Notes |
|---|---|---|---|
| **A. Discord on iPhone** (arrives with Phase 2) | The Discord bot's slash commands and buttons; interactions Ed25519-signed by Discord and carrying your user ID | Yes | $0; the Discord iOS app is the client; approvals are unforgeable by local agents |
| **B. Hosted private web console** (this same mobile UI) | A separate small Vercel project (never the public site; not `gtp-ops`, whose SSO blocks webhooks). Founder-only login with a **passkey (WebAuthn)**, plus a fresh passkey or TOTP step-up for approve, publish, pause/resume, spend and seat changes. Reads and writes the ledger in the private ops repo (later Postgres) through server-side functions | Yes | Function usage within Vercel Pro; no secrets in the browser; short sessions; every action in the ledger |
| C. Tunnel to the Mac (Tailscale / Cloudflare Tunnel) | Reach 127.0.0.1:4190 remotely | **No** | Rejected: it fails "Mac off", and it would expose a demo-grade surface |

Recommendation: **A first** (it comes free with Phase 2), then **B** if you want the full console on the phone. In
both, the kill switch must keep working when every model provider is down: pausing is a ledger write, not a model
call.

## Known Phase 1 limits

- Commands in flight live in memory: restarting the console loses a task that is waiting for a pasted answer. The
  ledger history is kept.
- The graphic uses locally installed fonts (no network), so PNG bytes are identical per machine, not across
  machines. Vendoring the OFL fonts is deferred to Phase 2.
- Recap selection rule: the latest kickoff on the latest settled Eastern date. Social Strategy's ranking is a
  documented rule, not a model's judgement.
