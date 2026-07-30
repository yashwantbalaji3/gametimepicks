# Operations Alerting Contract

**Program:** 069–072 · **Implementation:** `scripts/ops_alert.sh` · **Guard:** `scripts/ops_alert_test.sh` (wired into `run_all_tests.sh`)
**Status:** IMPLEMENTED · delivery **BLOCKED BY FOUNDER** (no endpoint configured)

---

## Why this exists

On 2026-07-30, `nightly-settle` failed for real. The orchestrator behaved perfectly: it exited non-zero, aborted publish at the health gate, and raised a workflow error. And then nothing happened for two days, because the only place that error appeared was the Actions tab.

A failure nobody is told about is operationally indistinguishable from a failure that was swallowed. The pipefail work made failures *visible*; this makes them *delivered*.

Four workflows each carried their own inline notify block — same four lines of shell, copy-pasted, none of them carrying slate context. They now all call one script.

## What an alert contains

| Field | Source | Why an operator needs it |
|---|---|---|
| workflow + failing phase | `PHASE` | which part of the day broke |
| ET slate date | `SLATE_DATE`, defaulting to today ET | which slate is affected |
| exit status | `EXIT_STATUS` | crash vs refusal |
| newest board date | read from `app/public/data/mlb/boards/` | **is generation still working?** |
| newest settled date | read from the settled ledger | **how far behind is the record?** |
| run URL + run id + attempt | GitHub env | the audit trail, and deduplication context |
| short error class/message | `ERROR_LINE`, redacted and truncated | what actually went wrong |

The two freshness fields are the point. "nightly-settle failed" is a fact; "nightly-settle failed, newest board 2026-07-30, newest settled 2026-07-27" tells you in one glance whether this is a blip or a three-day hole — which is exactly the judgement nobody was able to make in time on July 30.

## What an alert must never contain

- secrets or environment values
- raw sportsbook payloads
- user information
- bankroll, exposure, or protected hashes
- large logs, or stack traces containing local paths

`ERROR_LINE` is the only free-form field, so it is the only place a leak can enter. It is therefore:

1. reduced to its **first line** (a whole traceback is both noise and a leak),
2. stripped of local (`/Users/…`, `/home/…`) and CI checkout paths,
3. stripped of key-shaped tokens (24+ chars), 32+ char hashes (which covers the protected md5s), and `apiKey=`/`token=`/`secret=`/`password=` pairs,
4. truncated to 200 characters.

The guard test asserts each of these against a deliberately hostile input containing a local path, an API key and the real protected money hash.

## Behaviour

- **One message per failed run**, not per shell step — the step is `if: failure()` at job level.
- **Delivery never masks the primary failure.** `ops_alert.sh` always exits 0. The failing step is what fails the run; alerting is observability, not a gate. An unreachable webhook logs a warning and moves on.
- **An unconfigured webhook is honest, not silent**: the run logs `OPS_WEBHOOK_URL unset - this failure is visible only in the Actions tab.`
- **Delivery outcome is recorded** in the GitHub step summary (`delivered` / `FAILED to deliver` / `not attempted`), so the audit trail says whether a human was actually told.
- **GitHub Actions remains authoritative.** The webhook is a notification, never the record.

## Founder action — the one thing still required

Delivery is inert until an endpoint exists. No service has been selected on your behalf.

1. Choose a destination that accepts a JSON `POST` (a Slack/Discord incoming webhook both work with the `text`/`content` fields already in the payload; any first-party endpoint works too).
2. Add it as the repository secret **`OPS_WEBHOOK_URL`**. All four workflows already read it.
3. Verify without breaking production — **do not fail a real run to test this**:
   ```
   OPS_ALERT_PRINT_ONLY=1 PHASE=test EXIT_STATUS=1 ERROR_LINE="synthetic check" bash scripts/ops_alert.sh
   ```
   prints the exact payload without sending it. To test delivery, set `OPS_WEBHOOK_URL` locally and run the same command without `OPS_ALERT_PRINT_ONLY`.

Until then every scheduled failure remains visible only to whoever opens the Actions tab.

## Evidence labels

- **PROVEN** — payload contract, redaction, truncation, exit-0-on-delivery-failure, and the "no workflow hand-rolls its own payload" sweep are all asserted by `scripts/ops_alert_test.sh`, which runs in `run_all_tests.sh`.
- **MEASURED** — the freshness fields are read from the real board directory and ledger, not passed in by the caller; the test pins that by asserting the newest settled date differs from the slate date.
- **BLOCKED BY FOUNDER** — no `OPS_WEBHOOK_URL` is configured, so no alert has ever been delivered.
- **NAMED LIMITATION** — a scheduled failure is currently visible only in the Actions tab. This is the direct cause of the two-day July 30 outage.
- **REJECTED** — failing a production run to prove delivery works; selecting a notification vendor without approval.
- **FUTURE WORK** — escalation if consecutive runs fail; a daily heartbeat so silence is distinguishable from health (today, no alert means either "nothing broke" or "the alerter is broken").
