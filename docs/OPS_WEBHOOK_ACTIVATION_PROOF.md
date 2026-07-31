# OPS_WEBHOOK_URL — Activation Proof (2026-07-31)

**State: DELIVERY_PROVEN** (upgraded from ABSENT → CONFIGURED_UNVERIFIED → DELIVERY_PROVEN today).
No secret value was ever read or printed; every check below used names, exit paths, or run logs only.

## Evidence chain

1. **Secret exists.** `gh secret list` shows `OPS_WEBHOOK_URL` created **2026-07-31T16:01:33Z**
   (names only; values never accessible). This matches the founder's report that the webhook is now set.
2. **One informational delivery sent through the real path.** Workflow `ops-alert-test`
   (dispatch-only, added this program) ran `scripts/ops_alert.sh` with `OPS_ALERT_TEST=1` against the
   real secret — run [30647650414](https://github.com/yashwantbalaji3/gametimepicks/actions/runs/30647650414),
   job 91212915247, **2026-07-31T16:34Z, conclusion: success**.
3. **Delivery outcome is positive, not assumed.** The script emits exactly one of three signals:
   `::notice::OPS_WEBHOOK_URL unset` (not configured), `::warning::ops alert delivery failed`
   (configured but POST failed), or silence + summary `delivery: delivered` (POST accepted).
   The full job log contains **zero** occurrences of the first two strings and the informational
   `::notice::…delivery TEST…` annotation — the POST was accepted by the endpoint.
4. **The message was labeled a test.** `OPS_ALERT_TEST=1` renders
   *"GameTimePicks ops-alert delivery TEST on main (informational — nothing failed)"* — it cannot be
   mistaken for a production failure, and it still carries the operator context (slate date, newest
   board, newest settled, run URL).

## Contract proofs (re-run this session, all green — `bash scripts/ops_alert_test.sh`)

- **Hostile-input redaction:** local paths, CI checkout paths, key-shaped tokens, and 32+ hex hashes
  (including the protected money md5) are stripped from the error line.
- **Truncation:** the only free-form field is hard-capped at 200 chars; multi-line traces reduce to one line.
- **No masking:** the alerter always exits 0 — an unreachable webhook cannot fail (or rescue) the
  primary workflow result; the failing step is what fails the run.
- **No duplicate spam:** one alert per failed run (`if: failure()` on a single step per workflow);
  the test workflow is `workflow_dispatch`-only with a concurrency group.
- **Wiring intact:** all four production workflows (`nightly-settle`, `morning-projections`,
  `mlb-daily-production`, `mlb-pregame-capture`) route through `scripts/ops_alert.sh`; the guard
  asserts no workflow hand-rolls its own payload, and no workflow embeds a literal webhook URL.

## What the founder should expect

Nothing, most days. A message arrives only when a scheduled production workflow fails, carrying:
workflow + phase, ET slate date, exit status, newest board + newest settled dates, one redacted
error line (≤200 chars), and the run URL. Rollback: delete the secret — workflows degrade to the
log-only notice; nothing breaks.

_If the informational test message did **not** arrive in the founder's channel despite the accepted
POST above, the endpoint is swallowing payloads (e.g. wrong channel routing) — that is an endpoint
configuration issue, not a repository one; re-run the `ops-alert-test` workflow after adjusting._
