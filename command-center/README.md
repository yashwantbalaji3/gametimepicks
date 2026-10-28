# GameTimePicks CEO Command Center (Phase 1)

A local proof of concept for one CEO conversation in which specialised agent roles plan, contribute, deliver and
ask the founder for decisions. It is a **dry run**: there are no accounts and no paid inference, the publisher is a
mock, and the code makes no network calls. Approved under the M0 refinement plan (checkpoint CP0). Phase 2 starts
only at CP1/CP4.

## Run it

```bash
npm ci --prefix app
```

```bash
node command-center/surfaces/console/server.mjs
```

Open http://127.0.0.1:4190 and click the first suggestion ("Team, prepare GameTimePicks' NFL postgame recap…").

Other entry points:

```bash
node --test command-center/tests/*.test.mjs
```

```bash
node command-center/recap/run-recap.mjs --date 2026-10-25
```

`npm ci --prefix app` installs the app's existing devDependency Playwright, which the renderer uses. It changes no
tracked files. Everything generated goes to `command-center/out/`, which is git-ignored.

## What the two tracks show

**Track A — the CEO conversation.** Your message becomes a visible plan from the Chief of Staff. Each role then
contributes in turn:

1. Prompt Architect writes the brief.
2. Engineering checks feasibility.
3. Integrity Reviewer runs the gate.
4. Creative Renderer makes the graphic and captions.
5. Social Strategy ranks content angles.

The Chief of Staff then writes one consolidated report and raises **one decision bound to exact content digests**.
The console also shows:

- the action history and the task board;
- a budget meter (fixed at $0);
- team seats, including `manual:chatgpt`, where you paste a role's prompt into your own ChatGPT and paste the answer back;
- a **Pause** switch, enforced at the send boundary;
- **iPhone layouts (390 and 430 px):** a bottom tab bar (Chat · Approvals · Tasks · Activity · Team), Pause always
  in the top bar, and Approve/Reject pinned above the tabs. Tested in mobile Chromium; still loopback-only (remote
  iPhone access with the Mac off is a later phase, CP8; see [docs/architecture.md](docs/architecture.md)).

**Track B — a verified NFL postgame recap.** For one completed game it builds a 1080×1350 PNG, two captions and a
mock publish receipt. Every number comes from the append-only Forecast Ledger
(`data/internal/forecast-ledger/v1/nfl.jsonl`) and the receipt each ledger row names. Nothing is scraped from a
page.

## M2 — delegated engineering (Connected PoC-1)

One real task goes from a **ChatGPT spec** (you paste it via the `manual:chatgpt` seat) through three founder gates:

1. **G1** approves the spec.
2. A **Claude Code read-only plan run** follows, on your subscription through the local CLI.
3. **G2** approves the implementation.
4. A **Claude Code build run** happens in an isolated sparse working copy (`.claude/worktrees/cc-*`, branch `cc/*`).
5. The **Verifier** runs the diff, scope, tests and desktop/iPhone screenshots itself; Claude's report is not used as proof.
6. **G3** keeps the change (local commit on `cc/*`, never pushed) or discards it.

**Safety rails:**
- The Claude Code panel (in Controls) shows the billing confirmation, preflight, active runs, usage and limits.
- Pause cancels a run gracefully; **Stop now** kills it immediately.
- Edits are restricted to `command-center/surfaces/console/` and `command-center/tests/`.

Details: [docs/connected-poc-1-plan.md](docs/connected-poc-1-plan.md).

## Layout

| Path | What |
|---|---|
| `contracts/` | The only shapes that cross a role boundary (TaskEnvelope, Contribution, FactBundle, CaptionSet, PublishBundle, reason codes) |
| `ledger/` | `LedgerStore` interface + file store: append-only records, create-only idempotency claims (temp file + atomic link) |
| `orchestrator/` | The single dispatcher: intents → plan → tasks → policy (hop ≤ 3, ≤ 8 tasks, allowed delegations, founder-only actions, $0 budget) |
| `roles/` | Nine role cards drawn from the existing `agents/` roster, plus their machine-readable form |
| `providers/` | Seats: `fake` (labelled simulated), `manual:*` (your subscription, copy/paste), and `api:*` / `mcp:*` stubs that refuse until CP5 / Phase 3 |
| `recap/` | Track B: candidate selection, **integrity gate**, fact bundle, template captions, caption validator |
| `render/` | Versioned HTML template `nfl-recap@0` → Playwright PNG, offline (every page request aborted) |
| `publishers/` | Send-boundary checks + the mock publisher. No real provider is selected (CP2) |
| `surfaces/console/` | Loopback-only local web console |
| `docs/` | Architecture, approval security, and the open X-publishing evaluation |
| `engineering/` | M2: isolated working copy (snapshot → sparse worktree → keep/discard), verifier (tests, screenshots), prompts |
| `tests/` | 44 tests: core rules, no-network run, iPhone 390/430 flow, and M2 delegated engineering against a fake `claude` |

## Boundaries

- **Read-only on the product.** Only `command-center/` changes. No edits to `app/`, `data/`, workflows, routes or
  shared components.
- **Not a Vercel build input.** `app/scripts/vercel-ignore-build.sh` does not list `command-center/`, so this
  directory adds no Production builds.
- **Demo-grade approvals.** Loopback console approvals can only reach the mock publisher. See
  [docs/approval-security.md](docs/approval-security.md).
- **No live claims.** Postgame facts only, already public. Live posts, NBA, Theater video and the dashboard wait
  for checkpoint CP3.
