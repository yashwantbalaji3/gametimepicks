# Public Beta Analytics Contract — v2 (Program 058-061)

**Status: CONTRACT + INSTRUMENTATION IN SCHEMA — the provider is OFF.** No event leaves the browser:
`resolveSink()` returns the NO-OP unless BOTH `NEXT_PUBLIC_ANALYTICS_ENABLED` and
`NEXT_PUBLIC_ANALYTICS_ENDPOINT` are set at build time, and neither is set anywhere. No provider has been
chosen; the layer is provider-neutral by design.

Single source of truth for the typed schema: [`app/src/lib/analytics/event-contract.ts`](../app/src/lib/analytics/event-contract.ts) (`SCHEMA_VERSION = 2`).
Guardrail tests: [`event-contract.test.mjs`](../app/src/lib/analytics/event-contract.test.mjs), [`contract-v2.test.mjs`](../app/src/lib/analytics/contract-v2.test.mjs), [`page-events.test.mjs`](../app/src/lib/analytics/page-events.test.mjs), [`sink.test.mjs`](../app/src/lib/analytics/sink.test.mjs), [`bootstrap-wiring.test.mjs`](../app/src/lib/analytics/bootstrap-wiring.test.mjs), [`market-center-wiring.test.mjs`](../app/src/lib/analytics/market-center-wiring.test.mjs).
Predecessors: [`PRODUCT_ANALYTICS_EVENT_CONTRACT.md`](PRODUCT_ANALYTICS_EVENT_CONTRACT.md) (v1 catalog) and
[`ANALYTICS_ACTIVATION_DECISION.md`](ANALYTICS_ACTIVATION_DECISION.md) (the unsigned activation memo — still the
decision record).

---

## 1. What this measures (and what it must never claim)

The product is a **sports research terminal**: transparent simulations, calibrated probabilities, and market
context. Measurement exists to answer exactly one strategic question for the public beta:

> Do visitors treat the site as a research terminal they return to — and which sport do they want next?

Nothing in this contract measures, implies, or supports a claim of predictive superiority, ROI, or a
betting advantage. There is no event or field for wager amount, stake, pick selection, bankroll, or any
sportsbook payload. We measure **product usage**, never betting behavior.

---

## 2. Program-name mapping (v1 events are mapped, not renamed)

The program taxonomy (section 6.3) names fourteen events. Six of them were already carried by v1 events; a
rename would change the wire shape and break every existing guard for zero information gain, so those are
**mapped** in `PROGRAM_EVENT_MAP` (type-checked exhaustive in `event-contract.ts`). The other eight were
added as v2-native events under their program names.

| Program name | Contract event | Status |
|---|---|---|
| `session_started` | `source_visit` | mapped — the once-per-session first-party landing (coarse source bucket) IS the session-start signal |
| `homepage_viewed` | `homepage_viewed` | **new in v2** |
| `today_viewed` | `daily_hub_view` | mapped (fires on `/today` and `/mlb`) |
| `market_row_opened` | `market_row_opened` | **new in v2** (schema-only, see §5) |
| `probability_explainer_opened` | `probability_explainer_opened` | **new in v2** (schema-only, see §5) |
| `market_disagreement_opened` | `market_disagreement_opened` | **new in v2** (schema-only, see §5) |
| `game_report_viewed` | `game_report_open` | mapped |
| `results_viewed` | `results_recap_open` | mapped |
| `daily_brief_viewed` | `daily_brief_view` | mapped |
| `methodology_viewed` | `methodology_viewed` | **new in v2** |
| `status_viewed` | `status_viewed` | **new in v2** |
| `sport_interest_selected` | `sport_interest_selected` | **new in v2** (schema-only, see §5) |
| `feedback_submitted` | `feedback_submitted` | **new in v2** (schema-only, see §5) |
| `return_visit` | `return_visit` | already existed under its program name |

One supplemental event outside the program list: `market_center_view` (the `/markets` page view) — the
market-detail funnel step needed a page-view anchor and none existed.

---

## 3. v2 taxonomy — every event, in full

Shared required fields on every event: `event` (closed discriminant), `schemaVersion` (= 2), `dayBucket`
(coarse ET `YYYY-MM-DD` — day granularity only, never a timestamp). Shared forbidden fields on every event:
anything outside the closed `ALLOWED_PROPERTY_KEYS` allowlist — in particular any PII-shaped key
(`PII_KEY_DENYLIST`) and any raw market/money-shaped key (odds, price, line, stake — test-asserted absent).
`validateEvent()` rejects any violation before any sink can see the event.

| Event | Purpose | Required fields (beyond shared) | Context | Validation test |
|---|---|---|---|---|
| `source_visit` | Session start + coarse acquisition channel | `surface:"app"`, `source` (direct/x/discord/instagram/tiktok/organic/referral) | acquisition | event-contract 1/2, source.test |
| `homepage_viewed` | Landing reach — the funnel's first step | `surface:"homepage"` | funnel step 1 | contract-v2 3, page-events |
| `home_cta_click` | Does the hero convert into the core action? | `surface:"homepage"`, `cta`, `destination` (coarse bucket) | funnel step 1→2 | event-contract 1/2 |
| `daily_hub_view` | Today's-research reach (`/today`, `/mlb`) | `surface:"daily_hub"`, `sport`, `slateDateBucket` | funnel step 2 | event-contract 1/2, page-events |
| `daily_brief_view` | Daily-brief reach (destination habit) | `surface:"daily_hub"`, `sport` | funnel step 5 | event-contract 1/2, page-events |
| `market_center_view` | Market-intelligence center reach (`/markets`) | `surface:"markets"`, `sport` | funnel step 3 | contract-v2 3, page-events |
| `game_report_open` | Core value surface opened | `surface:"game_report"`, `sport` | funnel step 3 | event-contract 1/2, page-events |
| `market_row_opened` | High-intent research: a single market row expanded | `surface` (markets/game_report/daily_hub/research), `sport`, `marketFamily` (family bucket ONLY) | funnel step 3, high-intent | contract-v2 3/3b |
| `probability_explainer_opened` | Engagement with the transparent probability layers (raw vs calibrated vs no-vig market) | `surface`, `sport`, `marketFamily` | funnel step 4, high-intent | contract-v2 3/3b |
| `market_disagreement_opened` | Interest in the model-vs-market comparison itself — never a claim the disagreement is favorable | `surface`, `sport`, `marketFamily` | funnel step 4, high-intent | contract-v2 3/3b |
| `results_recap_open` | Trust loop: settled results checked | `surface:"results"`, `sport` | funnel step 5 | event-contract 1/2, page-events |
| `methodology_viewed` | Trust loop: HOW the research is produced | `surface:"methodology"` | trust | contract-v2 3, page-events |
| `status_viewed` | Honesty surface (`/system-status`) checked | `surface:"system_status"` | trust | contract-v2 3, page-events |
| `sport_interest_selected` | THE sport-demand signal (which sport next?) | `surface:"app"`, `sport` (incl. candidate `epl`) | demand | contract-v2 3 |
| `feedback_submitted` | Feedback count by CLOSED topic — no free-text channel exists | `surface:"app"`, `feedbackTopic` (accuracy/clarity/coverage/usability/other) | funnel step 6 | contract-v2 3/3b |
| `return_visit` | Retention: coarse return cohort from first-party day buckets | `surface:"app"`, `returning`, `cohortBucket` | funnel step 6 | event-contract 1/6 |
| `learn_trust_open`, `share_action`, `slate_filter_changed`, `availability_explanation_opened`, `today_slate_clicked_from_results`, `social_package_generated` | v1 engagement/ops events, unchanged | see v1 doc | engagement | event-contract 1/2 |

`marketFamily` is a **family** bucket (`moneyline`, `run_line`, `total`, `strikeouts`, `hits`,
`total_bases`, `hits_runs_rbis`, `home_runs`, `other`) — never a specific line, price, or anything a
sportsbook sent us. `feedbackTopic` is the ONLY dimension feedback carries; the schema has no free-text
field, so feedback content can never ride along with the count (test-asserted).

---

## 4. The funnel

**Landing → Today's Research → Market/Game detail → Probability explanation → Results/Daily brief → Return or feedback**

| Step | Definition | Events |
|---|---|---|
| 1 · Landing | A session begins on any page | `source_visit` (once/session), `homepage_viewed` |
| 2 · Today's Research | The daily research board is reached | `daily_hub_view` |
| 3 · Market/Game detail | A specific game or market is examined | `game_report_open`, `market_center_view`, `market_row_opened` |
| 4 · Probability explanation | The transparent research layer is engaged | `probability_explainer_opened`, `market_disagreement_opened` |
| 5 · Results/Daily brief | The trust loop closes | `results_recap_open`, `daily_brief_view`, `methodology_viewed`, `status_viewed` |
| 6 · Return or feedback | The visitor comes back, or tells us something | `return_visit`, `feedback_submitted` |

### Definitions (fixed BEFORE any data exists, so they cannot be gamed after)

- **Activation** — a session that reaches step 3 or deeper: at least one `game_report_open`,
  `market_row_opened`, `probability_explainer_opened`, or `market_disagreement_opened` on the same
  `dayBucket` as its `source_visit`. Landing alone is reach, not activation.
- **Retention** — `return_visit.cohortBucket === "next_day"` rate among visitors active on day N (north
  star), with `within_week` as the secondary band. Day-granularity buckets only — by design we cannot and
  do not compute per-user session counts.
- **High-intent research behavior** — the step-4 events plus `market_row_opened`: a visitor who opens the
  probability layers or the model-vs-market comparison is using the terminal as a terminal, not skimming a
  headline. The ratio (step 4 events / step 2 events) is the "research depth" read.
- **Sport-demand signals** — `sport_interest_selected` counts by sport, plus the `sport` dimension already
  carried on `daily_hub_view` / `game_report_open` / `market_row_opened`. The `epl` value exists in the
  sport enum ONLY so demand can be registered before any EPL surface ships.

### What evidence would justify NBA / UFC / EPL acceleration

Per the ratified strategy (research terminal; NBA-first, UFC hold), acceleration of a new sport is
justified when, over a sustained window (≥ 4 weeks of live measurement):

1. `sport_interest_selected` for that sport is a material share of all interest selections (not a
   handful of clicks), AND
2. returning visitors (not just first-visit traffic) express that interest — demand from people already
   retained is worth more than drive-by curiosity, AND
3. the MLB funnel shows research-depth engagement (step 4 use), proving the terminal format itself works
   before it is replicated.

Until measurement is live, every one of these reads "NOT YET MEASURED" — the same honest posture the /ops
growth view already takes. No sport decision should cite analytics before then.

---

## 5. What is wired vs schema-only (honest inventory)

**Wired at runtime** (all behind the NO-OP sink until activation):

- Page views, via `funnelEventsForPath` → the mounted `AnalyticsBootstrap`: `source_visit`,
  `homepage_viewed` (v2 — supersedes v1's deliberate omission of a home page-view), `daily_hub_view`,
  `daily_brief_view`, `game_report_open`, `results_recap_open`, `market_center_view` (v2),
  `methodology_viewed` (v2), `status_viewed` (v2).
- Interactions: `market_disagreement_opened` — choosing the "largest difference" sort on `/markets`
  (`market-center.tsx`, via the `marketDisagreementOpenedEvent` builder) IS the open-the-disagreement-view
  interaction; the sort spans every family at once, so it carries the coarse `other` family bucket.

**Schema-only** (defined + validated + tested, no call site yet): `market_row_opened`,
`probability_explainer_opened`, `sport_interest_selected`, `feedback_submitted`, plus the v1 interaction
events (`home_cta_click`, `share_action`, `slate_filter_changed`, `availability_explanation_opened`,
`today_slate_clicked_from_results`, `return_visit` emission). These require an interactive control that
does not exist yet — e.g. the probability-layers section is a server-rendered component with no expander —
and this program adds no new UI for instrumentation's sake. Wire each one only when its control ships, as
a one-liner through `emitEvent`/`track`.

---

## 6. Privacy & data-minimization posture (unchanged from v1, test-enforced)

- **No provider, no SDK, no cookie.** The module imports no external SDK; the only real sink shape is a
  first-party `sendBeacon` to an approved endpoint we control.
- **NOOP by default.** Both env vars unset ⇒ `resolveSink` returns the NO-OP; a half-configuration can
  never send (sink.test).
- **Closed allowlist ∩ PII denylist = ∅.** No name, email, IP, geo, device, user-agent, screen, timezone,
  cookie, referrer URL, or session id can even be *expressed* in the schema (event-contract test 4,
  contract-v2 test 5).
- **Day granularity only.** The only time-like field is the coarse `dayBucket`; precise timestamps are
  rejected by `validateEvent`.
- **No betting-behavior fields.** No stake, wager, bankroll, pick, odds, price, or line key exists or may
  be added (contract-v2 test 5 asserts the allowlist stays clean).
- **Validated before send; invalid events dropped whole.** Never partially sent, never thrown.

---

## 7. The ONE founder action remaining

Everything below the provider is built, tested, and dark. To turn measurement on:

1. **Sign** [`ANALYTICS_ACTIVATION_DECISION.md`](ANALYTICS_ACTIVATION_DECISION.md) §7 (Approve / Defer /
   Modify — it is still unsigned; nothing in this program signs it).
2. **Provision** an approved no-cookie, first-party endpoint that satisfies §4 of that memo (self-hosted,
   event-count oriented, day-granularity).
3. **Set the two env vars at build time**: `NEXT_PUBLIC_ANALYTICS_ENABLED=1` and
   `NEXT_PUBLIC_ANALYTICS_ENDPOINT=<the approved endpoint>`, then verify in staging (browser network tab)
   that only allowlisted, day-bucketed, PII-free events are sent.

Until all three happen, nothing is collected — and every dashboard honestly says so.
