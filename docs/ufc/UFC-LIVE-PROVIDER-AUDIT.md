# UFC live provider capability audit (UFC-001)

**Card:** UFC Fight Night: Allen vs. Duncan. ESPN event `600061541`, 12 bouts, Meta APEX, 2026-10-10. Prelims began 21:00Z; the main card begins 00:00Z.
**Provider:** ESPN's public MMA endpoints. No key is needed.
- Scoreboard: `site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20261010&limit=1000`
- Summary: `.../mma/ufc/summary?event=600061541`

**Passes:**
- **Pre-card pass:** 18:40–19:10Z.
- **First live pass:** 22:20–22:40Z, covering real snapshots from 18:40Z to 22:22:53Z. 47 changed snapshots; 4 bouts started, 3 of them finished.
- **Final pass:** after the main card; see the last section.

This document records what the provider states. Nothing below was inferred from prose, and no live state was simulated. All timestamps are recorder capture times. The recorder polls every ~90 s, so a transition happened at or before the stated time, never after it.

## Evidence used

| Source | What it is |
|---|---|
| **Tonight, real.** `scratchpad/ufc-live-capture/scoreboard-*.json` | The full scoreboard, captured read-only every ~90 s; only changed snapshots are kept. Sanitized, delta-encoded copy: `app/src/lib/live/fixtures/mma-live-20261010-timeline.json` |
| **Tonight, real.** `summary-*-404.json` | The summary endpoint for event 600061541 on every poll |
| **Tonight, real.** `mma-scoreboard-20261010-pre.json` | The pre-card scoreboard (18:40:20Z) |
| Sep 26 / Sep 19 fixtures (`mma-scoreboard-{pre,live,inround,settled,final}.json`) | Real captures from earlier cards |
| `data/internal/research/ufc/raw/espn-2023-08 … 2026-08.json` | Full historical payloads; 1,716 completed bouts |

## Status marks

- **VERIFIED_LIVE:** seen in tonight's real recordings, with a timestamp given.
- **FIXTURE_ONLY:** seen only in earlier real captures or historical payloads.
- **UNAVAILABLE:** not present in any payload we examined.

## Capability table

| Field | JSON path | Observed tonight (capture time, bout) | Mark |
|---|---|---|---|
| Event status | `events[].status.type.name/state` | `STATUS_SCHEDULED` (`pre`) still at **21:01:03Z** while bout 1 was already `STATUS_PRE_FIGHT`. It became `STATUS_IN_PROGRESS` by 21:07:05Z | **VERIFIED_LIVE**. It **lags the bouts**, so it is never used for bout state (test REAL 1 flips it and nothing changes) |
| Bout status | `competitions[].status.type.{state,name,detail,completed}` | Gatto–Kareckaite, in order: `STATUS_SCHEDULED` pre (18:40Z) → `STATUS_PRE_FIGHT` in, "Pre-fight" (21:01:03Z) → `STATUS_FIGHTERS_WALKING` in, "Walkouts" (21:07:05Z) → `STATUS_IN_PROGRESS_2` in, "R1, 3:47" (21:14:39Z) → `STATUS_IN_PROGRESS` "R1, 0:07" (21:19:11Z) → `_2` "R2, 4:18" (21:20:42Z) → `STATUS_END_OF_ROUND` "End R2" (21:25:26Z) → "R3, -" (21:31:29Z) → "End R3" (21:32:59Z) → `STATUS_FINAL` post, completed (21:34:30Z). The two IN_PROGRESS names **alternate within a single bout** | **VERIFIED_LIVE** |
| Scheduled start | `competitions[].date` | 21:00Z ×7, 00:00Z ×5. These are segment starts: the 1st prelim went to Pre-fight at 21:01Z, the 2nd at 21:34Z, the 3rd at 21:51Z | **VERIFIED_LIVE**, but it is a segment start, not a per-bout time |
| Current round | `status.period` | `0` through Pre-fight and Walkouts. `1`, `2`, `3` while in progress and at End of round | **VERIFIED_LIVE**. Period 0 with state `in` is not a round |
| Round clock | `status.displayClock`, `status.clock` (s) | **Counts DOWN** within a round: R1 3:47 → 2:41 → 1:09 → 0:07, then R2 opens 4:18 → 2:45 → 1:29 (Gatto); R1 4:43 → 3:11 → 2:09 → 0:37 (Pereira). Mid-round it can be `"-"` ("R3, -" at 21:31:29Z) | **VERIFIED_LIVE**. Time **remaining** in the round; `"-"` means absent |
| Clock at end of round | same | Usually `"-"` ("End R2", "End R1", "End R3"). But at a **stoppage** ESPN puts the remaining time there: Frye–Harris "End R1" `2:01` (22:07:43Z, final 2:59); Ribeiro–Franco "End R1" `3:11` (22:22:53Z). The Sep 26 "inround" fixture ("End R1" `3:58`, final 1:02) is the same case | **VERIFIED_LIVE**. Never shown as a clock |
| Result (bout over) | `state:"post"`, `completed:true`, `detail:"Final"` | Gatto 21:34:30Z, Pereira 21:51:07Z, Frye 22:09:14Z | **VERIFIED_LIVE** |
| Winner | `competitors[].winner` against `competitors[].id` | Pereira (`5261515`) flagged at her first FINAL (21:51:07Z). Frye Jr. (`5327626`) flagged at his first FINAL (22:09:14Z). **Gatto–Kareckaite: FINAL with no winner flag** from 21:34:30Z through at least 22:22:53Z (48+ min) | **VERIFIED_LIVE**, with a **winner-lag / no-winner case**. A final without a flag is shown as "result pending" |
| Winning method | none (no official field) | `competitions[].details[].type.text` is provider play-by-play: "Fight Open", "Walkout", "Tale of the tape", "Staredown", "Round Start", "Takedown Attempt", "Takedown", "Submission Attempt", "Knockdown", "Round End", "Round Unpause", "Fight Over", "Results", and **"Unofficial Winner Kotko"** (exactly that text, for both Pereira's and Frye's stoppages). For Gatto's distance bout the details end "Round End", "Fight Over", "Results" | **UNAVAILABLE as an official field.** "Kotko" is ambiguous (plausibly "KO/TKO" with the slash dropped), names nobody, and is labelled unofficial by the provider itself. Not read |
| Official finish round | `status.period` at `post` | Gatto 3, Pereira 1, Frye 1 | **VERIFIED_LIVE**, provider-reported |
| Official finish time | `status.displayClock` at `post` | **Elapsed**, unlike in-round: Gatto R3 `5:00` / 300; Pereira R1 `5:00` / 300 (an end-of-round stoppage); Frye **R1 `2:01` at the first FINAL (22:09:14Z), corrected to `2:59` / 179 one poll later (22:10:45Z)** | **VERIFIED_LIVE**, but **unofficial**: it has been revised after FINAL. Always labelled "unofficial time" |
| Judges' scores | `competitors[].linescores[0].linescores[]` | Absent until FINAL. Gatto–Kareckaite at 21:34:30Z: Gatto 28/27/28 (83), Kareckaite 28/29/28 (85) | **VERIFIED_LIVE** (distance bouts only). **Not used**: it is not a method or result field, and with no winner flag nothing is inferred from it (these scores could read as a split, a majority draw or anything else; that is the official result's job) |
| Live stats | `competitors[].statistics` | Key present, **empty on every capture** | **UNAVAILABLE** |

## Clock semantics change with the state

| Phase (adapter `MMA_PHASE`) | ESPN names | Clock shown? | Meaning |
|---|---|---|---|
| SCHEDULED | `STATUS_SCHEDULED` (pre) | no | none (`"-"`) |
| PRE_FIGHT | `STATUS_PRE_FIGHT` (in, period 0) | no | none. **Upcoming**, not live |
| WALKOUTS | `STATUS_FIGHTERS_WALKING` (in, period 0) | no | none. **Upcoming**, not live |
| IN_ROUND | `STATUS_IN_PROGRESS`, `STATUS_IN_PROGRESS_2` | yes, "R2 · 2:45 remaining" | time **remaining** in the round |
| ROUND_ENDED | `STATUS_END_OF_ROUND` | no, "End of R2" | `"-"`, or the remaining time at a stoppage. Never shown |
| IN_PLAY_OTHER | any other `in` name with a round | round only | direction not observed, so not shown |
| FINAL | `STATUS_FINAL` (post) | yes, "ended R1 at 2:59, unofficial time" | time **elapsed** at the finish. Provider-reported; can be revised |

## Replaced and cancelled bouts

- No cancelled or postponed state has ever been observed, tonight or historically.
- A replaced bout **gets a new competition id, and the old pairing disappears**. On 2026-09-26, Gall v Dumas `401923433` became Hernandez v Dumas `401924683` (roadmap U4).
- The hub therefore shows a roster bout that is missing from a feed which did answer as "Not in the live feed", never as "cancelled".
- An envelope is attached only when the bout id **and** both athlete ids match the card.
- Tonight: 12 of 12 bout ids and 24 of 24 athlete ids matched before the card, and no pairing changed up to 22:22:53Z.

## Summary endpoint

`summary?event=600061541` returned **HTTP 404** on every poll from 18:40Z through the first live pass, before and during the card. The body is `{"code":404,"message":"Error invoking GET: http://sports.core.api.espn.pvt/v2/sports/mma/leagues/ufc/events/600061541/competitions/600061541/status …"}`. The gateway never calls it. A summary request by bout id has not been tried, because no polling beyond the recorder was started.

## What the integration does with this

- **Gateway:** one dated scoreboard call; public only if `LIVE_PUBLIC_SPORTS` names `ufc`, and closed by default.
- **`espn-mma.mjs`:** adds `phase` and `clockMeaning` to each bout. The clock is carried only in IN_ROUND (remaining) and FINAL (elapsed, unofficial).
- **`ufc-live.mjs`:**
  - **UPCOMING:** Scheduled, Pre-fight or Walkouts.
  - **LIVE:** "R2 · 2:45 remaining", or "End of R2" with no clock.
  - **FINAL_PROVISIONAL:** "Final · awaiting official result" when ESPN names a winner, or "Final · result pending" when it names none.
  - **FINAL_CANONICAL:** only from the graded ledger.
  - The method is always "not reported by the live feed", and there is no in-fight probability.
- **Tests:** `ufc-live-real.test.mjs` replays the real timeline deterministically.

## Final pass (after the main card)

*To be completed from the recordings once the card is over (the recorder runs until 05:00Z):*
- [ ] Whether Gatto–Kareckaite ever gained a winner flag, and when.
- [ ] Main card: 5-round main event clocks, any submission finish (what `details` says), any further final-time corrections.
- [ ] Any bout that vanished or changed id or athlete ids.
- [ ] Event-level status reaching `post`, relative to the last bout.
- [ ] Whether the summary ever stopped returning 404.
