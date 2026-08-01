# MLB Afternoon Top-Up — Design & Proof (Program 092-095 Lane B)

Founder-approved conditional top-up, implemented as a **gated dispatch of the normal pipeline**
(no new capture path, no new provider call site) — and live-tested the same evening, which
exposed and fixed a real design trap.

## Measured behavior (the founder's precondition)

- 2026-07-31 11:52 ET generation: 10/15 games had provider odds events; the missing five were
  the evening slate. By **12:13 ET** props for those same games were posting (evidence: the
  12:13Z props capture contains PHI@BAL rows). Payload-level archive history is CI-artifact-only
  locally, so the boards' own capture ledger is the measurement source.
- Trigger window chosen from that evidence: **15:30 ET** (books have posted through the
  afternoon; evening first pitches are ~3h out; the 45-min lead cutoff stays intact).

## The live proof — and the root cause it caught

1. **19:49 ET, decision script on the real board: RUN** (2 uncovered pregame games — TEX@HOU in
   76 min, MIN@SEA in 191 min). Dispatched `mlb-daily-production`… which succeeded, spent **3
   credits**, reported "9/10 slate games", re-captured props (fresh 957 rows) — **and the
   coverage gap did not move.**
2. **Root cause (`ingest-mlb-team-markets.mjs:76`):** the completion workflow scopes its paid
   ingests to `board.leans` gameIds — *a game with no morning lean can never gain coverage from
   the completion path, by construction.* The gap was self-perpetuating regardless of when the
   books posted.
3. **Correction:** the top-up dispatches **`morning-projections`** — the board GENERATOR, which
   re-queries the provider event listing fresh (where evening events appear once posted) and
   chains production automatically on success.
4. **Second catch, same evening:** the corrected dispatch (run 30671905380) queued behind the
   writer queue until 13 of 15 games were in progress — and a mid-slate regen would have
   rewritten the whole board with post-start (research-ineligible) captures, churning the day's
   published 319-row record. **The run was cancelled before executing** (verified: board
   generatedAt unchanged at 15:52:36Z, 319 leans intact), and a **slate-safety rule** was added
   to the decision: the top-up runs only while the ENTIRE slate is still pregame. This is the
   conservative reading of the founder's provenance constraint — on slates with early
   afternoon games, evening gaps stay honestly partial rather than risking the record.

## Trigger conditions (all enforced in `app/scripts/mlb-topup-decision.mjs`, mutation-tested)

RUN only when: today's board exists **and** ≥1 scheduled game lacks any lean **and** its first
pitch is > 45 min away **and** balance − expected(62) ≥ floor(2000), with UNKNOWN balance
failing closed with a WARNING. Everything else SKIPs with a named reason. Per-event stop rules:
covered games and started games can never be a reason to run; when none remain, the day is done.
Equivalent-writer serialization and request dedupe are inherited from the dispatched pipeline
(shared `gtp-generated-artifacts` queue, 120-min provider cache, credit floors, the credit
sentinel, and the pregame `capturedAt < eventStart` guards — cached odds can never be restamped
as a new capture).

## Acceptance metrics (2026-07-31 live test)

| Metric | Before | After | Note |
|---|---|---|---|
| Games with market coverage | 10/15 | **10/15 (unchanged, honestly)** | 3 of the 5 gaps had passed first pitch by test time; the corrected regen was deliberately cancelled mid-queue for slate safety — today validated the *trigger and the guards*, not a coverage gain. First real gain expected on the next gap day with an all-evening slate |
| Generated eligible rows | 319 | 319 (record preserved — the point of the cancellation) | natively stamped (observer verifies) |
| Incremental credits | — | **3 total** (mis-targeted dispatch; cancelled regen spent 0) | well inside the 20–60/day budget |
| Post-first-pitch calls | 0 | 0 | decision cutoff + slate-safety rule + pipeline guards |
| Duplicate calls prevented | — | cache hits visible as `spent: 0` entries; props re-capture was a legitimate fresh snapshot | |

## Steady state

`mlb-afternoon-topup` cron 19:30 UTC daily → decision script → dispatch generator only on a
genuine gap **and only while the whole slate is pregame**. Expected long-run cost: **0 credits
on fully-covered days and on early-slate days** (slate-safety skip), 40–60 on all-evening gap
days. Mutation proofs: 9 tests including the slate-safety block, complete-coverage skip,
first-pitch cutoff, budget fail-closed, and UNKNOWN-balance fail-closed.
