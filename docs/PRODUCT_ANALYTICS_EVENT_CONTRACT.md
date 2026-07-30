# Product Analytics Event Contract

**Phase 9 · product-adoption sprint · provider-neutral, PII-free measurement plan**

> **Superseded-in-part (v2, Program 058-061):** the taxonomy grew into the public-beta research-terminal
> contract — [`PUBLIC_BETA_ANALYTICS_CONTRACT.md`](PUBLIC_BETA_ANALYTICS_CONTRACT.md) (`SCHEMA_VERSION = 2`).
> Every event below still exists unchanged; v2 adds events and maps program names onto the existing ones.

Status: **CONTRACT ONLY — no provider is activated, no instrumentation is wired into pages, no network call is made.** Turning on a real provider is a founder decision (see the last section).

Single source of truth for the typed schema: [`app/src/lib/analytics/event-contract.ts`](../app/src/lib/analytics/event-contract.ts).
Guardrail tests: [`app/src/lib/analytics/event-contract.test.mjs`](../app/src/lib/analytics/event-contract.test.mjs).

---

## 1. Why this exists

The sprint's premise is that **clarity + daily use** should improve as the product gets clearer. To know whether that is actually happening we need to measure a handful of adoption signals across the P0 surfaces — **without** activating a third-party tracker and **without** collecting personal data.

This document defines *what* we would measure and *what question each measurement answers*. The companion module defines the typed shapes and a no-op-by-default emitter. Neither one sends anything anywhere.

---

## 2. Hard privacy constraints (non-negotiable)

- **No provider is activated.** No Google Analytics / gtag, Plausible, PostHog, Segment, Mixpanel, Fathom, Umami, or any other tracker. The module imports **no external SDK**.
- **No network call by default.** `emitEvent`'s default sink is a **pure no-op**. It sends nothing, stores nothing, logs nothing.
- **No PII, ever.** No names, emails, IP addresses, precise geolocation, device fingerprints, user-agents, screen metrics, timezones, cookies, or cross-site identifiers. The property-key **allowlist is closed** and a test asserts it never overlaps a PII **denylist**.
- **Day granularity only.** The only date-like field is a coarse **day bucket** (`YYYY-MM-DD`) — the same public slate date every visitor sees. Never a precise timestamp.
- **First-party only.** The single stateful signal (return-day) is derived from a same-origin day bucket the caller already holds. No cross-site ID, no cookie, no third party.
- **A live provider requires founder approval.** Wiring a real sink is a decision, not a default (Section 6).

---

## 3. Shared definitions

| Concept | Definition | Why it is not PII |
|---|---|---|
| **Day bucket** | Coarse ET calendar day, `YYYY-MM-DD`. Day granularity only. | A calendar date is identical for every visitor that day; it identifies a *day*, not a *person*. |
| **Surface** | A closed enum naming *where* the event happened (`homepage`, `daily_hub`, `game_report`, `results`, `learn`/`trust`, `app`). | A page name, not a person. |
| **Sport** | Closed enum of live sports (`mlb`, `nba`, `nhl`, `ipl`, `ufc`, `multi`, `unknown`). | Content dimension, not a person. |
| **Return cohort** | Coarse bucket (`first_visit`, `same_day`, `next_day`, `within_week`, `later`) derived from a first-party day bucket. | A bucket, never a visit count, timestamp, or ID. |

Every event also carries `schemaVersion` (wire-shape version) and `dayBucket` (the coarse day it fired).

---

## 4. Event catalog (P0 surfaces)

Each event is minimal: a discriminant, a coarse surface, and only closed-enum / boolean / day-bucket properties. No free-form strings.

### 4.1 `home_cta_click` — homepage primary CTA click
- **Fires when** a visitor clicks the homepage primary or secondary CTA (e.g. *Simulate Today's Games* → `/simulate`, secondary → `/today`).
- **Properties** — `surface: "homepage"`, `cta: "primary" | "secondary"`, `destination` (coarse route bucket: `simulate` / `today` / `results` / `learn` / `games` / `other`; never a full URL or query), `dayBucket`.
- **Adoption question** — *Does the homepage hero convert visitors into the core action (simulate / today)?*

### 4.2 `daily_hub_view` — daily hub visit
- **Fires when** a daily hub renders (`/today` or a sport hub such as `/mlb`).
- **Properties** — `surface: "daily_hub"`, `sport`, `slateDateBucket` (the slate's public date), `dayBucket`.
- **Adoption question** — *Are people reaching the daily hub, and for which sport?*

### 4.3 `game_report_open` — game report open
- **Fires when** a game report opens (`/games/[sport]/[gameId]`).
- **Properties** — `surface: "game_report"`, `sport`, `dayBucket`. *(No game/content id — kept minimal. A coarse content id could be added later if the founder wants a per-game funnel; it would still be non-PII.)*
- **Adoption question** — *Are game reports — the core value surface — actually being opened?*

### 4.4 `results_recap_open` — results recap open
- **Fires when** a results / receipts recap opens (`/results` or a sport results page / drilldown).
- **Properties** — `surface: "results"`, `sport`, `dayBucket`.
- **Adoption question** — *Do visitors check results/receipts (the trust loop)?*

### 4.5 `share_action` — share action
- **Fires when** a visitor activates a share control (native share sheet or copy-link). *(No dedicated share control ships today; the emitter is wired when one does.)*
- **Properties** — `surface` (coarse origin: `game_report` / `results` / `daily_hub` / `other`), `method: "native" | "copy_link"`, `sport`, `dayBucket`. **No recipient, target, channel, or link is recorded** — only that a share was *initiated*.
- **Adoption question** — *Is the content compelling enough that people share it?*

### 4.6 `learn_trust_open` — Learn / Trust open
- **Fires when** a clarity/trust page opens: `/learn` ("How It Works"), Methodology, Market Guide, Responsible Use, or the Results Trust Center.
- **Properties** — `surface: "learn" | "trust"`, `trustSurface: "how_it_works" | "methodology" | "market_guide" | "responsible_use" | "results_trust"`, `dayBucket`.
- **Adoption question** — *Are visitors seeking to understand the product (the clarity loop)?*

### 4.7 `return_visit` — return-day visit *(privacy-first, no PII)*
- **Fires when** the app loads and a **first-party day bucket** (same-origin storage the caller already holds) shows the visitor was last seen on a prior calendar day.
- **Mechanism** — the caller keeps two coarse day strings in same-origin storage: a `firstSeenDayBucket` and a `lastSeenDayBucket` (day granularity only). `classifyReturnCohort(...)` and `buildReturnVisitEvent(...)` are **pure** — they do not read storage, cookies, or the clock; the caller passes the buckets in. **No cross-site identifier, no cookie, no visit counter, no timestamp.**
- **Properties** — `surface: "app"`, `returning: boolean`, `cohortBucket: "first_visit" | "same_day" | "next_day" | "within_week" | "later"`, `dayBucket`.
- **Adoption question** — *Do people come back on later days (daily-use habit / retention)?*

---

## 5. How the no-op emitter works

```ts
import { emitEvent } from "@/lib/analytics/event-contract";

// Today: routes to NOOP_SINK. Sends nothing, stores nothing, logs nothing.
emitEvent({ event: "game_report_open", schemaVersion: 1, dayBucket: "2026-07-23",
            surface: "game_report", sport: "mlb" });
```

- **Default sink = `NOOP_SINK`** — a pure no-op. Until a real sink is injected, every call is a validated no-op. No provider, no network, no storage.
- **Validate-then-forward.** `emitEvent` runs `validateEvent` first; only valid events reach the sink, and a malformed call is dropped silently (never throws in a user session).
- **Tree-shakeable.** The module has **zero top-level side effects** — only `const` data and pure functions. If nothing imports `emitEvent`, the whole module drops out of the bundle.
- **Injectable later.** A real sink is `(event: AnalyticsEvent) => void`. Dev/inspection helpers exist (`devConsoleSink`, `createMemorySink()`), but the **default stays no-op**.
- **Closed governance.** `ALLOWED_PROPERTY_KEYS` is the only set of keys any event may carry; `PII_KEY_DENYLIST` is asserted to never overlap it. New fields must pass both gates.

---

## 6. Founder approval request — turning on a real provider

> **This is a decision, not an action. Nothing below happens without an explicit "yes."**

The contract above is inert until a sink is injected. If we later want *live* numbers, the recommendation is a **privacy-first, no-cookie provider** so we keep the same guarantees end-to-end. Options to weigh:

| Option | Data residency | Cookies / cross-site ID | Notes |
|---|---|---|---|
| **Stay contract-only** (default) | none | none | Keep measuring nothing until there is a clear reason. |
| **Self-hosted, no-cookie** (e.g. a self-hosted Plausible/Umami-style endpoint on our own domain) | our infra | none | Highest control; only the events in this contract are ever emitted. |
| **Managed, no-cookie / cookieless** provider | vendor infra | none by design | Least ops; requires a data-processing review. |

**What approval would authorize (and only this):**
1. Provisioning a first-party, no-cookie endpoint (self-hosted preferred).
2. Injecting a real sink into `emitEvent` that posts **only** the events defined here — no new fields, no PII, day-bucket granularity preserved.
3. Wiring the emitter into the seven P0 surfaces.

**What approval would NOT change:** the property allowlist, the PII denylist, day-granularity, the money/portfolio artifacts (md5 `affe6b21071f2b3be96bb2774eb347c3`), or the "no third-party cross-site tracker" rule.

**Decision requested:** keep contract-only, or greenlight one of the privacy-first options above for a scoped pilot?

---

## 7. Wiring status

- **Not wired.** No page imports `emitEvent` yet. The module is dormant and tree-shakes out of the bundle.
- **Money untouched.** No change to portfolio / Bank Builder / Moonshot.
- **Tests** — `cd app && npx tsx --test src/lib/analytics/event-contract.test.mjs`.
- **Types** — `cd app && npx tsc --noEmit`.
