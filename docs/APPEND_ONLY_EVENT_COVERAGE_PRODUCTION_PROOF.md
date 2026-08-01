# Append-Only Event Coverage — Production Proof (PENDING FIRST PATCH DAY)

**State: ARCHITECTURE_SHIPPED · PRODUCTION_PROOF_PENDING.** The contract, validator,
materializer, and 11 mutation proofs are on main (see `APPEND_ONLY_EVENT_COVERAGE_CONTRACT.md`).
No production slate has carried a patch yet — forward-only rollout begins with the first safe
slate on/after 2026-08-01.

## What the first patch day must demonstrate (acceptance)

1. A base board publishes normally; an initially uncovered future event later gains an
   OFFICIAL_ADDITION patch; earlier rows remain byte-identical (compare pre/post materialized
   view minus appended rows).
2. The patch's rows are natively stamped, `capturedAt < scheduledStart`, fresh fingerprint.
3. Public view + System Status show base vs appended provenance; Results later settle exactly
   `settlementPopulation()` with gap-zero accounting.
4. Any movement_snapshot taken the same day appears in research accounting only.

Two clean patch days → retire the whole-slate fallback (separate commit).

_This document intentionally stays empty of claims until real production evidence exists._
