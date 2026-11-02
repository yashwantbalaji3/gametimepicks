# Publishing operations runbook

Scope: local console, scheduled jobs, monitoring and safe restart. Nothing here sends without founder approval.

## Monitors (read-only)

| Check | Command | Alert | Owner |
|---|---|---|---|
| Jobs, console, sleep | `node command-center/scripts/publish-monitor.mjs` | MISSED, REFUSED, UNKNOWN, FAILED_NOT_SENT, OVERDUE, CONSOLE_DOWN, MAC_ASLEEP_OR_FROZEN | Command Center |
| Missing packages | `node command-center/scripts/package-coverage.mjs 48 6` after `git fetch` | ALERT_NO_PACKAGE inside 6 hours of the start | Launch Readiness makes the package; Command Center reports it |
| Receipts | `node command-center/scripts/reconcile-receipts.mjs <ledgerDir> <months>` | Any mismatch or repeated slot | Command Center |

Run plan: the monitor runs while the console runs; coverage runs hourly on game days. Neither is scheduled yet. Both
stop when the Mac sleeps, so a silent monitor is not good news. A sleep gap is only seen after the Mac wakes.

## Failure ownership

| Failure | Owner | Action |
|---|---|---|
| Console down | Founder restarts | Safe restart below |
| Capture runner dead, stale input | Launch Readiness | Recover; no guessed values |
| VERIFICATION_CHANGED with real data | Launch Readiness | New version, new approval |
| UNKNOWN outcome | Founder + Command Center | Look up X, reconcile. Never retry |
| Missed job | Nobody retries | Event started: closed |

## Safe restart

1. Read the Publishing page. Restart only with no job due within 10 minutes and none in `unknown`.
2. Ctrl+C, confirm port 4190 is free.
3. Start from the live worktree: `caffeinate -i node command-center/surfaces/console/server.mjs`
4. Confirm `/api/state`: receipts unchanged, jobs unchanged, tick advancing.

Jobs, approvals, receipts and spend live in the ledger and survive. A restart loads the code then checked out.

## Preflight without the live console

Run a throwaway console from the branch on another port, with `GTP_CC_OUT_DIR` on a ledger copy, `GTP_CC_IMPORT_ROOT` on
a copy of the packages and their images, `GTP_CC_X_VAULT=memory` and `GTP_CC_AUTO_IMPORT=off`. Then POST
`/api/gate-check`. It runs the real recheck and cannot send. Approvals and jobs must still be made on the live console.

## Hosted path

See `persistent-scheduling-proposal.md` and `action-confirmation-contract.md`. Once-only claims, unknown-never-retried
and the spend cap stay. One sender at a time. No autonomous writes.
