# v1.8 — Ask GameTime readiness

**Date:** 2026-09-23 · **Branch:** `v18-ask-readiness` · **Base:** `4dbd40a3b`
Architecture untouched. No rewrite, no provider change, no key rotated, no tool added without a
deterministic owner.

## 1. Current deterministic tool ownership

Five tool modules: `compare` · `forecast` · `live` · `product` · `research`. The pipeline
(planner → typed tools → executor/evidence → grounding verifier → answer writer → claim/link validator)
is production-verified and is not changed here.

**Gaps, each named with the owner it is waiting on — no tool is proposed without one:**

| question Ask cannot answer deterministically | owner it needs | status |
|---|---|---|
| "How has Bank Builder done this month?" | canonical Results projection | **#637, unmerged** |
| "What happened to yesterday's Moonshot?" | same | #637 |
| "Why do these two records differ?" | C1 contradiction cells | #637 |
| "How are today's NFL forecasts doing?" | `LiveTrackedForecast` | **#645, dark** |
| "Which predictions are live right now?" | same | #645 |
| "What changed since I was last here?" | device-local observation | exists, not tool-exposed |

## 2. Corpus audit — three verified corrections

**🔴 A dead deep link.** `parlay-candidates` pointed at `/parlay-lab/`, a `ClientRedirect` stub to
`/build#suggested-cards` since Parlay Lab was retired. Ask was handing readers a redirect, and chained
redirects are already recorded in this repository as discarding query intent. **It was the only stale
route of twenty-one** — which is the argument for a guard rather than a sweep: the next one will also be
the only stale route.

**🔴 A false model-status claim.** The corpus said *"NFL and EPL forecasts are experimental."* Four NFL
families are `PUBLISHED` on the live player board — rushing yards, receiving yards, receptions, anytime TD
(116 occurrences across the committed boards) — with passing yards an `ESTIMATE`. A reader asking whether
GameTime publishes NFL predictions was told no.

The correction also restores a distinction the old copy collapsed: **published as a forecast** and
**eligible to appear as a parlay leg** are different things. The signature products remain MLB-only, so
both halves must be said or the reader draws the wrong inference either way.

**EPL was deliberately left alone.** Its published state could not be established from committed artifacts
in this pass, and the instruction was to correct only what is already merged and established.

### The guard

`help-corpus-freshness.test.mjs` checks the corpus **against the repository**, not against a remembered
fact: every routed chunk must resolve to a real page (not a redirect stub, not a missing route), and the
model-status copy is compared to the NFL board's actual family states. Its resolver carries a
positive/negative control so it cannot pass by calling everything a page.

**Probes: 2 of 2 caught**, negative control clean — reverting the route to the retired alias, and
re-asserting that NFL is wholly experimental.

## 3. Canonical Results integration — designed, not wired

**Deliberately not implemented against #637's unmerged contract.** Wiring a tool to a branch that may still
change is how a reader ends up quoting a shape that never shipped.

Proposed `getProductResults({ product, era?, window? })`, reading **only** `lib/results/projection`:

- **never passes a presentation context** → the strict `CURRENT` default, so a `LEGACY_HISTORY` cell can
  never answer a current question (C3);
- `LEGACY_HISTORY` only when the question is explicitly historical — *"what was the June 5–0 run?"* — and
  then with exact dates and era, never as evidence for today's methodology;
- **pending is not a loss; missing is not zero**; a cycle completion is not a hit rate; a calibration
  state is a word, not a number;
- *"why do these records differ?"* is answered from the projection's **contradiction cells** —
  `WINDOW_CONTRADICTS_LABEL`, `SUPERSEDED`, `DISCLOSED_GAP` — which is the one place that question has a
  deterministic answer rather than a narrated one.

## 4. Live integration — designed, blocked on two gates

Proposed `getLiveTrackedForecasts({ sport, gameId? })` over `LiveTrackedForecast` (#645).

May state: current value, period, clock, the frozen projection and its range, and
`BELOW | INSIDE | ABOVE`. **May not state** live probability, live EV, "on track", an updated projection,
or expected remaining production — none has a validated owner.

Blocked on: **(a)** the real-game observation that ESPN populates player stats *during* play, and
**(b)** public NFL activation, a Production env decision. Until both, this tool would have nothing
truthful to answer with for the only sport it would cover.

## 5. Multisport parlay dependency

Ask's parlay answers are bounded by deterministic candidate supply, and that supply is **MLB-only** —
today's eligible universe reads *"96 eligible legs across 1 sport."* The LLM must not be taught to invent
cross-sport legs to fill the gap; the dependency is on `ProductEligible` markets existing, which is a
founder gate earned by model evidence, not by product appetite.

## 6. Personal operating layer — roadmap

`Since Last Visit`, `Following` and `Saved` are **device-local by ownership** (`gtp.observation.v1`, the
follow store). A deterministic tool may read what the browser already holds and must never treat a device
observation as sports truth. **No accounts, no Supabase** — the local-first ownership is the design, not a
limitation to be engineered around.

## 7. Operational audit — observations only, nothing rotated

Production runs `gemini-3.5-flash-lite` at ~$0.0026/turn with a 40/40 smoke receipt. Rate limiter, provider
factory and fallback semantics are unchanged here. Three provider modules exist (`gemini`, `openai`,
`anthropic`) while one is configured — **not** a defect, but worth a deliberate decision about whether the
unused paths stay warm. **No key was read, rotated or printed.**

## 8. What shipped

Two files: three corpus corrections and one guard. Everything else is a plan with its dependency named.
