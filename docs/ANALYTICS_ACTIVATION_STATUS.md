# Analytics Activation Status

**Program:** 076–079 · **Date:** 2026-07-31 · **State: BLOCKED BY FOUNDER — production honestly dark.**

## What was verified this session

- **No endpoint exists.** The repository's GitHub secrets are `API_FOOTBALL_KEY`, `BALLDONTLIE_API_KEY`, `ODDS_API_KEY` (names inspected, values never read); no `OPS_WEBHOOK_URL`, no analytics endpoint. Repo variables carry pipeline tuning only — no `NEXT_PUBLIC_ANALYTICS_ENABLED` / `NEXT_PUBLIC_ANALYTICS_ENDPOINT` anywhere.
- **§7 of `ANALYTICS_ACTIVATION_DECISION.md` remains unsigned.** Nothing was signed on the founder's behalf; no provider was selected.
- **The dark state is proven, not assumed**: the sink resolves to NOOP with half or no configuration (guarded), the PII denylist and closed-enum contract hold (guarded), and the observer reports `analytics OFF` from the real build inputs.

## What is already built and waiting

Schema v2 (14-name taxonomy, closed enums, day buckets, no PII/odds/money fields) · funnel instrumentation on every real public control that survived the cleanup · deterministic adoption aggregator whose every metric supports `NOT_CONFIGURED / NOT_YET_MEASURED / NOT_ENOUGH_DATA / MEASURED` · internal `/ops` adoption panel (pruned from the export — verified again after the cleanup) · kill-switch and staging procedure · endpoint options analysis with a recommended default (`ANALYTICS_ENDPOINT_OPTIONS.md`).

**Every adoption metric is `NOT_YET_MEASURED`. No number has been invented, and none will render as a measured zero.**

## The one founder action

1. Pick an option in `docs/ANALYTICS_ENDPOINT_OPTIONS.md` (a no-cookie first-party collector; recommended default named there) and sign §7 of `docs/ANALYTICS_ACTIVATION_DECISION.md`.
2. Provision the endpoint and set the two build-time variables in Vercel — staging first.
3. Staging proof before production: inspect network payloads; only closed-enum, day-bucketed, PII-free events may leave the browser; verify the kill switch.

Until then, the seven-day observation plan runs on operational evidence only, and the adoption dashboard states remain honest placeholders.
