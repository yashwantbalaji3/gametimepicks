# Doubleheader join defect — 2026-07-28

**Status:** OPEN · **Severity:** P1 (data integrity, live slate) · **Found by:** an existing guard,
`the Game Report and Market Center agree on every shared game`, on the first slate containing a
doubleheader since that guard was written.

## What is wrong

The MLB board maps **both** games of the CLE @ CIN doubleheader to the **same** StatsAPI `gamePk`.

| Board `gameId` | Provider start | Maps to `gamePk` | Correct |
|---|---|---|---|
| `979a29c09433f74c` | 2026-07-28T17:41:00Z | **824489** | ❌ — that is the *late* game |
| `c869940458363d7a` | 2026-07-28T23:10:00Z | 824489 | ✅ |

Consequences, measured:

- `gamePk 824490` (first pitch 17:40:00Z) is **simulated but orphaned** — a full-game simulation
  exists for it and *no* board `gameId` points at it.
- Any model-vs-market comparison rendered for the **early** game is joined to the **late** game's
  simulation.
- Exactly **1 of 16** games on the slate is affected; every other `gamePk` is claimed by exactly one
  `gameId`.

## Why it happened

`markets/load.ts:155-157` builds `pkByGameId` from board leans. The board itself already carries the
wrong mapping, so the defect is **upstream in board generation**, not in the join that consumes it.

The likely trigger is a one-minute discrepancy between sources: the simulation records first pitch as
`17:40:00Z` (StatsAPI) while the provider records `17:41:00Z`. The late game matches exactly
(`23:10:00Z` both sides) and resolves correctly; the early game does not, and appears to fall back to
a team-based match that cannot distinguish the two halves of a doubleheader.

## Why it is not fixed here

The fix belongs in board generation (`pipeline/mlb/generate_mlb_board.py`), which is upstream of every
consumer and carries real regression risk — the repo already has doubleheader-safe identity handling
elsewhere (`{away}-{home}-{date}-{gamePk}` slugs) that must not be disturbed. Sprint 039's rules say
*do not rewrite blindly* and *defer uncertain decisions instead of guessing*. Diagnosing it precisely
and leaving it visible is the correct stopping point.

## The guard is left FAILING on purpose

`the Game Report and Market Center agree on every shared game` currently fails with:

```
979a29c09433f74c moneyline mode must match across surfaces
expected: FULL_COMPARISON   actual: SPORTSBOOK_ONLY
```

It is not quarantined and not weakened. It is correctly reporting a real defect on a live slate, and
suppressing it would recreate exactly the class of problem this codebase has spent six sprints
removing. Verified it is data-driven, not code-driven: the same test passes at `db21b610` (before
today's slate landed) and fails at `27217598` (with it).

## Recommended fix

Match provider events to `gamePk` by **(teams + nearest start time within a tolerance)**, not by exact
timestamp or by teams alone, and assert that the mapping is injective — no two `gameId`s may claim one
`gamePk`. That injectivity check is cheap and would have caught this at generation time rather than
two surfaces later.
