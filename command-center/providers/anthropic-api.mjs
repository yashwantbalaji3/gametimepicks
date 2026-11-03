/**
 * ANTHROPIC API SEAT (`api:anthropic`) — Claude as a hosted agent through the Messages API, so it can run on the
 * hosted worker with the Mac off. Billed by Anthropic's API platform (Console prepaid credits), separately from any
 * Claude.ai / Claude Code subscription; nothing here assumes a subscription includes API use. The subscription path
 * (providers/claude-code-cli.mjs) stays for local runs only. Locked until the founder adds ANTHROPIC_API_KEY and a
 * provider cap above $0 (orchestration/budgets.mjs); every cap defaults to $0.
 *
 *   messages.create  { model, max_tokens, system, messages, output_config: { effort, format: json_schema }, fallbacks }
 *   models.retrieve  connection test (no tokens, no charge)
 *
 * Prices are Anthropic first-party list prices per million tokens (claude-api reference, cached 2026-10-06).
 * GTP_CC_ANTHROPIC_PRICE_IN_PER_M / _OUT_PER_M override them. `fallbacks: "default"` may re-run a declined request on
 * another model whose prices can be higher, so the worst case is priced at FALLBACK_PRICE_CEILING whenever that is
 * above the configured model's price.
 */
import Anthropic from "@anthropic-ai/sdk";
import { worstCaseUsd, ProviderCallError } from "./api-common.mjs";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
export const ANTHROPIC_PRICES = Object.freeze({
  "claude-opus-5-5": Object.freeze({ inPerM: 4, outPerM: 20 }),
  "claude-sonnet-5-5": Object.freeze({ inPerM: 2, outPerM: 10 }),
  "claude-haiku-5-5": Object.freeze({ inPerM: 0.1, outPerM: 0.5 }),
});
/** The default refusal fallback can route to Claude Opus 4.8 ($5 / $25). */
export const FALLBACK_PRICE_CEILING = Object.freeze({ inPerM: 5, outPerM: 25 });
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export function anthropicConfig(env = {}) {
  const model = env.GTP_CC_ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL;
  const inP = Number(env.GTP_CC_ANTHROPIC_PRICE_IN_PER_M);
  const outP = Number(env.GTP_CC_ANTHROPIC_PRICE_OUT_PER_M);
  return {
    hasKey: Boolean(env.ANTHROPIC_API_KEY),
    model,
    price: inP > 0 && outP > 0 ? { inPerM: inP, outPerM: outP } : ANTHROPIC_PRICES[model] ?? null,
    effort: EFFORTS.has(env.GTP_CC_ANTHROPIC_EFFORT) ? env.GTP_CC_ANTHROPIC_EFFORT : "high",
    capUsd: Number(env.GTP_CC_ANTHROPIC_MONTHLY_CAP_USD) > 0 ? Number(env.GTP_CC_ANTHROPIC_MONTHLY_CAP_USD) : 0,
  };
}

/** Structured outputs need every object closed; the orchestration schemas leave it implicit. */
export function closeObjects(schema) {
  if (Array.isArray(schema)) return schema.map(closeObjects);
  if (!schema || typeof schema !== "object") return schema;
  const out = Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, closeObjects(v)]));
  if (out.type === "object" && !("additionalProperties" in out)) out.additionalProperties = false;
  return out;
}

/** SDK errors → the shared ProviderCallError codes. The message never carries request headers. */
function mapError(err) {
  if (err instanceof ProviderCallError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ProviderCallError("PROVIDER_TIMEOUT", "request timed out", { retryable: true });
  if (err instanceof Anthropic.APIConnectionError) return new ProviderCallError("PROVIDER_UNREACHABLE", "connection failed", { retryable: true });
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderCallError("PROVIDER_AUTH_FAILED", `HTTP ${err.status}`, { status: err.status });
  }
  if (err instanceof Anthropic.RateLimitError) return new ProviderCallError("PROVIDER_RATE_LIMITED", "HTTP 429", { status: 429, retryable: true });
  if (err instanceof Anthropic.APIError) {
    const text = String(err.message ?? "").replace(/\s+/g, " ").slice(0, 200);
    const code = err.status === 402 || /credit|billing|quota|spend/i.test(text) ? "PROVIDER_OUT_OF_CREDIT" : "PROVIDER_ERROR";
    return new ProviderCallError(code, `HTTP ${err.status}: ${text}`, { status: err.status, retryable: Number(err.status) >= 500 });
  }
  return new ProviderCallError("PROVIDER_ERROR", String(err?.message ?? err).slice(0, 160));
}

/**
 * @param {{ apiKey: string, model: string, price: {inPerM:number, outPerM:number}, effort?: string, fetch?: typeof fetch, timeoutMs?: number }} o
 */
export function createAnthropicAdapter({ apiKey, model, price, effort = "high", fetch: f = globalThis.fetch, timeoutMs = 120_000 }) {
  // One SDK retry, matching api-common's "at most one retry, only for 429 / 5xx / network".
  const client = new Anthropic({ apiKey, fetch: f, maxRetries: 1, timeout: timeoutMs });
  const ceiling = {
    inPerM: Math.max(price.inPerM, FALLBACK_PRICE_CEILING.inPerM),
    outPerM: Math.max(price.outPerM, FALLBACK_PRICE_CEILING.outPerM),
  };
  return {
    provider: "anthropic",
    model,
    async testConnection() {
      try {
        const m = await client.models.retrieve(model);
        return { ok: true, detail: `model ${m.id} visible`, modelAvailable: true };
      } catch (err) {
        if (err instanceof Anthropic.NotFoundError) return { ok: true, detail: `configured model ${model} NOT visible to this key`, modelAvailable: false };
        throw mapError(err);
      }
    },
    /** max_tokens bounds thinking plus answer, so it is the output worst case. */
    worstCase({ instructions, input, maxOutputTokens }) {
      return worstCaseUsd({ promptText: `${instructions}\n${input}`, maxOutputTokens, price: ceiling });
    },
    /** One structured call. Returns { artifact, model, fallbackRan, usage: { tokensIn, tokensOut, usd, estimated } }. */
    async generate({ instructions, input, schema, maxOutputTokens }) {
      let r;
      try {
        r = await client.beta.messages.create({
          model, max_tokens: maxOutputTokens, system: instructions,
          messages: [{ role: "user", content: input }],
          output_config: { effort, format: { type: "json_schema", schema: closeObjects(schema) } },
          betas: [FALLBACK_BETA], fallbacks: "default",
        });
      } catch (err) {
        throw mapError(err);
      }
      if (r.stop_reason === "refusal") {
        throw new ProviderCallError("PROVIDER_REFUSED", `declined (${r.stop_details?.category ?? "no category"})`);
      }
      if (r.stop_reason === "max_tokens") throw new ProviderCallError("PROVIDER_BAD_RESPONSE", "answer cut off at max_tokens");
      const text = r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      let artifact;
      try {
        artifact = JSON.parse(text);
      } catch {
        throw new ProviderCallError("PROVIDER_BAD_RESPONSE", "no JSON object in the model's answer");
      }
      const fallbackRan = (r.usage?.iterations ?? []).some((it) => it.type === "fallback_message");
      const tokensIn = (r.usage?.input_tokens ?? 0) + (r.usage?.cache_read_input_tokens ?? 0) + (r.usage?.cache_creation_input_tokens ?? 0);
      const tokensOut = r.usage?.output_tokens ?? 0;
      // A fallback bills at the substitute model's own rates; price it at the ceiling and say it is an estimate.
      const p = fallbackRan ? ceiling : price;
      return {
        artifact, model: r.model ?? model, fallbackRan,
        usage: { tokensIn, tokensOut, usd: Number(((tokensIn * p.inPerM + tokensOut * p.outPerM) / 1e6).toFixed(6)), estimated: fallbackRan },
      };
    },
  };
}
