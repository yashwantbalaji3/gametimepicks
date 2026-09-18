/**
 * THE ANTHROPIC ADAPTER — the only file in the product that knows a vendor's wire format.
 *
 * It follows the convention `api/slip-read.mjs` already established and that this repository has
 * therefore already approved: the Messages API over plain `fetch`, `x-api-key` plus
 * `anthropic-version`, no SDK, and a key read from the environment that is never logged, never echoed
 * into an error body, and never prefixed `NEXT_PUBLIC`.
 *
 * TEMPERATURE (§68). Planning runs at 0 and writing at 0.2. This is knowledge work: the same question
 * over the same evidence should produce the same tool plan every time, and a writer that reaches for
 * variety is a writer reaching for words the evidence did not supply. The numbers are stated here
 * rather than left to a default so a receipt can name them.
 *
 * ABORT IS REAL, NOT COSMETIC (§52, §95). Every request carries an AbortSignal wired to the caller's,
 * so a reader pressing Stop actually cancels the upstream request instead of leaving it to run and
 * bill while its answer is discarded.
 */
import { ASK_BUDGET, ASK_ERROR } from "./contract.mjs";
import { redact } from "./provider.mjs";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** The model this adapter uses. Recorded in every receipt beside the prompt and registry versions. */
export const ANTHROPIC_MODEL = "claude-sonnet-5";

/**
 * Error types this adapter will repeat back. A closed allowlist, because the point is to name a
 * CONFIGURATION fault to an operator, not to forward whatever a remote service decides to send.
 */
const KNOWN_ERROR_TYPES = Object.freeze([
  "authentication_error", "permission_error", "not_found_error", "invalid_request_error",
  "rate_limit_error", "overloaded_error", "api_error", "billing_error", "request_too_large",
]);

/**
 * @param {{apiKey: string, model?: string, fetchImpl?: typeof fetch}} config
 * @returns {import("./provider.mjs").AskModelProvider}
 */
/**
 * @param {{apiKey: string, model?: string, fetchImpl?: typeof fetch, diagnostics?: boolean}} config
 *   `diagnostics` forwards a REDACTED, TRUNCATED upstream error message. See `explain` below.
 */
export function createAnthropicProvider({ apiKey, model = ANTHROPIC_MODEL, fetchImpl = fetch, diagnostics = false } = {}) {
  if (!apiKey) throw new Error("createAnthropicProvider: no API key");

  async function call({ system, messages, maxTokens, temperature, signal }) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), ASK_BUDGET.providerTimeoutMs);

    try {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages }),
      });

      if (!res.ok) {
        /*
         * THE STATUS AND THE ERROR TYPE, NEVER THE MESSAGE. An upstream error body can echo request
         * content, and request content is the one place a key could plausibly appear in a malformed
         * deployment. So the numeric status crosses this line, and so does the provider's own short
         * error TYPE (`authentication_error`, `not_found_error`, `invalid_request_error`) — an enum
         * from a closed set, matched against an allowlist so an unexpected value is reported as
         * "unknown" rather than passed through. The MESSAGE never crosses.
         */
        let type = null;
        let explain = null;
        try {
          const body = await res.json();
          const raw = String(body?.error?.type ?? "");
          type = KNOWN_ERROR_TYPES.includes(raw) ? raw : raw ? "unrecognised_error_type" : null;
          /*
           * THE MESSAGE, IN NON-PRODUCTION ONLY.
           *
           * A 400 says the request was malformed; only the message says HOW, and without it an
           * operator is reduced to redeploying variants to bisect their own request body. That is a
           * real cost — this canary spent one deploy cycle learning "400" and nothing else.
           *
           * It is still withheld from production, because a production error body is read by
           * strangers and there is no operator behind it to act on the detail. Preview and local get
           * the message; production gets the status and the type. It passes through `redact()` and is
           * truncated, so even here nothing credential-shaped survives — and the API key travels in a
           * HEADER, which a body-validation error cannot echo.
           */
          const msg = String(body?.error?.message ?? "");
          if (diagnostics && msg) explain = redact(msg).slice(0, 220);
        } catch { /* a body we cannot parse tells us nothing, and that is fine */ }
        return {
          ok: false,
          code: res.status === 429 ? ASK_ERROR.RATE_LIMITED : ASK_ERROR.PROVIDER_ERROR,
          status: res.status,
          type,
          explain,
        };
      }

      const payload = await res.json();
      const text = (payload?.content ?? [])
        .filter((c) => c?.type === "text")
        .map((c) => c.text)
        .join("")
        .trim();

      return {
        ok: true,
        text,
        usage: { inputTokens: payload?.usage?.input_tokens ?? null, outputTokens: payload?.usage?.output_tokens ?? null },
      };
    } catch (e) {
      const aborted = e?.name === "AbortError";
      return { ok: false, code: aborted ? ASK_ERROR.PROVIDER_TIMEOUT : ASK_ERROR.PROVIDER_ERROR, detail: redact(e?.message) };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    id: "anthropic",
    model,

    async plan({ system, user, signal }) {
      return call({ system, messages: [{ role: "user", content: user }], maxTokens: 1500, temperature: 0, signal });
    },

    async write({ system, user, signal }) {
      return call({ system, messages: [{ role: "user", content: user }], maxTokens: ASK_BUDGET.maxAnswerTokens, temperature: 0.2, signal });
    },
  };
}
