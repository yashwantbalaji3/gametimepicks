/**
 * Private-beta access interface — deny-by-default, PII-free (Program 164 · Release 6).
 *
 * THE TWO LAWS:
 *   1. NO PII IN THE REPOSITORY, structurally: the cohort contract carries counts and windows
 *      only, and its validator REFUSES any object containing an email-shaped string or a
 *      roster-like field name. The roster lives with the access provider, never in git.
 *   2. DENY BY DEFAULT: no configuration = no access; a missing allowlist entry = no access;
 *      revocation wins over everything. There is no "beta flag" that can accidentally open the
 *      public site — access happens at the deployment/auth layer (see the admin-access ADR),
 *      and this module is the contract that layer must satisfy.
 *
 * Invitation generation is gated on real prerequisites: a monitored support destination, a
 * publishable legal set, and an explicit analytics decision. Burning testers on a broken loop is
 * the failure this prevents.
 */
import { canPublishLegalSet } from "../legal/content-manifest.mjs";

export const BETA_ACCESS_VERSION = 1;

const EMAIL_SHAPED = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
const ROSTER_FIELDS = /^(email|emails|name|names|participants?|roster|phone|address)$/i;

/** Validate a cohort contract. Counts and windows only — PII shapes refuse loudly. */
export function validateCohortContract(c) {
  const errors = [];
  if (!c || typeof c !== "object") return { valid: false, errors: ["no contract supplied"] };
  const scan = (obj, pathStr) => {
    for (const [k, v] of Object.entries(obj)) {
      if (ROSTER_FIELDS.test(k)) errors.push(`${pathStr}${k}: roster-like field — participant identity never enters the repository`);
      if (typeof v === "string" && EMAIL_SHAPED.test(v)) errors.push(`${pathStr}${k}: email-shaped value — PII refused`);
      else if (v && typeof v === "object") scan(v, `${pathStr}${k}.`);
    }
  };
  scan(c, "");
  if (!c.cohortId || !/^[a-z0-9-]+$/.test(c.cohortId)) errors.push("cohortId must be a plain slug");
  if (!Number.isInteger(c.targetCount) || c.targetCount < 1 || c.targetCount > 50) errors.push("targetCount must be a small integer — this is a controlled cohort, not a launch");
  if (!Number.isFinite(Date.parse(c.window?.start ?? "")) || !Number.isFinite(Date.parse(c.window?.end ?? ""))) errors.push("window.start/end required");
  if (!c.owner) errors.push("a named owner is required");
  if (!c.accessMethod) errors.push("accessMethod required (allowlist recommended)");
  return { valid: errors.length === 0, errors };
}

/** The invitation prerequisite gate. Nothing invites until every prerequisite holds for real. */
export function invitationPrerequisites({ supportState, legalManifest, analyticsDecision }) {
  const blockedBy = [];
  if (supportState !== "CONFIGURED") blockedBy.push(`support is ${supportState ?? "UNKNOWN"} — testers need a real, monitored destination before they hit a problem`);
  const legal = canPublishLegalSet(legalManifest ?? {});
  if (!legal.allowed) blockedBy.push(`legal set unpublishable (${legal.blocked.length} section(s) blocked) — beta terms cannot reference unapproved text`);
  if (analyticsDecision !== "ENABLED" && analyticsDecision !== "DEFERRED_BY_FOUNDER") {
    blockedBy.push("analytics undecided — either enabled or an explicit founder deferral; silence is not a decision");
  }
  return { ready: blockedBy.length === 0, blockedBy };
}

/** Deny-by-default access evaluation for whatever auth layer fronts the beta. */
export function resolveBetaAccess({ allowlistConfigured = false, entryPresent = false, revoked = false, windowOpen = false } = {}) {
  if (!allowlistConfigured) return { allow: false, reason: "no allowlist configured — deny by default, always" };
  if (revoked) return { allow: false, reason: "entry revoked — revocation wins over everything" };
  if (!entryPresent) return { allow: false, reason: "identifier not on the allowlist" };
  if (!windowOpen) return { allow: false, reason: "outside the cohort window" };
  return { allow: true, reason: "allowlisted, unrevoked, inside the window" };
}
