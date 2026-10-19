# NBA finals waiter — activation plan

Status: **inert**. It is merged off. Nothing runs until the repository variable `NBA_FINALS_WAITER_ENABLED` is set to exactly `true`.
Files: `.github/workflows/nba-finals-waiter.yml`, `app/src/lib/ops/nba-finals-waiter.mjs` (the rule),
`app/scripts/ops/nba-finals-waiter.mjs` (the runner), `app/scripts/ops/replay-nba-finals-waiter.mjs` plus `fixtures/nba-finals-waiter/`,
and `app/src/lib/ops/nba-finals-waiter.test.mjs`.

## The problem

`nba-results-refresh.yml` is the only workflow that writes `app/public/data/nba/results/{latest,finals-2026-27}.json`. /nba shows finals from those files, and the experimental grader reads them. The refresh has two kinds of clock:

- crons at `41 * * * *` and `11,26 0-7 * * *`
- `workflow_run` on publication-watchdog, which only fires often from about 12Z to 22Z

US evening games end between about 01:30Z and 05:30Z, when only the crons fire. GitHub delivered 3–5 runs between 00Z and 12Z on 10-17, 10-18 and 10-19. On 10-17/18 the runs landed at 00:14, 04:24, 05:03, 08:58 and 09:51Z. On opening night PHI@NY (401909089) should end around 01:30Z. With that delivery pattern its final would publish at about 04:25Z, nearly 3 hours late. NFL had the same failure on 10-18 with NO@NYG.

## What it does

- **Start.** Any delivered trigger starts one waiting job. The triggers are:
  - publication-watchdog completions
  - nba-forecast-window completions (worst-case trigger depth 3, pinned by `workflow-trigger-depth.test.mjs`)
  - crons at 21:47, 23:47 and 01:47Z
- **Waiting.** The job sleeps until the night's earliest unfinished tip + 100 min. A run that arrives more than 330 min before that window exits at once and leaves the watch to a later trigger.
- **Each cycle (every 5 min ± 45 s).** The job:
  1. runs `git pull` on main
  2. reads the committed finals record
  3. reads ESPN's free day scoreboard
  4. reads the `nba-results-refresh` run list
- **Dispatching.** A game ESPN shows `STATUS_FINAL` that the record does not hold yet is "owed". For an owed game the job first checks the month scoreboard (the refresh's own data source). It then dispatches `nba-results-refresh.yml` with no inputs, under these limits:
  - at most once per game per final fingerprint (team ids + scores)
  - one retry if that refresh ended cancelled or failed
  - at least 10 min between dispatches
  - at most 6 dispatches a night (manual dispatches count toward this)
  - never while a refresh run is queued or in progress
- **Never a loop.** These cases get one alert and no further dispatch:
  - a final the record holds in `refused` or `conflicts`
  - a refresh that succeeded but did not take the final (alerted as stalled, with the adapter's likely reason)
  - an ESPN regression from FINAL back to in-progress (the earlier attempt expires, so the game is owed again once it is final)
- **Exit.** When every game is recorded, postponed or cancelled, held, or given up 8 h after tip, the job exits DONE.
- **Long nights.** The job has a 330-min loop budget inside a 350-min timeout. When the budget runs out, it relays to a fresh run through `workflow_dispatch`. The fresh run resumes from main, the run list and the ledger lines that earlier runs printed.
- **Alerts** go to `::warning::`, the step summary and `scripts/ops_alert.sh` (the existing `OPS_WEBHOOK_URL`). They fire when:
  - a final has been on ESPN 45 min and is still not committed
  - a refresh failed
  - the cap is reached
  - a refresh stalled or was lost
  - a final is held
  - ESPN regressed a final
  - a game is given up
- **It never writes.** The job has `contents: read`. The refresh's write-once and conflict rules stay the only writer of finals.

## Activation guard (same defence in depth as the MLB lineup waiter)

1. **Job `if`.** The job runs only if `vars.NBA_FINALS_WAITER_ENABLED == 'true'`, or if it is a `workflow_dispatch` with `dry_run == 'true'`. For `workflow_run`, the run must also come from the default branch.
2. **Step check.** The live loop runs only when the variable is exactly `true` (GitHub's `==` ignores case) and no dry run was asked for, in any letter case. Everything else runs `--dry-run --once`.
3. **The runner itself.** The runner forces `--dry-run --once`, with no relay, unless `NBA_FINALS_WAITER_ENABLED` is exactly `true`.

Dry runs use their own concurrency group (`nba-finals-waiter-dry`) and print no ledger lines. Tests pin every layer, including an executed case matrix of the step's own shell.

## Cost

- **Money: none.** The repository is public, so Actions minutes are free. ESPN's scoreboard is public and needs no key. No paid provider is called and no secret is read except `OPS_WEBHOOK_URL`.
- **Calls.** Each run has a hard cap of 200 ESPN calls. The opening-night replay used 27 day-scoreboard calls and 2 month-scoreboard calls (about 1.8 MB each).
- **Runner time.** About 6 h on a night with late games (22:05Z → about 04:10Z, in two runs). Each early-exit arrival takes under a minute and reads no earlier logs.
- **Dispatches.** At most 6 a night. A refresh run takes about 70 s.

## Vercel build impact (verified against `app/scripts/vercel-ignore-build.sh`)

`app/public/data/nba/results/**` is covered by `:(top)app/`. It is not in `NON_BUILD_INPUTS` (`app/public/data/ops/` and `admin/status.json`) or `NON_BUILD_GLOBS`. So every `nba-results-refresh` commit is a full Production build. The test `VERCEL: a refresh commit under app/public/data/nba/results BUILDS` runs the real ignore script against a throwaway repo to confirm this.

- **What can build.** The waiter itself commits nothing. Its workflow and test file are not build inputs (the same test checks this). A dispatched refresh commits only when a reader-visible field moved: a new final, a corrected final, a postponement, a schedule change or the window state. A dispatch that finds nothing new causes no commit and no build.
- **Builds can increase, and the increase is bounded.** Without the waiter, one late cron run often picks up several finals in one commit. With it, each final is published about 5 min after it ends, so finals far apart in time become separate commits. Later crons then find nothing new and do not commit.
- **Opening-night replay.** Builds that recorded a final go from 2 (BOS@DET at 21:54Z; PHI@NY and OKC@SA batched at 04:25Z) to 3, so **+1 build**.
- **Upper bound.** At most 6 waiter-caused builds a night (the dispatch cap). In practice it is about the number of separate end-of-game clusters. Finals that land inside one 10-min spacing window share a dispatch.

## Rollback

1. **Instant stop:** `gh variable delete NBA_FINALS_WAITER_ENABLED`, or set it to anything other than `true`. The next trigger is skipped. A waiting run can be cancelled with `gh run cancel <id>`. It has written nothing, so cancelling loses nothing.
2. **Remove:** revert the workflow, the runner, the rule, the replay and the tests. The refresh's own crons and watchdog trigger are untouched either way.
3. **Data:** nothing to clean up. Every commit the waiter caused is an ordinary `auto: nba results capture` commit.

## One-night trial — opening night 2026-10-20 (founder-approved 2026-10-19)

ESPN's 10-20 scoreboard lists three games: BOS @ DET at 19:00Z, PHI @ NY at 23:00Z and OKC @ SA at 01:30Z on 10-21. The founder moved activation earlier so that all three are watched.

**Timing:**
- **Activation: 18:45Z** (2:45 PM ET), before the first tip.
- **One deadline for everything: 2026-10-21T10:00:00Z.** This replaces the earlier 08:00Z and 12:00Z figures.
  - OKC @ SA, the last game, tips at 01:30Z and ends at about 04:00Z, or about 04:20Z with two overtimes.
  - The waiter gives up on a game 8 h after tip, which is 09:30Z for OKC @ SA. 10:00Z covers that with margin.
  - The opening-night evidence capture keeps its own stop rule: final + 3 h, or 08:00Z at the latest. It is read-only and has nothing to do with the waiter.

**Steps:**

1. **Dry runs, already done (free, no effect):**
   - On GitHub, run 39267580926 on 10-19 at 14:17Z ran forced `--dry-run --once`, made 1 ESPN call and dispatched nothing.
   - Locally, against the real 10-20 scoreboard, at six instants:
     - 18:45Z WAIT (first window 20:40Z);
     - 20:45Z watching BOS @ DET;
     - 00:45Z watching BOS @ DET and PHI @ NY;
     - 03:30Z adds OKC @ SA;
     - each game is given up 8 h after tip if not final. That is what the 03:30Z and 09:59Z checks showed, because the replay reads today's scoreboard where nothing has tipped.
2. **At 18:45Z 10-20**, the controller sets both variables:
   - `gh variable set NBA_FINALS_WAITER_EXPIRES_AT --body 2026-10-21T10:00:00Z`
   - then `gh variable set NBA_FINALS_WAITER_ENABLED --body true`
3. **First arrival:** a publication-watchdog or nba-forecast-window completion, or the 21:47Z cron. The run waits until 20:40Z (BOS @ DET tip + 100 min). A run budget is 330 min, so the night takes about 3 runs, linked by relays. No relay happens at or after the expiry.
4. **End:** the controller deletes both variables once every opening-night final is committed and no waiter run is active, or at 10:00Z at the latest. It cancels any waiter run still going at the deadline.

**Independent limits** (none of them needs the Mac):

| Limit | Value |
|---|---|
| GitHub-side expiry | 10:00Z. After it, every trigger is a forced dry run |
| Job timeout | 350 min |
| Loop budget per run | 330 min |
| ESPN calls per run | 200 |
| Refresh dispatches per night | 6 |
| Spacing between dispatches | ≥ 10 min |
| Concurrency | never while a refresh is queued or in progress; own concurrency group |
| Permissions | `contents: read` |

If the Mac disconnects, the variables stay set, but the waiter is inert after 10:00Z. Delete them by hand when convenient.

### Success criteria (all from the run logs, the run list and `git log`)

- PHI@NY and OKC@SA each appear in `finals-2026-27.json` within 15 min of the waiter's `final-seen` ledger line. Compare with about 2–3 h for PHI@NY in the cron-only replay.
- No game draws more than 1 waiter dispatch (2 only with a logged `lost:` retry). There are at most 6 dispatches in total.
- No dispatch is created while a refresh run is queued or in progress.
- The waiter makes no commit. Every commit in the window is `auto: nba results capture`.
- Every alert key appears at most once. Ideally no alerts fire at all, apart from an expected `late:` if ESPN's month feed lags.
- The waiter exits DONE before the 10:00Z expiry. Runner time is about 6–7 h.
- Production builds from nba-results commits between 00Z and 12Z are at most the number of waiter dispatches plus the crons that found something new.

### Abort immediately (delete the variable) if

- a game draws more than 2 dispatches
- any commit comes from the waiter's run
- a dispatch overlaps a running refresh
- the waiter has not exited by the 10:00Z expiry (it stops itself there; check that it did)

## Evidence

- `node app/scripts/ops/replay-nba-finals-waiter.mjs` replays a synthetic opening night against recorded fixtures (the real ESPN 2026-10-20 scoreboard and the refresh runs GitHub actually delivered on the night of 10-17, shifted to 10-20). Result: **≤ 1 dispatch per game.**

  | Game | Waiter dispatches | Recorded with the waiter | Crons only |
  |---|---|---|---|
  | BOS@DET | 0 | — | 37 min after the final |
  | PHI@NY | 1 | 5 min after the final | 174 min after the final |
  | OKC@SA | 1 | 4 min after the final | 22 min after the final |

  The waiter exits DONE after one relay.
- The tests cover:
  - the rule: dedupe, spacing, cap, in-flight, postponed, ESPN regression, held in refused or conflicts, late alert, give-up, input sanity
  - the runner's seams
  - the activation guard
  - the trigger depth
  - the Vercel impact
  - the replay
