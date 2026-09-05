# Program 234 — resume state

**Entry** `dd068e5c5` (P233's close; `de298affe` ⊂ `dd068e5c5`, one lineage, nothing to reconcile).
**Current tip** `ef2f1ea07`, pushed. Releases A–J complete; see the execution log's departmental
matrix for what is done, blocked and not applicable. Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both
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
| G | `ACQUISITION_UNSCHEDULED` — NFL/UFC deadlines were invented from literals; 72h coverage verified met | `52f432c6f` |
| H | preregistered candidate evaluation; both live verdicts are refusals and both are published | `69bc2919c` |
| I | UFC producer's expired odds claim; `/nfl/game/[eventId]` orphan route | `0caaefa34` |
| J | cross-engine + responsive player suite; the sport filter that did not filter | `ef2f1ea07` |

## Next executable action

The charter's scope is met. The largest genuinely-remaining engineering item is the one the matrix
marks PARTIAL: **a per-product idempotent replay harness** proving a re-run produces no duplicate
debit, credit or slip publication. The offered window and settlement paths are verified; a harness
that replays a full lifecycle per active product is not built.

After that, the forward model registration comes due: run
`npx tsx scripts/model-learning-audit.mjs --json /tmp/audit.json && npx tsx scripts/model-eval/evaluate-candidate.mjs --audit /tmp/audit.json --write`
once 2,000 decisive rows have settled on or after 2026-09-06 (about five slates). Running it earlier
returns INSUFFICIENT_SAMPLE by design.

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

Both of the findings carried out of Release C are **closed** (`0caaefa34`). Remaining:

- **Product lifecycle replay** is unproven per product (matrix: PARTIAL). Nothing is known to be
  wrong; it is untested.
- A background `until`-loop that the harness moves off the foreground **loses its bound** and runs
  unattended. Watch for a condition that can actually occur, and never grep a marker written to a
  different stream than the file being watched.

## Unresolved founder tokens (unchanged, not populated)

`CONSOLE_REDEPLOY:RUN` · `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER` ·
`MOONSHOT_REPAIR_PAUSE_OR_RETIRE:<branch>`
