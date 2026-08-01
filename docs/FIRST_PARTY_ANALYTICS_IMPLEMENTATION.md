# First-Party Analytics Implementation (Program 092-095 Lane G)

**State: STAGING_PROVEN on real infrastructure — production activation is one founder action.**
No new vendor, no new paid plan, no conversion away from static export.

## Architecture (the compatibility question, answered empirically)

A single Vercel serverless function at the **project-root `/api` convention** (`app/api/collect.mjs`;
the Next app lives under `src/`, so this directory belongs to Vercel, not Next). **Proven on a
real preview deployment 2026-07-31**: the function deployed and executed beside the untouched
static export (build-info served from the same deployment). No `output: "export"` change, no
Next API routes, no new package (Blob is reached via its REST API with `fetch`).

- Validation core: `app/api/_collect-core.mjs` — pure, unit-tested; closed event-name enum and
  property-key allowlist **parity-guarded against `event-contract.ts`** (drift fails the suite).
- Storage: append-only day-bucketed objects (`analytics/<dayBucket>/<uuid>.json`) via Vercel
  Blob REST — write-only from the function, one tiny object per event, no read-modify-write
  races; an internal roll-up aggregates for the /ops dashboard (which remains pruned from the
  public export — guard-tested boundary, `out/api` asserted absent).
- Never stored or logged: IP, user-agent, referrer, cookies, headers, values of rejected
  payloads. Only dayBucket time resolution can exist end-to-end.

## Staging proof (black-box, preview deployment `gametime-picks-96r1il9nf…`)

| Probe | Result |
|---|---|
| Valid closed-enum event | accepted, normalized verbatim (`{schemaVersion, event, dayBucket, sport}`) |
| Forbidden key (`email`) | rejected — `forbidden key: email` (key name only, value never echoed) |
| Free text in an enum field | rejected — `value for cta is not enum-like` |
| Precise timestamp as dayBucket | rejected — `dayBucket must be YYYY-MM-DD` |
| Kill switch (default state) | **silent 204, zero body** — disabled/failed analytics is invisible to the UI |
| Malformed JSON | 400 from platform body parsing, zero body (never reaches the handler; the beacon client never reads responses) |
| Static export on same deployment | intact |

Unit proofs (suite): 8 collector-contract tests incl. enum/key parity with `event-contract.ts`
and the public-boundary assertion. The staging echo mode is structurally dead in production:
it exists only when `BLOB_READ_WRITE_TOKEN` is absent, i.e. when nothing can be stored at all.

## The one founder action (production activation)

In the Vercel dashboard, canonical project `gametime-picks`:
1. Create a **Blob store** (Storage tab — included with the plan; usage-based with included
   allowance; ~KB/day at beta volume) and attach it, which sets `BLOB_READ_WRITE_TOKEN`.
2. Set env vars: `ANALYTICS_COLLECTOR_ENABLED=1`,
   `NEXT_PUBLIC_ANALYTICS_ENABLED=1`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT=/api/collect/`
   (trailing slash — the site's `trailingSlash` redirect otherwise 308s the beacon).
3. Redeploy. Measurement begins at activation; **no backfill**.

Rollback/kill: unset `ANALYTICS_COLLECTOR_ENABLED` (server dead, silent 204) or
`NEXT_PUBLIC_ANALYTICS_ENABLED` (client sink → NOOP) — either alone fully stops collection.

## Resource impact

Function invocations = events/day (~50–1,000 at beta) — inside included Pro allowances; storage
KB/day; zero effect on build time or static serving (measured: the preview built normally).
Until the founder action, production remains provably dark: client sink NOOP (both
`NEXT_PUBLIC_*` vars absent) AND server kill-switched AND storeless.
