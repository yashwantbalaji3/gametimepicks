# Program 237 · resume state

Start `c73327585` → tip `8398c11e0`. Production serving `8398c11e` (built 2026-09-06T06:43:28Z).
CI green on `4fac83f0f`'s predecessors; the tip run was still in flight at close — stated, not claimed.
Protected money unchanged: `affe6b21071f2b3be96bb2774eb347c3` / `cb80473f88f3cb5f67208fa568925295`.
Two stashes and untracked `vp/` preserved. **Zero provider credits spent.**

## Shipped

| | |
|---|---|
| Four sport hubs on one shape | events → products → simulations → picks → results, same on /mlb /nfl /epl /ufc |
| Game summary first | real start times, model reads labelled by kind, keyboard-accessible report links |
| Sticky-strip overlap fixed | the heading sat under the bar at rest on every hub |
| Missing input ≠ no card | three distinct states with three distinct sentences |

## Not done

1. **Phases C, D, E, G, H untouched** — products/picks in context on the hubs beyond the section
   order, simulation-scene inspection, prospective multi-lane accounting, registry gaps, forward
   evaluation and authorization review.
2. **Observed scheduled operation.** The first `daily-products` run with the repaired pool is
   2026-09-06 15:30 UTC; the P236 fix landed ~01:00 UTC, after the previous run. `nightly-settle`
   carrying the new ladder-settler step had not fired at close (last: 2026-09-05T11:20Z). Cron drift
   here is 2–3h, so both windows are open, not missed.
3. **The generation/pool ordering is still fragile.** Generation is scheduled at 15:30 UTC and the
   pool it reads was written at 16:50 on 2026-09-05. The missing-input state now makes a bad draw
   VISIBLE rather than silent; it does not reorder the jobs. Moving `daily-products` later, or
   gating it on the pool's presence, is the actual repair and is not made here.
4. **Moonshot publication** remains blocked on multi-lane exposure accounting, unchanged from P236.

## Reproduction

    # hubs
    npx tsx --test app/src/lib/sport-hub/contract.test.mjs app/src/lib/sport-hub/adapters.test.mjs
    # generation at the SCHEDULED hour — a fixture demonstration, not current publication
    npx tsx app/scripts/activate-daily-portfolio.mjs --date 2026-09-05 --now 2026-09-05T15:30:00Z
    # settlement (dry run is the default)
    npx tsx app/scripts/products/settle-ladder-cards.mjs

## Founder decisions outstanding

Unchanged and unsynthesised: `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER` ·
`CONSOLE_REDEPLOY:RUN`. Moonshot disposition is settled (repair and resume) and was not re-asked.
