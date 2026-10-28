/**
 * OPENAI API SEAT (`api:openai`) — ChatGPT's roles (Prompt Architect, Product Strategist, Content Strategist) run
 * as real API calls. Billed by OpenAI's API platform, separately from ChatGPT Plus; nothing here assumes Plus
 * includes API use. Locked until the founder adds OPENAI_API_KEY, a monthly cap and the model's prices, and a
 * connection test passes (providers/catalog.mjs).
 *
 *   POST https://api.openai.com/v1/responses   { model, instructions, input, max_output_tokens, text.format json_schema }
 *   GET  https://api.openai.com/v1/models       connection test (no tokens, no charge)
 *
 * Prices are configuration, not guesses: OPENAI_PRICE_IN_PER_M / OPENAI_PRICE_OUT_PER_M (USD per million tokens,
 * from the founder's pricing page for the chosen OPENAI_MODEL). Without them the seat refuses: it couldn't enforce
 * the cap.
 */
import { callJson, worstCaseUsd, ProviderCallError, jsonFromText } from "./api-common.mjs";

export const OPENAI_BASE = "https://api.openai.com/v1";

export function openaiConfig(env = {}) {
  const inP = Number(env.OPENAI_PRICE_IN_PER_M);
  const outP = Number(env.OPENAI_PRICE_OUT_PER_M);
  return {
    hasKey: Boolean(env.OPENAI_API_KEY),
    model: env.OPENAI_MODEL || null,
    price: inP > 0 && outP > 0 ? { inPerM: inP, outPerM: outP } : null,
    capUsd: Number(env.GTP_CC_OPENAI_MONTHLY_CAP_USD) > 0 ? Number(env.GTP_CC_OPENAI_MONTHLY_CAP_USD) : 0,
  };
}

/**
 * @param {{ apiKey: string, model: string, price: {inPerM:number, outPerM:number}, fetch?: typeof fetch, sleep?: Function }} o
 */
export function createOpenAIAdapter({ apiKey, model, price, fetch: f = globalThis.fetch, sleep }) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  return {
    provider: "openai",
    model,
    async testConnection() {
      const r = await callJson(f, `${OPENAI_BASE}/models`, { method: "GET", headers, timeoutMs: 15_000, sleep });
      const ids = (r.data ?? []).map((m) => m.id);
      return { ok: true, detail: `${ids.length} models visible${model && !ids.includes(model) ? `; configured model ${model} NOT among them` : ""}`, modelAvailable: !model || ids.includes(model) };
    },
    worstCase({ instructions, input, maxOutputTokens }) {
      return worstCaseUsd({ promptText: `${instructions}\n${input}`, maxOutputTokens, price });
    },
    /** One structured call. Returns { artifact, model, usage: { tokensIn, tokensOut, usd, estimated } }. */
    async generate({ instructions, input, schema, schemaName, maxOutputTokens }) {
      const r = await callJson(f, `${OPENAI_BASE}/responses`, {
        headers, sleep,
        body: {
          model, instructions, input, max_output_tokens: maxOutputTokens, store: false,
          text: { format: { type: "json_schema", name: schemaName, schema, strict: false } },
        },
      });
      const text = r.output_text ?? (r.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("");
      const artifact = jsonFromText(text);
      if (!artifact) throw new ProviderCallError("PROVIDER_BAD_RESPONSE", "no JSON object in the model's answer");
      const tokensIn = r.usage?.input_tokens ?? 0;
      const tokensOut = r.usage?.output_tokens ?? 0;
      return {
        artifact, model: r.model ?? model,
        usage: { tokensIn, tokensOut, usd: Number(((tokensIn * price.inPerM + tokensOut * price.outPerM) / 1e6).toFixed(6)), estimated: false },
      };
    },
  };
}
