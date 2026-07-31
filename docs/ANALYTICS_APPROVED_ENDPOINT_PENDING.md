# Analytics — Approved, Endpoint Pending (2026-07-31)

**State: APPROVED_NOT_CONFIGURED.** This is the terminal state of Program 084–087 Lane C, and it is
the correct one: the founder approval received today authorizes the *contract*, and explicitly does
**not** authorize choosing an endpoint or provider.

## What changed today

- §7 of [`ANALYTICS_ACTIVATION_DECISION.md`](ANALYTICS_ACTIVATION_DECISION.md) is now **signed
  Approve** (see §7.1 for the recorded decision and its exact constraints, dated 2026-07-31).
- Nothing else changed. The event taxonomy, privacy fields, kill switch, and NOOP default are
  untouched; no env variable was set; no account was created; no endpoint exists.

## Verified activation-state ladder

| State | Verified today |
|---|---|
| APPROVED_NOT_CONFIGURED | **← current.** §7 signed; `NEXT_PUBLIC_ANALYTICS_ENABLED` / `NEXT_PUBLIC_ANALYTICS_ENDPOINT` absent from secrets, repo vars, env files, and CI (names inspected, values never read) |
| AUTHORIZED_ENDPOINT_PRESENT | not reached — no approved endpoint exists |
| STAGING_PROVEN | not reached |
| PRODUCTION_ENABLED | not reached |

The sink provably resolves to NOOP with half or no configuration (guard-tested in the suite), so
production remains honestly dark and every adoption metric stays `NOT_YET_MEASURED`.

## The one remaining founder decision

Pick an endpoint option in [`ANALYTICS_ENDPOINT_OPTIONS.md`](ANALYTICS_ENDPOINT_OPTIONS.md)
(three options prepared with costs, privacy, maintenance, and data-retention tradeoffs;
recommended default: **Option A — first-party collector on the existing Vercel project**, $0
incremental at beta volume, strongest privacy, zero exit cost; its honest cost is one focused
build session for the rate-limited collector + roll-up).

After that decision, the already-defined path applies unchanged:
provision endpoint → staging payload inspection (only closed-enum, day-bucketed, PII-free events;
kill switch verified; endpoint failure cannot affect the UI) → set the two build-time variables in
production → metrics begin at `NOT_YET_MEASURED`, no backfill.
