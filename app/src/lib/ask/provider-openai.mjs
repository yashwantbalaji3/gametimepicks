/**
 * THE OPENAI ADAPTER — the second implementation of `AskModelProvider`, and the reason the boundary
 * was worth having.
 *
 * Nothing above this file changes to accommodate OpenAI. The planner still receives a system prompt
 * and a user message and returns text; the writer still receives an evidence bundle and returns text;
 * the executor still re-validates every argument the model produced. A vendor's request shape, error
 * taxonomy and usage accounting live here and nowhere else (§B).
 *
 * WHY THIS EXISTS: cost. The Anthropic path measured ~$0.0249 per turn. This adapter targets models
 * priced one to two orders of magnitude lower. Cheapness buys nothing if the answer stops being
 * grounded, so it changes no grounding rule, relaxes no gate, and is held to the identical 91-case
 * eval and the identical hard gates before it may carry a reader's question.
 */
import { ASK_BUDGET, ASK_ERROR } from "./contract.mjs";
import { openAiToolList } from "./registry.mjs";
import { redact } from "./provider.mjs";

const ENDPOINT = "https://api.openai.com/v1/responses";

/** The default is the cheapest candidate under evaluation. `ASK_MODEL_NAME` overrides it. */
export const OPENAI_MODEL = "gpt-5-nano";

/**
 * Error types OpenAI names. An unrecognised value is reported as "unrecognised_error_type" rather
 * than passed through, so a surprising string cannot become a channel for arbitrary upstream text.
 */
const KNOWN_ERROR_TYPES = Object.freeze([
  "invalid_request_error", "authentication_error", "permission_error", "not_found_error",
  "rate_limit_error", "server_error", "api_error", "insufficient_quota", "overloaded_error",
]);

/* Same policy as the Anthropic adapter: retry what a moment fixes, never what a moment cannot. */
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const RETRY_DELAY_MS = 700;

/**
 * BUILD THE REQUEST BODY — pure, exported, and unit-tested.
 *
 * ⚠ THIS IS THE PART THAT CANNOT BE PROVEN WITHOUT A KEY, so it is the part that is isolated and
 * tested in the one way it can be: as a value. v1.6 lost a deploy cycle to a request field the model
 * had deprecated (`temperature`, 400 on every single call), and the lesson was not "read the docs
 * harder" — it was that an un-inspectable request body is a bisect waiting to happen. This function
 * makes the exact bytes assertable offline.
 *
 * NO `temperature`. The GPT-5 family are reasoning models and reject it exactly as `claude-sonnet-5`
 * does. The same reasoning applies as there: what holds this output steady is structural — a closed
 * tool registry, an executor that re-validates, evidence sentences rather than rows, and a numeric
 * verifier — not a sampling knob.
 */
/*
 * ⚠ REASONING EFFORT IS A BUDGET DECISION, MEASURED NOT GUESSED.
 *
 * The first real gpt-5-nano turn spent 1,216 of 1,270 output tokens on reasoning — 96% — leaving ~54
 * tokens to actually emit the plan. The planner duly returned a plan with no tool call, the writer got
 * no evidence, and the reader got a refusal. Nothing was wrong with the prompt, the catalogue or the
 * grounding: the model ran out of room to answer in.
 *
 * On a reasoning model the output ceiling is shared between thinking and writing, so a ceiling sized
 * for the ANSWER silently becomes a ceiling on whether there is an answer at all. Ask's planning stage
 * is routing, not deliberation — the hard thinking lives in a closed registry and a deterministic
 * executor — so minimal effort is the right setting on its merits, and it is also what the measurement
 * demands. §D permits a budget change when measurement proves a reason; this is that measurement.
 */
const REASONING_EFFORT = "minimal";

export function buildOpenAiRequest({ model, system, user, maxTokens, json = true, tools = null }) {
  const body = {
    model,
    /*
     * ⚠ THE SYSTEM PROMPT TRAVELS IN `input`, NOT `instructions`, AND THAT IS NOT A STYLE CHOICE.
     *
     * JSON mode refuses the request unless the word "json" appears in the INPUT MESSAGES:
     *   "Response input messages must contain the word 'json' in some form to use 'text.format' of
     *    type 'json_object'."
     * Ask's prompts already end with "Reply with ONE JSON object and nothing else" — but it sat in
     * `instructions`, which does not count, so every single call 400'd. Carrying the system prompt as
     * a system-role input message satisfies the rule without editing a provider-agnostic prompt to
     * suit one vendor.
     *
     * That leaves a dependency on prompt WORDING, which is exactly the kind of accident that rots
     * silently, so `assertJsonModeIsSatisfiable` makes it an asserted invariant instead.
     */
    input: [{ role: "system", content: system }, { role: "user", content: user }],
    /*
     * Output tokens on a reasoning model INCLUDE its reasoning tokens, which are billed and which the
     * reader never sees. The ceiling therefore has to cover both, and the usage read below records
     * them separately so a cost receipt says where the money actually went.
     */
    max_output_tokens: maxTokens,
    reasoning: { effort: REASONING_EFFORT },
  };

  if (json) {
    body.text = { format: { type: "json_object" } };
    assertJsonModeIsSatisfiable(body.input);
  }

  /*
   * THE TOOL CATALOGUE IS SENT AS SCHEMA, AND MAY NOT BE CALLED (§C).
   *
   * v1.6's worst defect was a catalogue that existed, was exported, and was never handed to the
   * model: it invented tool names for a third of the canary. So the schemas go on the request.
   *
   * `tool_choice: "none"` is the load-bearing half. Ask's planner does not emit vendor tool calls —
   * it emits a PLAN, a small DAG with dependency ordering that function calling cannot express. The
   * schemas are supplied so the model sees exactly which arguments the executor will accept; calling
   * is disabled so the plan contract is the only way out. The executor remains authoritative either
   * way, because the model is untrusted input whatever shape it answers in.
   */
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "none";
  }
  return body;
}

/**
 * JSON mode has a precondition, so state it where it can fail loudly rather than upstream at $0.00 a
 * call and a 400. Thrown, not logged: a request that cannot succeed should not be sent.
 */
export function assertJsonModeIsSatisfiable(input) {
  const text = JSON.stringify(input ?? "").toLowerCase();
  if (!text.includes("json")) {
    throw new Error("openai json mode requires the word 'json' in the input messages; the prompt no longer contains it");
  }
}

/** Pull the assistant text out of a Responses payload, whichever shape the field arrives in. */
export function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts = [];
  for (const item of payload?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("").trim();
}

/** Normalise usage, keeping reasoning tokens visible because they are billed and invisible to readers. */
export function extractUsage(payload) {
  const u = payload?.usage ?? {};
  return {
    inputTokens: u.input_tokens ?? null,
    outputTokens: u.output_tokens ?? null,
    reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? null,
    cachedInputTokens: u.input_tokens_details?.cached_tokens ?? null,
  };
}

/**
 * @param {{apiKey: string, model?: string, fetchImpl?: typeof fetch, diagnostics?: boolean}} config
 */
export function createOpenAiProvider({ apiKey, model = OPENAI_MODEL, fetchImpl = fetch, diagnostics = false } = {}) {
  // Fail closed and loudly at construction, exactly as the Anthropic adapter does. A provider built
  // without a credential would otherwise fail once per request, as an upstream 401, forever.
  if (!apiKey) throw new Error("createOpenAiProvider: no API key");
  async function call({ system, user, maxTokens, signal, json = true, tools = null }) {
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
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(buildOpenAiRequest({ model, system, user, maxTokens, json, tools })),
        });

        if (!res.ok) {
          let type = null;
          let explain = null;
          try {
            const body = await res.json();
            const raw = String(body?.error?.type ?? body?.error?.code ?? "");
            type = KNOWN_ERROR_TYPES.includes(raw) ? raw : raw ? "unrecognised_error_type" : null;
            /*
             * ALWAYS CAPTURED, SELECTIVELY DISCLOSED — the v1.6 lesson, applied from the start here.
             * Gating capture on a diagnostics flag meant production, the one environment that fails,
             * was the one environment that never read the message. `refusalPayload` in `_ask-core`
             * decides who sees it; the operator's log always does.
             */
            const msg = String(body?.error?.message ?? "");
            if (msg) explain = redact(msg).slice(0, 220);
          } catch { /* an unparseable body tells us nothing, and that is fine */ }
          return {
            ok: false,
            code: res.status === 429 ? ASK_ERROR.RATE_LIMITED : ASK_ERROR.PROVIDER_ERROR,
            status: res.status,
            type,
            explain,
          };
        }

        const payload = await res.json();
        const usage = extractUsage(payload);
        return {
          ok: true,
          text: extractOutputText(payload),
          /*
           * `incomplete` with reason `max_output_tokens` is this API's truncation signal, and it is
           * mapped to the same `stopReason` vocabulary the rest of Ask already reads. v1.6 spent a
           * deploy learning that truncation and "the model wrote prose instead of JSON" look
           * identical to a parser and need opposite fixes.
           */
          stopReason: payload?.status === "incomplete"
            ? (payload?.incomplete_details?.reason ?? "incomplete")
            : (payload?.status ?? null),
          usage,
        };
      } catch (e) {
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
    id: "openai",
    model,

    async plan({ system, user, signal }) {
      // The planner is the only stage that gets the tool schemas: it is the only one choosing tools.
      return call({ system, user, maxTokens: 1500, signal, json: true, tools: openAiToolList() });
    },

    async write({ system, user, signal }) {
      return call({ system, user, maxTokens: ASK_BUDGET.maxAnswerTokens, signal, json: true });
    },
  };
}
