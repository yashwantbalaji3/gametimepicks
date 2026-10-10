# Forward test B · amendment 1 (2026-10-10, before any included game has started; no code change)

**Clarification:**
- The forecast time T is defined in the frozen `run-forward-b.mjs` (`e273bf4e2c`) as the **later** of two captures:
  - the last `lineup` capture with both lineups posted;
  - the latest `matchup` capture.
- Both must be captured before the scheduled start.
- The starters come from that `matchup` capture.

The registration's sentence "the latest `matchup` capture at or before T" describes the same rule, because T is at least that capture's time. This amendment changes no code, threshold or window. It was written before the first pitch of the first included game (849831, 2026-10-11T00:00Z).
