/**
 * xAI API SEAT (`api:xai`) — Grok as the Social Intelligence agent, researching public X with the server-side
 * X Search tool. This is programmatic API access, billed by xAI from PREPAID credits; it is separate from using
 * Grok in the X app or on grok.com, and separate from any authority to post on X (research ≠ publishing).
 *
 * Checked on docs.x.ai on 2026-10-27:
 *   • grok-4.3: $1.25 / $2.50 per million input / output tokens (higher above 200k-token prompts);
 *   • X Search is billed per item fetched: $5 per 1,000 posts, $10 per 1,000 profiles;
 *   • with prepaid credits and the default $0 invoiced limit, "API requests will be automatically rejected once
 *     your prepaid credits are depleted" — so a prepaid balance with auto top-up OFF is a hard ceiling.
 * The exact request shape for the X Search tool is UNVERIFIED until the first real connection test (CP-X1).
 *
 *   POST https://api.x.ai/v1/responses   { model, instructions, input, tools: [{ type: "x_search", … }], max_output_tokens }
 *   GET  https://api.x.ai/v1/api-key     connection test (key status; no tokens, no charge)
 */
import { callJson, worstCaseUsd, ProviderCallError, jsonFromText } from "./api-common.mjs";

export const XAI_BASE = "https://api.x.ai/v1";
export const XAI_DEFAULT_MODEL = "grok-4.3";
export const XAI_PRICES = Object.freeze({ "grok-4.3": { inPerM: 1.25, outPerM: 2.5 } });
/** Per fetched X post (docs.x.ai pricing, 2026-10-27). */
export const X_SEARCH_USD_PER_POST = 5 / 1000;
/** Worst-case allowance per research call: up to this many fetched posts are budgeted before the call. */
export const X_SEARCH_POST_ALLOWANCE = 100;

export function xaiConfig(env = {}) {
  const model = env.XAI_MODEL || XAI_DEFAULT_MODEL;
  return {
    hasKey: Boolean(env.XAI_API_KEY),
    model,
    price: XAI_PRICES[model] ?? (Number(env.XAI_PRICE_IN_PER_M) > 0 && Number(env.XAI_PRICE_OUT_PER_M) > 0 ? { inPerM: Number(env.XAI_PRICE_IN_PER_M), outPerM: Number(env.XAI_PRICE_OUT_PER_M) } : null),
    capUsd: Number(env.GTP_CC_XAI_MONTHLY_CAP_USD) > 0 ? Number(env.GTP_CC_XAI_MONTHLY_CAP_USD) : 0,
  };
}

/** @param {{ apiKey: string, model?: string, price: object, fetch?: typeof fetch, sleep?: Function }} o */
export function createXaiAdapter({ apiKey, model = XAI_DEFAULT_MODEL, price, fetch: f = globalThis.fetch, sleep }) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const toolAllowanceUsd = X_SEARCH_POST_ALLOWANCE * X_SEARCH_USD_PER_POST;
  return {
    provider: "xai",
    model,
    async testConnection() {
      const r = await callJson(f, `${XAI_BASE}/api-key`, { method: "GET", headers, timeoutMs: 15_000, sleep });
      const blocked = r.api_key_blocked || r.api_key_disabled || r.team_blocked;
      return { ok: !blocked, detail: blocked ? "the key or team is blocked/disabled" : `key "${String(r.name ?? "unnamed").slice(0, 40)}" active` };
    },
    worstCase({ instructions, input, maxOutputTokens }) {
      return worstCaseUsd({ promptText: `${instructions}\n${input}`, maxOutputTokens, price, toolAllowanceUsd });
    },
    /** Research with X Search. Returns { artifact, citations, model, usage }. */
    async research({ instructions, input, maxOutputTokens, fromDate = null, toDate = null }) {
      const r = await callJson(f, `${XAI_BASE}/responses`, {
        headers, sleep,
        body: {
          model, instructions, input, max_output_tokens: maxOutputTokens, store: false,
          tools: [{ type: "x_search", ...(fromDate ? { from_date: fromDate } : {}), ...(toDate ? { to_date: toDate } : {}) }],
        },
      });
      const text = r.output_text ?? (r.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("");
      const artifact = jsonFromText(text);
      if (!artifact) throw new ProviderCallError("PROVIDER_BAD_RESPONSE", "no JSON object in Grok's answer");
      const citations = (r.citations ?? []).map(String);
      const tokensIn = r.usage?.input_tokens ?? 0;
      const tokensOut = r.usage?.output_tokens ?? 0;
      // Fetched-post counts aren't reliably reported per response yet: bill the citations seen, flag as estimate.
      const posts = Number(r.usage?.server_side_tool_usage?.x_search_posts ?? r.usage?.num_sources_used ?? citations.length);
      const usd = (tokensIn * price.inPerM + tokensOut * price.outPerM) / 1e6 + posts * X_SEARCH_USD_PER_POST;
      return { artifact, citations, model: r.model ?? model, usage: { tokensIn, tokensOut, xPosts: posts, usd: Number(usd.toFixed(6)), estimated: true } };
    },
  };
}
