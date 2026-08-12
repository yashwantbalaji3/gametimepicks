# NBA Lineup Source Evaluation — REJECTED for the pre-start role (Program 163 · Release B)

Question: does any free/authorized source provide an **official pre-start NBA lineup** fit for the
`injuriesLineups` live-input gap? Evaluate before integrating; a rejection with evidence is the
required outcome when the sources don't hold up.

Probe receipts (2026-08-12 ~01:5x UTC, two keyless requests, zero cost):

1. **ESPN summary, settled corpus game** (`…/summary?event=401591869`) → 200, 41 KB.
   `boxscore.players[].statistics[].athletes[]` carries `starter: true/false` with athlete ids —
   REAL official starters, **but this block exists because the game was played**. It is box-score
   data.
2. **ESPN summary, future scheduled game** (`…/summary?event=401902644`, MIA@TOR Oct 3) → 200,
   9.7 KB. **`boxscore.players` is absent pre-start.** No `rosters` block. The only availability
   content is the injuries block — which is the separate input we already capture.

## Candidate verdicts

| Candidate | Verdict | Why |
|---|---|---|
| ESPN summary starters | **REJECTED for pre-start**; ACCEPTED as `POST_START_STARTERS` (retrospective verification only) | starters materialize at tip-off — settlement-grade, temporally ineligible for shadow input by definition |
| ESPN depth charts | REJECTED for the official role | PROJECTED by nature; projections are research metadata, never an official lineup |
| ESPN injuries feed | Not a candidate | availability evidence; the contract makes "injuries can never satisfy lineups" executable |
| NBA.com official (stats endpoints) | REJECTED without founder action | official pregame lineups exist there (~30 min before tip), but the terms are restrictive and the endpoints are historically hostile to unattended use — a rights/licensing decision, not an engineering one |

## Decision

**REJECTED** — no acceptable free source for `OFFICIAL_LINEUP` today. The gap stays MISSING in
`LIVE_INPUT_MATRIX` with this document as the evaluation receipt. **Next candidate:** a founder
rights/licensing decision on NBA.com official lineups or a licensed feed; that card belongs to the
founder queue, not the engineering lane.

## What shipped instead of an integration

`src/lib/sports/lineups/contract.mjs` — the closed evidence vocabulary (OFFICIAL_LINEUP,
PROJECTED_LINEUP, ROSTER, POST_START_STARTERS, INJURY_REPORT, UNKNOWN) and the fail-closed shadow
gate: eligibility requires an explicitly labeled official lineup with `sourceAsOf` provably before
`scheduledStartUtc`. Post-start evidence, projections, rosters, injuries, absent timestamps and
unlabeled official claims all refuse with their exact reasons. When a real source is ever
licensed, its adapter must satisfy this contract — the vocabulary does not bend to the feed.
