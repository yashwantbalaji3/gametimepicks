/**
 * METERED API CALLS — the shared discipline for every provider API seat (OpenAI, xAI).
 *
 *   • Never silent: a seat runs only when the founder configured the key, a monthly cap above $0, and the last
 *     connection test passed. The Anthropic API is never used at all (Claude runs on the subscription).
 *   • Capped before the call: the worst-case cost (prompt estimate × input price + max output × output price +
 *     the tool allowance) must fit in what is left of the provider's monthly cap, or the call is refused.
 *   • Priced after the call from the provider's reported usage; the record says which numbers are estimates.
 *   • Bounded retries: one retry, only for 429 / 5xx / network errors, after a short wait. 4xx never retries.
 *   • Bounded time: every request has a timeout.
 *   • Keys never leave this module's request headers: not logged, not in the ledger, not in errors.
 */

export const DEFAULT_TIMEOUT_MS = 120_000;
export const RETRY_DELAY_MS = 2_000;

/** Rough token estimate for a prompt (≈ 4 characters per token, rounded up, plus 10% headroom). */
export const estimateTokens = (text) => Math.ceil((String(text).length / 4) * 1.1);

/** Worst-case USD for one call, from per-million-token prices plus a fixed tool allowance. */
export function worstCaseUsd({ promptText, maxOutputTokens, price, toolAllowanceUsd = 0 }) {
  return (estimateTokens(promptText) * price.inPerM + maxOutputTokens * price.outPerM) / 1e6 + toolAllowanceUsd;
}

export class ProviderCallError extends Error {
  constructor(code, detail, { status = null, retryable = false } = {}) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.detail = detail;
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * POST/GET JSON with a timeout and at most one retry. Returns parsed JSON or throws ProviderCallError whose detail
 * never contains the request headers.
 */
export async function callJson(f, url, { method = "POST", headers, body, timeoutMs = DEFAULT_TIMEOUT_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await f(url, { method, headers, body: body == null ? undefined : JSON.stringify(body), signal: ctrl.signal });
    } catch (err) {
      clearTimeout(timer);
      const e = new ProviderCallError(err.name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNREACHABLE", String(err.message ?? err).slice(0, 160), { retryable: true });
      if (attempt === 0) { await sleep(RETRY_DELAY_MS); continue; }
      throw e;
    }
    clearTimeout(timer);
    const text = await res.text();
    if (res.ok) {
      try {
        return JSON.parse(text);
      } catch {
        throw new ProviderCallError("PROVIDER_BAD_RESPONSE", "response was not JSON", { status: res.status });
      }
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt === 0) { await sleep(RETRY_DELAY_MS); continue; }
    const code = res.status === 401 || res.status === 403 ? "PROVIDER_AUTH_FAILED"
      : res.status === 402 || /credit|billing|quota|spend/i.test(text) ? "PROVIDER_OUT_OF_CREDIT"
        : res.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR";
    throw new ProviderCallError(code, `HTTP ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 200)}`, { status: res.status, retryable });
  }
}

/** Pull the first JSON object out of a model's text answer (fenced or bare). */
export function jsonFromText(text) {
  const raw = String(text ?? "");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1];
  const body = fenced ?? (raw.indexOf("{") >= 0 ? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1) : "");
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
