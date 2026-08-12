/**
 * Private-admin access contract (Program 164 · Release 7).
 *
 * The decision record (docs/ADMIN_ACCESS_DECISION.md) recommends a SEPARATE deployment of the
 * internal build behind the host's server-side protection. Whatever layer the founder chooses
 * must satisfy THIS contract — deny-by-default, server-side, session-bounded — and the public
 * production export keeps proving /launch and /ops absent regardless (those guards do not move).
 *
 * WHY A CONTRACT AND NOT AN IMPLEMENTATION: creating identity-provider accounts, DNS records, or
 * a real private deployment is founder-authorized work. The contract + synthetic fixtures mean
 * the chosen provider is verified against fixed rules on day one instead of ad-hoc clicking.
 */

export const ADMIN_ACCESS_VERSION = 1;

/** Evaluate one admin request under the contract. Pure; deny-by-default on every missing input. */
export function evaluateAdminRequest({ deploymentProtected = false, authenticated = false, sessionAgeMinutes = null, allowlisted = false, maxSessionMinutes = 720 } = {}) {
  const deny = (reason) => ({ allow: false, reason });
  if (!deploymentProtected) return deny("the deployment itself is not behind server-side protection — a hidden URL or client-side prompt is not security");
  if (!authenticated) return deny("unauthenticated — deny and challenge");
  if (!allowlisted) return deny("authenticated but not on the founder allowlist — wrong user is still deny");
  if (!Number.isFinite(sessionAgeMinutes) || sessionAgeMinutes < 0) return deny("session age unknown — an unbounded session is a leaked session");
  if (sessionAgeMinutes > maxSessionMinutes) return deny(`session expired (${sessionAgeMinutes}m > ${maxSessionMinutes}m) — re-authenticate`);
  return { allow: true, reason: "protected deployment + authenticated + allowlisted + fresh session" };
}

/** Response-header requirements for any admin surface — no indexing, no caching, ever. */
export const ADMIN_RESPONSE_HEADERS = Object.freeze({
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "no-store, max-age=0",
});
