/**
 * THE ANTHROPIC ADAPTER — the only file in the product that knows a vendor's wire format.
 *
 * It follows the convention `api/slip-read.mjs` already established and that this repository has
 * therefore already approved: the Messages API over plain `fetch`, `x-api-key` plus
 * `anthropic-version`, no SDK, and a key read from the environment that is never logged, never echoed
 * into an error body, and never prefixed `NEXT_PUBLIC`.
 *
 * TEMPERATURE: NOT SENT, BECAUSE THIS MODEL REFUSES IT. See the request body below — the parameter is
 * deprecated for this model and including it 400s every call. Steadiness comes from the structure
 * instead, which is where it should have come from anyway.
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

/**
 * Upstream conditions worth ONE retry, and the ones that are not.
 *
 * A deterministic 4xx — a bad key, a wrong model, a malformed body — will fail identically the second
 * time, so retrying it spends a call to learn nothing. Overload, a gateway hiccup and a dropped
 * connection are the opposite: the same request very often succeeds moments later.
 */
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const RETRY_DELAY_MS = 700;

  async function call({ system, messages, maxTokens, signal }) {
    /*
     * ONE RETRY, FOR TRANSIENT CONDITIONS ONLY (§85, §168).
     *
     * ⚠ THE FAILURE THIS COMMENT ONCE EXPLAINED WAS NOT A PROVIDER FAILURE AT ALL.
     *
     * The production smoke showed ~50% failures on one question, and this file was rewritten twice to
     * explain them: first as per-request randomness, then as a multi-minute upstream WINDOW. Both were
     * wrong. The cause was an unguarded property read in `buildEvidence` (a PARTIAL envelope with no
     * `player` key), surfacing as `PROVIDER_ERROR` only because the endpoint's outer catch had no code
     * of its own for an internal throw. Every hypothesis about this provider was built on that
     * mislabel, and each new measurement refuted the previous one because none of them were about
     * this file.
     *
     * Two things kept it alive. The refusal named the wrong subsystem, so the evidence was read as
     * being about the network. And the retry below made a deterministic bug look stochastic, because
     * whether a turn crashed depended on whether the planner passed `statFamily` that time.
     *
     * The retry policy itself is unchanged and still correct for what it is actually for: a genuine
     * gateway hiccup or dropped connection very often succeeds moments later.
     *
     * So: one retry, a short fixed delay, transient statuses and network throws only, and an honest
     * refusal after that. A blind retry-everything would have hidden the deprecated-`temperature` 400
     * behind a doubled bill and a longer wait.
     */
    for (let attempt = 0; ; attempt += 1) {
      const out = await attemptOnce();
      const retryable = !out.ok
        && attempt === 0
        && !signal?.aborted
        && (out.threw ? out.code !== ASK_ERROR.PROVIDER_TIMEOUT : TRANSIENT_STATUS.has(out.status));
      if (!retryable) return { ...out, attempts: attempt + 1 };
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    async function attemptOnce() {
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
        /*
         * ⚠ NO `temperature`. This model rejects it outright — 400 invalid_request_error,
         * "`temperature` is deprecated for this model" — so sending it fails every single call.
         *
         * The v1.6 plan called for a low temperature on planning and a low-to-moderate one on
         * writing, reasoning that this is knowledge work rather than creative writing. That reasoning
         * was sound and the lever no longer exists. What actually holds the output steady is
         * structural and always did the heavier lifting: the planner may only name tools from a
         * closed registry, the executor re-validates every argument, the writer receives already-
         * interpreted evidence sentences rather than raw rows, and the answer is checked against a
         * numeric index before it is emitted. A temperature setting would have nudged; these refuse.
         */
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
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
          /*
           * ALWAYS CAPTURED, SELECTIVELY DISCLOSED.
           *
           * This was gated on `diagnostics`, which is off in production — so in the one environment
           * that actually fails, the message was never even read. When every production call began
           * returning `400 invalid_request_error` on a request body byte-identical to one that had
           * passed minutes earlier, the operator had a status and a type and no way to learn the
           * sentence that would have named the cause outright, short of a deploy.
           *
           * The message is now always captured here and the DISCLOSURE decision is made at the
           * endpoint: the server log always carries it (operator-only), the response body carries it
           * outside production only. `redact()` and the 220-char truncation apply either way, and the
           * API key travels in a HEADER, which a body-validation error cannot echo.
           */
          const msg = String(body?.error?.message ?? "");
          if (msg) explain = redact(msg).slice(0, 220);
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
        /*
         * `stop_reason` distinguishes "the model wrote prose instead of JSON" from "the model was
         * cut off mid-JSON". They look identical to a parser and need opposite fixes — a stricter
         * instruction versus more room — so guessing between them wastes a deploy either way.
         */
        stopReason: payload?.stop_reason ?? null,
        usage: { inputTokens: payload?.usage?.input_tokens ?? null, outputTokens: payload?.usage?.output_tokens ?? null },
      };
    } catch (e) {
      /*
       * A THROW MUST NOT LOSE ITS IDENTITY.
       *
       * This branch returned `detail: redact(e?.message)` and nothing else — and when the message was
       * empty the whole refusal carried no status, no type and no detail, so an intermittent
       * production failure was indistinguishable from every other kind. `fetch` in particular throws a
       * TypeError whose useful information lives in `cause`, not `message`, so reading only `message`
       * discards exactly the part that says what happened.
       */
      const name = String(e?.name ?? "Error");
      const aborted = name === "AbortError" || controller.signal.aborted;
      const parts = [name, e?.message, e?.cause?.message ?? e?.cause?.code].filter(Boolean);
      return {
        ok: false,
        code: aborted ? ASK_ERROR.PROVIDER_TIMEOUT : ASK_ERROR.PROVIDER_ERROR,
        errorName: name,
        threw: true,
        detail: redact(parts.join(" · ") || "threw with no message"),
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    }
  }

  return {
    id: "anthropic",
    model,

    async plan({ system, user, signal }) {
      return call({ system, messages: [{ role: "user", content: user }], maxTokens: 1500, signal });
    },

    async write({ system, user, signal }) {
      return call({ system, messages: [{ role: "user", content: user }], maxTokens: ASK_BUDGET.maxAnswerTokens, signal });
    },
  };
}
