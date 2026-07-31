# Analytics Endpoint Resource Impact (2026-07-31, Program 088-091)

Quantifies what activating the approved analytics contract would do to existing resources —
so the endpoint decision (still the founder's, per §7.1 of the decision memo) is made with
numbers, not vibes. Nothing here activates anything.

## Event volume model (beta scale)

Closed-enum taxonomy (14 names), day-bucketed, validated-before-send. At public-beta traffic
(order of 10–100 daily visitors, single-digit events/visit):

| Load | Estimate |
|---|---|
| Events/day | ~50–1,000 |
| Payload size | ~200–400 bytes/event (closed enums, no free text) |
| Ingress/day | **~10 KB–400 KB** — noise at any infrastructure scale |
| Storage/yr at the high end | < 150 MB raw JSON; far less rolled up to day-level counts |

## Impact per option (from `ANALYTICS_ENDPOINT_OPTIONS.md`)

| | A · First-party collector (recommended) | B · Plausible CE | C · Umami |
|---|---|---|---|
| Vercel build minutes | none (one function does not change the static build) | none | none |
| Vercel functions cost | **the one real change**: adds the first serverless function to an otherwise function-free project — invocations = events/day, well inside Pro's included allowance at beta volume; must be rate-limited + size-capped + origin-checked | none (external VPS) | none (external host) |
| Vercel bandwidth | +ingress only (KB/day) | none | none |
| New monthly bill | $0 | VPS $5–20/mo | ~$0 (free tiers) |
| Retention control | exact (`dayBucket` only stored) | stores request timestamps (finer than contract) | stores request timestamps |
| Ops burden | rate-limit + roll-up job we own | ClickHouse+Postgres babysitting | one app + Postgres |

**Guardrails already in the contract that cap resource risk:** kill-switch env flag (instant
off, no code change); half-configuration = NOOP (can't leak load before the endpoint exists);
validation drops malformed events client-side (no junk ingress); no backfill (no burst load at
activation); analytics failure can never affect the public site (beacon fire-and-forget).

## Bottom line

At beta volume, analytics is resource-trivial under every option. The decision axis is privacy
fidelity and ops ownership, not cost. Option A's only real resource question — introducing a
serverless function to a static-export project — is bounded by rate-limiting and included Pro
allowances, and it keeps stored data exactly at the contract's day-bucket resolution. If beta
traffic 100×'s, revisit with measured function invocation counts before any plan change.
