# Append-Only Event Coverage Contract (Program 096-099 Lane B — SHIPPED)

Removes the whole-slate limitation: future eligible events can gain coverage **without touching a
single published row**. Implementation: `app/src/lib/mlb/board-patches.mjs` (validation, identity,
deterministic materializer, settlement population) + 11 mutation proofs in `board-patches.test.mjs`.

## Architecture

`immutable base board` + `append-only patch stream` → `materialize()` → deterministic current view;
`settlementPopulation()` = base + accepted OFFICIAL_ADDITION rows, exactly.

## Row identity (immutable, repo-native)

`eventId | marketKey | playerId(or "team") | line | side | capturePolicyVersion` — doubleheaders
stay distinct (eventId↔gamePk is 1:1 post-Sprint-041); no display names. An official-addition
patch colliding with any base or previously accepted identity is **refused** (never
last-write-wins).

## Patch rules (each mutation-tested)

1. Targets exactly ONE event, on the base board's schedule, whose start is in the future —
   started-event patches are impossible; unknown start refuses.
2. Carries `eventId, gamePk, scheduledStart, capturedAt, requestWindowStart, requestFingerprint,
   seq, patchId, kind, rows[]`; every row `capturedAt < scheduledStart`; a capturedAt preceding
   its own request window = restamped cache → refused.
3. `kind`: **official_addition** (first eligible capture of an uncovered question → joins the
   closed generated population, settles normally) vs **movement_snapshot** (later capture of a
   covered question → research-only, never in W/L denominators, never in settlement).
   Multiple captures of one prediction question can never inflate prediction counts.
4. Application is ordered (seq, patchId), idempotent (duplicate patchId = no-op), deterministic
   (input order irrelevant — proven), and gap-zero (`published = base + appended`, proven).
5. **Forward-only from 2026-08-01** (`ROLLOUT_START`): pre-rollout boards refuse all patches;
   July 31 and earlier history is never rewritten.

## Materialized public behavior

The view exposes `patchProvenance` (patchId, kind, event, capturedAt, row count); base rows stay
byte-identical (proven); System Status can distinguish base coverage / appended official rows /
movement-only snapshots from the accounting block.

## Rollout posture

The whole-slate pregame top-up remains the active fallback. Event-level patches begin with the
first safe slate on/after 2026-08-01; production proof doc
(`APPEND_ONLY_EVENT_COVERAGE_PRODUCTION_PROOF.md`) fills after the first real patch day, and the
fallback is removed only after **two** clean append-only slates.
