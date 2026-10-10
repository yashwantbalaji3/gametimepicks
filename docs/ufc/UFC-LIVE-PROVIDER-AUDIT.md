# UFC live provider capability audit (UFC-001)

**Written:** 2026-10-10, between 18:40Z and 19:10Z. That is before tonight's card started: prelims begin at 21:00Z and the main card at 00:00Z.
**Card:** UFC Fight Night: Allen vs. Duncan. ESPN event `600061541`, 12 bouts, Meta APEX.
**Provider:** ESPN's public MMA endpoints. No key is needed.
- Scoreboard: `site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20261010&limit=1000`
- Summary: `.../mma/ufc/summary?event=600061541`

This document records what the provider states. It does not record what we would like it to state. No field below was inferred from prose, and no live state was simulated.

## Evidence used

| Source | What it is | State it shows |
|---|---|---|
| **Tonight, real.** `scoreboard-20261010T184020Z.json` (recorder) | The full scoreboard for tonight's card, captured 18:40:20Z. Sanitized copy: `app/src/lib/live/fixtures/mma-scoreboard-20261010-pre.json` | Every bout is scheduled (`pre`) |
| **Tonight, real.** `summary-20261010T18{4020,4452,4622,4753}Z-404.json` and `summary-20261010T185700Z-404.json` | The summary endpoint for event 600061541 | HTTP **404** every time |
| Fixture `mma-scoreboard-pre.json` | Sep 26 card, 20:20Z | scheduled |
| Fixture `mma-scoreboard-live.json` | Sep 26, same bout (401914472) as the next two | `in` · `STATUS_PRE_FIGHT` · period 0 · clock `-` |
| Fixture `mma-scoreboard-inround.json` | Sep 26, same bout | `in` · `STATUS_END_OF_ROUND` · "End R1" · period 1 · `3:58` |
| Fixture `mma-scoreboard-settled.json` | Sep 26, same bout | `post` · `STATUS_FINAL` · period 1 · `1:02` · winner flag set |
| Fixture `mma-scoreboard-final.json` | UFC 331 (Sep 19), a completed card | `post`, 3 bouts |
| Historical raw scoreboards: `data/internal/research/ufc/raw/espn-2023-08 … 2026-08.json` | Full, unsanitized payloads. 1,716 completed bouts | `post` only |

The recorder kept capturing after this was written. It stores only snapshots that changed. As of 18:57Z it held one scoreboard, from 18:40Z, and every bout in it was still `pre`.

## Status marks

- **VERIFIED_LIVE**: seen in tonight's real recordings. The table says which state it was seen in. Before the card starts, that can only be the pre-card state.
- **FIXTURE_ONLY**: seen only in the committed fixtures (real captures from earlier cards) or in the historical raw payloads. Not yet seen tonight.
- **UNAVAILABLE**: not present in any payload we examined.

## Capability table

| Field | JSON path | Observed values | Mark |
|---|---|---|---|
| Event status | `events[].status.type.{name,state,detail}` | Tonight: `STATUS_SCHEDULED` / `pre` / "Scheduled". Fixtures: `STATUS_IN_PROGRESS` / `in`, and `STATUS_FINAL` / `post` | **VERIFIED_LIVE** (pre only). In-progress and final states are FIXTURE_ONLY |
| Bout status | `events[].competitions[].status.type.{state,name,detail,completed}` | Tonight: all 12 `pre` / `STATUS_SCHEDULED`. Fixtures: `in` + `STATUS_PRE_FIGHT` ("Pre-fight", period 0), `in` + `STATUS_END_OF_ROUND` ("End R1"), `post` + `STATUS_FINAL` ("Final"). `STATUS_FIGHTERS_WALKING` ("Walkouts", period 0) is recorded in the `espn-mma.mjs` header from 2026-09-26 21:10Z but is not in any fixture | **VERIFIED_LIVE** (pre only). `in` and `post` are FIXTURE_ONLY |
| Scheduled start | `competitions[].date` (also `startDate`, `timeValid`) | Tonight: `2026-10-10T21:00Z` ×7 and `2026-10-11T00:00Z` ×5, with `timeValid: true`. These match `card-latest.json` | **VERIFIED_LIVE**. Note that this is the start time of the bout's **card segment**: every prelim reads 21:00Z. It is not a per-bout walkout time |
| Current round | `competitions[].status.period` | Tonight: `0` on every bout. Fixtures: `0` during pre-fight, `1` in round 1 | **FIXTURE_ONLY**. Period 0 means "not begun" (state `in` + period 0 is a walkout), so the adapter maps it to null, never "R0" |
| Round clock | `status.displayClock`, `status.clock` (seconds) | Tonight: `"-"` and `0.0`. Fixture in a round: `"3:58"` at "End R1". Historical finals: `clock` (seconds) equals `displayClock` read as **time elapsed in the round**, in 1,716 of 1,716 bouts (e.g. `300.0` = `"5:00"`) | **FIXTURE_ONLY**. Whether the clock counts **up or down while a round is running** has not been verified; that needs tonight's in-round captures. `"-"` maps to null |
| Result (bout over) | `status.type.state == "post"`, `completed: true`, `detail: "Final"` | Fixtures and 1,716 historical bouts | **FIXTURE_ONLY**. The event-level status lags behind the bouts: the settled fixture shows the event still `in` while a bout is `post` |
| Winner | `competitions[].competitors[].winner` against `competitors[].id` (the ESPN athlete id; **not** `athlete.id`) | Fixture: Jauregui (5063403) `winner: true`. Before the card, `winner` is `false` on both corners, which is a default and not a result. In 25 of the 1,716 historical finals neither corner is flagged (draws, no contests, or gaps) | **FIXTURE_ONLY** |
| Winning method | none | There is no KO/TKO/SUB/DEC field. `details`, `notes` and `situation` are absent. The summary returns 404 for this event | **UNAVAILABLE**. One proxy exists but is **not** used: judges' scorecards in `competitors[].linescores` appear on 825 of 826 historical bouts that went the distance and on 8 of 890 that ended early. That is evidence about decisions only, not a method field |
| Official finish round | `status.period` once the bout is `post` | Fixture `1`. UFC 331 fixture `1`, `1`, `3` | **FIXTURE_ONLY**, and provider-reported only. It is "official" only once the settlement owner records it |
| Official finish time | `status.displayClock` once `post` (`status.clock` holds the same value in seconds) | Fixture `"1:02"`. UFC 331 `"1:57"`, `"3:22"`, `"5:00"` | **FIXTURE_ONLY**. Elapsed time in the final round; same caveat as above |
| Live stats (strikes, takedowns, control) | `competitors[].statistics` | Absent tonight. Empty or absent on all 3,432 historical competitor entries. Tonight's `playByPlayAvailable` is `false`, and the summary returns 404 | **UNAVAILABLE** |

## Replaced and cancelled bouts

- **No cancelled or postponed state has ever been observed** on the MMA scoreboard. The adapter maps `*CANCELED*` and `*POSTPONED*` names defensively, but no payload has carried one.
- **A replaced bout gets a new competition id, and the old pairing disappears.** Example from 2026-09-26: Gall v Dumas was id `401923433` in the frozen snapshots from 09-22 to 09-24. The final pre-card snapshot instead holds Hernandez v Dumas with id **`401924683`** (roadmap U4). So, while the card is live:
  - a roster bout that is missing from a feed which did answer is shown as **"Not in the live feed"**, never as "cancelled";
  - an envelope is attached to a bout only when the bout id **and** both ESPN athlete ids match the card (`envelopeMatchesBout`). A changed pairing therefore never inherits our pick.
- Tonight's card and feed agree: 12 of 12 bout ids and 24 of 24 athlete ids match (test UFC-RO 3).

## Summary endpoint

`summary?event=600061541` returned **HTTP 404** in every capture so far (18:40Z, 18:44Z, 18:46Z, 18:47Z, 18:57Z), with the body `{"code":404,"message":"Error invoking GET: http://sports.core.api.espn.pvt/v2/sports/mma/leagues/ufc/events/600061541/competitions/600061541/status, status=404 …"}`. The provider's internal lookup uses the **card** id as a competition id, which does not exist.

We have not tested whether a summary request for a **bout** id would work, because the recorder does not request one and no extra polling was started. The gateway does not call the summary for UFC.

## What the integration does with this

- **Gateway:** UFC makes one dated scoreboard call per card date. It never calls the summary. UFC is public only if `LIVE_PUBLIC_SPORTS` names it, and it is closed by default.
- **Contract (`app/src/lib/live/ufc-live.mjs`):**
  - **UPCOMING:** pre, walkouts, absent, or unknown.
  - **LIVE:** the round and clock are shown only as the provider states them.
  - **FINAL_PROVISIONAL:** the provider's `post`. The winner is shown as "reported", and the pick is not graded.
  - **FINAL_CANONICAL:** only from a graded-ledger row for this pick.
  - The method is always "not reported by the live feed". No in-fight probability exists anywhere.

## To be completed from tonight's recordings after the card

*Placeholder. Fill this in from `scratchpad/ufc-live-capture/` once the card is over. Do not fill it in from memory.*

- [ ] First scoreboard in which a prelim bout leaves `pre`: its `status.type.name`, `period` and `displayClock`. Was the walkout state `STATUS_PRE_FIGHT` or `STATUS_FIGHTERS_WALKING`?
- [ ] An in-round capture: does `displayClock` count up (elapsed) or down (remaining)? Is `status.clock` consistent with it?
- [ ] The between-rounds state name and detail (`STATUS_END_OF_ROUND`, "End R1"?), and which clock value it carries.
- [ ] How quickly bouts flip to `post`, measured as recorder timestamp minus the real finish. The recorder polls every 90 s, so this is an upper bound.
- [ ] For every bout, `winner` at `post` compared with the official result (the graded ledger tomorrow). Any disagreement, and any `post` without a winner.
- [ ] Finish round and time at `post` compared with the official record.
- [ ] Event-level status lag: when the event-level status reached `post`, compared with the last bout.
- [ ] Whether any bout disappeared, changed id or changed athlete ids during the card.
- [ ] Whether `linescores`, `statistics`, `details` or `notes` appeared on any capture while the card was live.
- [ ] Whether the summary ever stopped returning 404.
- [ ] Update the marks above from FIXTURE_ONLY to VERIFIED_LIVE only for the fields actually observed.
