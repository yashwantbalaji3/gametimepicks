/**
 * Support channel configuration — fail-closed (Program 137).
 *
 * THE RULE THIS ENCODES. A form that submits nowhere, a mailto: to an unmonitored address, or a
 * "we'll get back to you within 24 hours" line nobody agreed to are all WORSE than no support
 * entry point: each one makes a promise the company cannot keep, to a user who has a real problem.
 * So the public surface renders a support entry point ONLY when a real destination, a named owner,
 * and a founder-authorised response expectation all exist. Absent any of them, it renders nothing.
 *
 * Nothing here invents a value. `responseExpectation` in particular is passed through verbatim from
 * configuration and is never defaulted — an SLA the founder did not agree to is a fabricated SLA.
 *
 * Configuration is read at BUILD time (this is a static export — there is no server to read env at
 * request time):
 *
 *   GTP_SUPPORT_DESTINATION   mailto:someone@domain  |  https://…            (required)
 *   GTP_SUPPORT_OWNER         the human or rota answering it                 (required)
 *   GTP_SUPPORT_RESPONSE      the exact response expectation to publish      (required)
 *
 * As of 2026-08-05 none of the three is set anywhere in the repository, CI, or Vercel, so the
 * resolved state is NOT_CONFIGURED and no support UI ships. See docs/SUPPORT_READINESS.md.
 */

export const SUPPORT_STATES = {
  /** No configuration at all — the honest default. Renders nothing. */
  NOT_CONFIGURED: "NOT_CONFIGURED",
  /** Configuration present but unusable. Renders nothing, and is LOUD: partial config is a mistake. */
  INVALID: "INVALID",
  /** Real destination + owner + authorised response expectation. Renders the entry point. */
  CONFIGURED: "CONFIGURED",
};

/**
 * Values that look like configuration but are placeholders. Shipping any of these would put a dead
 * address in front of users, which is the exact failure this module exists to prevent.
 */
const PLACEHOLDER = /(example\.(com|org|net)|localhost|changeme|your[-_.]?(email|domain)|todo|tbd|placeholder|noreply|no-reply|test@|foo@|bar@)/i;

const EMAIL = /^mailto:[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/i;

function validDestination(value) {
  if (typeof value !== "string" || !value.trim()) return { ok: false, reason: "missing" };
  const v = value.trim();
  if (PLACEHOLDER.test(v)) return { ok: false, reason: `placeholder value (${v})` };
  if (EMAIL.test(v)) return { ok: true, kind: "email" };
  if (/^https:\/\/[^\s/]+\.[^\s/]{2,}/i.test(v)) return { ok: true, kind: "url" };
  // http:// is rejected deliberately — a support form posting over plaintext is not privacy-safe.
  return { ok: false, reason: `not a mailto: address or https:// URL (${v})` };
}

/**
 * Resolve the support configuration. Pure: pass an env-shaped object; nothing is read implicitly,
 * so tests never depend on the machine they run on.
 *
 * @returns {{state: string, enabled: boolean, destination: string|null, kind: string|null,
 *            owner: string|null, responseExpectation: string|null, problems: string[]}}
 */
export function resolveSupportConfig(env = {}) {
  const destination = (env.GTP_SUPPORT_DESTINATION ?? "").trim() || null;
  const owner = (env.GTP_SUPPORT_OWNER ?? "").trim() || null;
  const responseExpectation = (env.GTP_SUPPORT_RESPONSE ?? "").trim() || null;

  const none = !destination && !owner && !responseExpectation;
  const problems = [];

  const d = validDestination(destination);
  if (!d.ok) problems.push(`GTP_SUPPORT_DESTINATION: ${d.reason}`);
  if (!owner) problems.push("GTP_SUPPORT_OWNER: missing — an unowned channel is not a channel");
  if (!responseExpectation) {
    problems.push("GTP_SUPPORT_RESPONSE: missing — never defaulted, an unauthorised SLA is a fabricated promise");
  } else if (PLACEHOLDER.test(responseExpectation)) {
    problems.push(`GTP_SUPPORT_RESPONSE: placeholder value (${responseExpectation})`);
  }

  // Absent vs broken are different operationally: one is "not started", the other is "someone
  // configured this and it does not work". Both render nothing; only the second is an error.
  const state = none ? SUPPORT_STATES.NOT_CONFIGURED : problems.length ? SUPPORT_STATES.INVALID : SUPPORT_STATES.CONFIGURED;

  return {
    state,
    enabled: state === SUPPORT_STATES.CONFIGURED,
    destination: state === SUPPORT_STATES.CONFIGURED ? destination : null,
    kind: state === SUPPORT_STATES.CONFIGURED ? d.kind : null,
    owner: state === SUPPORT_STATES.CONFIGURED ? owner : null,
    responseExpectation: state === SUPPORT_STATES.CONFIGURED ? responseExpectation : null,
    problems,
  };
}

/**
 * What the ops/support launch gate should record. Kept beside the resolver so the gate can never
 * claim a channel the resolver would refuse to render.
 */
export function supportGateEvidence(env = {}) {
  const c = resolveSupportConfig(env);
  return {
    configured: c.enabled,
    state: c.state,
    owner: c.owner,
    // A gate is PASS only when a real destination is reachable AND owned. Config alone is not proof
    // of delivery — that needs a send/receipt test, which requires the destination to exist first.
    gate: c.enabled ? "PASS_PENDING_DELIVERY_TEST" : "PARTIAL",
    blocker: c.enabled ? null : "no founder-provided support destination, owner, or response expectation",
    problems: c.problems,
  };
}
