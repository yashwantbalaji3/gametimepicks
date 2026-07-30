# Analytics Endpoint Options — for the founder decision (NOTHING IS CHOSEN OR DEPLOYED)

**Status:** OPTIONS PREPARED · **Decision owner:** founder · **Nothing here has been provisioned, purchased,
signed up for, or configured.** No vendor account exists. No endpoint is set. `NEXT_PUBLIC_ANALYTICS_ENABLED`
and `NEXT_PUBLIC_ANALYTICS_ENDPOINT` are unset everywhere, so `resolveSink()` returns the NO-OP and nothing
leaves any browser.

This document exists because §7 of [`ANALYTICS_ACTIVATION_DECISION.md`](ANALYTICS_ACTIVATION_DECISION.md)
is still **unsigned** and step 2 of its activation checklist ("provision an approved no-cookie, first-party
endpoint") had no concrete options to choose between. It supplies the options and one recommended default.
It does not make the choice.

---

## 0. Repository search performed before writing this

A founder-approved endpoint config would have shown up in one of these; none of them contains one:

| Where an approved endpoint would live | Found |
|---|---|
| `ANALYTICS_ACTIVATION_DECISION.md` §7 decision record | **unsigned** — all three boxes empty, no signature, no date |
| `NEXT_PUBLIC_ANALYTICS_ENDPOINT` in any env file, CI workflow, or deploy config | **absent** |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` set anywhere | **absent** |
| A vendor SDK or account reference in `app/package.json` / source | **absent** — the layer imports no external SDK by design |

Conclusion: the endpoint decision is genuinely open, and production measurement stays dark until the founder
closes it.

---

## 1. What any option must satisfy (non-negotiable, from the activation memo §4)

1. **No cookie, no cross-site identifier, no fingerprint.** Our events already carry none; the sink must not
   add one.
2. **First-party or self-hosted.** The founder owns the store. No data brokering, no third-party profile.
3. **Event-count oriented.** Aggregates. Not session replay, not heatmaps, not user profiles.
4. **Day granularity.** Our only time-like field is a coarse `dayBucket`; a provider that timestamps to the
   second is storing more than we collect.
5. **Accepts our exact wire shape** — a validated, closed-enum JSON event from `event-contract.ts`
   (`SCHEMA_VERSION = 2`), posted by `navigator.sendBeacon`. No transformation, no enrichment.
6. **Exportable to the capture format** the internal dashboard already consumes
   (`docs/ADOPTION_DASHBOARD_CONTRACT.md` §2). If a provider cannot emit that file, the adoption dashboard
   cannot read it.

**Explicitly out of scope, whatever the cost saving:** Google Analytics, Meta Pixel, Segment, or any
provider that sets a cross-site cookie, builds a user profile, or resells traffic data.

---

## 2. The three concrete options

### Option A — First-party collector on the existing Vercel project

A single serverless function (`/api/collect`) on the domain the site already serves from. It re-validates
each event with the *same* `validateEvent()` the browser used, drops anything invalid, and appends the
accepted event to an append-only store the founder owns (Vercel Blob, or Neon/Vercel Postgres, or a daily
JSON object). A small scheduled job rolls the store into the capture file the /ops dashboard reads.

- **Cost:** $0 incremental on the existing Vercel plan at beta traffic; storage is kilobytes per day.
- **Ops burden:** lowest ongoing — no server to patch, no database to babysit if Blob/JSON is used. Highest
  *initial* build (the function, the store, the roll-up job) — roughly one focused session.
- **Privacy:** strongest. Same-origin request, so no third-party host ever sees a visitor. No vendor
  processes the data at all; no DPA, no sub-processor, no consent banner triggered by a third party.
- **Schema fit:** exact. The stored row *is* our event; nothing is mapped or renamed.
- **Exit cost:** zero. The store is a file/table the founder already owns.
- **Caveat:** the static export currently has no API surface — enabling one function is a real (small)
  architecture change, and it must be rate-limited and size-capped or it is an open write endpoint.

### Option B — Self-hosted Plausible (Community Edition)

Plausible CE on a small VPS (or a container host), backed by its Postgres + ClickHouse pair. Events arrive
as Plausible "custom events" with our closed-enum fields as event properties.

- **Cost:** a VPS that can carry ClickHouse comfortably — the smallest realistic tier, monthly, ongoing.
- **Ops burden:** highest. Two databases, upgrades, backups, TLS, and disk growth are now the founder's job.
- **Privacy:** strong and well-documented (cookieless by design, no cross-site identifier), and self-hosting
  keeps the data on infrastructure the founder controls.
- **Schema fit:** good but lossy. Plausible models a *pageview-plus-properties* world; our events are a
  closed union with per-event required fields, and CE imposes limits on custom properties per event. Some
  events would need flattening, and the property allowlist would live in two places instead of one.
- **Exit cost:** moderate — data is exportable, but through Plausible's schema, not ours.
- **Bonus:** a usable dashboard exists on day one, without building one.

### Option C — Self-hosted Umami

Umami on a container host (or the founder's Vercel account) with a managed Postgres (a free-tier Neon
database is sufficient at beta volume). Events arrive as Umami custom events with JSON payload data.

- **Cost:** near $0 at beta volume on free tiers; a small monthly bill once traffic grows.
- **Ops burden:** low-to-moderate — one app, one Postgres, straightforward upgrades. Lighter than Option B.
- **Privacy:** strong (cookieless, no cross-site identifier) and self-hosted, so the store is the founder's.
- **Schema fit:** good. Umami's event-data model accepts arbitrary key/value payloads, so our events survive
  mostly intact — but they arrive as *its* rows, and the day-bucket semantics are ours to preserve rather
  than the tool's to enforce.
- **Exit cost:** low — Postgres the founder already owns; a SQL query produces the capture file.
- **Caveat:** it is still a third-party application processing the events, even when self-hosted; it will
  record a request timestamp finer than our `dayBucket`, which is more time resolution than we collect.

---

## 3. Comparison

| | **A · First-party collector** | **B · Self-hosted Plausible** | **C · Self-hosted Umami** |
|---|---|---|---|
| Incremental cost at beta volume | none | monthly VPS | ~none (free tiers) |
| Initial build effort | highest | low | low |
| Ongoing ops burden | lowest | highest | low–moderate |
| Third party sees a visitor | never | never (self-hosted) | never (self-hosted) |
| Stores more than we collect | no | yes (request timestamps) | yes (request timestamps) |
| Wire-shape fidelity | exact | lossy (property limits) | good |
| Ready-made dashboard | no (we have /ops) | yes | yes |
| Produces the capture file | directly | via export | via SQL |
| Exit cost | zero | moderate | low |

---

## 4. Recommended default (a recommendation, not a decision)

**Option A — the first-party collector.**

The reasoning is specific to this product, not a general preference:

1. The adoption dashboard and its aggregator are **already built** and already read a capture file
   (`docs/ADOPTION_DASHBOARD_CONTRACT.md` §2). Options B and C would each add a second dashboard whose
   definitions of activation and retention are *not* the ones fixed in the analytics contract — which is
   exactly how a measurement story drifts from the honest one.
2. Our events are a closed discriminated union with per-event required fields. Option A stores that shape
   verbatim; B and C store a flattened approximation, so the property allowlist would have to be enforced
   twice.
3. It is the only option under which **nothing beyond `dayBucket` is ever recorded**. B and C both write a
   request timestamp, which is finer resolution than the contract permits us to collect.
4. There is no vendor to select, sign with, or leave, so the decision is reversible at no cost.

Its real disadvantage is honest: it needs an API surface the static export does not have today, and that
endpoint must be rate-limited, size-capped, and origin-checked or it is an unauthenticated write endpoint.
Budget that work explicitly rather than discovering it during activation.

**Pick Option C instead if** the priority is seeing numbers this week with the least build effort and a
ready-made dashboard is worth accepting a second definition of the metrics.
**Pick Option B only if** the founder specifically wants Plausible's dashboard and is willing to own a
ClickHouse deployment.

---

## 5. What happens after a choice — and what still does not

Choosing an option changes nothing on its own. Activation still requires, in order:

1. Sign §7 of [`ANALYTICS_ACTIVATION_DECISION.md`](ANALYTICS_ACTIVATION_DECISION.md).
2. Provision the chosen endpoint.
3. Run the **staging rehearsal** in [`ADOPTION_DASHBOARD_CONTRACT.md`](ADOPTION_DASHBOARD_CONTRACT.md) §5 —
   verify in the browser network tab that only allowlisted, day-bucketed, PII-free events are sent.
4. Only then set both env vars on the production build.

Until step 4, `/ops` reads `NOT YET MEASURED` for every adoption figure, which is the truth.

**This document does not choose, provision, purchase, or deploy anything.**
