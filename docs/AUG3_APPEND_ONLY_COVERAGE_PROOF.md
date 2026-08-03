# Aug 3 Append-Only Coverage (Program 100-103 Lane F)

## Wiring check — the honest answer

The append-only patch architecture (`app/src/lib/mlb/board-patches.mjs`, 11 mutation proofs,
Program 096-099) is **implemented and proven in test, but it is NOT yet called by the scheduled
production path.** The live coverage-addition path remains the whole-slate top-up
(`mlb-afternoon-topup` → `mlb-topup-decision.mjs` → dispatch of the generator), exactly as
documented at 096-099 close: *"forward-only rollout begins with the first safe slate; the
whole-slate fallback stays until two clean append-only slates."*

Reporting this plainly rather than claiming a wiring that does not exist: Aug 3's coverage will
be completed by the **fallback**, not by the patch stream. Wiring the patch stream into the
generator is real remaining engineering, and it was correctly not attempted mid-incident — the
overnight priority was restoring the daily lifecycle, and a new write path introduced during an
outage is how incidents compound.

## Aug 3 coverage state

| Item | Value |
|---|---|
| Base board | 8 games, 7 covered, 211 rows, all captured 18h+ pregame |
| Uncovered | LAD @ CHC (gamePk 824647), 20:05 ET first pitch — markets not posted at 00:34 ET |
| Patches applied | **0** (patch stream not yet wired to automation) |
| Base immutability | trivially intact — no patch was applied; the base board bytes are the published ones |
| Post-start paid calls | **0** |
| Credits spent | 20 (base board only) |

## What happens next, by design

1. **09:30 ET** — scheduled `morning-projections` regenerates. The whole slate is still pregame
   (earliest first pitch 18:40 ET), so regeneration is safe under the slate-safety rule and will
   pick up LAD@CHC if books have posted.
2. **15:30 ET** — `mlb-afternoon-topup` evaluates. It will `SKIP` at zero credits if coverage is
   complete, and dispatch the generator only if a genuine gap remains while the whole slate is
   still pregame.
3. If books never post for that game, it stays honestly uncovered — partial coverage is a
   truthful state, not a defect.

## Invariants (unchanged, still enforced in test)

Base rows immutable · identity overwrite refused · idempotent application · started-event patches
refused · cached responses cannot be restamped · movement snapshots never enter the official
prediction/settlement population · gap-zero accounting. All 11 proofs green in this program's
validation run.
