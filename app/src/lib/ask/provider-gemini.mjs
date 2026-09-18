/**
 * THE GEMINI ADAPTER — the third implementation of `AskModelProvider`.
 *
 * Third time through this boundary, nothing above it changed again: the planner still gets a system
 * prompt and a user message and returns text, the executor still re-validates every argument, the
 * verifier still runs. That is the whole return on having drawn the line in the first place.
 *
 * Gemini's request shape differs from both predecessors in ways that matter, and each one is handled
 * here rather than leaking upward:
 *   - the system prompt is `systemInstruction`, not a role in the message list
 *   - JSON is requested with `responseMimeType`, and (unlike OpenAI) imposes no word requirement
 *   - THINKING IS BILLED AND MUST BE TURNED OFF EXPLICITLY (see below)
 *   - function declarations use an OpenAPI subset that rejects `additionalProperties`
 */
import { ASK_BUDGET, ASK_ERROR } from "./contract.mjs";
import { geminiToolList } from "./registry.mjs";
import { redact } from "./provider.mjs";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** The cheapest candidate under evaluation. `ASK_MODEL_NAME` overrides it. */
export const GEMINI_MODEL = "gemini-2.5-flash-lite";

/** Google's own status enum. Anything unrecognised is reported as such, never passed through. */
const KNOWN_ERROR_TYPES = Object.freeze([
  "INVALID_ARGUMENT", "FAILED_PRECONDITION", "PERMISSION_DENIED", "NOT_FOUND",
  "RESOURCE_EXHAUSTED", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED", "UNAUTHENTICATED",
]);

const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const RETRY_DELAY_MS = 700;

/**
 * BUILD THE REQUEST BODY — pure, exported, unit-tested, for the same reason as the OpenAI adapter:
 * the exact bytes are the one thing no offline test can otherwise reach.
 *
 * ⚠ `thinkingBudget: 0`. This family thinks by default and bills for it. The first gpt-5-nano turn
 * spent 1,216 of 1,270 output tokens reasoning and had no room left to emit a plan — the answer came
 * back empty and nothing about the prompt was wrong. That lesson is applied here BEFORE the first
 * call rather than after it: Ask's planning stage is routing, the hard thinking lives in a closed
 * registry and a deterministic executor, and an output ceiling shared with invisible thinking is a
 * ceiling on whether there is an answer at all.
 *
 * No `temperature`, `topP` or `topK`, for the reason that has now held across three vendors: what
 * keeps this output steady is structural, and a sampling knob is the thing most likely to be
 * deprecated out from under a request that otherwise works.
 */
export function buildGeminiRequest({ system, user, maxTokens, json = true, tools = null }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  };

  /*
   * THE CATALOGUE IS SENT, AND CALLING IS DISABLED (§C) — the same contract as the OpenAI adapter.
   * The model sees exactly which arguments the executor will accept; the plan remains the only way
   * out, because Ask's planner emits a dependency-ordered DAG that function calling cannot express.
   */
  if (tools?.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: "NONE" } };
  }
  return body;
}

/** Join the text parts of the first candidate. */
export function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
}

/** Normalise usage. Thinking tokens are billed and invisible, so they are recorded separately. */
export function extractGeminiUsage(payload) {
  const u = payload?.usageMetadata ?? {};
  return {
    inputTokens: u.promptTokenCount ?? null,
    outputTokens: u.candidatesTokenCount ?? null,
    reasoningTokens: u.thoughtsTokenCount ?? null,
    cachedInputTokens: u.cachedContentTokenCount ?? null,
  };
}

/**
 * @param {{apiKey: string, model?: string, fetchImpl?: typeof fetch, diagnostics?: boolean}} config
 */
export function createGeminiProvider({ apiKey, model = GEMINI_MODEL, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("createGeminiProvider: no API key");

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
        const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            /*
             * THE KEY TRAVELS IN A HEADER. Google's docs also accept `?key=`, and that is refused
             * here: a credential in a URL is a credential in every proxy log, every error report and
             * every referrer along the way.
             */
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(buildGeminiRequest({ system, user, maxTokens, json, tools })),
        });

        if (!res.ok) {
          let type = null;
          let explain = null;
          try {
            const body = await res.json();
            const raw = String(body?.error?.status ?? "");
            type = KNOWN_ERROR_TYPES.includes(raw) ? raw : raw ? "unrecognised_error_type" : null;
            // Always captured, disclosed by environment — the v1.6 lesson, applied from the start.
            const msg = String(body?.error?.message ?? "");
            if (msg) explain = redact(msg).slice(0, 220);
          } catch { /* an unparseable body tells us nothing */ }
          return {
            ok: false,
            code: res.status === 429 ? ASK_ERROR.RATE_LIMITED : ASK_ERROR.PROVIDER_ERROR,
            status: res.status,
            type,
            explain,
          };
        }

        const payload = await res.json();
        return {
          ok: true,
          text: extractGeminiText(payload),
          /* MAX_TOKENS here is the truncation signal, mapped into the vocabulary the engine reads. */
          stopReason: payload?.candidates?.[0]?.finishReason ?? null,
          usage: extractGeminiUsage(payload),
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
    id: "gemini",
    model,
    async plan({ system, user, signal }) {
      return call({ system, user, maxTokens: 1500, signal, json: true, tools: geminiToolList() });
    },
    async write({ system, user, signal }) {
      return call({ system, user, maxTokens: ASK_BUDGET.maxAnswerTokens, signal, json: true });
    },
  };
}
