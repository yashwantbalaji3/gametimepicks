# MLB lineup waiter: one-slate Production trial plan

**Status:** prepared. **Not started.** The waiter is merged but inert:
- merged #1131 as `32a275b420` (2026-10-19 02:47Z), at verified head `c70ab69da2` = re-verified `82f4a72999` + `main`;
- `MLB_LINEUP_WAITER_ENABLED` is **unset** (API 404).

## Preparation done
| Check | Result |
|---|---|
| Off switch after merge | Variable unset; 0 waiter runs triggered between the merge and the dry run |
| Dry run | `gh workflow run mlb-lineup-waiter.yml -f dry_run=true` → run **39191632155** succeeded in about 1 min. Step env `MLB_LINEUP_WAITER_ENABLED=''`, `DRY=true`, so it ran the `--dry-run --once` path. Decision: `DONE · every game on 2026-10-18 has started or is postponed`. **0 refresh dispatches** (the last refresh was the 01:32:58Z schedule). |
| Concurrency | The waiter group `mlb-lineup-waiter` (live) and `mlb-lineup-waiter-dry` (dry) are separate. The refresh's `gtp-generated-artifacts` writers gate every dispatch (re-verified, F4/F11). |
| Independent verification | READY TO ACTIVATE (`PR1131_ACTIVATION_READINESS.md`, re-verification section) |

## Proposed trial slate
**ALCS game 849815, CLE @ TB. First pitch 2026-10-20 00:08Z (Mon 10-19, 8:08 PM ET).**
- The single game keeps the trial easy to observe.
- The waiter watches from T−240, about 20:08Z.
- **Fallback:** game 849814 on 10-20 (first pitch 10-21 00:08Z) if 10-19 is postponed.

## Execution, once the founder approves
1. **About 19:30Z on 10-19,** the founder (or the coordinator on explicit instruction) sets the variable to exactly lowercase `true`: `gh variable set MLB_LINEUP_WAITER_ENABLED --body true`.
2. **First trigger:** the next trigger (`workflow_run` off mlb-daily-production or publication-watchdog, or a cron) starts the live waiter. If none arrives by 20:00Z, one manual `gh workflow run mlb-lineup-waiter.yml` with no inputs. Confirm that run's log does **not** contain "forced to --dry-run".
3. **Monitoring** (coordinator, read-only, about every 20 min):
   - waiter run logs: decisions, ledger lines, alerts;
   - `mlb-lineup-refresh` runs;
   - commits on `main`;
   - StatsAPI lineup status;
   - `full-game-simulations/2026-10-19.json` lineup sources;
   - Production build-info.
4. **After first pitch (DONE),** delete the variable (end of trial) and cancel any waiter run still in progress. Expect one failure alert from the cancel; that's normal.

## Success criteria (all must hold)
- [ ] At most 2 waiter-initiated refresh dispatches for the game (hard cap 6).
- [ ] 0 duplicate dispatches for the same lineup fingerprint.
- [ ] A confirmed-lineup simulation on Production **before T−60** (23:08Z), checked against StatsAPI batting orders.
- [ ] 0 overlap with another `gtp-generated-artifacts` writer; 0 cancelled refreshes.
- [ ] No failed or timed-out waiter run. At most 1 `dispatch-failed` webhook. Every `lost:`, `retry-exhausted:` or `frozen:` alert reviewed.
- [ ] Vercel: builds only for real lineup changes. Stamp-only refreshes are suppressed by #1088.
- [ ] No change to any past-date file or frozen forecast.

## Rollback (instant)
1. `gh variable delete MLB_LINEUP_WAITER_ENABLED`.
2. `gh run cancel <id>` for any in-progress waiter run.
3. The waiter writes nothing, so there is no data cleanup.
4. Removal: revert-merge `32a275b420`.

## After the trial
The coordinator reports the evidence against each criterion. Permanent activation is a separate founder decision; the variable stays deleted until then.
