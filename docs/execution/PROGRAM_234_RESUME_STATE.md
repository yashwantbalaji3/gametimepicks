# Program 234 — resume state

**Entry** `dd068e5c5` (P233's close; `de298affe` ⊂ `dd068e5c5`, one lineage, nothing to reconcile).
**Current tip** `178d0f47c`, pushed. Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both
pre-existing stashes and founder-owned `vp/` untouched.

## Done

| release | outcome | commit |
| --- | --- | --- |
| A | EPL pre-event delivery **verified** on durable receipts (2h53m pre-kickoff); publication predicate narrowed — a truthy object is not a forecast | `f7a47c5d1` |
| B | the fixed-frame MLB player: one click, 8 chapters, ~45s, pointer still, report always reachable | `e355a092d` |
| C | EPL / UFC / NFL adapters on the same player; `/simulate` deep-links every ready sport | `178d0f47c` |

## Next executable action — Release D, recording mode

The player already takes a `ratio` prop (`natural` | `portrait` | `landscape` | `feed`) and the
frame honours it; `RATIO_CSS` in `components/simulate/presentation-player.tsx` is where the
compositions live. What is missing is the chooser, the countdown, and hiding the surrounding chrome
from the capture frame. Then the three additional presentation types the charter names: today's
Top 10, an eligible published parlay, and a results recap.

Auto-play already totals 37–45s per sport, inside the charter's 45–75s band, and chapter timing is
per-chapter `holdMs` in each adapter — not a loading delay.

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
- A client component importing anything from `lib/simulate/day-view` drags `node:fs` into the
  browser bundle and fails the export build. Use `lib/simulate/ready-states.mjs`.

## Open findings

- `ufc/card-latest.json` still emits the expired "our authorisation to buy odds covers NFL only".
  The presentation refuses to carry it and a test pins that, but the producer is unfixed.
- `/nfl/game/[eventId]` is an orphan route — nothing in the built export links to it.

## Unresolved founder tokens (unchanged, not populated)

`CONSOLE_REDEPLOY:RUN` · `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER` ·
`MOONSHOT_REPAIR_PAUSE_OR_RETIRE:<branch>`
