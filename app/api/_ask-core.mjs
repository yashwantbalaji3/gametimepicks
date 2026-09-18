/**
 * ASK ENDPOINT — the decisions, without the network (the shape `_slip-read-core.mjs` established).
 *
 * Everything the handler must decide before it spends a token or opens a socket lives here, so every
 * refusal is driven by a unit test rather than by a deployment: feature off, provider absent, wrong
 * method, oversized body, malformed shape, rate limited. The handler does the fetching and nothing
 * else.
 *
 * FAIL-CLOSED, like the Live gateway and the slip reader. With the flag unset Ask answers 503 and
 * calls nothing; with no `ANTHROPIC_API_KEY` it answers 503 and calls nothing. Neither state degrades
 * into answering from the model's own knowledge, because in neither state is there a model.
 *
 * ASK DEPENDS ON ONE SECRET. It stores nothing, identifies nobody and has no database, so it requires
 * no Supabase project — the slip reader needs those because it reads a user's uploaded file, and
 * inheriting its requirements merely because the files are adjacent would be a dependency invented by
 * proximity.
 */
import { ASK_BUDGET, ASK_ERROR, ASK_RATE_LIMIT } from "../src/lib/ask/contract.mjs";
import { missingAskConfig, selectProvider } from "../src/lib/ask/provider.mjs";
import { normaliseContext, normaliseMessages, normalisePreferences } from "../src/lib/ask/conversation.mjs";

export { ASK_REQUIRED_ENV } from "../src/lib/ask/provider.mjs";

/**
 * THE KILL SWITCH (§25, §87, §88). Ask is OFF unless explicitly enabled.
 *
 * Default-off is the deliberate choice: the route can ship, the page can render, and the endpoint
 * answers a clean "temporarily unavailable" until someone turns it on. Rollout is therefore flag-off →
 * canary → flag-on, and switching it off is one environment variable rather than a deployment.
 */
export function askDisabled(env = process.env) {
  const v = env.ASK_GAMETIME_ENABLED;
  return v === undefined || v === "" || v === "0" || v === "false";
}

/**
 * A coarse per-instance rate limiter (§70, §26).
 *
 * DELIBERATELY NOT A NEW SERVICE. A Vercel function instance is not a global counter, so this bounds
 * one abusive client against one warm instance rather than promising a distributed guarantee — and it
 * is described that way in the docs instead of being sold as something it is not. A durable
 * distributed limiter needs Redis, which is a founder gate.
 *
 * Entries are evicted past their TTL so a long-lived instance cannot accumulate an unbounded map,
 * which is the way naive in-memory limiters become the outage they were meant to prevent.
 */
export function makeRateLimiter(limits = ASK_RATE_LIMIT, now = () => Date.now()) {
  const hits = new Map();

  return {
    check(clientKey) {
      const t = now();
      for (const [k, v] of hits) if (t - v.last > limits.entryTtlMs) hits.delete(k);

      const key = String(clientKey ?? "anonymous").slice(0, 120);
      const entry = hits.get(key) ?? { times: [], inFlight: 0, last: t };
      entry.times = entry.times.filter((x) => t - x < limits.windowMs);
      entry.last = t;

      if (entry.inFlight >= limits.maxConcurrentPerClient) {
        hits.set(key, entry);
        return { ok: false, code: ASK_ERROR.RATE_LIMITED, retryAfterSeconds: 5, reason: "concurrent" };
      }
      if (entry.times.length >= limits.maxTurnsPerWindow) {
        hits.set(key, entry);
        const oldest = entry.times[0];
        return { ok: false, code: ASK_ERROR.RATE_LIMITED, retryAfterSeconds: Math.max(1, Math.ceil((limits.windowMs - (t - oldest)) / 1000)), reason: "window" };
      }

      entry.times.push(t);
      entry.inFlight += 1;
      hits.set(key, entry);
      return { ok: true, release: () => { const e = hits.get(key); if (e) e.inFlight = Math.max(0, e.inFlight - 1); } };
    },
    get size() {
      return hits.size;
    },
  };
}

/**
 * Decide whether this request may proceed, and normalise it if it may.
 *
 * @param {{ env?: object, method?: string, body?: any, bodyBytes?: number, isProduction?: boolean }} input
 * @returns {{ status: number, proceed: boolean, reason: string, code?: string, request?: object, provider?: string }}
 */
export function decideAsk({ env = {}, method = "POST", body = null, bodyBytes = 0, isProduction } = {}) {
  if (method !== "POST") return refuse(405, ASK_ERROR.METHOD_NOT_ALLOWED, "POST only");

  if (askDisabled(env)) return refuse(503, ASK_ERROR.FEATURE_DISABLED, "Ask GameTime is not enabled");

  const provider = selectProvider(env, { isProduction });
  if (!provider.ok) {
    // Names only. `missingAskConfig` returns VARIABLE NAMES, never values, and the reason string is
    // built from those names so a 503 body can never carry a secret.
    const missing = missingAskConfig(env);
    return refuse(503, provider.code, missing.length ? `Ask GameTime is not configured (${missing.join(", ")})` : provider.detail);
  }

  if (bodyBytes > ASK_BUDGET.maxRequestBytes) return refuse(413, ASK_ERROR.REQUEST_TOO_LARGE, "that request is too large");
  if (!body || typeof body !== "object") return refuse(400, ASK_ERROR.MALFORMED_REQUEST, "a JSON body is required");

  const messages = normaliseMessages(body.messages);
  if (!messages.ok) return refuse(messages.code === ASK_ERROR.REQUEST_TOO_LARGE ? 413 : 400, messages.code, messages.detail);

  return {
    status: 200,
    proceed: true,
    reason: "ready",
    provider: provider.provider,
    request: {
      messages: messages.messages,
      // Client context is SHAPE-checked here and EXISTENCE-checked by the resolver downstream. An id
      // in a request body is a claim, and a crafted link must not make Ask discuss an entity the
      // product never published.
      context: normaliseContext(body.context),
      preferences: normalisePreferences(body.preferences),
      priorEntities: Array.isArray(body.entities)
        ? body.entities
          .filter((e) => e && typeof e.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(e.id))
          .slice(0, 6)
          .map((e) => ({ id: e.id, kind: String(e.kind ?? "").slice(0, 20), sport: String(e.sport ?? "").slice(0, 8) || null, label: String(e.label ?? "").slice(0, 80) || null }))
        : [],
    },
  };
}

const refuse = (status, code, reason) => ({ status, proceed: false, code, reason: reason ?? code });

/**
 * The operational log line (§75). Intent, tools, timings, token counts, error code.
 *
 * NEVER the question, never the answer, never the bankroll, never a key. A debugging log that carries
 * chat bodies is a privacy decision nobody made deliberately, so the default is that the content does
 * not appear and the SHAPE of the turn does.
 */
export function askAuditLine(decision, receipt = {}, extra = {}) {
  return JSON.stringify({
    ask: decision.proceed ? "answered" : "refused",
    status: decision.status,
    code: decision.code ?? null,
    provider: receipt.provider ?? decision.provider ?? null,
    model: receipt.model ?? null,
    promptVersion: receipt.promptVersion ?? null,
    registry: receipt.registry ?? null,
    intent: receipt.intent ?? null,
    tools: receipt.toolCalls ?? [],
    toolStatuses: receipt.toolStatuses ?? [],
    verifier: receipt.verifierStatus ?? null,
    plannerMs: receipt.plannerMs ?? null,
    toolsMs: receipt.toolsMs ?? null,
    writerMs: receipt.writerMs ?? null,
    totalMs: receipt.totalMs ?? null,
    inputTokens: receipt.inputTokens ?? null,
    outputTokens: receipt.outputTokens ?? null,
    reasoningTokens: receipt.reasoningTokens ?? null,
    errorCode: receipt.errorCode ?? null,
    ...extra,
  });
}

/**
 * A coarse client key for the limiter. Not identity, not stored, never logged with the turn.
 *
 * The forwarded address is the only signal a stateless function has. It is hashed rather than kept so
 * that nothing resembling a personal identifier survives in memory even for the TTL — the limiter
 * needs to tell clients apart, which does not require knowing who they are (§74).
 */
export function clientKeyFrom(headers = {}) {
  const raw = String(headers["x-forwarded-for"] ?? headers["x-real-ip"] ?? "").split(",")[0].trim() || "anonymous";
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/**
 * WHAT A REFUSAL MAY SAY, AND TO WHOM.
 *
 * The upstream message is captured on every call, because the environment that actually fails is
 * production and a message that was never read there is no use to anyone. Disclosure is a separate
 * decision from capture, and it lives HERE — pure and tested — rather than in the network file,
 * because "does a stranger see this" is exactly the kind of decision that should not be reachable
 * only through a live HTTP request.
 *
 * Production gets the code, the reason, the numeric status and the provider's error TYPE (a closed
 * enum). It does not get the message, the refusal detail, or the thrown error's name. Preview and
 * local get everything, because there is an operator behind them.
 */
export function refusalPayload(result = {}, { isProduction = true, reason = null } = {}) {
  const payload = { ok: false, code: result.code, reason };
  if (result.providerStatus) payload.providerStatus = result.providerStatus;
  if (result.providerType) payload.providerType = result.providerType;
  if (isProduction) return payload;
  if (result.providerExplain) payload.providerExplain = result.providerExplain;
  if (result.detail) payload.detail = result.detail;
  if (result.providerErrorName) payload.providerErrorName = result.providerErrorName;
  return payload;
}
