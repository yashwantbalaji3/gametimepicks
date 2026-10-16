# Live Hub acceptance report — SEA @ DEN · ESPN 401872995 · Thu 2026-10-15 8:15 PM ET

**Result:** DEN 17, SEA 14 (overtime). The ESPN final was observed at 03:38Z.
**Report stage:** final (2026-10-16 afternoon ET). Game phase complete; **settlement (check 9) PASS**, on evidence gathered after the capture stopped (see "Capture coverage").
**Method:** read-only capture (`~/gtp-evidence/live-v2-401872995/captures/`, a pass every 5 min from 23:15Z, every 30 min from 05:00Z). Analysis used:
- the V2 replay (#1108);
- `acceptance-eval.py` and screenshot review;
- the generalized kit's `report.mjs` (#1082, Sunday kit);
- `origin/main` history, GitHub Production deployment records, and one read each of Production's `build-info.json`, `live-props/401872995.json` and the game page at 20:12Z.

The capture process and its evidence were never modified.
**Live Hub V2 stays unpublished.** This game is one of the windows the promotion rule requires. The others are NFL Sunday 10/18 and one MLB postseason game.

## Totals (whole capture, 23:15:16Z → 13:09:58Z)
- **83 passes**:
  - 80 passes made 480 requests, all **HTTP 200 with a body, 0 bot-challenged**;
  - 3 passes (18 requests) got **no response from any host, ESPN included**. That was local connectivity loss, not a site failure (see "Capture coverage").
- **156 screenshots** at 390 and 1440 px: 144 ok, with **0 horizontal overflow and 0 broken images**. All 12 failures were in the 3 offline passes (`ERR_INTERNET_DISCONNECTED`).

**V2 replay of every game-phase gateway envelope against ESPN's summary:**
- **0 disagreements, 0 lags**;
- 0 gateway refusals;
- 0 passes without usable ESPN truth;
- 3 clock-drift passes, informational: the gateway caches, and ESPN is fetched at a different moment;
- 1 pass where ESPN's summary omitted period and clock mid-OT, so the period was unverified.

## Checks
| # | Check | Evidence | Verdict |
|---|---|---|---|
| 1 | Forecast frozen before kickoff | The forecast fingerprint, board hash and receipt set were identical on **every one of the 68 responsive passes at or after kickoff**. There were 4 pre-kickoff revisions, the last at 00:09Z, and no receipt added after kickoff. The game page reads "Forecast frozen at Oct 15, 8:09 PM ET". The forecast left `forecasts/latest.json` at 13:58:07Z, after the capture ended. That roll-off is expected and changes no value: the board hash is still `7e273159…` on main | **PASS** |
| 2 | Kickoff transition | Pass 00:12:07Z: PRE / scheduled. Pass 00:17:11Z: gateway LIVE Q1 14:56, ESPN IN_PROGRESS Q1 14:56. No "Live" before ESPN. The 5-min pass interval bounds the transition to ≤ 5 min, so ≤ 120 s cannot be shown at this resolution | **PASS** (5-min resolution) |
| 3 | Score | Every in-play pass matched ESPN (0 score disagreements); no score shown pregame | **PASS** |
| 4 | Quarter / clock | Quarter matched on every verified pass. "Halftime", "End of 4th" and "7:58 - OT" passed through, and the final shows "Final/OT" with no clock | **PASS** |
| 5 | Live player stats | ⚠ **Capture-kit bug:** the kit requested `players=true`, but the gateway enables stats only for `players=1` (what the client sends), so the recorded envelopes hold no `playerStats`. Fixed for Sunday (#1082 `96ccf62ebb`). Screenshot values matched ESPN's box at 01:34Z (Smith-Njigba 11, Harvey 31, Waddle 15) and at the final (134 / 31 / 24). Rows showed "—" before a first measurement and a recorded 0 as 0 (Wilson: 0 rec on 1 target) | **PASS on screenshots**; envelope level **NOT OBSERVED** |
| 6 | Frozen vs observed | Each row shows the GTP pregame value beside the live/final value; frozen values unchanged (check 1) | **PASS** |
| 7 | Feed delay / recovery | No delay occurred ("Updated 4s ago" mid-game) | **NOT OBSERVED** (V2 delayed/stale line added in #1111; production bands in `freshness.mjs`) |
| 8 | Provisional final | /live at 03:38Z: "FINAL — GRADING PENDING", chip "Final · grading pending", 14–17, no period line, no WIN/LOSS. The TD row reads "Final status not measured · grading pending" | **PASS** |
| 9 | Canonical settlement | Player-prop settlement final **CANONICAL** on main from `3122bf3f3c` (17:07:59Z). **First served by Production 2026-10-16T17:12:52Z** (deployment 7125037355, READY ±60 s); the provisional record was served from **14:03:50Z** (7120952913, `af35921ef8`). 56/56 rows agree with ESPN's final box; 10 no-measurement rows carry no value; nothing pending is counted. Details below | **PASS** (post-capture evidence; the capture itself did not observe it) |
| 10 | Pregame immutability | No receipt revision at or after kickoff; frozen at 8:09 PM ET; the frozen block of all 56 settled rows is unchanged from the board | **PASS** |
| 11 | Mobile | 72 shots at 390 px (game phase 36): overflow 0, chip and score visible on the card | **PASS** (44 px links pinned in code, not measured from the capture) |
| 12 | Unsupported sports | /live reads "Live tracking: NFL and MLB. NBA, Premier League and UFC are not tracked live yet" | **PASS** |
| 13–15 | Poll cadence / freshness bands / aria-live | Client-side behaviour that server-side captures cannot see. The V2 board has no `aria-live` (reviewed) | **NOT OBSERVED** |
| 16–18 | Rails / over-under / touchdowns | Rails show the line, the GTP value and a live marker. Anytime TD reads "Not tracked live · settled from the official box score" while ESPN already had a Dobbins TD | 16, 18 **PASS**; 17 **NOT OBSERVED** (no under rows featured) |
| 19–21 | Provider failure | 0 refusals all game, so no outage occurred | **NOT OBSERVED** (fixture tests only) |
| 22–23 | Desktop/mobile parity, layout | Same pass, same data; 0 overflow at both widths | **PASS** (visual spot-check) |

## Check 9 — settlement, in detail

### Which record settles this game
The kit's original watch read `data/internal/nfl/settlement/<date>.json`. That file is the **market paper record**, which grades the pinned pre-start market consensus. It lists SEA @ DEN as `pending: NO_TARGETS` and will never settle it (see "Why NO_TARGETS"). The record that settles this game's published predictions is the **player-prop settlement**. It has two artifacts:
- `data/internal/nfl/prop-settlement/2026-10-15.json` (the ledger);
- `app/public/data/nfl/live-props/401872995.json` (the public live/final artifact).

### Timeline (UTC, 2026-10-16)
| When | What | Evidence |
|---|---|---|
| 03:38Z | ESPN final, 17–14 OT | Capture pass 03:38:08Z |
| 13:09:58Z | Last capture pass; settlement not yet on main | `captures.jsonl` |
| 13:56Z | First `nfl-event-window` run after the final (run 38911734982, an automated dispatch). Its post-final sweep reads the final box score | Actions run |
| 13:57:16Z | Every row settled **PROVISIONAL**: `finalFirstObservedAt` | ledger `settledAt`, live-props |
| 13:58:10Z | `af35921ef8` committed: ledger + live-props (phase FINAL, finality PROVISIONAL) | `git log` |
| **14:03:50Z** | **Provisional record served**: Production deployment 7120952913 (sha `af35921ef8`) success. The 5 other deployments created that second are older commits and went `inactive` | GitHub Deployments API |
| 16:57:16Z | 3-hour reconciliation window closes (`RECONCILIATION_WINDOW_MS`, `live-prop-state.mjs`) | code |
| 17:05Z | Scheduled `nfl-event-window` run (38937035149). Its promotion sweep moves `finality` to CANONICAL; nothing else changes | Actions run |
| 17:07:59Z | `3122bf3f3c` committed: 56/56 rows CANONICAL | `git log` |
| **17:12:52Z** | **Canonical record served**: Production deployment 7125037355 (sha `3122bf3f3c`) success | GitHub Deployments API |
| 20:12:21Z | One Production read: build `d6de0ceb47` serves `live-props/401872995.json` with phase FINAL, finality CANONICAL and 46 SETTLED / 10 NO_MEASUREMENT | single request, HTTP 200, no mitigation |

**How "served" is determined:** a deployment serves a commit when `git merge-base --is-ancestor <commit> <deployment sha>` holds and its status is success. GitHub stamps can be off by up to ±60 s against Vercel's own READY time. `docs/live/capture/git-watch.mjs` reproduces both served times mechanically, and the kit's self-test pins them.

The final reached Production **13 h 35 min after the ESPN final**. Two causes, neither a defect:
1. The free in-game producer is not scheduled. `nfl-live-props.yml` is *disabled_manually*, and `nfl-live-props-free.yml` is dispatch-only and last ran 2026-10-02. As a result, **no live-props artifact existed on main during the game**, and the in-game player values on the page came from the gateway.
2. The post-final sweep runs only in `nfl-event-window`, and the first such run after the final was at 13:56Z. Expect the same shape on Sunday.

### Reconciliation against the official result
- **Score:** main's `results/latest.json` row reads 401872995 SEA @ DEN, `STATUS_FINAL`, home DEN **17**, away SEA **14** (captured 13:55:23Z). That equals ESPN's final (`Final/OT`, DEN 17 / SEA 14) in the last captured summary (13:09:58Z).
- **Player props:** every one of the **56 ledger rows** was re-derived from that summary with the producer's own `statFor`, and **56/56 agree** (46 observed values; 10 rows absent from the box score on both sides).
  - The public live-props artifact matches the ledger row for row (56/56 same final value and state).
  - The copy Production served at 20:12Z matches too.
- **Unavailable is never 0:** the 10 `NO_MEASUREMENT` rows have `finalStat: null`, `lineResult: null`, `forecastResult: null` and `bookRuleUnknown: true`, in both the ledger and live-props:
  - Coleman: rush yds, receptions, TD;
  - Holani: rec yds, receptions;
  - Badie: receptions;
  - Humphrey: rec yds, receptions, TD;
  - Stidham: TD.

  The 15 observed zeros are real box-score zeros, e.g. Wilson 0 rec / 0 yds on 1 target, and 13 anytime-TD "NO".
- **Pending is never a loss:** the ledger holds no PENDING row (`TERMINAL_STATES` = SETTLED, NO_MEASUREMENT). The market record keeps the event in `pending` with `losses: 0`, `decisive: 0` and the note "pending is never a loss".
- **Why `decided = 0` and `forecastWins = 0`:** there was nothing to decide.
  - **No sportsbook line was frozen for any row:** every row's `frozen.market` is null and `pricingState` is NOT_PROBED, and the board's `marketCoverage` reads `probed: false, priced: 0`. The odds lane has been refused since 2026-10-11 (see below).
  - A yardage or reception row is graded WIN/LOSS only against a frozen line, so `lineResult` and `forecastResult` are null.
  - Anytime TD is one-sided: `lineResult` is the fact (3 YES, 13 NO) and `forecastResult` is `NOT_APPLICABLE` (16 rows). That is the settler's rule (`settle()` in `live-prop-state.mjs`), not a gap.
  - So the counts read 46 observed, 10 no-measurement, 16 not applicable, 0 decided. **Nothing here is a model-performance claim.**

### Why NO_TARGETS
**Root cause:** the Program 171 odds-credit ceiling.
- The ledger `data/internal/research/odds/nfl/p171-ledger.json` reached **1,160 of the 1,160 authorized credits at 2026-10-11T11:41:55Z**, with the last four 5-credit prop probes of the week-5 sweep.
- Since then every `nfl-event-window` odds step refuses before calling. Run 38824201244 at 23:34Z read: "REFUSED: cumulative 1160 + worst-case 3 would cross the 1160-credit Program 171 ceiling".
- `public/data/nfl/markets/latest.json` was therefore last captured 2026-10-11T11:41:55Z (77 rows, none for week 6).
- `run-nfl-event-window.mjs` found no market row for 401872995, so it set `families.market` to `NO_MARKET`, "no authorized capture row joined this event", and `settlementTargets: null`.
- `settle-nfl-current.mjs:67` then files the event as `pending: NO_TARGETS`.

**Compare TB @ DAL (2026-10-08):**
- that artifact joined a market row captured 2026-10-08T22:17:03Z, before the ceiling, so it carried targets and settled at 2026-10-09T16:08:16Z (3 market legs, all LOSS);
- every week-6 event, including all Sunday 10/18 games, is `NO_TARGETS`/`PRE_KICKOFF` for the same reason.

**Classification: expected, fail-closed behaviour.** This is not a code defect, and stale odds were not refused: there is no week-6 row at all. The receipt (`docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md`) says this refusal is "a DECISION OWED to the founder, not a broken job". Two side effects deserve a note, neither changing data:
1. **Misleading lineage stamp (minor code defect).** For a `NO_MARKET` event, `run-nfl-event-window.mjs` writes `evidence.odds.asOf = publicMarkets.capturedAt` (2026-10-11T11:41:55Z). A reader can take that as "odds evidence from Oct 11" for an event that had none.
   - Suggested fix: when no row joined, write `odds: { asOf: null, documentCapturedAt: publicMarkets.capturedAt, joined: false }`, or `odds: null`.
   - The contract validator ignores a null stamp, so this is safe. A guard test should assert that a NO_MARKET artifact never carries a non-null `evidence.odds.asOf`.
2. **Red runs.** Every scheduled `nfl-event-window` run since 10-11 concludes *failure*, because the refused odds step exits non-zero, even though the later steps (artifacts, settlement, commits) succeed. The run status hides real failures.
   - Suggested fix: treat a ceiling refusal as a typed skip with a warning annotation, and keep a non-zero exit for real errors.

## Capture coverage — honest accounting
- **Planned:** Phase A every 5 min, 23:15Z → 05:00Z; Phase B every 30 min until settled-and-served, at the latest 2026-10-17T02:00Z.
- **Phase A:** 67 passes, complete, no gap.
- **Phase B:** 16 passes, 05:00:39Z → 13:09:58Z.
  - Two passes ran late: 09:03 → 09:42Z (39 min) and 12:13 → 13:09Z (57 min). Consistent with the host sleeping or stalling; within the report's gap tolerance.
- **Network interruption:** passes at 10:12:45Z, 10:42:47Z and 11:12:49Z recorded no response from **any** host, ESPN included. That is local connectivity loss, not a site failure. The capture recovered at 11:42:52Z.
  - **Kit bug:** those 18 request lines are **invalid JSON** (`"http":000`, unquoted with leading zeros). Fixed in the Sunday kit: `http` is always a number, with an `error` field. `report.mjs` now repairs and lists such lines.
  - All of this was in Phase B (post-game), so **no in-game observation was lost**.
- **Capture stopped at 13:09:58Z.** That is 12 h 50 min before its planned settle-watch end, and before either settlement commit. There is no `finished` line: the process was ended when the previous session's background tasks were stopped.
  - The kit now writes a `stopped` line on TERM/INT/HUP, so an interrupted run can be told apart from one still running.
  - Check 9 therefore rests on git, the GitHub deployment records and one Production read, not on a capture pass. **Settlement served** is evidenced; **the served page's rendering of it is NOT OBSERVED** (no screenshot after 13:09Z).
- **Legacy watch blind spot:** even had it kept running, the old watch read only the market paper record (NO_TARGETS forever). It would have run to 02:00Z without seeing the prop settlement. Fixed: the Sunday kit watches the live-props finality and the prop ledger, and confirms serving by build-info and by GitHub Production deployments.

## Findings
1. **Capture kit `players=true`** (check 5): fixed on #1082 for Sunday.
2. **Replay tool:** an ESPN summary can omit period and clock mid-play. This is now classed as unverified, not a disagreement (#1108).
3. **Cosmetic:** the game page's live panel eyebrow reads "LIVE NOW" above a "Final/OT" score. The static HTML served at 20:12Z still carries "Live now · Checking the live feed…" in that panel. It belongs with the deferred L5 item (badge vocabulary after final) and is a post-capture fix candidate.
4. **Capture kit settlement watch** read the wrong record and wrote invalid JSON for failed requests. Both are fixed in the Sunday kit (`docs/live/capture/`, self-test `kit.test.mjs`).
5. **No in-game live-props artifact:** the scheduled producer is disabled, so in-game player values come only from the gateway, and settlement waits for the next `nfl-event-window` run. Whether to schedule the free producer on game days is an owner decision; it is a workflow change, not made here.
6. **NO_TARGETS for all of week 6:** caused by the odds credit ceiling, a decision owed. There is also one minor lineage-stamp defect and the red-run noise, with fixes described above but not applied.

## Next
- **Sunday 10/18 NFL window:** second capture with the generalized kit. See `docs/live/LIVE_V2_SUNDAY_1018_PLAN.md`.
- **Optional, real browser, one visit:** confirm that the SEA @ DEN game page, /live and Results render the canonical final consistently. The data behind all three is verified above; the rendering after 13:09Z was not captured.
