# Forward-Only Row Stamping

**Program:** 066–068 · **Status:** IMPLEMENTED, effective for boards generated from 2026-07-31 onward
**Code:** `pipeline/mlb/generate_mlb_board.py` · **Guards:** `pipeline/mlb/generate_mlb_board_identity_test.py` (19 tests)

---

## Why this exists

Program 062–065 built the additive research-lineage sidecar and reported **`PROVEN_STAMPED = 0`**. That was the honest number: the exporter can reconstruct a great deal about a historical row — which event it belonged to, which source settled it, whether its slate was quarantined — but it cannot reconstruct **when the odds were read**. Once a board is on disk, that instant is simply gone.

That single missing field is what keeps every legacy row at `LEGACY_UNSTAMPED`. It is also the field most worth having, because research eligibility is exactly the claim *we looked at this before the game started*.

The tempting shortcut is the board's file-level `generatedAt`. It is right there, it is usually pregame, and it would move the coverage number a great deal. It is also wrong: `generatedAt` describes the **run**, not the row. A board generated at 15:31 may contain a row whose prices were read at 15:38, or a row for a game that started at 15:35. Substituting it manufactures provenance rather than recording it — which is why the lineage contract bans it and why a mutation test now pins the ban.

## What a stamped row carries

Written by `_build_lean` at generation time:

| Field | Source | Note |
|---|---|---|
| `eventId` | `derive_event_id(sport, league, participants, scheduledStart)` | The **settlement** derivation, so a board row and the result that grades it name the same event — including both halves of a doubleheader, which start-to-the-minute separates |
| `capturedAt` | the odds call that produced the row | Stamped when that call returns, per event — not once per run |
| `scheduledStart` | the event's start instant | Not the slate date. A 20:40 ET first pitch is the next UTC day, and the slate date cannot express that |
| `providerRefs` | `{oddsApiEventId, bookmaker}` | Recorded from the response, never inferred from participant names |
| `researchEligible` | **derived**: `capturedAt < scheduledStart` | See below |
| `rowSchemaVersion` | `mlb-board-row-1` | Lets the exporter tell a natively-stamped row from a reconstructed one |

## `researchEligible` is derived, never asserted

It is computed from the row's two instants every time, and **fails closed**:

- missing `capturedAt` → not eligible
- missing or unparseable `scheduledStart` → not eligible
- `capturedAt == scheduledStart` → **not eligible** (equality is not "before")
- `capturedAt > scheduledStart` → not eligible

A row cannot hand-assert the flag, because nothing reads a hand-asserted value. This matters more than it looks: an eligibility flag that can be set is a flag that will eventually be set by a well-meaning backfill.

## The mutations that pin it

| Mutation | Required outcome | Test |
|---|---|---|
| Remove per-row `capturedAt` | eligibility forfeited | `test_MUTATION_removing_capturedAt_forfeits_eligibility` |
| Substitute board-level `generatedAt` | must not rescue the row — the fixture is built so the board stamp *would* have passed | `test_MUTATION_file_level_generatedAt_cannot_stand_in_for_capturedAt` |
| Capture after first pitch, or exactly at it | not pregame | `test_capture_after_first_pitch_is_not_pregame` |
| Team-name-only join on a doubleheader | resolves to the wrong game | `test_MUTATION_old_lastwritewins_behaviour_is_caught` |

## Coverage: what this does and does not change

**It is forward-only, and deliberately so.**

- Boards generated **from 2026-07-31 onward** carry native stamps and can reach `PROVEN_STAMPED`.
- The **2026-07-30 board is NOT stamped.** It was regenerated during this program to recover the site from a three-day outage, using the code that existed at that moment; the stamping landed after. It is honestly `NOT_YET_STAMPED`, and no attempt was made to add stamps to it afterwards — doing so would invent the very timestamps this document exists to protect.
- **Every historical board stays untouched.** 2026-07-28 remains quarantined; 2026-07-29 has no board at all (see the execution log); everything before stays `LEGACY_UNSTAMPED` and aggregate-only.

`PROVEN_STAMPED` therefore stays **0** at the end of this program and becomes reachable on the first scheduled run after the stamping deploys. A coverage number that climbs only when genuinely new evidence arrives is the entire point; a number that jumps because old rows were relabelled would mean nothing.

## Interaction with the sidecar exporter

The exporter (`app/scripts/build-research-row-lineage.mjs`) prefers native stamps and falls back to reconstruction:

- native `capturedAt` + `eventId` present → eligible for `PROVEN_STAMPED`
- reconstructed from the pregame archive → `PROVEN_SIDECAR`
- nothing to reconstruct from → `LEGACY_UNSTAMPED` (aggregate only, no row-level claim)
- sources disagree on identity → `CONFLICTED` (kept distinct from `QUARANTINED`; no rate either way)

## Evidence labels

- **PROVEN** — stamps are written by the real code path and the mutations fail as required (19 guards, `pipeline/mlb/` 58 passed).
- **WALL_CLOCK_OPEN** — no natively-stamped board exists yet; the first arrives with the next scheduled generation.
- **REJECTED** — substituting board-level `generatedAt`; backfilling stamps onto the 2026-07-30 or any earlier board.
- **FUTURE WORK** — carrying the same stamps through settlement so a settled row inherits its board row's provenance without a join; extending the contract to NBA boards, where `tipoffIso` persistence (Program 062–065) is the equivalent prerequisite.
