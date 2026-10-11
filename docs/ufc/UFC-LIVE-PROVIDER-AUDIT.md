# UFC live provider capability audit (UFC-001)

**Card:** UFC Fight Night: Allen vs. Duncan. ESPN event `600061541`, 12 bouts, Meta APEX, 2026-10-10. Prelims began 21:00Z; the main card began 00:00Z, and the main event ended at 02:48Z.
**Provider:** ESPN's public MMA endpoints. No key is needed.
- Scoreboard: `site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20261010&limit=1000`
- Summary: `.../mma/ufc/summary?event=600061541`

**Passes:**
- **Pre-card pass:** 18:40Z.
- **First live pass:** 22:20Z.
- **Final pass:** 03:00Z, covering **all 170 changed scoreboard snapshots from 18:40:20Z to 03:02:21Z (the recorder ran to 05:00Z; nothing changed after 03:02:21Z)**.

This document records what the provider states. Nothing below was inferred from prose, and no live state was simulated. All timestamps are recorder capture times. The recorder polls every ~90 s, so a transition happened at or before the stated time.

## Evidence used

| Source | What it is |
|---|---|
| **Tonight, real.** `scratchpad/ufc-live-capture/scoreboard-*.json` | Read-only recorder output; only changed snapshots are kept. Sanitized and delta-encoded as `app/src/lib/live/fixtures/mma-live-20261010-timeline.json` (170 snapshots, ~185 KB; reproduces every raw snapshot's bout states, pinned by digest in REAL 18). It keeps status, competitors (id, winner, name, records, linescores) and play-by-play text at `post` |
| **Tonight, real.** `summary-*-404.json` | 136 summary polls, **all HTTP 404** |
| Sep 26 / Sep 19 fixtures, historical raw payloads | Earlier real captures; 1,716 historical completed bouts |

Marks: **VERIFIED_LIVE** = seen tonight (timestamp given). **FIXTURE_ONLY** = seen only earlier. **UNAVAILABLE** = not in any payload.

## Capability table

| Field | JSON path | Observed tonight | Mark |
|---|---|---|---|
| Event status | `events[].status.type` | `STATUS_SCHEDULED` at **21:01:03Z** while bout 1 was already `STATUS_PRE_FIGHT`, then `STATUS_IN_PROGRESS` by 21:07:05Z. **It reverted to `STATUS_SCHEDULED` / `pre` at 02:51:46Z and 02:56:18Z**, after the last bout went final, and reached `STATUS_FINAL` only at 03:02:21Z | **VERIFIED_LIVE, unusable.** It lags at the start and was wrong for ~10 min after the card. Never used for bout state (tests REAL 1, REAL 17) |
| Bout status | `competitions[].status.type.{state,name,detail,completed}` | Names seen: `STATUS_SCHEDULED` (pre); `STATUS_PRE_FIGHT` ("Pre-fight", in, period 0); `STATUS_FIGHTERS_WALKING` ("Walkouts", in, 0); `STATUS_FIGHTERS_INTRODUCTION` ("Intros", in, 0; main event only, 02:15:33Z); `STATUS_IN_PROGRESS` and `STATUS_IN_PROGRESS_2` ("R1, 3:47"; they **alternate within one bout**); `STATUS_END_OF_ROUND` ("End R2"); **`STATUS_END_OF_FIGHT`** (in, detail "Final", no winner; Meerschaert–Walker 23:50:35Z); `STATUS_FINAL` (post, completed) | **VERIFIED_LIVE** |
| Scheduled start | `competitions[].date` | 21:00Z ×7, 00:00Z ×5. Segment starts only: each bout went to Pre-fight when the previous one ended (21:01, 21:34, 21:51, 22:09Z …; main event 02:00:27Z) | **VERIFIED_LIVE**, segment start, not a per-bout time |
| Current round | `status.period` | `0` until the fight starts (Pre-fight, Walkouts, Intros); `1`–`5` afterwards (the main event reached R5) | **VERIFIED_LIVE**. `in` with period 0 is not a round |
| Round clock (in round) | `status.displayClock`, `status.clock` (s) | **Counts DOWN**: R1 3:47 → 2:41 → 1:09 → 0:07, then R2 4:18 (Gatto); the main event's R5 went 3:48 → 2:16. Mid-round it can be `"-"` ("R3, -", 21:31:29Z) | **VERIFIED_LIVE**. Time **remaining** |
| Clock at END_OF_ROUND / END_OF_FIGHT | same | Usually `"-"`. At a stoppage it holds the time remaining (Frye "End R1" `2:01`, final 2:59; Walker "End R2" `1:24` and END_OF_FIGHT `1:24`, final 3:35). It also appears **mid-round**: main event "End R3" `3:15` (02:30:38Z) and `2:12` (02:32:09Z), then **back to "R3, 0:08"** (02:33:40Z) | **VERIFIED_LIVE**. Never shown as a clock |
| Result (bout over) | `state:"post"`, `completed:true` | All 12 bouts, 21:34:30Z to 02:48:45Z | **VERIFIED_LIVE** |
| Winner | `competitors[].winner` against `competitors[].id` | 11 of 12 flagged **at their first FINAL**. `winner:false` is present on both sides in **every** state, so a false flag means nothing on its own. **Gatto–Kareckaite: no winner ever**, from 21:34:30Z through the end of the recording. It was an official **majority draw** | **VERIFIED_LIVE**. A FINAL with no flag is never shown as a winner |
| Draw signals | `competitors[].linescores[0].linescores[].value`, `competitors[].records[].summary` | Gatto–Kareckaite: per-judge cards **28/27/28 vs 28/29/28**. The totals 83 vs 85 must **not** be used. Records: 9-3-2 → **9-3-3** (21:37:31Z) and 6-2-1 → **6-2-2** (21:46:35Z) | **VERIFIED_LIVE**. Both signals are required; then the bout is shown as "Draw (provider-reported, unofficial)" |
| Winning method | none (no official field) | `details[].type.text` play-by-play at `post`: **"Unofficial Winner Kotko"** ×7 (the KO/TKO-type stoppages), **"Unofficial Winner Submission"** ×2 (Ribeiro, Allen), **"Unofficial Winner Decision"** ×2 (Godínez, Herbert). There is no such item for the draw. It never names the winner and has no decision type (unanimous/split) | **UNAVAILABLE as an official field.** The provider itself labels the play-by-play **unofficial**. Not read or shown. It is a candidate future label ("provider play-by-play: Submission, unofficial") only if a founder approves |
| Finish round | `status.period` at `post` | 1 ×5, 2 ×3, 3 ×3, 5 ×1 | **VERIFIED_LIVE**, provider-reported |
| Finish time | `status.displayClock` at `post` | Elapsed when correct, but **unreliable mid-round**. Stoppages: Frye 2:01 → 2:59, Ribeiro 3:11 → 1:49, Prado 0:37 → 4:23, Walker 1:25 → 3:35, Tanzilovi 2:21 → 2:39, Fili 4:38 → 0:22. **Main event 2:46 → 2:14 → 2:46** (it flip-flopped). Decisions: `"-"` first, then `5:00` (Godínez 01:27:12Z → 01:30:15Z; Herbert) | **VERIFIED_LIVE, unofficial.** A mid-round final time is **withheld** ("ended in R5; finish time not yet confirmed"). Only `5:00` is shown, as "unofficial time" |
| Judges' scores | `competitors[].linescores` | Present at FINAL for the 3 distance bouts only | **VERIFIED_LIVE**. Used only for the two-signal draw check; never to pick a winner |
| Live stats | `competitors[].statistics` | Key present, **empty in all 170 snapshots** | **UNAVAILABLE** |

## Clock semantics by phase (adapter `MMA_PHASE`)

| Phase | ESPN names | Shown as | Clock |
|---|---|---|---|
| SCHEDULED | `STATUS_SCHEDULED` | Upcoming · "Scheduled" | none |
| PRE_FIGHT / WALKOUTS / INTRODUCTIONS / PRE_START_OTHER | `STATUS_PRE_FIGHT`, `STATUS_FIGHTERS_WALKING`, `STATUS_FIGHTERS_INTRODUCTION`, any other `in` name with period 0 | Upcoming · "Pre-fight" / "Walkouts" / "Introductions" / "Before the fight" | none (no round) |
| IN_ROUND | `STATUS_IN_PROGRESS`, `STATUS_IN_PROGRESS_2` | Live · "R2 · 2:45 remaining" | **remaining** |
| ROUND_ENDED | `STATUS_END_OF_ROUND` | Live · "End of R2" | never |
| FIGHT_OVER | `STATUS_END_OF_FIGHT` | Awaiting official result · "Fight over · result coming" | never; no winner |
| IN_PLAY_OTHER | any other `in` name with a round | Live · "R2" | never (direction unknown) |
| FINAL | `STATUS_FINAL` | Awaiting official result · "ESPN reports X won (ended R3 at 5:00, unofficial time)" or "(ended in R1; finish time not yet confirmed)"; with no winner, "Final — no winner reported; awaiting official result" or "Draw (provider-reported, unofficial)" | `5:00` only |

## Replaced and cancelled bouts

- None tonight. 12 bout ids, each with one constant athlete pair, from 18:40Z to the end.
- Historically a replaced bout gets a new id and the old pairing disappears (Gall v Dumas `401923433` → Hernandez v Dumas `401924683`).
- A roster bout missing from a feed which did answer is shown as "Not in the live feed".
- An envelope attaches only when the bout id and both athlete ids match.

## Summary endpoint

`summary?event=600061541` returned **HTTP 404 on all 136 polls**, from 18:40Z to 04:54Z. The gateway never calls it.

## What the integration does

- **Gateway:** one dated scoreboard call; public only if `LIVE_PUBLIC_SPORTS` names `ufc`, and closed by default.
- **`espn-mma.mjs`:** `phase`, `clockMeaning`, the fighter's current `record` and per-judge `judgeScores` at FINAL.
- **`ufc-live.mjs`:**
  - UPCOMING / LIVE / FINAL_PROVISIONAL / FINAL_CANONICAL, as in the table above.
  - The two-signal provider draw.
  - Outcome HIT/MISS/**VOID** only from the graded ledger. VOID means a row with no winner and no hit.
  - No method and no in-fight probability.
- **Tests:** `ufc-live-real.test.mjs` (REAL 0–17) replays the whole real card deterministically.

## Open after tonight

- Compare the official results (graded ledger, next morning) with ESPN's 11 flagged winners and with the draw.
- How long after the card the graded ledger (`graded-picks.json`, 60 shown) carries tonight's rows. FINAL_CANONICAL needs that row plus a rebuild.
- Whether the post-card `STATUS_SCHEDULED` event status persists, and whether a later re-fetch changes any bout.
