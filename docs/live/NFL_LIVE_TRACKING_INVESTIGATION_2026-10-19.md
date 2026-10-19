# NFL live tracking: Sunday 2026-10-18 investigation (read-only)

Written 2026-10-19 at about 02:00Z. Sources: `gh api` run, job and log reads; `git show origin/main:…`; the capture report `docs/live/evidence/SUNDAY_2026-10-18_CAPTURE_REPORT.md`. No dispatches, no writes, no paid calls. All times are UTC.

## 1. Why `nfl-live-props` is disabled

- **State and time:** `disabled_manually`, with workflow `updated_at` 2026-09-27T17:30:06Z (workflow id 367341628).
- **Why:** its one scheduled run, `36336729861` at 17:23:03Z, made the Phase H live-odds probe. The provider charged **3 Odds API credits**, then the script crashed on `ReferenceError: matchEvent` before writing the ledger, so the spend went unrecorded. With that entry missing, the guard limiting the probe to one call never tripped, so every 15-minute slot would have charged again.
- **Who approved it:** the incident doc `docs/incidents/2026-09-27-phase-h-unledgered-charge.md` (commit `88f71a3dfb`) records "disabled manually (founder-approved) at 2026-09-27T17:30Z".
- **Who clicked it:** the GitHub API does not record which account disabled the workflow; the only evidence is that doc.
- **Standing rule:** `docs/ENGINEERING_START_HERE.md:163` and `docs/INCIDENT_AND_ROLLBACK_RUNBOOK.md:111` say "Do not re-enable without founder authorization."
- **Phase H itself is stuck,** per the 10-02 handoff: the probe reports ALREADY PROBED and the pilot NOT STARTED, so it needs a new authorization.
- **`nfl-live-props-free`** (PR #740, `00bdab4056`, 2026-09-27) is the same `capture-live-props.mjs`, but:
  - it has **no schedule** and names no secret;
  - it is `workflow_dispatch` only. Its header says this is deliberate: "a scheduled trigger here would recreate the cadence that was just stopped".
- **Runs:** only 3 ever, all manual: `36341172699` (09-27), `36946287040` and `36948483980` (10-02). **None ran on Sunday 10-18.**
- **Result:** no in-game producer runs on any cadence. The live-props artifact is written only by the `--post-final` step inside `nfl-event-window`.

## 2. Causal verdict for NO@NYG (401873000)

**Verdict: indirectly yes, directly no.**
- **Indirectly:** with both producers off, the only path to a live-props artifact is `nfl-event-window`'s post-final step. That step only runs when something dispatches `nfl-event-window` for **pregame** reasons, or when one of its four daily crons arrives.
- **Direct cause:** a 2h40m hole in `nfl-event-window` runs (19:55:04Z → 22:35:03Z), combined with the post-final age gate. Concurrency was not a factor, and no trigger was dropped.

How it happened:
1. **Age gate.** `selectPostFinalTargets` only targets games kicked off at least 3.5h ago (`POST_FINAL_MIN_AGE_MS`, `app/src/lib/sports/nfl/live-prop-state.mjs:586`). For NO@NYG (kickoff 17:00Z) that is 20:30Z.
   - The 19:53 run (`39160783742`) correctly skipped it; the game was still LIVE until the capture saw FINAL at 20:27:29Z.
2. **No run between 20:30Z and 22:35Z.** Both dispatchers' decision rules are pregame-only:
   - `nfl-kickoff-refresh` **held** with `NO_KICKOFF_SOON` at 21:12 (`39166814879`), 21:13 (`39166861048`) and 22:03 (`39170555537`). The 4 PM block had kicked off, and SNF (DAL@GB, 00:20Z) was more than 120 minutes away.
   - `nfl-pregame-free-refresh` `39166814737` (started 21:12:44Z) logged `WAIT_THEN_DISPATCH ROSTER`. It slept until T−105 for SNF and dispatched at **22:35:01Z**.
3. **That SNF ROSTER dispatch** (`39172867233`, skip_odds) ran post-final as a side effect and wrote NO@NYG's provisional final. That is commit `4aae3effb2` at 22:36:59Z, with `finalFirstObservedAt` 22:36:09Z.
4. **Scheduled delivery was late, not dropped.**
   - All four Sunday `nfl-event-window` crons arrived: `0 13`→16:20:53 (+3h21m), `30 14`→17:29:07 (+2h59m), `0 15`→17:56:33 (+2h57m), `0 21`→22:47:20 (+1h47m).
   - Had the 21:00Z slot been on time, NO@NYG would have been provisional at about 21:02Z.
   - `publication-watchdog`, the tick both dispatchers ride, also had gaps: 19:51→21:11 (80 minutes) and 22:40→23:55 (75 minutes).
   - Other crons the same day:
     - `nfl-kickoff-refresh`: 5 scheduled deliveries for 28 Sunday slots.
     - `mlb-lineup-refresh`: first delivery 18:13Z, against 15:30Z–17:30Z slots. This is the same drop pattern PR #1131 documents.
5. **Concurrency was not a factor.**
   - The `gtp-generated-artifacts` writers in the hole were short and none blocked anything: mlb-lineup-refresh 20:57–20:58, 21:37–21:38 and 22:29–22:30; auto-refresh 22:17–22:19.
   - No `nfl-event-window` run was created in the hole, so nothing could queue.
6. **The red runs had no effect on settlement.**
   - 15 of the 18 `nfl-event-window` runs between 16:00Z and 23:59Z concluded `failure`. In every one, the only failed step was the receipt-gated odds capture. The 3 inspected logs show `REFUSED: cumulative 1160 + worst-case 3 would cross the 1160-credit Program 171 ceiling`, so **no credits were spent**.
   - Settlement and publish succeeded in all 18 runs.

### Every relevant run, Sunday 16:00Z–23:59Z (start≈created; end = updated_at)

`nfl-event-window`. Odds step: **R** = refused at the credit ceiling, **S** = skipped (skip_odds). Each row gives created→ended, then trigger · run id · odds · post-final effect.
- 16:02:21→16:04:26 · dispatch (kickoff-refresh) · 39143179731 · R
- 16:20:53→16:22:41 · cron 0 13 · 39144583213 · R
- 16:24:00→16:25:54 · dispatch · 39144817043 · R
- 16:48:14→16:50:09 · dispatch · 39146668188 · R
- 17:29:07→17:31:02 · cron 30 14 · 39149790773 · R · HOU@JAX provisional `514e307ff5`
- 17:56:33→17:58:21 · cron 0 15 · 39151870314 · R · HOU@JAX re-read (window open)
- 18:17:10→18:19:03 · dispatch · 39153459036 · R · re-read
- 18:26:42→18:28:40 · dispatch · 39154177722 · R · re-read
- 18:46:38→18:48:27 · dispatch · 39155711219 · R · re-read
- 19:04:59→19:06:42 · dispatch · 39157112604 · R · re-read
- 19:30:03→19:31:56 · dispatch (pregame-free) · 39159037761 · S · re-read
- 19:53:07→19:55:04 · dispatch (kickoff-refresh) · 39160783742 · R · NO@NYG not yet eligible
- **gap: 2h40m with no run**
- 22:35:03→22:37:07 · dispatch (pregame-free, SNF ROSTER) · 39172867233 · S · **HOU@JAX CANONICAL + NO@NYG provisional, `4aae3effb2`**
- 22:42:28→22:44:30 · dispatch (kickoff-refresh) · 39173401812 · R · NO@NYG re-read
- 22:47:20→22:49:10 · cron 0 21 · 39173746209 · R · re-read
- 23:25:03→23:26:48 · dispatch (pregame-free, INACTIVES) · 39176424219 · S · re-read
- 23:28:00→23:30:07 · dispatch (kickoff-refresh) · 39176630424 · R · re-read
- 23:57:55→23:59:26 · dispatch (kickoff-refresh) · 39178662681 · R · **BUF@LV provisional `c5baca5693`**

Dispatcher decisions after the 1 PM block:
- `nfl-kickoff-refresh` DISPATCH at 19:52, 22:41 and 23:56 (`STALE_BEFORE_KICKOFF`); HOLD at 21:12, 21:13 and 22:03.
- `nfl-pregame-free-refresh` run 39166814737: WAIT 21:25 → DISPATCH 22:35 → WAIT 22:37 → DISPATCH 23:25 → ALREADY_REFRESHED 23:27.
- The other `nfl-pregame-free-refresh` runs that day ended `cancelled`, superseded in their own concurrency group.

## 3. Lifecycle: provider feed → live stats → final → reconciliation → canonical

| Step | Owner (script / workflow) | Trigger | Design latency |
|---|---|---|---|
| Provider feed | ESPN public scoreboard/summary (free) | request or run time | n/a |
| In-game facts (score, clock, 3 stat families) | `app/api/live.mjs` gateway + `lib/live/gateway-live-rows.mjs` | page request | ≤45s fresh / ≤120s delayed (`lib/live/freshness.mjs`) |
| In-game producer artifact `live-props/<id>.json` | `capture-live-props.mjs` (live window 8h) via `nfl-live-props` (**disabled**) or `-free` (**dispatch-only**) | none active | **not produced** |
| Final → PROVISIONAL settlement | `capture-live-props.mjs --post-final` in `nfl-event-window` "Settle…" step | any `nfl-event-window` run, kickoff ≥3.5h ago | max(final, kickoff+3.5h) + wait for the next run |
| Reconciliation window | `finalityAt` / `RECONCILIATION_WINDOW_MS` = 3h (`live-prop-state.mjs:494`) | re-reads on every run while open | 3h from **`finalFirstObservedAt`** (our first read, not ESPN's final) |
| PROVISIONAL → CANONICAL | `promoteFinality` sweep, first thing in each `--post-final` call (fetch-free) | first `nfl-event-window` run after closure | closure + wait for the next run |
| Ledger fold | `settle-nfl-live-props.mjs --write` (same step) | same run | same run |
| Market paper record | `settle-nfl-current.mjs` (needs official result via `sport-schedules` 13:00Z) | daily `nfl-event-window` | next morning (`AWAITING_OFFICIAL_RESULT` all three) |

Observed on Sunday. Times are first commit on main (capture first-seen and Production served: 5–11 min later).

| Game | Kickoff | FINAL first seen | Eligible (K+3.5h) | Provisional | Δ from final | Window closes | Canonical |
|---|---|---|---|---|---|---|---|
| HOU@JAX 401872996 | 13:30 | 16:49:35 | 17:00 | 17:30:55 (`514e307ff5`) | +41m | 20:30:06 | 22:36:59 (`4aae3effb2`), +2h07m after closure, +5h47m after final |
| NO@NYG 401873000 | 17:00 | 20:27:29 | 20:30 | 22:36:59 (`4aae3effb2`) | **+2h10m** | 10-19 01:36:09 | pending |
| BUF@LV 401873005 | 20:25 | 23:34:25 | 23:55 | 23:59:17 (`c5baca5693`) | +25m | 10-19 02:58:34 | pending |

**Why canonical is pending.**
- **The rule:** promotion needs `now − finalFirstObservedAt ≥ 3h` **and** a `--post-final` invocation after that instant. On main right now, both artifacts read `finality: PROVISIONAL`.
- **No run since:** the last `nfl-event-window` run was 23:57:55Z, and no workflow other than `nfl-event-window` calls the sweep.
- **A comment overstates coverage:** the `capture-live-props.mjs` comment saying `nfl-event-window` calls `--promote-only` daily is stale; nothing passes that flag. The `--post-final` call does promote first, though, so the behaviour is the same.
- **Expected landing:** the first `nfl-event-window` run on Monday 10-19, from any trigger.
  - Slots `30 14` and `0 15` arrived about 3h late on Sunday, so the likely landing is **about 17:30–18:00Z**, then Production about 5 minutes later.
  - Fallbacks: the `0 21` cron, then the MNF (WSH@SF, 10-20 00:15Z) pregame dispatches at about 22:15Z (kickoff-refresh, T−120) and about 22:30Z (pregame-free, T−105).
  - If every one of those is dropped, canonical waits for Tuesday's crons. Until then the honest state is PROVISIONAL; it must not be shown as canonical.
- **Evidence caveat:** the capture report says the NO@NYG live-props artifact was "never on main during the window". Yet `4aae3effb2` added `app/public/data/nfl/live-props/401873000.json`, and the report's own provisional line cites that commit. Re-check the capture's artifact probe before quoting that line.

## 4. Minimum safe changes, ranked by impact/risk

1. **Post-final waiter (free; high impact, low risk).**
   - **What:** extend `nfl-pregame-free-refresh` or add a sibling with the same shape: `workflow_run` off `publication-watchdog`, Sunday/Monday/Thursday crons as best-effort extras, an in-flight check, and dedupe.
   - **Decider:** a pure decider over the committed boards and artifacts returns DISPATCH when either:
     - a game kicked off ≥3.5h ago has no FINAL artifact; or
     - a PROVISIONAL artifact's window has closed.
   - **Action:** dispatch `nfl-event-window` with `skip_odds=true`, the proven zero-credit chain. Add no new writer.
   - **Fixes:** NO@NYG-type holes. Provisional latency would be bounded by the watchdog tick (Sunday gaps of 9–80 minutes) instead of the next pregame need. Canonical lands about 3h after first read instead of waiting for the next day's runs.
   - **Cost:** 0 credits. Roughly +1 Production build per kickoff group final, plus 1 per promotion; Sunday already had 18 event-window runs, each with a successful publish step.
   - **Approval:** founder activation, like PR #1131 (a new scheduled dispatcher that triggers Production builds). No paid spend.
2. **Stop dispatching refused paid sweeps (free; medium impact, low risk).**
   - **What:** `decide-kickoff-refresh.mjs` should HOLD with a ceiling state when the Program 171 ledger is at 1160/1160.
   - **Why:** today it dispatches paid sweeps that refuse, which turned 15 of 18 runs red and cost a Production build each.
   - **Fixes:** honest run status; fewer builds. It frees the event window for the waiter in item 1.
   - **Cost:** 0 credits, fewer builds.
   - **Approval:** none for the logic. Raising the ceiling itself is a founder spend decision and out of scope.
3. **Anchor the post-final gate on observed FINAL, not age (free; low–medium impact, low risk).**
   - **What:** keep the 3.5h fetch-saver, and also target a game when the committed schedule or gateway already says FINAL. The sweep already refuses to write non-FINAL games (`capture-live-props.mjs:195`).
   - **Limit:** it would **not** have helped on Sunday (no run between 20:30Z and 22:35Z), so it ranks below items 1 and 2.
   - **Approval:** none.
4. **Give `nfl-live-props-free` a cadence (free; medium impact, medium cost).**
   - **What:** add the same watchdog tick for in-game artifacts.
   - **Cost:** about 20+ Production builds per Sunday, since each tick with a live game commits.
   - **Low value:** the in-game facts are already served by the gateway.
   - **Approval:** founder. It reverses an explicit "no schedule" design decision, and it touches COST-001 build churn.
5. **Re-enable paid `nfl-live-props`: do not.**
   - Its free half is identical to option 4.
   - Its Phase H steps name `ODDS_API_KEY`, the probe is spent and the ledger ceiling is reached.
   - Requires founder authorization plus a new Phase H authorization. High risk, for no reliability gain over options 1 and 4.

No statistic in this document was estimated. Every gap above is stated as observed; none is filled.
