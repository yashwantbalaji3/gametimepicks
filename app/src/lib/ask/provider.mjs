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
export const ASK_PROVIDERS = Object.freeze(["anthropic", "openai", "gemini", "fake"]);

/**
 * Which secret each provider needs. Provider choice and credential requirement are ONE fact, so the
 * 503 that reports a missing configuration names the variable for the provider actually selected —
 * not the variable that happened to be required when the file was first written.
 */
export const ASK_PROVIDER_ENV = Object.freeze({
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
  fake: null,
});

/**
 * Decide which provider this process should use. PURE — takes an env object, returns a decision, reads
 * no globals and opens no sockets, so every branch is a unit test rather than a deployment experiment.
 *
 * @param {object} env
 * @param {{ isProduction?: boolean }} [opts]
 */
export function selectProvider(env = {}, opts = {}) {
  const asked = String(env.ASK_MODEL_PROVIDER ?? "").trim().toLowerCase();
  const hasAnthropic = Boolean(String(env.ANTHROPIC_API_KEY ?? "").trim());
  const hasOpenAi = Boolean(String(env.OPENAI_API_KEY ?? "").trim());
  const hasGemini = Boolean(String(env.GOOGLE_API_KEY ?? "").trim());
  const isProduction = opts.isProduction ?? String(env.VERCEL_ENV ?? "").toLowerCase() === "production";
  /* An explicit model name overrides the adapter's default. Names only — never a credential. */
  const model = String(env.ASK_MODEL_NAME ?? "").trim() || null;

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

  if (asked === "openai") {
    if (!hasOpenAi) return { ok: false, code: ASK_ERROR.PROVIDER_NOT_CONFIGURED, detail: "OPENAI_API_KEY is not set" };
    return { ok: true, provider: "openai", model };
  }

  if (asked === "gemini") {
    if (!hasGemini) return { ok: false, code: ASK_ERROR.PROVIDER_NOT_CONFIGURED, detail: "GOOGLE_API_KEY is not set" };
    return { ok: true, provider: "gemini", model };
  }

  if (asked === "anthropic") {
    if (!hasAnthropic) return { ok: false, code: ASK_ERROR.PROVIDER_NOT_CONFIGURED, detail: "ANTHROPIC_API_KEY is not set" };
    return { ok: true, provider: "anthropic", model };
  }

  /*
   * NO EXPLICIT CHOICE. Anthropic stays the default while it is the verified provider, so a migration
   * that is half-configured cannot silently move production onto an unverified model. Switching is a
   * deliberate act: set ASK_MODEL_PROVIDER. (v1.6.1 §K flips this only after the canary passes.)
   */
  if (!asked && hasAnthropic) return { ok: true, provider: "anthropic", model };
  if (!asked && hasOpenAi) return { ok: true, provider: "openai", model };
  if (!asked && hasGemini) return { ok: true, provider: "gemini", model };

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
/*
 * EVERY CREDENTIAL ASK MAY EVER USE — not the one it needs right now.
 *
 * ⚠ THE DISTINCTION IS LOad-BEARING. This list also drives the built-output scan that asserts no Ask
 * secret name reaches a client chunk. Left as the single ACTIVE provider's key, adding a second vendor
 * would have silently stopped that scan looking for the new one: the guard would still pass, and would
 * be checking a name that no longer mattered. A leak guard must enumerate every name that could leak.
 *
 * "Which one is required for this configuration" is a different question, answered by `requiredEnvFor`.
 */
export const ASK_REQUIRED_ENV = Object.freeze(["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY"]);

/** The secret the SELECTED provider needs — one name, chosen by configuration, never a union. */
export function requiredEnvFor(env = {}) {
  /*
   * ⚠ ASK THE ASKED-FOR PROVIDER, NOT THE SELECTED ONE. Routing this through `selectProvider` alone
   * was wrong in exactly the case that matters: with ASK_MODEL_PROVIDER=openai and no key, selection
   * FAILS, so there is no selected provider to look up, and the 503 fell back to listing every
   * credential in the system. An operator who has named their provider should be told the one
   * variable they are missing, not handed a menu.
   */
  const asked = String(env.ASK_MODEL_PROVIDER ?? "").trim().toLowerCase();
  if (asked && Object.prototype.hasOwnProperty.call(ASK_PROVIDER_ENV, asked)) {
    const name = ASK_PROVIDER_ENV[asked];
    return name ? [name] : [];
  }
  const decision = selectProvider(env, { isProduction: false });
  const name = decision.ok ? ASK_PROVIDER_ENV[decision.provider] : null;
  return name ? [name] : [];
}

/** Names only — a VALUE is never read into a message, a log line or an error. */
export function missingAskConfig(env = {}) {
  const required = requiredEnvFor(env);
  if (required.length) return required.filter((k) => !String(env[k] ?? "").trim());
  // Nothing selected at all: report every credential that could have selected something.
  return Object.values(ASK_PROVIDER_ENV).filter(Boolean).filter((k) => !String(env[k] ?? "").trim());
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
    /*
     * ⚠ OPENAI KEYS CONTAIN DASHES AND UNDERSCORES (`sk-proj-…`, `sk-svcacct-…`). The previous pattern
     * required [A-Za-z0-9] only, so it stopped at the first dash and redacted nothing useful. A
     * redactor that silently fails to match is worse than none, because it is trusted.
     */
    .replace(/sk-(proj|svcacct|admin)-[A-Za-z0-9_-]{8,}/g, "sk-$1-***")
    /* Google API keys are a fixed shape and contain neither a prefix the rules above match nor a dash. */
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza***")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-***")
    /*
     * `Bearer <token>` is TWO tokens, and a pattern that consumes one \S+ after the header name eats
     * the word "Bearer" and leaves the credential behind it in the log. The scheme word is matched
     * optionally so the value after it is always what gets removed.
     */
    .replace(/(x-api-key|authorization|api[_-]?key|token)\s*[:=]\s*(?:bearer\s+)?\S+/gi, "$1: ***")
    .replace(/\bbearer\s+[A-Za-z0-9._-]{12,}/gi, "bearer ***")
    .slice(0, 400);
}
