/**
 * Founder response schema + mechanical state transitions (Program 165 · Release A).
 *
 * The seven Program-164 packets become ONE answerable form. This module owns:
 *   - the enumerated, NON-SECRET choice vocabulary per blocker (unknown fields, duplicate
 *     blockers, stale schema versions, secret-shaped strings, and PII shapes all REFUSE);
 *   - the separation the charter demands: a CHOICE is not EXTERNAL_CONFIGURATION_COMPLETE, and
 *     neither is ACCEPTANCE_VERIFIED — three different facts, three different fields;
 *   - the mechanical transition rule: a valid choice moves a blocker only to
 *     FOUNDER_ACTION_PROVIDED; external configuration moves it to VERIFYING; CLOSED comes only
 *     from the real acceptance receipt, never from this module.
 *
 * The founder-facing form (docs/FOUNDER_RESPONSE_FORM.md) and the machine template
 * (docs/founder-response.template.json) are both generated views of THIS vocabulary — the
 * repository artifact is the authority.
 */
import { SHARED_BLOCKERS, SHARED_BLOCKERS_VERSION } from "./shared-blockers.mjs";

export const FOUNDER_RESPONSE_SCHEMA_VERSION = 1;

const EMAIL_SHAPED = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
const SECRET_SHAPED = /(sk-[A-Za-z0-9]{8,}|[A-Fa-f0-9]{32,}|Bearer\s+\S+|-----BEGIN)/;

/** Enumerated choices per blocker. RECOMMENDED option first, always. */
export const ALLOWED_CHOICES = Object.freeze({
  "blocker-legal-section3": Object.freeze(["ANSWERS_PROVIDED_SEE_DECISIONS", "DEFER_LEGAL"]),
  "blocker-support": Object.freeze(["DEDICATED_MONITORED_INBOX", "EXISTING_HELPDESK_URL", "TEMPORARY_FOUNDER_INBOX", "DEFER_BETA"]),
  "blocker-analytics": Object.freeze(["FIRST_PARTY_COLLECTOR", "DEFER_ANALYTICS"]),
  "blocker-beta-cohort": Object.freeze(["COHORT_APPROVED_SEE_DETAILS", "DEFER_BETA_COHORT"]),
  "blocker-odds": Object.freeze(["AUTHORIZE_ONE_NFL_CANARY_MAX_5", "DEFER_ODDS", "CHANGE_PROVIDER_PLAN"]),
  "blocker-nba-lineup-rights": Object.freeze(["nba-com-terms-reviewed", "licensed-feed", "defer"]),
  "blocker-admin-access": Object.freeze(["OPTION_1_PROTECTED_INTERNAL_DEPLOYMENT", "OPTION_2_ZERO_TRUST_PROXY", "OPTION_3_LOCAL_ONLY"]),
});

/** Fields an answer may carry beyond `choice`. Everything else is unknown and refuses. */
const ANSWER_FIELDS = new Set(["choice", "externalConfigurationComplete", "details", "vendor"]);

function scanForbidden(value, where, errors) {
  if (typeof value === "string") {
    if (EMAIL_SHAPED.test(value)) errors.push(`${where}: email-shaped value — PII never enters the response artifact`);
    if (SECRET_SHAPED.test(value)) errors.push(`${where}: secret-shaped value — secrets go to provider dashboards, never this form`);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) scanForbidden(v, `${where}.${k}`, errors);
  }
}

/** Validate a full response document. Total; fail-closed on everything unexpected. */
export function validateFounderResponse(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") return { valid: false, errors: ["no response supplied"] };
  if (doc.schemaVersion !== FOUNDER_RESPONSE_SCHEMA_VERSION) errors.push(`schemaVersion ${doc.schemaVersion} is stale/unknown — regenerate the form (current ${FOUNDER_RESPONSE_SCHEMA_VERSION})`);
  if (doc.blockersVersion !== SHARED_BLOCKERS_VERSION) errors.push(`blockersVersion ${doc.blockersVersion} does not match the registry (${SHARED_BLOCKERS_VERSION})`);
  const answers = doc.answers;
  if (!answers || typeof answers !== "object") { errors.push("answers object required"); return { valid: false, errors }; }

  const registryIds = new Set(SHARED_BLOCKERS.map((b) => b.id));
  const seen = new Set();
  for (const [id, answer] of Object.entries(answers)) {
    if (!registryIds.has(id)) { errors.push(`${id}: not a registry blocker — unknown entries refuse`); continue; }
    if (seen.has(id)) { errors.push(`${id}: duplicate answer`); continue; }
    seen.add(id);
    for (const k of Object.keys(answer ?? {})) if (!ANSWER_FIELDS.has(k)) errors.push(`${id}.${k}: unknown field — the schema never silently widens`);
    const choices = ALLOWED_CHOICES[id];
    const choice = answer?.choice;
    const normalized = id === "blocker-nba-lineup-rights" && typeof choice === "string" && choice.startsWith("licensed-feed:") ? "licensed-feed" : choice;
    if (!choices.includes(normalized)) errors.push(`${id}: choice "${choice}" not in the enumerated set [${choices.join(", ")}]`);
    if (id === "blocker-nba-lineup-rights" && normalized === "licensed-feed" && !/^licensed-feed:[a-z0-9-]{2,40}$/.test(choice ?? "")) {
      errors.push(`${id}: licensed-feed needs a plain vendor slug (licensed-feed:<vendor>), never credentials`);
    }
    if ("externalConfigurationComplete" in (answer ?? {}) && typeof answer.externalConfigurationComplete !== "boolean") {
      errors.push(`${id}: externalConfigurationComplete must be a boolean — it is a separate fact from the choice`);
    }
    scanForbidden(answer, id, errors);
  }
  for (const id of registryIds) if (!seen.has(id)) errors.push(`${id}: missing — the form is answered once, completely (use the DEFER choice to defer)`);
  return { valid: errors.length === 0, errors };
}

/**
 * Mechanical transition for one answered blocker. NEVER returns CLOSED — closure needs the real
 * acceptance receipt outside this module.
 */
export function transitionFor(id, answer) {
  const defers = new Set(["DEFER_LEGAL", "DEFER_BETA", "DEFER_ANALYTICS", "DEFER_BETA_COHORT", "DEFER_ODDS", "defer", "OPTION_3_LOCAL_ONLY"]);
  const normalized = typeof answer?.choice === "string" && answer.choice.startsWith("licensed-feed:") ? "licensed-feed" : answer?.choice;
  if (defers.has(normalized)) return { state: "FOUNDER_ACTION_PROVIDED", note: "deferred by explicit choice — an honest decision, recorded; re-open by re-answering" };
  if (answer?.externalConfigurationComplete === true) return { state: "VERIFYING", note: "choice + external configuration reported — run the blocker's acceptance verifier for the CLOSED receipt" };
  return { state: "FOUNDER_ACTION_PROVIDED", note: "choice recorded — external configuration (provider dashboard) still pending before verification can run" };
}
