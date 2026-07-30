# Analytics Activation — Founder Decision Memo

**Status:** DECISION REQUIRED · **Prepared:** Sprint 005 (retention layer) · **Owner:** founder
**Nothing is activated by this memo.** The analytics contract is schema-only and defaults to a no-op sink.

> **v2 note (Program 058-061):** the event taxonomy referenced below was extended to the public-beta
> research-terminal contract — see [`PUBLIC_BETA_ANALYTICS_CONTRACT.md`](PUBLIC_BETA_ANALYTICS_CONTRACT.md)
> (`SCHEMA_VERSION = 2`, program-name mapping, funnel/activation/retention definitions). The decision in
> Section 7 remains **unsigned** and is unchanged by that program; it is still the one founder action
> gating any data collection.

---

## 1. The decision

The consumer daily loop (Homepage → Today Hub → Daily Brief → Game Report → Results → Return) is now
complete and *instrumented in schema* — but **no data is being collected**, so we cannot yet tell whether
the retention bet is working. The decision is:

> **Activate a single privacy-first, no-cookie, first-party analytics sink** so that the already-defined,
> PII-free events start producing counts — **or** stay dark until a later date.

This memo does **not** change any behavior. Activation is a deliberate follow-up (Section 6).

**Recommendation:** activate a *self-hosted, no-cookie, day-granularity* sink limited to the events below.
It is the only way to learn whether the daily-habit product is retaining users, and it can be done without
collecting a single personal field.

---

## 2. What we would measure (and the event that already carries it)

Every item maps to an event that **already exists** in `app/src/lib/analytics/event-contract.ts`
(provider-neutral, closed-enum, PII-free). No new schema is needed to answer these questions.

| Consumer question (retention) | Existing event | Coarse dimensions |
|---|---|---|
| **Homepage usage** — do people reach the homepage and click into the product? | `home_cta_click` | cta (primary/secondary), destination (today/simulate/results/…) |
| **Brief opens** — are people reaching the daily MLB intelligence brief? | `daily_brief_view` | sport, dayBucket |
| **Daily-hub reach** — are people getting to /today at all? | `daily_hub_view` | sport, slateDateBucket |
| **Report opens** — is the core value surface (a game report) opened? | `game_report_open` | sport |
| **Recap usage** — do people check yesterday's settled results? | `results_recap_open` | sport |
| **Return behavior** — do people come back on later days? | `return_visit` | cohortBucket (first_visit / same_day / next_day / within_week / later) |
| **Loop completion** — does results → today actually route people back? | `today_slate_clicked_from_results` | sport |
| **Engagement depth** — do people use the readiness grouping / open the "why"? | `slate_filter_changed`, `availability_explanation_opened` | filter, availabilityLevel |

The **north-star retention metric** these enable: *next-day return rate* — of users who saw the brief on
day N, what fraction return on day N+1 (`return_visit.cohortBucket === "next_day"`).

---

## 3. Privacy constraints (non-negotiable, already enforced in code)

The contract is built so activation cannot leak personal data:

- **No PII.** `ALLOWED_PROPERTY_KEYS` is a closed allowlist; `PII_KEY_DENYLIST` is asserted to never
  intersect it (test-enforced). No name, email, IP, geo, device, cookie, referrer, or session id.
- **Day-granularity only.** Time is a coarse `dayBucket` (`YYYY-MM-DD`), never a precise timestamp — it
  identifies a calendar day, never a person.
- **No betting-behavior tracking.** There is no event or field for wager amount, stake, pick selection, or
  bankroll — and none may be added. This is a paper-only, educational product; we measure *product usage*,
  not betting behavior.
- **First-party, no cross-site identifier.** `return_visit` is derived from a first-party day bucket the
  page already holds; no third-party cookie or fingerprint.
- **Validated before send.** `emitEvent` validates every event and silently drops malformed ones; a bad
  call can never send junk or throw inside a user session.

---

## 4. Provider characteristics to require (if activated)

Any sink chosen at activation must be:

1. **No-cookie / cookieless** (no consent-banner burden, no cross-site identifier).
2. **Self-hosted or EU/first-party** (no data brokering; we control the store).
3. **Event-count oriented** (aggregates, not session replay / heatmaps / user profiles).
4. **Day-granularity retention** (matches our coarse `dayBucket`).

Providers that fit the shape (illustrative, not an endorsement): a self-hosted Plausible/Umami-style
counter, or a first-party edge log we own. Explicitly **out of scope:** Google Analytics, Meta Pixel,
Segment, or anything that sets a cross-site cookie or builds a user profile.

---

## 5. What activation does NOT change

- No public copy, prediction, betting, or performance claim.
- No money, Bank Builder, Moonshot, portfolio, record, or research systems.
- No new sport, no model change.
- The events remain PII-free; only the *sink* changes from no-op to a real counter.

---

## 6. If approved — the (small) activation checklist

Activation is deliberately a *separate*, reviewable step. It is NOT done by this memo.

1. Stand up the chosen no-cookie sink; obtain its ingest endpoint.
2. Implement one `AnalyticsEventSink` that forwards validated events to that endpoint (server-side or a
   thin first-party beacon). Keep `NOOP_SINK` as the default.
3. Wire `emitEvent(...)` calls at the instrumented surfaces (homepage CTA, brief view, report open, recap
   open, results→today, return-visit) — behind the injected sink.
4. Add a kill-switch env flag so the sink can be disabled instantly without a deploy.
5. Verify in staging that only allowlisted, day-bucketed events are sent (no PII), then enable in prod.
6. Review the next-day return rate after ~2 weeks of data.

---

## 7. Decision record

- [ ] **Approve** — activate a no-cookie, day-granularity sink for the events in Section 2.
- [ ] **Defer** — keep analytics dark; revisit after the next content/retention iteration.
- [ ] **Modify** — approve with changes (note them here): ______________________________

_Signed:_ ______________________  _Date:_ ____________

---

## 8. Activation & kill-switch (implemented Sprint 006 — provider currently OFF)

The provider-agnostic wiring is shipped and tested; **no data leaves the browser until BOTH variables are set
at build time** (a half-configuration can never send):

| Env var | Meaning | Default |
|---|---|---|
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | **Kill switch.** `1` / `true` = on; unset / `0` = hard OFF (no-op). | OFF |
| `NEXT_PUBLIC_ANALYTICS_ENDPOINT` | The APPROVED first-party (no-cookie) endpoint the beacon posts validated events to. | none |

`resolveSink()` returns the NO-OP unless `enabled === true` AND an endpoint is present. To **disable instantly**,
unset `NEXT_PUBLIC_ANALYTICS_ENABLED` and redeploy (or flip it to `0`) — no code change.

**Boundary (honest status):** Sprint 006 shipped the sink, source attribution, funnel page-view instrumentation,
social-ops surface, and the /ops growth/health read — all behind this disabled config. **Measurement is NOT
live.** The remaining founder/provider action is: stand up an approved no-cookie first-party endpoint, set the
two env vars, and verify in staging (browser network tab) that only allowlisted, day-bucketed, PII-free events
are sent. Until then the /ops funnel reads `NOT YET MEASURED`, which is the truth.

**What is emitted (when live):** only the closed-enum events in `event-contract.ts` — `source_visit` (coarse
bucket), `daily_hub_view`, `daily_brief_view`, `game_report_open`, `results_recap_open`, `return_visit`, and
the interaction events — each validated before send. **Never** wagering, portfolio, bankroll, identity, full
referrer URL, ad id, or free-form text.
