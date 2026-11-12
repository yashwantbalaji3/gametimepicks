# Release gate: block only on runs that can write (proposal for founder review)

**Status: PROPOSAL.** The v1 gate (`~/gtp-evidence/bin/release_gate.sh`) is unchanged until the founder approves.
2026-11-12, engine (forecast-guard), per the founder's ~20:25Z directive.

## The problem (measured 2026-11-12)
The v1 gate refuses while any in-progress workflow other than deploy-flush exists (`release_gate.sh` line 17).
- `nfl-pregame-free-refresh` (run 43286561667) started 19:05Z and waits inside its job from its T-375 horizon to the
  T-55 inactives pass (timeout 355 min).
- #1335 was green at 19:02Z and could not merge before the 21:30Z window closed. The whole chain slipped to the next
  04:00Z window.
- That run cannot conflict with a merge:
  - it declares `permissions: contents: read`;
  - it never commits or pushes;
  - its only effect is `gh workflow run nfl-event-window.yml`, whose run is a separate, visible writer.

## The correction: one line in the gate, nothing else
Replace line 17's "any in-progress run" with "any in-progress run that can write the repository":
```
RUN=$(cd /Users/yashwantbalaji/Downloads/gametimepicks && git fetch -q origin && node app/scripts/ops/release-gate-blockers.mjs) || fail "workflows in progress: $RUN"
```
`app/src/lib/ops/release-gate-blockers.mjs` (pure; tests in `release-gate-blockers.test.mjs`) classifies each committed
workflow from origin/main, never from the working tree. A run is NON-BLOCKING only when its workflow:
1. declares `contents:` and every declaration is `read` (no declaration = default token = blocks; `write-all` blocks);
2. never runs `git commit`, `git push` or `gh pr merge`;
3. uses no secret token other than GITHUB_TOKEN (a personal token could push regardless of `contents:`).

An unknown workflow name blocks, and the deploy-flush exemption is unchanged.

## What stays exactly as it is
- **Real write/deploy conflicts stay locked.** Every committed writer blocks (tested: nfl-event-window,
  nba-forecast-window, sport-schedules, nightly-settle, auto-refresh, daily-products), and so does any workflow that
  doesn't declare `contents:`. A waiter's dispatched writer blocks the moment it runs.
- **Unchanged checks:** the exact-head check (`--match-head-commit`), OPEN/MERGEABLE/CLEAN, quality + python
  SUCCESS, any non-green check, the :25–:45 lineup slot, and rollback.
- **Freshness is untouched.** No workflow changes, so the pregame refresh, inactives pass and event windows run exactly
  as today.

## Non-blocking today (committed, read-only)
- data-contract-check, mlb-afternoon-topup, mlb-lineup-waiter, mlb-research-integration;
- nba-finals-waiter, nfl-kickoff-refresh, nfl-pregame-free-refresh;
- ops-alert-test, publication-watchdog, quality-gate.

Print the full table with `node app/scripts/ops/release-gate-blockers.mjs --table`.

## Evidence
- `release-gate-blockers.test.mjs`, 5/5:
  - the committed writers block;
  - the committed waiters pass;
  - MUTATIONS: a waiter given `contents: write`, a `git push`, a personal token, `write-all`, or no declaration
    becomes a writer, and a comment mentioning `git push` does not;
  - REPLAY of 19:05Z: the waiter + deploy-flush gives no blockers; the waiter + nfl-event-window blocks on
    nfl-event-window; an unknown name blocks.
- Dry run on origin/main: `--runs "nfl-pregame-free-refresh,deploy-flush"` exits 0; adding nfl-event-window exits 1
  with `BLOCKING nfl-event-window: CONTENTS_WRITE COMMITS_OR_PUSHES`.

## Residual risk
- A waiter could dispatch a writer in the seconds between the gate's check and its merge. Writers already retry a lost
  push race (reset to origin/main and re-plan), and a merge plus a data commit cost one extra build at most. The same
  race exists today with any cron starting mid-gate.

## Considered and rejected
- **Splitting nfl-pregame-free-refresh into short scheduled passes.** GitHub delivered its crons 1h40m–4h55m late
  (header of the workflow; memory: GitHub drops frequent crons). In-job waiting is what makes the T-55 inactives pass
  land on time, so splitting it would trade release convenience for injury freshness.
- **Exempting the refresh by name.** It rots: a renamed or new waiter needs a gate edit. The structural rule needs none.
