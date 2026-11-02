# Proposal: scheduled posts that survive a closed Mac

Status: proposal. Nothing here is built or authorized.

## What happened

PHI @ WSH was due at 7:30 PM EST on Nov 1 and was recorded as missed after kickoff. The cause is not proven; the
evidence fits the Mac sleeping or the console stalling.

## What survives today

| Event | Scheduled job | Result |
|---|---|---|
| Console restart | Survives in the ledger | Runs if the console returns before the start time |
| Mac asleep, wakes in time | Survives | Runs on the next tick |
| Mac closed past the start time | Survives | Recorded as missed, never sent late |
| Console stopped | Survives | Same, and no alert reaches anyone |
| Mac off | Survives on disk | Nothing runs |

`caffeinate -i` does not hold a closed lid on battery.

## Options

**A. Keep the Mac, harden it (no new cost).** Run the console under a user LaunchAgent that restarts it. Use the
committed monitor to alert on console down, missed jobs and sleep gaps. This improves detection only. A closed Mac
still sends nothing.

**B. Hosted publisher (recommended, needs founder cutover authorization).** The code exists in `hosted/` and
`deploy/`. A cloud job sends founder-approved posts, so a closed Mac no longer matters. Cost and current readiness
are unmeasured here, and the Mac must stop sending first: one sender at a time, enforced by `activeHost`.

## Rules for B

1. Only a job the founder saved can run. Nothing approves, schedules or retries by itself.
2. The same gate runs at send, including holds, once-only checks and the spend cap.
3. No autonomous production writes. The publisher posts approved jobs and records results.
4. An unknown create-post outcome is never retried.
5. The ledger moves over with a verified sync, and receipts stay intact.
6. Hold release and replace-held stay off hosted until the passkey step-up exists.

## Decision needed

Authorize A now, and a measured readiness review for B.
