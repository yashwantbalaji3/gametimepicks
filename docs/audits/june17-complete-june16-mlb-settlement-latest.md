# June 17 — Complete June 16 MLB Settlement (attempt)

_Branch `june17-complete-june16-mlb-settlement` off main `b3f0b55` (PR #501). Re-run ~01:35 ET
June 17. Official sources only._

## Headline finding
**The June 16 MLB slate is NOT fully final.** The **San Francisco Giants @ Atlanta Braves** game
(MLB Stats API gamePk **824912**) is officially **"Suspended: Rain" (codedGameState=U)** — not
Final. Per the no-fabrication / no-force rules, the optimizer slips that depend on a player from
that game must remain **pending**; they cannot be officially settled until the game resumes and
completes. The user's belief that all games are final does not hold for this one fixture.

## Command run
`SETTLE_DATE=2026-06-16 SKIP_NBA=1 bash scripts/automation_settle.sh` (MLB Stats API box scores;
free public endpoints only). It re-fetched official box scores and re-graded leans/parlays/optimizer
+ refreshed the daily/model audits.

## Before vs after (June 16 optimizer slips)
| | total | W | L | pending |
|---|---|---|---|---|
| Before (PR #501) | 112 graded-units | 5 | 47 | 4 |
| After (this re-run) | 112 | 5 | 47 | **4** |

**No change** — the re-run produced only idempotent regrade churn (refreshed `gradedAt` timestamps,
no result changes), because the one blocking game is still suspended. That churn was discarded;
there is no material settlement to deploy beyond #501.

## The 4 still-pending optimizer slips (why)
1. `Bryce Eldridge` (+ Nico Hoerner WIN) — Eldridge is SF@ATL → **suspended, not final** → pending.
2. `Matt Olson` + `Victor Caratini` (+ Kody Clemens, David Fry WIN) — Olson is SF@ATL **suspended**;
   Caratini DNP'd in a final game (would void) → the suspended leg keeps it **pending**.
3. `Jase Bowen` (+ Austin Slater, Royce Lewis, Ceddanne Rafaela WIN) — Bowen recorded **0 official
   at-bats** in a final game (SD@STL); the grader conservatively leaves a 0-AB hits prop unresolved
   rather than call it a loss/void → **pending** (this is the only slip not blocked by the suspended
   game; its outcome hinges on a 0-AB grading edge case).
4. `Eli White` + `Carter Jensen` (+ Blake Dunn, James Wood WIN) — Eli White is SF@ATL **suspended**;
   Jensen DNP'd (would void) → the suspended leg keeps it **pending**.

So **3 of 4** pending slips are hard-blocked by the officially-suspended SF@ATL game; the 4th is a
0-at-bat edge case the settler conservatively leaves unresolved. None were forced or fabricated.

## Settled counts (unchanged, official)
- MLB validation leans (June 16): **545 graded — 262 W / 283 L** (players with an official at-bat in
  a final game). DNP / 0-AB players and the suspended-game players are correctly left unsettled.

## Preservation checks (all intact)
- World Cup: team markets **11 graded, 10 W / 1 L**; player props **17 W / 33 L / 22 void**; WC
  cards 2 W; mixed cards 4 L — unchanged from PR #501.
- Bank Builder: Run #1 **$100 → $10,376.17 · 5–0 · completed**; Run #2 **settled · 0/2**; Run #3
  **evaluating / not launched** (no Run #3 artifact). UFC unchanged. No new Bank Builder run.

## Site state
No code change needed — the date-gate already shows June 16 as settled/results (not active pending),
and the 4 pending slips display honestly as pending. Production already reflects this (PR #501).

## Honest limitation
The June 16 MLB settlement **cannot be completed** until the suspended SF@ATL game finishes
(typically resumed the following day). Re-run `SETTLE_DATE=2026-06-16 SKIP_NBA=1 bash
scripts/automation_settle.sh` after it completes to clear the 3 game-blocked slips; the Bowen 0-AB
slip needs a void/loss grading-rule decision.

## Next recommended task
Re-run the settlement once gamePk 824912 (SF@ATL) is Final, then generate the June 17 slate.
