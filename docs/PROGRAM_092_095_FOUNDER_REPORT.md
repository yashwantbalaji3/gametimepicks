# Program 092–095 Founder Report — The Defects Are Closed, The Machine Measures Itself

**2026-07-31 evening · Bottom line: every named reliability defect is closed with a proof, the
morning-red invariants are fixed without weakening a single guard, `auto-refresh` went green for
the first time in its existence, one workflow now owns settlement, your approved top-up is live —
and its first real dispatch caught a design flaw that made the coverage gap self-perpetuating.
The analytics collector is implemented and staging-proven on real infrastructure; production
measurement is one dashboard action away.**

## The two morning-red tests — fixed honestly

The invariant conflated "evening game whose odds haven't posted" with the July-28 identity
disaster. The new state model passes a lean-less sim only when the game is scheduled, the slate
has zero identity collisions, the sim carries no market data, and it honestly declares itself
partial — the 07-28 case still hard-fails (that slate had a collision), and so do orphans,
unsafe sources, and overstated statuses, each with a mutation proof. Props now resolve 1111/1111
via a doubleheader-safe schedule join. Side effect: `daily-lifecycle`'s six days of gate
refusals were exactly these tests.

## The top-up story (worth reading)

Your conditional approval was implemented as a gated dispatch with 9 mutation-tested rules —
and the live test earned its keep twice. First dispatch (2 genuinely uncovered pregame games):
succeeded, spent 3 credits, moved nothing — the completion workflow's paid ingest scopes to the
board's **existing leans**, so an uncovered game could never become covered by construction.
Corrected target: the board **generator**. Then the second catch: the corrected dispatch queued
behind the writer queue until most of the slate was in progress, and a mid-slate regen would
have churned the day's published 319-row record — **I cancelled it before it executed** (board
verified untouched) and added a slate-safety rule: the top-up only ever runs while the entire
slate is pregame. Steady state: 0 credits on covered or early-slate days, 40–60 on all-evening
gap days; fail-closed on any credit anomaly. Today's total live cost: 3 credits for two design
truths the tests alone would never have found.

## Reliability closures (each with its proof)

- **auto-refresh: first green run ever** (30669837038, 11m12s) — after fixing the second latent
  killer (a `set -e` grep on unittest-style output) the 084-087 timeout fix had exposed.
- **Hit-rate truth**: decisive = W+L only; voids counted separately everywhere (they were also
  miscounted as pushes in buckets); July-30 regression pins **44.02%**, not 42.08%.
- **Stale public contract can no longer publish**: the health gate now refuses when the
  contract's settled-through date lags the ledger — proven by live mutation.
- **One settlement writer**: nightly-settle owns the schedule; daily-lifecycle is a manual
  recovery tool; `daily-rebuild` retired (it no-opped every day of its life); a guard test fails
  on any second scheduled writer.
- **Missed crons self-heal**: a 10:30 ET watchdog dispatches the normal morning workflow only
  when no run happened, nothing is queued, and no board exists — provably unable to
  double-dispatch or double-spend.

## Analytics: implemented, staged, one action from live

A single first-party Vercel function beside the static export (architecture question answered
empirically on a preview deployment). Black-box staging proofs: valid closed-enum events
accepted; email keys, free text, and precise timestamps rejected; kill switch silent;
enum/key parity with the approved contract is suite-enforced. **Your one action:** create the
Blob store on `gametime-picks` and set three env vars
(`FIRST_PARTY_ANALYTICS_IMPLEMENTATION.md` §"one founder action"). Until then production stays
provably dark, and the first adoption read honestly reports NOT_CONFIGURED.

## Your queue (short)

1. Vercel email toggles (~3 min) — unchanged from 088-091.
2. Analytics store + env vars (~5 min) — measurement starts, no backfill.
3. Aug 7: duplicate quiet-window review (3 clean entries so far, including the busiest deploy
   evening on record with zero duplicate deployments).
4. Billing screenshot (still the last dollar unknown).

## Verification

Full suite green including the two formerly-red live-slate tests (nothing weakened — four hard
failure classes with mutation proofs), typecheck, build, 18-check health gate, Python suites
with the new settlement regression, bash guards (alerter, watchdog, pipefail). Protected money
byte-exact (19-14 · $19,065.40); `vp/` untouched; no model, calibration, or settlement-policy
change anywhere.

**Launch-readiness verdict: the operational layer is now self-observing (alerts), self-healing
(watchdog), self-limiting (credit sentinels), single-owner (settlement), and honest under
partial data (invariant states). What remains between here and a fully measured public launch
is your two dashboard actions and the quiet week finishing.**
