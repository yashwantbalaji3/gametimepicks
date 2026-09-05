# Program 234 — resume state

**Entry** `dd068e5c5` (P233's close; `de298affe` ⊂ `dd068e5c5`, one lineage, nothing to reconcile).
**Current tip** `65767a9d6`, pushed, CI-green lineage, **serving in production** (build marker
`65767a9d` built 2026-09-05T19:29:40Z). Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both
pre-existing stashes and founder-owned `vp/` untouched.

## Done

| release | outcome | commit |
| --- | --- | --- |
| A | EPL pre-event delivery **verified** on durable receipts (2h53m pre-kickoff); publication predicate narrowed — a truthy object is not a forecast | `f7a47c5d1` |
| B | the fixed-frame MLB player: one click, 8 chapters, ~45s, pointer still, report always reachable | `e355a092d` |
| C | EPL / UFC / NFL adapters on the same player; `/simulate` deep-links every ready sport | `178d0f47c` |
| D | recording mode (9:16 / 4:5 / 16:9, countdown, chrome outside the crop) + Top 10 / parlay / recap presentations; the gate's flaky guard diagnosed and its cause removed | `b11c51070`, `f2a4ec509` |
| E | `/results` date ranges + presets, sport x risk grid, slip drill-down — on per-card rows that reconcile with the ledger exactly | `d211a1036` |
| F | daily and cumulative trends over the same population; empty days are gaps, rates pooled from sums | `65767a9d6` |

## Next executable action — Release G, current coverage and daily products

A–F are shipped, gated and live. What remains is G (offered-window coverage for NFL/EPL/UFC across
the next 72h, and one proven lifecycle per active product), H (the candidate-vs-incumbent comparison
harness), and I (navigation follow-through, the two open findings below, and the departmental
matrix).

Start with the two open findings — both are small, both are real, and both belong to I:
the expired UFC `notModelled.moneyline` sentence in its producer, and `/nfl/game/[eventId]` being an
orphan route nothing in the export links to.

## Do not repeat

- **A guard that fails because the product improved may still be right about the producer.** The EPL
  calibration blocker vanished when the graded count crossed 20 while its gate stage stayed
  UNPROVEN. The threshold was measuring the wrong quantity. Fix the producer before touching a guard.
- **A test that loops over an empty array passes and proves nothing.** The histogram bar test did
  exactly this. Assert the count before the contents, then mutation-probe.
- **`z-50` on a descendant loses to a sibling of its ancestor.** Modals go in a portal. DOM checks
  said the buttons were visible and enabled while the footer sat on top of them.
- **Bins are objects in MLB and plain numbers in EPL.** Assuming one shape produced a silently empty
  chart. Check the artifact, per sport.
- `trailingSlash: true` — the slash goes before the query, or the 308 eats the query.
- **ANY module a `"use client"` file imports must have no `node:fs` anywhere in its import graph.**
  Hit twice: `READY_STATES` from `day-view` (C) and `dailySeries` from `dated-cards` (F). The pure
  halves live in `lib/simulate/ready-states.mjs` and `lib/results/card-math.mjs`.
- **A test may not move the artifact its siblings are reading.** `suite-phases` renamed `app/out`
  aside mid-run and made the deploy gate flaky for three of six runs; it now uses `--app <scratch>`.
- **Never pool a total with its own parts.** The read model emits a whole-stream row AND a row per
  tier; summing both doubled the recap's record. `card-math` refuses a mixed-granularity set.
- Run the gate AFTER the last edit, immediately before the commit. A suite result is about a tree.

## Open findings

- `ufc/card-latest.json` still emits the expired "our authorisation to buy odds covers NFL only".
  The presentation refuses to carry it and a test pins that, but the producer is unfixed.
- `/nfl/game/[eventId]` is an orphan route — nothing in the built export links to it.

## Unresolved founder tokens (unchanged, not populated)

`CONSOLE_REDEPLOY:RUN` · `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER` ·
`MOONSHOT_REPAIR_PAUSE_OR_RETIRE:<branch>`
