# Aug 3 Official Population Freeze (Program 108-111 Lane E)

The official prediction population for 2026-08-03, frozen per event at its own first pitch.
This is the exact set that settlement must grade — no more, no less.

## Per-event manifest (base = frozen board, patches = none)

| gamePk | Matchup | First pitch (UTC) | Official rows | Freeze |
|---|---|---|---|---|
| 823431 | WSH @ PHI | 22:40 | 19 | at 22:40 |
| 823520 | STL @ NYY | 23:05 | 25 | at 23:05 |
| 823757 | PIT @ MIL | 23:40 | 26 | at 23:40 |
| **824647** | **LAD @ CHC** | 2026-08-04T00:05 | **0** | uncovered — books never posted to the provider |
| 822867 | SF @ TEX | 2026-08-04T00:05 | 44 | at 00:05 |
| 824160 | TOR @ HOU | 2026-08-04T00:10 | 30 | at 00:10 |
| 824324 | TB @ COL | 2026-08-04T00:40 | 36 | at 00:40 |
| 825095 | SD @ AZ | 2026-08-04T01:40 | 31 | at 01:40 |

## Accounting

```
base official rows                    211
+ unique official patch additions       0   (writer not shipped — see the patch status doc)
= materialized official population    211
  movement snapshots                    0   (never included)
  rejected patches                      0   (never included)
  no-market decisions                   1   (LAD @ CHC — never included)
```

**Events represented: 7 of 8.** Row identities are 1:1 with rows (211/211) after the identity
fix; no identity appears twice. Every official row's `capturedAt` (04:34:03–04:34:05Z) precedes
its event's first pitch by **18+ hours** — asserted by the base-immutability guard, not just
claimed.

## Invariants at freeze

- **Post-start official additions: 0.** Structurally impossible today (no writer exists), and
  refused by both `classifyEvents` (`EVENT_STARTED_FREEZE_OFFICIAL`) and the patch validator.
- **Base unchanged since cutover:** sha256 `d2e81ca342aa15b298fd16fe3feb9f2eb197650462cd5436d5ac82e584bebf41`,
  identity digest `5e69fa7b…ed7ed69` — guard-pinned, so a same-count row swap also fails.
- **LAD @ CHC stays honestly uncovered.** It is a no-market decision, not a loss, not a gap to be
  papered over, and it must not appear in any settled denominator.

## What settlement must produce (Aug 4 overnight)

`settled + unresolved-by-policy == 211`, decisive `== W + L` with void/push/unavailable excluded,
and the 7 represented events accounted for exactly once each. Assertions in
`AUG3_SETTLEMENT_ACCEPTANCE.md`.
