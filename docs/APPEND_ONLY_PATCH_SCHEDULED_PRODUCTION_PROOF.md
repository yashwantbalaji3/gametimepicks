# Append-Only Patch — Scheduled Production Status (Program 108-111 Lane C)

**State: EVENT-LEVEL CLASSIFICATION WIRED AND LIVE · OFFICIAL-ADDITION WRITER NOT SHIPPED.**
Reporting this precisely rather than claiming a production patch path that does not exist.

## What shipped today

1. **Per-event classification** (`classifyEvents` in `mlb-topup-decision.mjs`) — replaces the
   all-or-nothing slate rule. Every scheduled event is classified independently:
   `ALREADY_COMPLETE` · `MARKETS_AVAILABLE_ADD_OFFICIAL_PATCH` · `NO_ELIGIBLE_MARKETS_YET` ·
   `EVENT_STARTED_FREEZE_OFFICIAL` · `IDENTITY_OR_SOURCE_ERROR_FAIL_CLOSED` ·
   `CREDIT_BUDGET_BLOCKED`. **A started early game no longer blocks a still-pregame late game.**
2. **Minimal-query plan (§7.3)** — the classifier emits only the events that justify a paid
   request. On today's board that is exactly one: `824647` (LAD @ CHC). Seven covered games are
   never re-queried to discover whether one uncovered game posted.
3. **Wired into the single authoritative top-up workflow** (`mlb-afternoon-topup`) as a free,
   read-only reporting step that runs before any coverage action, so the decision is observable
   in the run log even on days when nothing is fetched.
4. **Base immutability cutover + guard** — see `AUG3_BASE_BOARD_IMMUTABILITY_MANIFEST.md`.
5. **Row-identity defect fixed** (`ee56b83c`) — found by the cutover ritual itself.

## What did NOT ship, and why

**The official-addition writer** (fetch one event's markets → generate rows → write patch →
materialize → publish).

The blocker is concrete, not a matter of time: **`pipeline/mlb/generate_mlb_board.py` has no
single-event scoping.** Its CLI accepts `--date`, `--markets`, and credit flags only; there is
no code path anywhere that produces board rows for one event. Producing a *lean* row is not a
matter of fetching odds — it runs the projection framework, confidence tiering, and de-vigging.
Building that today would mean writing new code in the **paid** path that reaches into the
projection pipeline this program forbids altering, and shipping it to an **unattended** scheduled
workflow hours before it fires.

That is precisely the pattern behind the last two incidents: a change that looked right, fired
unattended, and broke the day. The classification layer captures most of the safety value with
none of that risk, and the writer now has an exact, well-scoped specification.

## Remaining work (specified, not hand-waved)

1. Add `--event <gamePk|eventId>` scoping to the board generator, emitting rows for one event
   using the **unchanged** projection path.
2. Wrap it in a patch writer that: reads the frozen base, asserts the base hash **before and
   after**, writes an `official_addition` patch through the existing validator, materializes,
   and regenerates only affected downstream artifacts.
3. First run supervised (`--apply` explicit, human observing, before first pitch) — never
   unattended on day one.
4. Two clean patch days → retire the whole-slate fallback.

## Today's fallback posture

The whole-slate fallback remains, and remains correctly gated: `decideTopup` refuses once **any**
slate game has started (§1.2). Today's first pitch is 18:40 ET and the top-up runs 15:30 ET, so
the fallback is still legal today — but the classifier's report is what will tell us whether it
was even needed.
