# Adoption Dashboard Contract — internal /ops adoption read

**Status: BUILT AND DARK.** The aggregator, the capture format, and the internal dashboard are shipped and
tested. **Production measurement is BLOCKED BY FOUNDER** — §7 of
[`ANALYTICS_ACTIVATION_DECISION.md`](ANALYTICS_ACTIVATION_DECISION.md) is unsigned, no endpoint is
provisioned, and both activation env vars are unset. Every adoption figure on `/ops` therefore reads
`NOT YET MEASURED`, which is the honest state, not a placeholder to be filled with zeros.

| Component | Where |
|---|---|
| Aggregator (pure) | [`app/src/lib/analytics/adoption.ts`](../app/src/lib/analytics/adoption.ts) |
| Dashboard panel | [`app/src/app/ops/adoption-panel.tsx`](../app/src/app/ops/adoption-panel.tsx) |
| Mounted on | `/ops` — internal only ([`app/src/app/ops/page.tsx`](../app/src/app/ops/page.tsx)) |
| Event schema | [`event-contract.ts`](../app/src/lib/analytics/event-contract.ts) (`SCHEMA_VERSION = 2`) |
| Taxonomy + funnel definitions | [`PUBLIC_BETA_ANALYTICS_CONTRACT.md`](PUBLIC_BETA_ANALYTICS_CONTRACT.md) |
| Endpoint options (undecided) | [`ANALYTICS_ENDPOINT_OPTIONS.md`](ANALYTICS_ENDPOINT_OPTIONS.md) |
| Guards | [`adoption.test.mjs`](../app/src/lib/analytics/adoption.test.mjs), [`adoption-mutation.test.mjs`](../app/src/lib/analytics/adoption-mutation.test.mjs), [`instrumentation-audit.test.mjs`](../app/src/lib/analytics/instrumentation-audit.test.mjs) |

---

## 1. Why this is internal, and how that is enforced

Raw analytics payloads — even PII-free ones — are operator data, not public content. Two independent
mechanisms keep the dashboard off the public site, and neither may be relaxed:

1. `guardInternalRoute()` in `/ops/page.tsx` renders a data-free 404 shell in a production build.
2. `scripts/prune-internal-routes.mjs` lists `ops` in `INTERNAL_ROUTES` and **deletes** the emitted
   `out/ops/` directory from the static export, so the URL does not exist on the deployed host.

The panel itself renders **aggregates only** — no event list, no capture-file dump, no per-row detail. That
is a property of the component, not a convention: `instrumentation-audit.test.mjs` asserts it.

---

## 2. Capture format (the aggregator's ONLY input)

The aggregator never reads a network, a database, or a clock. It consumes one JSON envelope, which fixtures
provide today and an activated collector would write to
`data/internal/ops/analytics-capture/latest.json` (internal, never exported).

```json
{
  "kind": "analytics-event-capture",
  "schemaVersion": 2,
  "windowStart": "2026-07-01",
  "windowEnd": "2026-07-14",
  "collectedUnder": "staging",
  "events": [
    { "event": "source_visit", "schemaVersion": 2, "dayBucket": "2026-07-01", "surface": "app", "source": "x" }
  ]
}
```

| Field | Rule |
|---|---|
| `kind` | must be exactly `analytics-event-capture` |
| `schemaVersion` | must equal the contract's `SCHEMA_VERSION` (2) |
| `windowStart` / `windowEnd` | coarse `YYYY-MM-DD` day buckets, inclusive, start ≤ end, span ≤ 366 days |
| `collectedUnder` | `off` \| `staging` \| `live` — a capture can never be more live than its collection |
| `events` | array of raw payloads; **every one is re-validated** by `validateEvent()` here |

`parseAdoptionCapture()` fails closed: an envelope it cannot trust is an **error**, never an
empty-but-valid window. A malformed capture therefore produces `NOT YET MEASURED`, not a clean-looking zero
report.

**Rejection taxonomy** (surfaced on the dashboard as counts, never as raw error text):
`invalid_shape`, `unknown_event`, `schema_version`, `day_bucket`, `disallowed_key`, `invalid_field`,
`outside_window`.

Reference fixtures live in [`app/src/lib/analytics/fixtures/`](../app/src/lib/analytics/fixtures/):
`adoption-capture-two-week.json` (a full window), `adoption-capture-empty.json` (valid envelope, nothing
collected), `adoption-capture-rejections.json` (every rejection class), `adoption-capture-no-sessions.json`
(counts present, every rate unknown).

---

## 3. The measured-vs-unknown rule (the point of this whole module)

Every figure is one of two states:

- **measured** — a real value derived from accepted events.
- **`NOT_YET_MEASURED`** — accompanied by a **reason string** that is rendered next to the metric.

The rule that keeps the dashboard honest:

> **A COUNT of zero is measured.** If the window carried traffic and `sport_interest_selected` never
> occurred, that is a real observation and it renders `0`.
>
> **A RATE with a zero denominator is unknown.** `18 ÷ 0` is not `0%`; it is `NOT YET MEASURED` with the
> reason "a rate with a zero denominator is unknown, not 0%".

The same rule governs coverage: a day inside the window with no events is reported as a **coverage gap**
(`missingDayBuckets`), never as a measured zero-traffic day.

`adoption-mutation.test.mjs` proves this is enforced rather than merely intended: it mutates the aggregator
to return a measured `0` for a zero-denominator rate in a child process, asserts the mutation changes
behaviour, and restores the source byte-identically.

---

## 4. Metric definitions (fixed before any data exists, so they cannot be tuned afterwards)

All ratios are **event-count ratios**. The contract collects no session or user identity by design, so a
per-visitor rate is not computable and is never presented as one. Every ratio carries a `basis` string that
says so, and the dashboard renders it.

| Panel figure | Definition |
|---|---|
| **Reach** | `source_visit` (session starts), `homepage_viewed`, `daily_hub_view` counts |
| **Activation** | detail-event count ÷ session-start count, where detail events are `game_report_open`, `market_center_view`, `market_row_opened`, `probability_explainer_opened`, `market_disagreement_opened` (funnel step 3+) |
| **Research depth** | high-intent events (`market_row_opened`, `probability_explainer_opened`, `market_disagreement_opened`) ÷ `daily_hub_view` — the contract §4 research-depth read |
| **Trust loop** | `results_recap_open` + `daily_brief_view` + `methodology_viewed` + `status_viewed` + `learn_trust_open`, absolute and per session |
| **Retention** | shares of the coarse `return_visit.cohortBucket` distribution: next-day share (north star) and within-week band |
| **Sport demand** | `sport_interest_selected` counts by sport, plus the `sport` dimension on `daily_hub_view` / `game_report_open` / `market_row_opened` |
| **Data quality** | submitted / accepted / rejected, rejections by reason, missing day buckets, day coverage |

### Minimum-window rule (enforced in code, not by memory)

`sportDemand.interpretable` is `false` — and the panel prints **"do not interpret"** — unless **both**:

1. the window is at least `MIN_SPORT_DEMAND_WINDOW_DAYS` = **28 days** (the ratified ≥ 4-week bar), and
2. the dashboard's measurement mode is **LIVE**.

No sport decision may cite these counts before both hold. A 14-day staging window shows its numbers and
explicitly refuses to interpret them.

### Measurement mode

`resolveMeasurementMode()` derives the mode from the *sink config*, so the dashboard can never claim
measurement the sink is not performing:

| Mode | When |
|---|---|
| **OFF** | the sink is not fully configured (either env var missing) — today's state |
| **STAGING** | sink live, but `NEXT_PUBLIC_ANALYTICS_MODE=staging`, or the endpoint host is localhost / a staging or preview host / unparseable |
| **LIVE** | sink live against a production host |

A capture whose `collectedUnder` differs from the dashboard's mode raises a warning rather than being
silently merged.

---

## 5. Kill switch and staging procedure

### Kill switch

| Env var | Meaning | Default |
|---|---|---|
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | **The kill switch.** `1`/`true` = on; unset or `0` = hard OFF | OFF |
| `NEXT_PUBLIC_ANALYTICS_ENDPOINT` | The approved first-party endpoint | none |
| `NEXT_PUBLIC_ANALYTICS_MODE` | `staging` forces STAGING for a rehearsal against a production-shaped endpoint | unset |

`resolveSink()` returns the NO-OP unless **both** of the first two are set — a half-configuration can never
send, and `sink.test.mjs` / `adoption.test.mjs` both assert it.

**To kill measurement instantly:** unset (or set to `0`) `NEXT_PUBLIC_ANALYTICS_ENABLED` and redeploy. No
code change, no revert, no vendor console. The next build ships a NO-OP sink; `/ops` returns to
`NOT YET MEASURED`; nothing already collected is deleted by this action (deleting the store is a separate,
deliberate act).

### Staging procedure (run BEFORE production is ever enabled)

1. Provision the chosen endpoint from [`ANALYTICS_ENDPOINT_OPTIONS.md`](ANALYTICS_ENDPOINT_OPTIONS.md)
   against a **non-production** host.
2. Build a preview with `NEXT_PUBLIC_ANALYTICS_ENABLED=1`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT=<staging>`, and
   `NEXT_PUBLIC_ANALYTICS_MODE=staging`. Confirm `/ops` shows **measurement staging**.
3. In the browser network tab, walk the funnel (home → today → a game report → results → methodology) and
   inspect every outbound beacon body. Confirm each payload: is one of the closed-enum events; carries only
   allowlisted keys; has a `dayBucket` of the form `YYYY-MM-DD` and **no finer timestamp**; contains no
   name, email, IP, geo, device, user-agent, referrer URL, cookie, or session id.
4. Export a capture in the §2 format and load it at `data/internal/ops/analytics-capture/latest.json`.
   Confirm the panel's rejection counts are **zero** — a non-zero count means the collector is altering the
   wire shape.
5. Let staging run until the window is ≥ 28 days if any sport decision is expected to reference it.
6. Only then propose flipping production, and only after §7 of the activation memo is signed.

### Production activation — BLOCKED BY FOUNDER

Setting the two production env vars is the founder's action. Nothing in this program signs the decision
memo, provisions an endpoint, selects a vendor, or enables the sink. **Production stays dark.**

---

## 6. Wiring inventory (what actually fires at runtime)

This table is drift-guarded: `instrumentation-audit.test.mjs` asserts that every event in the contract
appears here exactly once, and that **nothing marked WIRED lacks a real call site**. Under-claiming is
permitted (a concurrently-shipped control may be wired before this table is updated); over-claiming fails
the test.

| Event | Status | Call site / reason |
|---|---|---|
| `source_visit` | WIRED | `analytics-bootstrap.tsx`, once per session, coarse source bucket |
| `homepage_viewed` | WIRED | page view of `/` via `funnelEventsForPath` |
| `daily_hub_view` | WIRED | page view of `/today` and `/mlb` |
| `daily_brief_view` | WIRED | page view of `/today` |
| `game_report_open` | WIRED | page view of `/games/<sport>/<gameId>` |
| `results_recap_open` | WIRED | page view of `/results` and `/results/*` |
| `market_center_view` | WIRED | page view of `/markets` |
| `methodology_viewed` | WIRED | page view of `/methodology` |
| `status_viewed` | WIRED | page view of `/system-status` |
| `learn_trust_open` | WIRED | page view of `/learn` (`how_it_works`), `/market-guide` (`market_guide`), `/responsible-use` (`responsible_use`) — the page view IS the control on a server-rendered reading surface |
| `market_disagreement_opened` | WIRED | `market-center.tsx` — choosing the "largest difference" sort on `/markets` |
| `home_cta_click` | SCHEMA-ONLY | The control is real (`home/landing-hero.tsx`: primary → `/simulate`, secondary → `/today`) and the builder `homeCtaClickEvent()` ships with it, but the call site lives in a component outside this lane's file ownership while lanes run concurrently. One line at the call site: `track(homeCtaClickEvent(dayBucket, "primary", href), sink)` |
| `today_slate_clicked_from_results` | SCHEMA-ONLY | Controls are real (`slate-status-chips.tsx`, `mlb/mlb-slate-availability.tsx`, `game/mlb-simulation-report-v2.tsx` all link results → `/today`); builder `todaySlateClickedFromResultsEvent()` ships. Same file-ownership reason |
| `market_row_opened` | SCHEMA-ONLY | Requires an interactive row expander; a concurrent lane is shipping the research explorer that provides one |
| `probability_explainer_opened` | SCHEMA-ONLY | Same — the probability-layers section is server-rendered with no expander in this lane's tree |
| `return_visit` | SCHEMA-ONLY | `buildReturnVisitEvent()` is pure and tested, but emitting it requires persisting a first-party day bucket in browser storage. Adding a storage write is a privacy-surface change that belongs with activation, not before it |
| `sport_interest_selected` | SCHEMA-ONLY | No sport-interest control exists anywhere in the product. No control is being invented to satisfy instrumentation |
| `feedback_submitted` | SCHEMA-ONLY | No feedback control exists on any surface; the closed-topic schema is ready for one when it ships |
| `share_action` | SCHEMA-ONLY | No share or copy-link control exists anywhere in the product |
| `slate_filter_changed` | SCHEMA-ONLY | `/today` renders the full slate with no filter control |
| `availability_explanation_opened` | SCHEMA-ONLY | No per-game "why this tier?" expander exists |
| `social_package_generated` | SCHEMA-ONLY | An internal pipeline signal, not a browser event; it would be emitted by the generation script, never by the app |

**The standing rule:** wire an event when its control ships, as a one-liner through `emitEvent`/`track`.
Never build UI so that an event has something to fire on.

> This table **supersedes** the wired/schema-only inventory in
> [`PUBLIC_BETA_ANALYTICS_CONTRACT.md`](PUBLIC_BETA_ANALYTICS_CONTRACT.md) §5, which predates the
> `learn_trust_open` page-view wiring and is not drift-guarded. Where the two disagree, this one is checked
> by a test and that one is not.

---

## 7. What this dashboard must never become

- It must never render raw event payloads, a capture-file dump, or anything per-visitor.
- It must never present an event-count ratio as a per-user rate.
- It must never show `0` where the honest answer is `NOT YET MEASURED`.
- It must never be linked from public navigation or shipped in the static export.
- Its numbers must never be used to support a claim about predictive performance. They measure whether
  people use a research terminal; they say nothing about whether the research is any good — that question
  belongs to the calibration and results work, and its historical answers stay visible there.
