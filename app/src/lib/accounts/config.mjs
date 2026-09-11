/**
 * ACCOUNTS CONFIG — fail-closed (P263).
 *
 * Accounts, slip uploads and the personal record all depend on a Supabase project that does not exist
 * yet. Everything that touches them reads this module first, and every surface is expected to render a
 * plain "not connected yet" state rather than a broken control. The same shape the support inbox and
 * the morning trigger use: a feature with no credentials is UNCONFIGURED, which is a product state,
 * not an error.
 *
 * THREE STATES, on purpose:
 *   UNCONFIGURED   — nothing is set. The founder has not created the project yet.
 *   MISCONFIGURED  — half of it is set, or the URL is not a Supabase address. This is louder than
 *                    UNCONFIGURED because it means someone tried and it is silently not working.
 *   READY          — both values are present and well-formed.
 *
 * WHAT MAY LIVE HERE: the project URL and the ANON key, both of which are public by design — they ship
 * to every browser and authorise nothing on their own, because row-level security decides what a signed
 * -in person can read. The SERVICE ROLE key must never be read by anything under src/: it bypasses RLS
 * entirely, so it belongs only to server code in app/api/, and a guard asserts that.
 */

const URL_SHAPE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/;

/** @param {Record<string, string | undefined>} [env] */
export function accountsConfig(env = typeof process === "undefined" ? {} : process.env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  if (!url && !anonKey) {
    return { state: "UNCONFIGURED", reason: "no Supabase project is connected yet", url: null, anonKey: null };
  }
  if (!url || !anonKey) {
    return {
      state: "MISCONFIGURED",
      reason: `half-configured: ${url ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : "NEXT_PUBLIC_SUPABASE_URL"} is missing`,
      url: null, anonKey: null,
    };
  }
  if (!URL_SHAPE.test(url)) {
    return { state: "MISCONFIGURED", reason: "NEXT_PUBLIC_SUPABASE_URL is not a https://<project>.supabase.co address", url: null, anonKey: null };
  }
  return { state: "READY", reason: "accounts are connected", url: url.replace(/\/$/, ""), anonKey };
}

/** True only when a real project is connected. Everything gated on accounts asks this. */
export const accountsReady = (env) => accountsConfig(env).state === "READY";

/**
 * What to tell a reader. Never names an environment variable to a visitor and never prints a key —
 * the operator detail belongs in the run log, not on the page.
 */
export function accountsNotice(cfg) {
  switch (cfg.state) {
    case "READY": return null;
    case "MISCONFIGURED": return "Accounts are temporarily unavailable. Nothing you do here is lost — the rest of the site is unaffected.";
    default: return "Accounts are not open yet. Everything on this page works without one, and your choices stay in this browser.";
  }
}
