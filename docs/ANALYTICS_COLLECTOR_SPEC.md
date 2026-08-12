# First-Party Analytics Collector — Deployment Specification (Program 165 · Release D)

What the founder (or whoever hosts it) must stand up; this repository never creates the external
service. The client side is already complete and fail-closed (lib/analytics: NOOP without the
flag; forbidden properties rejected in tests).

- **Endpoint contract:** POST `<NEXT_PUBLIC_ANALYTICS_ENDPOINT>` accepting the committed event
  schema (lib/analytics/event-contract) as JSON; respond 204; reject anything outside the schema
  version with 400 (never store unknown shapes).
- **Allowed origins:** exactly the production origin (and preview when testing) — CORS-restricted.
- **Ingest control:** if the collector needs a write token, it lives SERVER-SIDE at the collector;
  the public site never carries it (NEXT_PUBLIC_* is bundle-visible by definition).
- **Data minimization:** store only the schema's fields — no IP retention beyond transient
  abuse-limiting, no cookies, no user ids, day-granularity timestamps (the §7 privacy basis).
- **Region/retention:** founder decision — recommend single region + 90-day rolling retention
  with a deletion owner named.
- **Rate limits:** modest per-IP limits; drop, never queue, over-limit events.
- **Monitoring:** count accepted/rejected/over-limit per day — that count IS the data-quality
  dashboard v1.
- **Rollback:** unset `NEXT_PUBLIC_ANALYTICS_ENABLED` (hard client kill), then retire the endpoint.
