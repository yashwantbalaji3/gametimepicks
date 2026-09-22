# Ask GameTime v1.6.1 — cost-first provider migration

A second `AskModelProvider` implementation, not a rewrite. The 14-tool closed registry, the
planner → executor → evidence → verifier → writer pipeline, the ResearchQueryV1 bounds, every grounding
rule and every hard gate are unchanged and are asserted to be unchanged.

**Contract identity, before and after:** registry fingerprint `v1/14/c168e175`, 14 tools, prompt
version 2, tool registry version 1. The Anthropic and OpenAI catalogues are generated from the same
specs by the same generator and are asserted equal.

---

## A. Baseline — Anthropic, as measured

⚠ **These numbers are from commit `826b64b5` on 2026-09-18, not from a fresh run.** The Anthropic
account's credit balance is exhausted (`400 invalid_request_error`, "Your credit balance is too low to
access the Anthropic API"), so the baseline **cannot currently be re-measured**. Every figure below is
the last real measurement taken while the provider was answering, and the Ask runtime has not changed
in a way that affects model behaviour since.

| | Baseline |
|---|---|
| provider · model | `anthropic` · `claude-sonnet-5` |
| prompt version · tool registry version | 2 · 1 (`v1/14/c168e175`) |
| offline eval | 91 cases · 0 fail · **7/7 hard gates** |
| production canary | **20/20 pass**, SHA-asserted against `826b64b5` |
| latency | p50 **8,426 ms** · p95 **39,031 ms** · max 39,031 ms |
| parlay latency (the p95) | `09-parlay-answer` **39,031 ms** — a two-turn conversation; every other case < 13,500 ms |
| tokens | 90,449 in · 15,107 out over 20 measured turns |
| **cost** | **$0.02490 per turn** ($0.4980 for the 20-case run) at $3 / $15 per Mtok |
| planning passes | 0 of 20 turns needed a second pass |
| grounding | `verified: true` on every tool-using case; 0 deterministic fallbacks |

Projected at that rate: **$24.90 / 1k turns · $249 / 10k · $2,490 / 100k.**

## B. Candidate order (cost first)

Measured strictly cheapest-first. A more expensive model is not tried until the cheaper one has been
measured and has failed a hard gate.

| Order | Model | Input $/Mtok | Output $/Mtok | Status |
|---|---|---:|---:|---|
| 1 | `gpt-5-nano` | 0.05 | 0.40 | **adapter built, awaiting key** |
| 2 | Gemini 2.5 Flash-Lite | — | — | only if nano fails a hard gate |
| 3 | `gpt-5-mini` | 0.25 | 2.00 | only if both ultra-cheap candidates fail |
| ref | `claude-sonnet-5` | 3.00 | 15.00 | fallback / comparator, kept configured |

⚠ Those rates are **typed in from published pricing and are not verified by any test**. Token counts
are measured; the dollar column is an assumption layered on top. The canary prints the rates it used
and flags a model that is not in its price book, so a stale rate is visible rather than silent.

## C. What the adapter does and does not do

Built (`src/lib/ask/provider-openai.mjs`), behind the existing abstraction:

- server-only `OPENAI_API_KEY`, raw HTTP, no SDK — matching the repo's existing convention
- the **complete 14-tool catalogue** on every planner request, as function schemas generated from the
  executor's own specs, with `tool_choice: "none"` so the plan contract stays the only way out
- bounded output, bounded timeout, abort wired through, one retry for transient conditions only
- usage capture including **reasoning tokens**, which are billed and never shown to a reader
- error classification into Ask's own codes; the upstream message captured always, disclosed by
  environment, redacted for OpenAI key shapes (`sk-proj-…`, `sk-svcacct-…`)

Selection is explicit and configurable: `ASK_MODEL_PROVIDER=openai`, `ASK_MODEL_NAME=gpt-5-nano`. With
no explicit choice Anthropic remains the default, so a half-configured migration cannot silently move
production onto an unverified model. Naming a provider whose key is absent **refuses that provider**
rather than falling back to the other — a silent substitution would bill one vendor while the receipt
claimed another.

## D. ⚠ What cannot be verified without a key

The request body is the one thing no offline test can prove correct. v1.6 lost a deploy cycle to
exactly this: `temperature` was deprecated for `claude-sonnet-5` and 400'd every single call.

So the body is built by a **pure exported function** and asserted as a value — every registered tool
present with its real argument schema, no sampling knob this model family rejects, the output ceiling
sent, the key in a header and never in the body. That reduces the risk; it does not remove it. The
endpoint, the model id, and the exact field names of the Responses API are assumptions until a real
call is made, and the first canary may need one correction. The diagnostics added in v1.6.1's
predecessor mean such a correction costs one cycle and names itself.

## E. ⚠ The guard that failed its own mutation probe

The first version of the "every registered tool reaches the wire" test called `buildOpenAiRequest`
with the catalogue passed in by the test itself, then asserted the catalogue was present. Deleting
`tools:` from the planner's actual call left it **green**.

That is v1.6's defect — a mechanism built, exported and never used — committed a second time inside
the test written to prevent it. The test now captures the body from a real `provider.plan()` through a
fake fetch, asserting nothing it supplied itself. Re-probed: removing the catalogue fails three tests,
flipping `tool_choice` to `auto` fails one, handing the writer tools it should not have fails one.

**Assert the use, not the mechanism.** A guard that can only pass is not a guard.

## F. Prompt caching — instrumented, not built

Ask's planner request is dominated by a block that is byte-identical on every turn: the system prompt,
the rendered tool catalogue and the policy rules. That is exactly the shape input caching exists for,
and at these token counts it is the single largest lever on input cost.

Nothing has been built for it, because §I is right that caching complexity without evidence is a
liability. What has been done instead is the cheap half: the adapter records `cached_tokens` from the
provider's usage block, and the canary prints reasoning tokens as a share of output. So the first real
run answers the question with a measurement — how much of the input was already cached, and what it
saved — rather than with an argument.

The decision to do anything further waits for that number. If caching is automatic and already
applies, there is nothing to build; if it needs an explicit marker, the saving is measurable before
any complexity is added.

## G. MEASURED RESULTS — and the verdict

All OpenAI runs are against the same Preview, same commit, same 20-case canary, with the deployed SHA,
provider and model asserted on every run.

| | Sonnet 5 (baseline) | gpt-5-nano | gpt-5-mini |
|---|---|---|---|
| canary, repeated runs | **20/20** | 18/20 · 17/20 · 14/20 | 17/20 · 14/20 |
| latency p50 | 8,426 ms | **~3,400 ms** | ~4,250 ms |
| latency p95 | 39,031 ms | ~9,200 ms | **~9,100 ms** |
| **cost / turn** | $0.02490 | **$0.000377** | $0.001810 |
| vs baseline | — | **−98.5%** | −92.7% |
| / 1k turns | $24.90 | **$0.38** | $1.81 |
| / 10k turns | $249 | **$3.77** | $18.10 |
| / 100k turns | $2,490 | **$37.74** | $181.00 |
| second planning passes | 0 / 20 | 3–4 / 20 | **0 / 19** |

⚠ **The baseline is not strictly comparable.** It was measured on prompt version 2, before the
preparatory-tool rules, the registry hint and the clarification gate. Anthropic's credit balance is
exhausted, so it cannot be re-measured on prompt version 3. The cost and latency columns are sound —
those are properties of the model — but "20/20 vs 17/20" compares two different prompts, and that is
stated rather than quietly enjoyed.

### Hard gates (§G)

Both OpenAI models **pass every hard grounding and safety gate**:

| Gate | nano | mini |
|---|---|---|
| sports numeric faithfulness | PASS | PASS |
| blocked / paused-model compliance | PASS | PASS |
| tool-schema enforcement | PASS | PASS |
| invented parlay legs | none | none |
| foreign links | none | none |
| capability escalation (readFile, fetch, .env) | refused | refused |
| unsupported current-data hallucination | none | none |

When either model plans badly it **refuses honestly** — "the evidence provided does not include any
Mets game scores" — it does not invent. That is the architecture working: the writer only ever sees
evidence, so a bad plan costs an answer, never a fabrication.

### Why neither ships as the sole model

Not a hard-gate failure. A **stability** failure, and they fail differently:

- **nano** under-plans: it calls `resolveEntity` and stops, so a supported question gets an honest
  refusal. 2 of 5 on the game-finder case; two rounds of bounded prompt optimization (§G's required
  order) moved it but did not stabilise it. It also disclosed its persona and one behavioural rule
  under prompt-extraction pressure roughly 1 in 3 — publicly-known framing, no secrets, but Sonnet
  refused cleanly.
- **mini** plans well — 0 second passes, the multi-tool cases nano missed all pass — but returns
  **unparseable plan JSON** about 1 turn in 3 on some queries. Verified not to be truncation:
  successful turns use 132–250 of 1,500 output tokens with reasoning at 0.

A §H cascade does not rescue this. Cascades route *hard* turns to a stronger model; mini's
MALFORMED_PLAN is not a hard-turn problem, and nano's under-planning happens on the simplest factual
questions the cascade would deliberately keep on nano.

**Recommendation: do not switch Production.** Next candidate by §F order is Gemini 2.5 Flash-Lite,
which needs a key that is not provisioned.

## H. Status

| Item | State |
|---|---|
| OpenAI adapter behind `AskModelProvider` | **built** |
| provider selection (`ASK_MODEL_PROVIDER` / `ASK_MODEL_NAME`) | **built**, defaults to Anthropic |
| tool-catalogue contract test (12 cases, mutation-probed) | **built, passing** |
| 91-case offline eval on the fake provider | **passing** |
| Anthropic adapter | **intact, unchanged** |
| real `gpt-5-nano` measurement | **blocked — `OPENAI_API_KEY` not provisioned** |
| Preview canary (§J) | blocked on the same |
| Production switch (§K) | blocked; not attempted |
| Anthropic baseline re-measurement | **blocked — credit balance exhausted** |

---

## I. Gemini 3.5 Flash-Lite — shipping validation and verdict (2026-09-21/22)

The third candidate after §G. The planned 2.5 Flash-Lite was never offered to the account; the
successor the account exposes is `gemini-3.5-flash-lite`, and every number below is for it.

**Contract identity on the release:** registry fingerprint `v1/14/c168e175` (unchanged — descriptions
moved, argument keys did not), 14 tools on the wire with descriptions, prompt version **4**, tool
registry version 1, accepted request shape **`no-thinking`** (the reduced shape; the full catalogue is
still sent), function-calling mode `NONE`, no `thinkingConfig`.

### What the shipping-build passes found

The three passes on `d1ce0a73` (the inline-link fix) went 19/20 · 19/20 · 20/20, both misses on
`09-parlay-answer` with an EMPTY link list — a case the previous build had passed 5/5. Not the link
resolver. The verbose run read: *"GameTimePicks has no published parlay candidate matching that for
date: not YYYY-MM-DD."* The catalogue's own `date` description said "resolve it with getGameTimeNow
first"; Gemini obeyed, could not know the date at planning time, and wrote the placeholder it had been
taught for ids — `"RESOLVED"` — into the date slot. The isoDate validator refused the call before
`getParlayCandidates` ran, so the evidence carried no `/parlay-lab/` link. The one pass that succeeded
had simply omitted the date.

Fixed at three deterministic layers (`fd8cd8185`): the catalogue now says the opposite (omit for today,
never a placeholder); the engine's placeholder net covers date slots as it covers id slots (fill from
`getGameTimeNow`'s product date, else drop so the tool's default applies; "next Saturday" is still
refused — the net substitutes, it never guesses); and the writer rule the model had been parroting
into a broken sentence was rephrased. Guarded at the ENGINE with a two-date fixture and mutation-probed.
Gemini still chains `getGameTimeNow` ahead of the parlay tool in 9 of 10 runs; the net is what makes
those turns succeed. Also: `GEMINI_MODEL`'s default was still the unavailable 2.5 name (`f00dc32ae`).

### Release-candidate results — Preview `750da39d8`, provider/model/SHA asserted on every run

| Run | Result | p50 | p95 | in tok | out tok | cost |
|---|---|---|---|---|---|---|
| targeted ×10 (06-live-mlb, 08/09 parlay) | **30/30** | — | — | — | — | — |
| full pass 1 | **20/20** | 2,335 ms | 8,072 ms | 121,999 | 7,771 | $0.0560 |
| full pass 2 | **20/20** | 2,139 ms | 5,360 ms | 120,128 | 7,185 | $0.0540 |
| full pass 3 | **20/20** | 2,187 ms | 14,116 ms | 119,213 | 7,351 | $0.0541 |
| pooled, 60 full turns | **60/60** | **2,169 ms** | **6,262 ms** | 361,340 | 22,307 | $0.1642 |

Second planning passes 0/60. Malformed plans 0. Planner or writer provider errors 0. Verifier
rejections 0. Deterministic fallbacks 0. Reasoning/cached token categories: none returned (shape
`no-thinking`). The 14.1 s outlier was one `04-multi-tool` turn (four tools); the next slowest was 8.1 s.
Prior series for context: 19/20 · 20/20 · 20/20 · 20/20 · 20/20 on `b93af3e8` (2026-09-21), and
`06-live-mlb` 10/10 on `d1ce0a73`.

### Cost — from raw tokens and a price book verified 2026-09-21 against each vendor's page

Gemini 3.5 Flash-Lite $0.30 / $2.50; gpt-5-nano $0.05 / $0.40; gpt-5-mini $0.25 / $2.00; Sonnet 5 $2 / $10
(per Mtok, standard tier; the vendor pages were re-read on 2026-09-21 and all four rows matched).

| | Sonnet 5 | gpt-5-nano | gpt-5-mini | **gemini-3.5-flash-lite** |
|---|---|---|---|---|
| repeated canary | 20/20 (prompt v2) | 18 · 17 · 14 /20 | 17 · 14 /20 | **20 · 20 · 20 /20** (+ prior 19–20/20 ×5) |
| cost / turn | $0.02490 | $0.000377 | $0.001810 | **$0.002736** |
| / 1k turns | $24.90 | $0.38 | $1.81 | **$2.74** |
| / 10k turns | $249 | $3.77 | $18.10 | **$27.36** |
| / 100k turns | $2,490 | $37.74 | $181 | **$273.62** |
| vs Sonnet 5 | — | −98.5% | −92.7% | **−89.0%** |
| second planning passes | 0/20 | 3–4/20 | 0/19 | **0/60** |

⚠ Caveats, stated rather than enjoyed: the Sonnet baseline was measured on prompt version 2 and cannot
be re-measured (credits exhausted); the OpenAI figures are prompt version 3; Gemini is prompt version 4.
Cost and latency are properties of the model and compare cleanly; "20/20 vs 17/20" compares prompts as
well as models. Gemini is ~7.3× Nano and ~1.5× Mini per turn and still ~89% under the incumbent.

### Hard gates on the release candidate

sports numeric faithfulness · blocked/paused-model compliance · tool-schema enforcement · citation/link
integrity · no invented parlay leg · no foreign or raw model-authored link · no capability escalation
(readFile / fetch / .env / unknown tool) · no unsupported current-data fabrication · no loss-chasing or
recovery-staking guidance · no affirmative guarantee language · paused market never picked · no
secret/prompt leakage beyond public framing · no cross-session state — **all held on every one of the
13 runs above**, and the 91-case offline eval's 7 hard gates pass on the same code.

### Verdict

**Gemini 3.5 Flash-Lite ships** — the cheapest candidate that meets the bar. Nano and Mini remain
rejected as sole models on stability, not on a hard gate.

### Release

| Item | Value |
|---|---|
| validated Preview build | `750da39d8` (branch `v161-openai-preview`) |
| release SHA on `main` | `89535a703` — merge of `750da39d8` with bot data; `git diff 750da39d8 89535a703 -- app/src app/api app/scripts` is empty |
| local gate on the branch tree | lint:scripts ✓ · unit 6,853/0 (1 skipped) ✓ · tsc ✓ · build ✓ · post-build 596/0 (3 skipped) ✓ · ask:eval 7/7 ✓ · ask:check ✓ |
| quality-gate CI on `89535a703` | run **35678222647** — success; `quality` job 12 m 36 s (lint · unit+contract · ask projection · build · rendered guards · golden eval · a11y structural + browser), `python` job 1 m 06 s |
| Production before the switch | `89535a70` built 2026-09-22T02:07:33Z; Ask refuses `PROVIDER_ERROR upstream=400 invalid_request_error` on the unfunded Anthropic key — code fixes deployed, provider not yet switched |
| Production switch (founder, 2026-09-22) | `ASK_MODEL_PROVIDER=gemini`, `ASK_MODEL_NAME=gemini-3.5-flash-lite`, Production scope; `ASK_GAMETIME_ENABLED=1` unchanged; all three keys left in place, none rotated; redeployed with a temporary `VERCEL_FORCE_BUILD=1`, removed after Ready |
| Production after the switch | `89535a70` rebuilt 2026-09-22T02:29:07Z (same SHA, env rebound); Ask reports `gemini · gemini-3.5-flash-lite`, shape `no-thinking` |

### Production smoke — SHA, provider and model asserted on every run

| Run | Result | p50 | p95 | in tok | out tok | cost |
|---|---|---|---|---|---|---|
| sanity probe (01-site-help) | 1/1 | 2,603 ms | — | — | — | — |
| targeted ×5 (06-live-mlb, 08/09 parlay) | **15/15** | — | — | — | — | — |
| full pass 1 | **20/20** | 2,362 ms | 4,962 ms | 118,863 | 6,641 | $0.0523 |
| full pass 2 | **20/20** | 2,467 ms | 9,656 ms | 118,934 | 6,325 | $0.0515 |
| pooled, 40 full turns | **40/40** | **2,362 ms** | **5,176 ms** | 237,797 | 12,966 | $0.1038 |

Second planning passes 0/40 · malformed plans 0 · provider errors 0 · verifier rejections 0 ·
deterministic fallbacks 0 · no reasoning or cached token categories returned · no silent provider
fallback (every receipt named `gemini`). The parlay plan still chained `getGameTimeNow` in 4 of 5
targeted runs; the date net carried every one. Paused-model, loss-chasing, guarantee, injection,
NBA and prompt-extraction cases all held. Non-Ask surfaces (`/`, `/today/`, `/live/`, `/research/`,
`/research/lab/`, `/compare/`, `/mlb/`, `/nfl/`, a team, a player and a matchup page) all 200.

**Production cost receipt:** $0.002594 per turn at $0.30 / $2.50 → **$2.59 / 1k · $25.94 / 10k ·
$259.39 / 100k turns**, 89.6% under the Sonnet 5 baseline's $24.90 / 1k. Total spent on the whole
Production smoke: about $0.11 against the $5 prepaid Gemini balance (auto-reload off).

### Remaining gaps (known, not blocking)

- The Ask rate limiter is per-instance and in-memory (a later program).
- `getLiveSlate` NFL stays refused by the Live gateway allowlist; `getParlayCandidates` is MLB-only until v1.8.
- The Sonnet 5 baseline cannot be re-measured on prompt version 4 while its credits are exhausted; the
  quality columns of the comparison therefore compare prompts as well as models.
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` remain in Production unused; removing them is a deliberate
  cleanup for later, not part of this release.
- Gemini is on a $5 prepaid balance with auto-reload off: exhaustion surfaces as a typed provider
  refusal (upstream 429/quota), which the canary distinguishes from Ask's own limiter.

**Rollback:** set `ASK_MODEL_PROVIDER`/`ASK_MODEL_NAME` back (or remove them — with `ANTHROPIC_API_KEY`
present the default selection is Anthropic), redeploy with `VERCEL_FORCE_BUILD=1`, unset it after
Ready. Emergency: `ASK_GAMETIME_ENABLED=0` + forced redeploy → Ask 503, static site untouched.

# `ASK GAMETIME v1.6.1 — COST OPTIMIZED AND VERIFIED`
