# OPS_WEBHOOK_URL — Founder Setup

**State: ABSENT** (secret names inspected 2026-07-31; values never read). Two real failures this morning — a quality-gate refusal and a CI test-gate refusal — were again visible only in the Actions tab.

1. **Secret name:** `OPS_WEBHOOK_URL` (GitHub → Settings → Secrets → Actions). Any endpoint accepting a JSON `POST` works; the payload carries `text`/`content` fields (Slack/Discord-compatible) plus structured context. No provider is recommended here — that choice is yours.
2. **Contract:** workflow, phase, ET slate date, exit status, run URL/id/attempt, newest board + newest settled dates, one redacted error line (≤200 chars; paths/keys/hashes stripped — guard-tested against the real money hash). Never: secrets, payloads, money detail, traces.
3. **Safe test (no production risk):** `OPS_ALERT_PRINT_ONLY=1 PHASE=test EXIT_STATUS=1 ERROR_LINE="synthetic" bash scripts/ops_alert.sh` prints the exact payload without sending. To test delivery, export `OPS_WEBHOOK_URL` locally and rerun without the flag.
4. **Rollback:** delete the secret. Workflows degrade to the honest log-only notice; nothing breaks.
