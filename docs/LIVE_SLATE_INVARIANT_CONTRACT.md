# Live-Slate Invariant Contract (Program 092-095 Lane C — CLOSED)

The two tests that failed every morning are fixed **without weakening true-orphan detection**.
Both formerly-red tests now pass on the real partial slate, and every dangerous state remains a
named hard failure with a mutation proof.

## Why the old invariant was wrong (and why it existed)

`event-identity.test.mjs` treated "no lean claims this gamePk" as an orphaned simulation. But a
full-game simulation's canonical upstream is the **board schedule + projections** (it exists for
all 15 scheduled games), while leans appear only as books post odds — so the check conflated the
normal morning state of an evening game with the 2026-07-28 disaster (both halves of a
doubleheader mapped to one gamePk; 824490 simulated-but-unreachable **beside a collision**).

## The state model (`app/src/lib/live-slate-invariant.mjs`)

| State | Meaning | Verdict |
|---|---|---|
| CLAIMED_BY_MARKET_ROW | a lean claims the sim's gamePk | pass |
| **LEGITIMATE_PARTIAL_UPSTREAM** | scheduled on the board + **zero collisions on the date** + sim carries **no market snapshot** + sim honestly declares `unavailable`/`partial` | pass |
| TRUE_ORPHAN_NO_UPSTREAM_SOURCE | simulated gamePk not on the board (or null) | **hard fail** |
| IDENTITY_CONFLICT_ON_SLATE | ANY collision on the date makes every unclaimed sim suspect — this is exactly the 07-28 signature, so the historical disaster still fails under the new rules | **hard fail** |
| POSTGAME_OR_UNSAFE_SOURCE | market data present on an unclaimed sim (mis-join symptom) | **hard fail** |
| PARTIAL_PRESENTED_AS_COMPLETE | partial state not declared (`status`/`completeness` claim full) | **hard fail** |

Public honesty is preserved: a legitimate partial sim must carry `status: unavailable` /
`completeness: unavailable`, which is exactly what the public availability states render.

## Prop resolution (`resolve-team.test.mjs`)

Props can exist for events whose game markets haven't posted (they carry `matchup`
"Away @ Home"). The measured test now joins those to the board **schedule** — but only when the
team pair maps to exactly ONE scheduled game that date. A doubleheader pair stays unresolved
(fail-closed), mirroring the upstream nearest-start resolver. Result on the live slate:
**1111/1111 props game-resolved (100%)**, team attribution still honestly UNRESOLVED until
lineups post.

## Mutation proofs (`live-slate-invariant.test.mjs`, all green)

Real legitimate intraday fixture passes · remove upstream (game off board) → TRUE_ORPHAN ·
foreign/null gamePk → TRUE_ORPHAN · introduce collision → IDENTITY_CONFLICT (07-28 replay) ·
attach market capture → UNSAFE_SOURCE · declare partial as complete → hard fail · every mutation
asserts it actually changed the fixture · fixture round-trips byte-identical.

## Ripple effect

`daily-lifecycle`'s six consecutive quality-gate refusals were these two tests. The gate now
passes on legitimate partial mornings while still refusing on any of the four hard states.
