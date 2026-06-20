# Fix Bank Builder next steps + Moonshot demo state

_Branch `fix-bank-builder-next-steps-demo` off main `40ce6664`. June 20, ~21:12 UTC._

## Complaint → fix
The /bank-builder page was settled but not actionable: Lane A Step 3 read a vague "Upcoming", Lane B "Starting path", Moonshot "stopped" — none with a card or reason.

| area | before (vague) | after (actionable) |
|---|---|---|
| Lane A Step 3 | "Upcoming", no card | **AWAITING NEXT CARD** + open candidate drawer: "Step 3 candidate · awaiting a balanced slate" + exact reason |
| Lane B restart | "Starting path", no card | candidate drawer: "Restart candidate · awaiting a balanced slate" + exact reason |
| Moonshot | "stopped", nothing | restart-candidate banner: "Restart candidate · awaiting a confirmed slate" + exact reason |

## Root cause + real state (verified at runtime)
- The view model only treated step status `coming_soon` as "awaiting"; the artifact uses `awaiting` for Step 3 → Step 3 fell through to "upcoming" with a null card → the vague placeholder. Fixed `buildPublicDualLadder` to recognize `awaiting` and to carry a `nextCandidate` (card legs OR honest reason) on the awaiting/queued step.
- **Why candidates are reasons, not cards:** the prior Netherlands+Germany Step 3 card is **void** — both games finished (Germany lost 0–1 to Ivory Coast, verified API-Football). The remaining/upcoming slate is **favorite-heavy** (Spain −1000, Ecuador −800; the only balanced sides are longshots Belgium +360 / NZ +320), so **no clean +150 (Lane A) or +100..+250 (Lane B) two-leg card clears the gate**. Fabricating one would violate the gates → honest "candidate pending approval + exact reason" is the correct, non-fabricated state.

## Changes
| artifact / file | change |
|---|---|
| `ui-loader.ts` | `LaneDisplay.nextCandidate` (status/headline/reason/stake/odds/legs) + mapping |
| `public-dual-ladder.ts` | recognize `awaiting`; attach `candidate` to awaiting (Lane A) + queued (Lane B) steps |
| `dual-ladder-board.tsx` | render the candidate (legs OR reason) + "awaiting approval"; open the next-step drawer by default; clearer unlock note for far-future rungs |
| `moonshot-lane-card.tsx` + `moonshot-lane.ts` | `restartCandidate` banner when stopped |
| `dual-bank-builder-active.json` | Lane A/B `nextCandidate` (honest reason, `legs: []` — no fabricated legs) |
| `moonshot-lane/active.json` | `restartCandidate` (honest reason, $25 not placed) |

## Safety
- **Candidate-only → no exposure**: all candidates are `pending` (never `active`/`placed`); Mr. Dub stays $9,776.17 / $0 / 9-6. No card placed (the favorite-heavy slate supports none cleanly).
- **No fabrication**: candidate bodies carry reasons + real cited odds (in prose), `legs: []` — no invented legs/odds. No `-1000` generated legs (the lone `-1500` is a pre-existing real settled leg, not added).
- **Protected crown untouched**: `public/data/bank-builder/*` ($100→$10,376.17, 5-0) unchanged.
- Gates: tsc clean · **1189/1189 tests** (+ candidate/exposure tests) · build OK · audits clean · desktop + mobile (375px) QA clean.
