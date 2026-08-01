# July 31 Settled PROVEN_STAMPED Acceptance (Lane A — WALL_CLOCK_OPEN)

**State at program close (2026-07-31 ~23:00 ET): WALL_CLOCK_OPEN, everything staged.** The last
July-31 games (SEA/HOU slots) finish after midnight ET; the ONE canonical writer
(`nightly-settle`, crons 01:30 + 03:30 ET) settles them. Nothing may trigger settlement early —
official-final gating is the policy, not a delay.

## Pre-staged facts (verified tonight)

- Board fingerprint: `2026-07-31.json`, generatedAt `2026-07-31T15:52:36Z`, 15 games,
  **319/319 rows natively stamped** (observer: FULLY_STAMPED, 319 research-eligible), 10/15
  games with market coverage (honest partial — books never posted 5 evening games to the
  provider before generation; 3 credits of live top-up testing confirmed, see
  `MLB_AFTERNOON_TOPUP_DESIGN_AND_PROOF.md`).
- The settled-lineage exporter runs inside nightly-settle post-settle (Sprint 048 wiring), and
  the acceptance machinery itself was proven on 227/227 rows July 31 morning (Program 076-079).
- New this week, all live on main for the settle to flow through: decisive-denominator
  accounting (`aggregate_outcomes`), the `research-contract:stale` health gate, and 5/5 alert
  wiring — a failed overnight settle cannot be silent.

## Acceptance checklist (run after the Aug-1 nightly settle — ~10 min)

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks && git pull --ff-only
cd app && node scripts/public-beta-observe.mjs
```

Expected: `newest settled 2026-07-31` · `lineage acceptance PROVEN_STAMPED · N/319 rows` (N =
settled rows on covered games; gap-zero vs generated population, voids explicit) · settlement
log shows `settled= decisive= wins= losses= pushes= voids=` with decisive = W+L only ·
`/results` shows July 31 only after accounting closes · no July-30-or-older unstamped row
promoted (sidecar states stay distinct) · run URL + deployed SHA appended HERE.

If any game is postponed/suspended: it stays fail-closed Pending/Void per policy and this doc
records the named exception — July 28 quarantine and July 29 generation-block never enter
denominators.

## Daily learning posture

One additional forward observation; **expectation: cumulative evidence unchanged** (market
remains benchmark; no retuning; total-bases stays disabled). Metric deltas go here after settle.
