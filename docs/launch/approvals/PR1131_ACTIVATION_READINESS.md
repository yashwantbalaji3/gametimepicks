# PR #1131: MLB lineup waiter activation readiness (independent verification)

- **PR head verified:** `07abe772726751d35c860bd9df1ff060662e1156` (draft; base `feafaee144`; 5 files, +1,677)
- **Verified:** 2026-10-18 ~22:30Z by an independent verifier, not the author. Read-only on GitHub (no dispatch, no variables, no PR comments).
- **Verdict: READY WITH CONDITIONS.** The exact head `07abe77` is **not** ready to activate as it stands.
  - Fix F1 to F4 first (each is small), then re-verify the new head.
  - F5 to F11 can be tracked, but must be fixed before the regular season (late March 2027).
  - Nothing found can corrupt published data, because three layers bound the damage:
    - the refresh never regenerates a started game (`generate-mlb-full-game-simulations.mjs:65-72`, carry-forward);
    - the stamp-only gate drops no-change commits;
    - dispatches are capped at 6 per slate.
  - The defects are a guard bypass, lost watches, wasted dispatches, and wrong or suppressed alerts.

## Findings (ranked)

| # | Sev | Where | Defect | Proposed fix |
|---|---|---|---|---|
| F1 | **High** (guard) | `mlb-lineup-waiter.yml:62-66, 79-81, 101` | **The activation guard can be bypassed while the waiter is disabled.**<br>• `dry_run` is a free-text input. GitHub expression `==` "ignores case when comparing strings" ([docs: expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)), so `dry_run=True` (or `TRUE`) passes the job `if`.<br>• The shell test `[ "$DRY" = "true" ]` is case-sensitive, so the step then runs the **live** loop: `--relay`, real dispatches, self-relay.<br>• Adversarial test #1 fails with `True`, `TRUE` and `tRuE`. | • Make the input `type: boolean`.<br>• In the step, pass `ENABLED: ${{ vars.MLB_LINEUP_WAITER_ENABLED }}` and force `--dry-run --once` unless `"$ENABLED" = "true"` (exact match) and `"$DRY" != "true"`.<br>• Add a contract test for the fix. |
| F2 | Med | runner `:311-318` vs wf `:86, :104` | **The post-dispatch wait can push the job past its timeout.**<br>• The wait is 45 s plus up to 25 × 60 s and never checks the budget.<br>• Worst case: 330 + 0.75 + 25 + two decide passes ≈ 357 min, plus setup, against `timeout-minutes: 350`.<br>• The job is then killed: no relay, and the `if: failure()` notify does not run on a timeout cancel.<br>• Any exit without a relay after ~22:00Z leaves night games unwatched, because publication-watchdog's last delivered arrival is ~22:00–23:46Z. | • Cap the wait at `remainingBudget`, or lower the budget to 300.<br>• Make the notify step `if: failure() \|\| cancelled()`. |
| F3 | Med | runner `:130` (`--limit 8`), `:163-170` | **Ledger recovery looks too far back for too few runs.**<br>• Each workflow_run arrival during a running job becomes a pending run, and the next arrival cancels it.<br>• publication-watchdog delivered 15–17 completions on each of 10-17 and 10-18, about one per 20–30 min from 15Z to 20Z. A 330-min watch therefore accumulates ≈10 cancelled runs.<br>• The run that actually dispatched falls outside the 8 that the next run reads. Adversarial test #15 fails.<br>• The ledger is lost. Consequences: repeat alerts, and a "stalled" fingerprint can be re-dispatched. That is bounded by the cap and spacing, which come from the run list. | • Use `--limit 100` and filter `createdAt` to 36 h.<br>• Skip `conclusion=skipped`, and skip cancelled runs that have no logs.<br>• Better: emit the ledger as a run artifact or job output and read it via the API. |
| F4 | Med | runner `:111` | **The writer queue misses `ufc-fight-week.yml`.**<br>• Its line `group: gtp-generated-artifacts     # comment` fails the anchored regex.<br>• So the claim "never while any writer is running or queued" is false for UFC fight weeks. Adversarial test #3 fails. | Parse the YAML (`js-yaml` is already a dependency) and read `concurrency.group` at both workflow and job level. |
| F5 | Med | decider `:213, :317-320`; `FAILED` at `:73` | **A dispatched refresh that ends `cancelled` is never retried and never alerted until T-60.**<br>• Cancellation happens through pending-run replacement in the shared group, documented in `nba-forecast-window.yml:20` and `soccer-leagues.yml:25`, and seen once in the last 400 refresh runs.<br>• The fingerprint is "already dispatched", `cancelled` is not in `FAILED`, and the "stalled" check needs a *success*.<br>• The waiter's reason text even says "every posted lineup is already in the committed simulation" (`:323`), which is wrong.<br>• Adversarial test #4 and end-to-end scenario S2 confirm it. | • Treat a dispatch whose next refresh run concluded `cancelled` or `failure` as unconsumed: allow one retry per key, and alert on the second.<br>• Fix the reason text. |
| F6 | Med | decider `:300`, `normalizeSchedule:117` | **An empty or malformed-but-200 schedule while the committed board lists games returns `DONE`, and the run exits without a relay.**<br>• Adversarial test #7 fails.<br>• This compounds with F2's late-evening gap. | Treat "board has games, schedule has none" as an input failure (retry). Declare DONE only after the board and the schedule agree. |
| F7 | Low-Med | decider `:230-236, :255`; author test `:172` | **Doubleheader game 2 (TBD) gets futile dispatches.**<br>• StatsAPI sets a TBD game 2's `gameDate` to game 1 + 5 min (2025 sample: 778195, 778046, 778170 …), and the board copies it.<br>• The refresh therefore freezes game 2 from game 1 + 5 min. The waiter ignores the board clock for TBD games and dispatches anyway: a wasted dispatch plus a false "stalled" alert.<br>• The author's test uses `boardFirstPitch: {}`, so it misses this. Adversarial test #6 fails.<br>• Postseason has no doubleheaders. | • Report a TBD game whose board time has passed as `FROZEN_BY_BOARD` (one alert, no dispatch).<br>• Or teach the refresh the TBD rule. |
| F8 | Low-Med | decider `:213, :318` | **A lineup that goes A → B → A is never refreshed back to A.**<br>• Key A is "already dispatched", so the simulation keeps B, and a false `stalled:` alert is raised.<br>• Adversarial test #5 fails. | Expire a dispatched key once a later dispatch for the same game side has landed. Equivalently, dedupe on (key, committed fingerprint at dispatch). |
| F9 | Low | runner `:75-79` | **A stalled response body is unbounded.**<br>• `clearTimeout` runs before `res.json()`, so a body that stalls after its headers hangs the cycle until the job timeout.<br>• Adversarial test #8 fails. | Clear the timer after `await res.json()`. |
| F10 | Low | runner `:299, :304` | **The re-decide before a dispatch, and `gh workflow run`, are outside any try.**<br>• A StatsAPI or gh error at that moment is fatal (exit 1, no relay).<br>• If `gh` errors after GitHub accepted the dispatch, no ledger line is printed. The run list still enforces spacing and the cap. | Wrap both calls. Print an `attempt` ledger line *before* dispatching and a `dispatch` line after. |
| F11 | Low | runner `:221`; wf `:68-70`; decider `:283, :338`; runner `:268` | **Smaller defects:**<br>(a) A dry run prints alert ledger lines that a later live run recovers, which suppresses the real webhook (adversarial test #16).<br>(b) A dry-run dispatch shares the live concurrency group, so it queues for up to 330 min behind a live run and can replace a pending relay.<br>(c) A run whose `createdAt` is null throws `Invalid time value` from `etDate` (adversarial test #9). Every cycle then becomes an "input failure".<br>(d) Hitting the call cap (`CallCapReached`) exits with no relay. On a 15-game slate, boxscore re-fetches for owed games plus 60-s writer waits can approach 400. | (a) Skip ledger lines when `dryRun`.<br>(b) Give dry runs their own group.<br>(c) Guard `Number.isFinite`.<br>(d) Relay on CAP, or size the cap per game before the regular season. |

**Checked and OK:**
- Started or past games are never dispatched for: the deadline is min(StatsAPI time, board time); T-10 cutoff; Live/Final.
- The cap counts the ledger **or** manual and waiter `workflow_dispatch` runs, whichever is higher. Spacing honours manual dispatches.
- DST and ET-midnight helpers are correct for 2026-11-01 and 2027-03-14 (adversarial test #11).
- Partial, duplicate, string or negative IDs map to NOT_POSTED.
- The waiter never commits. It uses `contents: read`; its only git operation is `pull`.
- Secrets and permissions are minimal: `OPS_WEBHOOK_URL` only, and `actions: write` is required to dispatch.
- `DRY` is passed via env, so there is no injection risk.
- `ops_alert.sh` honours `OPS_ALERT_PRINT_ONLY`.
- The relay works with GITHUB_TOKEN: "With the exception of `workflow_dispatch` and `repository_dispatch`", token-triggered events create no runs ([docs: events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).

## Concurrency

**Two waiter runs.** At most one waiter runs and one is pending.
- A newer pending run cancels the older one, which has done nothing yet ([docs: concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)). That is safe.
- The side effects are F3 (ledger window) and F11b (a dry run can replace the relay).

**Waiter vs refresh.** There is no writer overlap: the refresh is in `gtp-generated-artifacts`, and GitHub serializes the group.
- The waiter waits on in-flight and settling refresh runs.
- A time-of-check/time-of-use window of seconds remains between the writer check and the dispatch.
- The real risk is pending replacement: the dispatched refresh can be cancelled (F5), or it can cancel another writer's pending run. That is pre-existing behaviour of the shared group.

**Handover at 330 min.**
- When it relays as designed, it is correct: B queues behind A, recovers A's ledger, and waits on any in-flight refresh.
- It breaks only through F2 (timeout before the relay) or F3 (ledger window).

**NFL waiter.** The two waiters use separate groups and both gate on the writer queue.
- Both can dispatch in the same instant: one refresh runs and the other pends. A third writer arriving then cancels the pending one, which is the F5 path.
- They share GITHUB_TOKEN's "1,000 requests per hour per repository" ([docs: limits](https://docs.github.com/en/actions/reference/limits)). The waiter uses ≤ ~6 requests/min when writers are busy. That is acceptable.

## Recovery (kill and resume)

I ran the real runner (`--dry-run --once --date 2026-10-18 --now 19:28Z`) with a fake `gh` on PATH and a fetch fixture (a changed away nine for 849817). The fake `gh` recorded **0 `workflow run` attempts**.

| Scenario | Result |
|---|---|
| **S1:** killed after `gh workflow run` but before the ledger line; that refresh was cancelled | Would DISPATCH the same fingerprint again (bounded by spacing and the cap; a desirable retry). |
| **S2:** ledger recovered; refresh cancelled | WAIT forever, with a wrong reason (F5). |
| **S3:** ledger recovered; refresh succeeded but did not take the lineup | One `stalled` alert, no re-dispatch. Correct. |

In-process tests (`decideOnce` with injected `gh` and StatsAPI) confirm:
- **No duplicate** while the refresh is in flight.
- **No duplicate** once it landed, with or without the ledger (main is the record).
- Ledger reconstruction is correct **only within the 8-run window** (F3).

Not simulated: a SIGKILL inside a live GitHub runner, and real `gh run view --log` for runs that were cancelled while pending.

## Tests

| Suite | Result |
|---|---|
| Author `mlb-lineup-waiter.test.mjs` | **40/40 pass** |
| Workflow guards: `workflow-trigger-depth`, `cron-slots`, `cron-punctuality`, `cron-slot-attribution`, `watchdog-wiring`, `pregame-free-refresh`, `workflow-shell-syntax`, `workflow-script-cwd`, `workflow-failure-visibility`, stamp-only gate, writer ownership (12 files) | **125/125 pass** |
| Every test touching `.github/workflows` (75 files) plus the author suite | **636: 635 pass, 0 fail, 1 skipped** (integration-gated) |
| **Verifier adversarial** (18 tests, not committed) | **6 pass, 12 fail.** The 12 failures are F1 (×2), F3, F4, F5, F6, F7, F8, F9, F11a, F11c and F2 (budget). |

The 6 adversarial passes cover DST, the midnight guard (a game crossing ET midnight is never refreshed, a documented limitation), malformed shapes, started-game cases, cap and spacing bypass attempts (none possible), and the in-flight and landed resume path.

The adversarial file is saved outside the worktree at `scratchpad/mlb-lineup-waiter.adversarial.test.mjs` (session scratchpad). **Recommend adding it to the PR** once the fixes land, with its assertions as the acceptance tests.

## Replay reproduction

`replay-mlb-lineup-waiter.mjs --from 2026-10-08 --to 2026-10-18` reproduces the PR's headline numbers (46 StatsAPI calls):

| Metric | Result |
|---|---|
| Final nine simulated before first pitch | 22/22 → 22/22 |
| Median minutes from post to simulation | 33 → 8 |
| Waiter dispatches | 10 (≤ 2 a day) |
| Lineup-changing builds | 11 → 13 |
| Runner-minutes per slate day | 584 |
| Worst lead before first pitch | **34** (the PR says 33) → 158 |

**Hand spot-checks.**
- **10-12, game 849812** (21:00Z).
  - StatsAPI timecode `20261012_171950` already shows the final away nine.
  - Git shows the first confirmed commit at `088724d2de`, 20:26:01Z. That is an **mlb-daily-production** commit, not a lineup refresh: the first refresh landed 22:33Z, after first pitch. Lead 34 min. ✔
- **10-18, game 849817** (21:08Z).
  - The archive shows home posted at 17:41:22Z; the away nine appears at timecode 17:45:07Z.
  - Published at `785fbdc8ff`, 18:05:07Z, after the **manual** 18:03Z dispatch. Lead 183. ✔

**Methodology caveats.** The direction of the result is sound; its magnitude is optimistic.

1. "Today" includes the human dispatch on 10-18. The cron-only model is 18/22, not 22/22.
2. The replay ignores the 330-min budget, relay gaps, F2, F3, F5 and F6. It assumes every dispatched refresh starts 15 s after creation and succeeds, so queueing and cancellation are not modelled.
3. The replay sees upstream at the feed's change instant. The live waiter reads `hydrate=lineups`, whose lag is not modelled.
4. `posted` sometimes comes from GTP's own capture or sim commit (for example 10-14 home), which pins lag near 0 in both columns.
5. Only the first 12 pregame timecodes are read. That was sufficient here (2–3 per game).
6. The sample is 9 postseason slates with ≤ 2 games each. There are no doubleheaders, the cap is never exercised, and there is no 15-game call load.
7. "Worst lead 33 → 158" is a single-side minimum. It is not a distribution claim.

**Live dry run** (`--dry-run --once`, 22:22Z): `DONE`, 849817 STARTED, 1 StatsAPI call. For 10-19 (`--date 2026-10-19`): WAIT "left to a later trigger" at 12:00Z; WAIT, both sides NOT_POSTED, at 20:30Z.

**Cost.**
- The repo is PUBLIC: "GitHub Actions usage is free … for public repositories that use standard GitHub-hosted runners" ([docs: billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). So 584 runner-min per day costs $0.
- Limits: 6-hour job limit and 20 concurrent jobs on the Free plan ([docs: limits](https://docs.github.com/en/actions/reference/limits)).
- `workflow_run` chaining: "can't … chain together more than three levels". That matches the repo's 4-workflow depth convention, and `workflow-trigger-depth` passes.
- Vercel: the waiter itself makes no commit, so it triggers no build.

## Activation checklist

**Preconditions**
1. F1 to F4 fixed on a new head. The adversarial tests for them pass, the 40 author tests still pass, and the workflow guards are green.
2. An exact-head re-verification is recorded here, then the PR is merged by the coordinator.
3. `OPS_WEBHOOK_URL` delivery is confirmed (an `OPS_ALERT_TEST=1` delivery).
4. No other writer change lands that day.
5. The NFL waiter and the live capture are not mid-window.

**Dry-run dispatch first** (variable still unset)
- Dispatch `mlb-lineup-waiter`, `dry_run=true`, from `main`.
- Expect: one decision printed, exit 0, 0 `mlb-lineup-refresh` or `mlb-lineup-waiter` runs created by it, webhook payload printed only.

**Who sets the variable**
- The founder or coordinator, as a human action (never an agent), on a slate morning before 12:00Z: `gh variable set MLB_LINEUP_WAITER_ENABLED --body true`.

**One-slate observed trial.** The next postseason slate, with the success criteria all required:
- Waiter-originated `workflow_dispatch` runs of `mlb-lineup-refresh` ≤ **2 per game** (and ≤ 6 hard).
- **0 duplicate dispatches** for one fingerprint. Check the ledger lines against the run list.
- Each side's confirmed nine is **live in Production before T-60**. Verify the Production simulation JSON's batters against StatsAPI `battingOrder`, not just the commit.
- **0 writer overlap.** No refresh run's `startedAt`–`updatedAt` interval intersects another `gtp-generated-artifacts` run, and no refresh run was `cancelled`.
- No waiter run ends `failure` or `timed_out`.
- A relay, if one happens, resumes with the recovered ledger, visible in the step summary.
- StatsAPI calls ≤ 400 per run.
- Alerts: none, or only true positives.

**Rollback**
1. Run `gh variable delete MLB_LINEUP_WAITER_ENABLED`.
2. **Also** `gh run cancel` any in-progress or pending `mlb-lineup-waiter` run. A running job keeps dispatching until its budget ends; deleting the variable only stops new runs and relays.
3. Revert the PR if needed.
4. There is no data cleanup: every commit is an ordinary refresh commit.

**Window note.** The postseason ends in early November, so the observable benefit window is about two weeks. F5 to F11 and the founder questions (regular-season cap, call budget) must close before Opening Day 2027.

## Re-verification at 82f4a72999 (2026-10-18)

- **Head:** `82f4a72999131327498b612c40ce63f256e13819` (draft; +779/−96 over `07abe77`, 6 files). Verified ~23:10Z by an independent verifier, not the author. Local only: nothing was dispatched, no variable was set, nothing was pushed or commented.
- **Verdict: READY TO ACTIVATE**, subject to the founder's activation decision and the one-slate trial.
  - F1–F4 are fixed and independently confirmed. No path found lets a disabled waiter dispatch or relay.
  - The new findings N1–N3 are Low. Track them with the regular-season items; none blocks the trial.

| # | Status | Evidence |
|---|---|---|
| F1 | **Fixed** | 14 variable values (`""`, `TRUE`, `True`, `tRuE`, `true `, ` true`, `'true'`, `"true"`, `1`, `yes`, `on`, …) × 15 triggers: `workflow_dispatch` with 11 `dry_run` forms, `workflow_run` on main and on another branch, `schedule`, self-relay. The step layer alone picks `--dry-run --once`, and the runner layer alone forces dry/once/no-relay. End to end, the real runner with a DISPATCH fixture and a refusing `gh` made **0** `workflow run` calls for 13 non-exact values. Positive control (`true`): 6 refresh attempts + 1 relay. |
| F2 | **Fixed** (residual N1) | Every sleep is capped at the remaining budget. Notify is `failure() \|\| cancelled()`. The hard stop is real. |
| F3 | **Fixed** | 70 newer cancelled + 20 skipped + null-`createdAt` + self runs: the dispatching run is still recovered, with ≤ 30 log reads. |
| F4 | **Fixed** | The pattern equals js-yaml on all 10 literal forms tried (block, comment, quoted, flow, string, job-level, CRLF, comments, look-alikes). |
| F5 | **Fixed** | LOST → 1 retry, then exhausted. A retry honours spacing and the in-flight gate. A queued dispatch is never duplicated. An unconfirmed attempt blocks only once a run follows it. |
| F6 | **Fixed for empty** (residual N3) | Empty, or only other-`officialDate` entries → WAIT with `inputSuspect`. |
| F7 | **Fixed** | FROZEN_BY_BOARD: one alert, never dispatched, DONE once game 1 is live, and the board clock bounds the window. |
| F8 | **Fixed** | A→B→A works. Exhausted A followed by main moving to C re-opens A. No ping-pong when main is unchanged (a `stalled` alert instead). |
| F9 | **Fixed** | A fetch that ignores abort and never sends headers is bounded at 2 × timeout. |
| F10 | **Fixed** (info N4) | The attempt/dispatch lines and the 3-try dispatch with a run-list check work. |
| F11 | **Fixed** | (a) A dry alert writes no ledger line and is print-only. (b) Dry runs use their own group, and a relay lands in the live group. (c) Garbage timestamps never throw, and spacing still holds. (d) Relay on CAP after ≥ 30 min (by reading). |

**Rewritten adversarial tests.** The original file run against the new head gives 16/18. GUARD #1 and BUDGET fail only because they assert the *old source text*: the `[ "${DRY:-false}" = "true" ]` regex, and the old `for (… i < 25 …)` loop (`TypeError`). Neither is a behaviour failure.
- The rewrites keep the intent. GUARD now executes the real step script across 7 × 6 cases, which is stronger.
- BUDGET checks budget + hard stop + setup ≤ timeout and drives `waitForRefresh`. **Gap:** BUDGET assumes no time passes before the loop (see N1).
- The author's two edited contract tests are tightened, not weakened.

**New findings**
- **N1 (Low).** The hard stop is armed *after* ledger recovery, with `(budget + 12) min` from the moment it is armed, not from `started` (runner `main`, `setTimeout(…, (a.budgetMin + HARD_STOP_GRACE_MIN) * 60_000)`).
  - Measured: 30 one-second log reads armed it 31 s late.
  - Realistic recovery (about 1 min) keeps the end under 350 min. The worst case (31 `gh` calls at the 120-s timeout) exceeds it: the job is killed with no relay, though notify still fires.
  - Fix: delay `deadline + grace·60000 − Date.now()`.
- **N2 (Low).** A `dispatch-failed:` alert is re-emitted, with a webhook each time, every cycle (~80 s) while `gh workflow run` keeps failing. The key is never added to `ledger.alerted`. Reproduced: the same key fired twice in 1.5 min.
  - Fix: push the key and skip it if already present.
- **N3 (Low).** A *partial* schedule ends the watch as DONE with no relay: board game 2 is missing from a 200 response and game 1 has started. This contradicts the PR's "DONE only when the board agrees". It needs StatsAPI to drop a game; postponed games normally stay listed.
  - Fix: WAIT/`inputSuspect` while any board game ≤ 90 min past first pitch is absent from the schedule.
- **Info:**
  - N4: if `gh` errors after GitHub accepted the dispatch and the run list lags more than 10 s, a second dispatch is sent. This is bounded by the in-flight gate, spacing and the cap.
  - N5: the writer pattern misses folded (`group: >-`) and `${{ … }}` group forms. Neither is in the repo today.
  - N6: a mis-cased variable (`TRUE`) still starts a forced-dry job on every trigger (~20 a day, 1 StatsAPI call each, 0 dispatches). The header's "every trigger is a skipped job" holds only for other values.
  - N7: the hard stop relays without checking `unfinished()`, which is harmless.

**Tests (this head)**

| Suite | Result |
|---|---|
| Author suite + PR adversarial file | **69/69** |
| Original adversarial file | **16/18** (2 source-text failures, explained above) |
| New re-verifier tests (20, not committed; `scratchpad/mlb-lineup-waiter.reverify2.test.mjs`) | **19/20**. The one failure is the N3 probe. |
| Every tracked test that mentions workflows (115 files) | **986: 980 pass, 5 fail, 1 skipped.** The 5 failures are `ask-ci-and-build` post-build checks that need `out/` (no build allowed; unrelated). |
| `tsc --noEmit -p .` | clean |
| Unit phase (`run-suite --phase unit`) | **9,571: 9,565 pass, 1 fail, 5 skipped.** The failure is the known `forecast-contradiction`. Identical to the author's numbers. |

- **Replay:** on the cached inputs, 0 StatsAPI calls. `replay.json` is **byte-identical** to the pre-fix run: 22/22 → 22/22, median 33 → 8 min, 10 dispatches, worst lead 34 → 158, 584 runner-min per day.
- **Live:**
  - `--dry-run --once` with a refusing `gh` (reads only), 23:07Z: DONE, 849817 STARTED, 1 call.
  - `--date 2026-10-19`: WAIT, left to a later trigger.
  - `--relay` with `MLB_LINEUP_WAITER_ENABLED=True`: forced to dry once.
  - **0** `workflow run` calls.
  - Ledger recovery logs "skipped": the waiter workflow is not on main yet, which is expected before merge.

**Checklist changes**
- Precondition 1 is now met: F1–F4 are fixed at `82f4a72`, and the adversarial file is in the PR with 18/18.
- Add three checks:
  - **(a)** The variable must be exactly lowercase `true`. The first triggered run's log must *not* contain `forced to --dry-run`.
  - **(b)** The dry-run dispatch must run in group `mlb-lineup-waiter-dry`, and its step must show `--dry-run --once`.
  - **(c)** Trial criteria gain two items: at most 1 `dispatch-failed` webhook (N2), and every `lost:`, `retry-exhausted:` and `frozen:` alert reviewed.
- On rollback, `gh run cancel` now fires the notify alert. That alert is expected.
- N1–N3 join F-items for Opening Day 2027.
