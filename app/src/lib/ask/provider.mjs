/**
 * THE MODEL PROVIDER BOUNDARY — one adapter, so the product never learns a vendor's shape.
 *
 * `AskModelProvider` is two methods, `plan` and `write`. Everything above this line speaks in plans,
 * evidence and answers; everything below speaks HTTP to one vendor. The value of that is not
 * hypothetical portability — it is that the planner, the executor, the verifier and every eval can be
 * driven by a deterministic fake that satisfies the same interface, so CI exercises the real code path
 * without ever making a paid call (§90).
 *
 * WHICH PROVIDER IS SELECTED IS A FUNCTION OF THE ENVIRONMENT, AND FAILS CLOSED.
 *
 *   ASK_MODEL_PROVIDER=fake                 → the deterministic fake (tests, local, CI)
 *   ASK_MODEL_PROVIDER unset + a key present → Anthropic
 *   no key                                   → PROVIDER_NOT_CONFIGURED, and Ask answers 503
 *
 * The last line is the important one. With no key the endpoint refuses and says so; it does not fall
 * back to answering from the model's own knowledge, because there is no model, and it does not fall
 * back to a fake in production, because a fake answering a reader would be a fabrication with a
 * friendly face. `selectProvider` therefore REFUSES a fake in production unless it was asked for by
 * name, which is the mutation probe "force the fake in production" is written against.
 */
import { ASK_ERROR } from "./contract.mjs";

/**
 * @typedef {object} AskModelProvider
 * @property {string} id                                          stable name, recorded in receipts
 * @property {string} model                                       the exact model identifier used
 * @property {(input: PlanInput) => Promise<PlanOutput>} plan      intent + tool plan, structured
 * @property {(input: WriteInput) => Promise<WriteOutput>} write   the final answer, from evidence only
 */

/** Names the runtime understands. Anything else is a configuration error, not a silent default. */
export const ASK_PROVIDERS = Object.freeze(["anthropic", "fake"]);

/**
 * Decide which provider this process should use. PURE — takes an env object, returns a decision, reads
 * no globals and opens no sockets, so every branch is a unit test rather than a deployment experiment.
 *
 * @param {object} env
 * @param {{ isProduction?: boolean }} [opts]
 */
export function selectProvider(env = {}, opts = {}) {
  const asked = String(env.ASK_MODEL_PROVIDER ?? "").trim().toLowerCase();
  const hasKey = Boolean(String(env.ANTHROPIC_API_KEY ?? "").trim());
  const isProduction = opts.isProduction ?? String(env.VERCEL_ENV ?? "").toLowerCase() === "production";

  if (asked && !ASK_PROVIDERS.includes(asked)) {
    return { ok: false, code: ASK_ERROR.PROVIDER_NOT_CONFIGURED, detail: "unknown provider name" };
  }

  if (asked === "fake") {
    /*
     * THE PRODUCTION FAKE REFUSAL. A fake provider generates plausible prose with no model behind it.
     * In CI that is exactly right; served to a reader it is a fabrication. Setting the variable in a
     * production environment is therefore refused rather than honoured, so the failure is a 503 a
     * human investigates instead of an answer a human believes.
     */
    if (isProduction) return { ok: false, code: ASK_ERROR.PROVIDER_NOT_CONFIGURED, detail: "the fake provider is refused in production" };
    return { ok: true, provider: "fake" };
  }

  if (asked === "anthropic" || (!asked && hasKey)) {
    if (!hasKey) return { ok: false, code: ASK_ERROR.PROVIDER_NOT_CONFIGURED, detail: "ANTHROPIC_API_KEY is not set" };
    return { ok: true, provider: "anthropic" };
  }

  // No provider asked for and no key: Ask is deployable but not answerable, which is the intended
  // state between shipping the route and provisioning the key.
  return { ok: false, code: ASK_ERROR.PROVIDER_NOT_CONFIGURED, detail: "no model provider is configured" };
}

/**
 * Which configuration names Ask itself requires. Deliberately SHORT.
 *
 * Ask does not inherit slip-read's Supabase variables merely because they sit in a neighbouring file.
 * Ask stores nothing, identifies nobody and has no database, so requiring a database credential would
 * be a dependency invented by proximity. One secret, server-side only.
 */
export const ASK_REQUIRED_ENV = Object.freeze(["ANTHROPIC_API_KEY"]);

/** Names only — a VALUE is never read into a message, a log line or an error. */
export function missingAskConfig(env = {}) {
  return ASK_REQUIRED_ENV.filter((k) => !String(env[k] ?? "").trim());
}

/**
 * Redact anything credential-shaped before it reaches a log or an error body.
 *
 * Applied to every string the endpoint logs, not only the ones expected to be risky, because the
 * strings that leak a key are by definition the ones nobody expected to contain one.
 */
export function redact(s) {
  return String(s ?? "")
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, "sk-ant-***")
    .replace(/sk-[A-Za-z0-9]{16,}/g, "sk-***")
    /*
     * `Bearer <token>` is TWO tokens, and a pattern that consumes one \S+ after the header name eats
     * the word "Bearer" and leaves the credential behind it in the log. The scheme word is matched
     * optionally so the value after it is always what gets removed.
     */
    .replace(/(x-api-key|authorization|api[_-]?key|token)\s*[:=]\s*(?:bearer\s+)?\S+/gi, "$1: ***")
    .replace(/\bbearer\s+[A-Za-z0-9._-]{12,}/gi, "bearer ***")
    .slice(0, 400);
}
