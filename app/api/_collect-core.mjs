/**
 * First-party analytics collector — core validation (Program 092-095 Lane G).
 *
 * Pure logic, no I/O, so every rule in the founder-approved contract is unit-testable. The HTTP
 * handler (collect.mjs) is a thin shell around this. Underscore prefix = Vercel does not expose
 * this file as a route.
 *
 * Contract enforced here (docs/PUBLIC_BETA_ANALYTICS_CONTRACT.md, SCHEMA_VERSION 2):
 *   - closed event-name enum (guard-tested in sync with event-contract.ts)
 *   - allowlisted property keys only; any unknown key REJECTS the event
 *   - PII-shaped keys rejected outright (defense in depth beyond the allowlist)
 *   - values must be short enum-like strings/numbers/booleans — no free text
 *   - dayBucket is the only time field, format YYYY-MM-DD
 *   - no odds/lines/picks/stakes/bankroll/wager fields exist in the allowlist
 */

export const SCHEMA_VERSION = 2;

/** Closed event-name enum — MUST equal EVENT_TYPES in event-contract.ts (parity guard-tested). */
export const EVENT_NAMES = Object.freeze([
  "home_cta_click",
  "daily_hub_view",
  "game_report_open",
  "results_recap_open",
  "share_action",
  "learn_trust_open",
  "return_visit",
  "slate_filter_changed",
  "availability_explanation_opened",
  "today_slate_clicked_from_results",
  "daily_brief_view",
  "social_package_generated",
  "source_visit",
  "homepage_viewed",
  "market_center_view",
  "market_row_opened",
  "probability_explainer_opened",
  "market_disagreement_opened",
  "methodology_viewed",
  "status_viewed",
  "sport_interest_selected",
  "feedback_submitted",
]);

/** Allowlisted property keys — MUST equal ALLOWED_PROPERTY_KEYS in event-contract.ts (parity guard-tested). */
export const ALLOWED_KEYS = Object.freeze([
  "event",
  "schemaVersion",
  "dayBucket",
  "surface",
  "cta",
  "destination",
  "sport",
  "slateDateBucket",
  "method",
  "trustSurface",
  "returning",
  "cohortBucket",
  "filter",
  "availabilityLevel",
  "source",
  "marketFamily",
  "feedbackTopic",
]);

/** PII/forbidden-shaped keys — rejected even if someone later widens the allowlist carelessly. */
export const FORBIDDEN_KEY_PATTERN =
  /(email|name$|user|account|device|ip$|address|phone|cookie|fingerprint|referr|url|odds|line|pick|stake|bankroll|wager|exposure|amount|token|password)/i;

const DAY_BUCKET = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_BODY_BYTES = 2048;
const MAX_VALUE_LENGTH = 40;

/**
 * @returns {{ ok: true, event: object } | { ok: false, reason: string }}
 */
export function validateCollectPayload(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "payload must be a JSON object" };
  }
  const keys = Object.keys(raw);
  if (keys.length > ALLOWED_KEYS.length) return { ok: false, reason: "too many fields" };

  for (const k of keys) {
    if (FORBIDDEN_KEY_PATTERN.test(k) && !ALLOWED_KEYS.includes(k)) {
      return { ok: false, reason: `forbidden key: ${k}` };
    }
    if (!ALLOWED_KEYS.includes(k)) return { ok: false, reason: `unknown key: ${k}` };
  }

  if (raw.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: "wrong schemaVersion" };
  if (!EVENT_NAMES.includes(raw.event)) return { ok: false, reason: "unknown event name" };
  if (!DAY_BUCKET.test(raw.dayBucket ?? "")) return { ok: false, reason: "dayBucket must be YYYY-MM-DD" };

  const event = { schemaVersion: SCHEMA_VERSION, event: raw.event, dayBucket: raw.dayBucket };
  for (const k of keys) {
    if (k === "schemaVersion" || k === "event" || k === "dayBucket") continue;
    const v = raw[k];
    const t = typeof v;
    if (t === "string") {
      // enum-like only: short, no whitespace runs, no URLs — free text can never pass.
      if (v.length > MAX_VALUE_LENGTH || /\s{2,}|https?:|@/.test(v)) {
        return { ok: false, reason: `value for ${k} is not enum-like` };
      }
      event[k] = v;
    } else if (t === "number" && Number.isFinite(v)) {
      event[k] = v;
    } else if (t === "boolean") {
      event[k] = v;
    } else {
      return { ok: false, reason: `unsupported value type for ${k}` };
    }
  }
  return { ok: true, event };
}

/** Kill switch: any non-empty falsy-intent value disables collection instantly. */
export function collectorDisabled(env = process.env) {
  const flag = env.ANALYTICS_COLLECTOR_ENABLED;
  return !(flag === "1" || flag === "true");
}
