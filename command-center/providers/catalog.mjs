/**
 * PROVIDERS — one place that says, for Claude Code / Anthropic, ChatGPT / OpenAI and Grok / xAI, how each can take
 * part, whether it is connected right now, what it costs, and what the founder must do next. The console's
 * Providers panel and the orchestrator's seat resolution both read this, so the screen and the behaviour can't
 * disagree.
 *
 * Every contribution carries an EXECUTION label derived from its seat — never from what the output claims:
 *   REAL CONNECTED AGENT       the provider was called through a supported, authenticated integration
 *   MANUAL PROVIDER HANDOFF    the founder ran the prompt in the provider's own app and pasted the answer back
 *   SIMULATED AGENT OUTPUT     a deterministic stand-in (the `fake` seat) — never presented as a provider's work
 *   DETERMINISTIC AUTOMATION   our own code (gates, validators, renderers)
 *   UNAVAILABLE / NOT CONFIGURED
 *
 * Supported methods only: no consumer passwords, no browser-session scraping, no automation of a consumer app.
 */
import { openaiConfig, createOpenAIAdapter } from "./openai-api.mjs";
import { xaiConfig, createXaiAdapter, XAI_PRICES, X_SEARCH_USD_PER_POST } from "./xai-api.mjs";

export const EXECUTION = Object.freeze({
  REAL: "REAL CONNECTED AGENT",
  MANUAL: "MANUAL PROVIDER HANDOFF",
  SIMULATED: "SIMULATED AGENT OUTPUT",
  DETERMINISTIC: "DETERMINISTIC AUTOMATION",
  UNAVAILABLE: "UNAVAILABLE / NOT CONFIGURED",
});

/** The execution label for a seat. A `fake` seat is SIMULATED whatever its artifact says. */
export function executionOf(seat) {
  if (!seat) return EXECUTION.UNAVAILABLE;
  if (seat === "fake") return EXECUTION.SIMULATED;
  if (seat === "deterministic") return EXECUTION.DETERMINISTIC;
  if (seat.startsWith("manual:")) return EXECUTION.MANUAL;
  if (seat === "cli:claude-code" || seat.startsWith("api:") || seat.startsWith("mcp:")) return EXECUTION.REAL;
  return EXECUTION.UNAVAILABLE;
}

const PROVIDER_OF_SEAT = {
  "cli:claude-code": "anthropic", "manual:claude": "anthropic", "api:anthropic": "anthropic", "mcp:claude": "anthropic",
  "manual:chatgpt": "openai", "api:openai": "openai", "mcp:chatgpt": "openai",
  "manual:grok": "xai", "api:xai": "xai", "mcp:grok": "xai",
};
export const providerOfSeat = (seat) => PROVIDER_OF_SEAT[seat] ?? null;

const monthOf = (iso) => String(iso).slice(0, 7);

/** USD spent through a provider's metered API this calendar month (UTC), from the ledger. */
export function spentThisMonth(entries, provider, nowIso) {
  return entries
    .filter((e) => e.kind === "contribution" && providerOfSeat(e.data.seat) === provider && e.data.seat.startsWith("api:") && monthOf(e.at) === monthOf(nowIso))
    .reduce((s, e) => s + (e.data.cost?.usd ?? 0), 0);
}

const lastTest = (entries, integration) => entries.filter((e) => e.kind === "provider-test" && e.data.integration === integration).at(-1) ?? null;

/**
 * Build a ready API adapter for `api:openai` / `api:xai`, or say exactly why not.
 * @returns {{ ok: true, adapter, capUsd, spentUsd } | { ok: false, code: string, detail: string, founderAction: string }}
 */
export function apiSeat(seat, { env = {}, entries = [], now, fetch: f = globalThis.fetch, sleep, requireTest = true, forTest = false } = {}) {
  if (seat === "api:anthropic") {
    return { ok: false, code: "NEVER_SILENT_API", detail: "Claude runs on your subscription (Claude Code); the Anthropic API is not used", founderAction: "none" };
  }
  const provider = seat === "api:openai" ? "openai" : seat === "api:xai" ? "xai" : null;
  if (!provider) return { ok: false, code: "SEAT_NOT_ENABLED", detail: `${seat} has no API adapter`, founderAction: "none" };
  const cfg = provider === "openai" ? openaiConfig(env) : xaiConfig(env);
  const keyVar = provider === "openai" ? "OPENAI_API_KEY" : "XAI_API_KEY";
  const capVar = provider === "openai" ? "GTP_CC_OPENAI_MONTHLY_CAP_USD" : "GTP_CC_XAI_MONTHLY_CAP_USD";
  if (!cfg.hasKey) return { ok: false, code: "NOT_CONFIGURED", detail: `${keyVar} is not set`, founderAction: `add ${keyVar} (approved at checkpoint ${provider === "openai" ? "CP-O1" : "CP-X1"})` };
  if (provider === "openai" && (!cfg.model || !cfg.price)) return { ok: false, code: "NOT_CONFIGURED", detail: "OPENAI_MODEL and its OPENAI_PRICE_IN_PER_M / OPENAI_PRICE_OUT_PER_M are needed to enforce the cap", founderAction: "set the model and its prices from OpenAI's pricing page" };
  if (provider === "xai" && !cfg.price) return { ok: false, code: "NOT_CONFIGURED", detail: `no price known for ${cfg.model}`, founderAction: "set XAI_PRICE_IN_PER_M / XAI_PRICE_OUT_PER_M or use grok-4.3" };
  if (!forTest && !(cfg.capUsd > 0)) return { ok: false, code: "BUDGET_EXCEEDED", detail: `${capVar} is $0`, founderAction: `set ${capVar} to the monthly ceiling you approve` };
  const test = lastTest(entries, seat);
  if (requireTest && !test?.data?.ok) return { ok: false, code: "NOT_TESTED", detail: test ? `last connection test failed: ${test.data.detail}` : "no connection test has passed yet", founderAction: "run the connection test in Providers" };
  const spent = spentThisMonth(entries, provider, now);
  const adapter = provider === "openai"
    ? createOpenAIAdapter({ apiKey: env.OPENAI_API_KEY, model: cfg.model, price: cfg.price, fetch: f, sleep })
    : createXaiAdapter({ apiKey: env.XAI_API_KEY, model: cfg.model, price: cfg.price, fetch: f, sleep });
  return { ok: true, adapter, capUsd: cfg.capUsd, spentUsd: spent };
}

/**
 * The onboarding view: per provider, each integration path with status, mode, billing, limits, the founder's next
 * action, the last connection test and any error.
 * @param {{ env?: object, entries?: object[], now: string, hosted?: boolean }} o
 */
export function providerStatus({ env = {}, entries = [], now, hosted = false }) {
  const preflight = entries.filter((e) => e.kind === "preflight").at(-1)?.data ?? null;
  const billing = entries.filter((e) => e.kind === "attestation" && e.data.subject === "claude-billing").at(-1)?.data ?? null;
  const test = (id) => {
    const t = lastTest(entries, id);
    return t ? { at: t.at, ok: t.data.ok, detail: t.data.detail } : null;
  };
  const api = (seat) => {
    const r = apiSeat(seat, { env, entries, now, fetch: () => { throw new Error("status only"); } });
    if (r.ok) return { status: "CONNECTED", error: null, founderAction: null };
    if (r.code === "NOT_TESTED" && test(seat)) return { status: "ERROR", error: r.detail, founderAction: r.founderAction };
    return { status: r.code === "NOT_TESTED" ? "CONFIGURED" : "NOT CONFIGURED", error: null, founderAction: r.founderAction };
  };
  const oa = openaiConfig(env);
  const xa = xaiConfig(env);

  const claudeCli = hosted
    ? { status: "BLOCKED", founderAction: "CP-H2: add CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) to the private repo's Actions secrets" }
    : preflight?.ok && billing
      ? { status: "CONNECTED", founderAction: null }
      : { status: preflight && !preflight.ok ? "ERROR" : "CONFIGURED", error: preflight && !preflight.ok ? preflight.detail : null, founderAction: billing ? "run the preflight in Controls" : "confirm claude.ai usage credits are off (Controls), then run the preflight" };

  const list = [
    {
      id: "anthropic", name: "Claude Code · Anthropic", roles: ["Engineering", "Verifier support", "Feasibility reviews"],
      integrations: [
        {
          id: "cli:claude-code", label: hosted ? "Claude Code on the hosted worker (subscription token)" : "Claude Code CLI on this Mac (your Max subscription)",
          mode: "automatic", execution: EXECUTION.REAL, billing: "Max subscription allowance — no API billing; usage credits must stay OFF",
          limits: "per run: plan $1 est. / 10 turns, build $3 est. / 40 turns; $5 est. per command",
          capabilities: ["read-only plans and reviews", "implementation in an isolated working copy", "never pushes to the public repo"],
          ...claudeCli, error: claudeCli.error ?? null,
          lastTest: preflight ? { at: entries.filter((e) => e.kind === "preflight").at(-1).at, ok: preflight.ok, detail: preflight.ok ? `${preflight.evidence?.authMethod} · ${preflight.evidence?.subscriptionType}` : preflight.detail } : null,
        },
        { id: "manual:claude", label: "Claude app (copy / paste)", mode: "manual", execution: EXECUTION.MANUAL, billing: "your Claude plan", limits: "your plan's limits", capabilities: ["any text role"], status: "AVAILABLE", founderAction: null, error: null, lastTest: null },
        { id: "api:anthropic", label: "Anthropic API", mode: "—", execution: EXECUTION.UNAVAILABLE, billing: "metered API — deliberately not used", limits: "—", capabilities: [], status: "NOT USED", founderAction: null, error: null, lastTest: null },
      ],
    },
    {
      id: "openai", name: "ChatGPT · OpenAI", roles: ["Prompt Architect", "Product Strategist", "Content Strategist"],
      integrations: [
        { id: "manual:chatgpt", label: "Your ChatGPT app (copy / paste)", mode: "manual", execution: EXECUTION.MANUAL, billing: "your ChatGPT plan — no API billing", limits: "your plan's message limits", capabilities: ["every ChatGPT role"], status: "AVAILABLE", founderAction: null, error: null, lastTest: null },
        {
          id: "api:openai", label: `OpenAI API${oa.model ? ` (${oa.model})` : ""}`, mode: "automatic", execution: EXECUTION.REAL,
          billing: "OpenAI API platform, billed separately from ChatGPT Plus (prepaid credits)",
          limits: oa.capUsd > 0 ? `monthly cap $${oa.capUsd}; $${spentThisMonth(entries, "openai", now).toFixed(2)} spent this month` : "monthly cap $0 (locked)",
          capabilities: ["every ChatGPT role, unattended"], ...api("api:openai"), lastTest: test("api:openai"),
        },
        { id: "mcp:chatgpt", label: "ChatGPT app → Command Center connector (MCP)", mode: "founder-initiated, in the ChatGPT app", execution: EXECUTION.REAL, billing: "your ChatGPT plan", limits: "write actions on individual plans: UNVERIFIED", capabilities: ["read tasks and submit answers without copy / paste"], status: "BLOCKED", founderAction: "needs the hosted Command Center (H1) and its connector endpoint (H1.5)", error: null, lastTest: null },
      ],
    },
    {
      id: "xai", name: "Grok · xAI", roles: ["Social Intelligence (public X research)"],
      integrations: [
        { id: "manual:grok", label: "Grok in the X app or grok.com (copy / paste)", mode: "manual", execution: EXECUTION.MANUAL, billing: "free tier available with an X / Grok account; limits not published", limits: "free-tier limits (unpublished)", capabilities: ["X research with links, pasted back"], status: "AVAILABLE", founderAction: "sign in to Grok with your X account (no purchase needed)", error: null, lastTest: null },
        {
          id: "api:xai", label: `xAI API (${xa.model}, X Search)`, mode: "automatic", execution: EXECUTION.REAL,
          billing: `prepaid credits; ${xa.model} $${XAI_PRICES[xa.model]?.inPerM ?? "?"}/$${XAI_PRICES[xa.model]?.outPerM ?? "?"} per M tokens; X Search $${(X_SEARCH_USD_PER_POST * 1000).toFixed(0)} per 1,000 posts`,
          limits: xa.capUsd > 0 ? `monthly cap $${xa.capUsd}; $${spentThisMonth(entries, "xai", now).toFixed(2)} spent this month; requests rejected when prepaid credit runs out` : "monthly cap $0 (locked)",
          capabilities: ["unattended X research with citations"], ...api("api:xai"), lastTest: test("api:xai"),
        },
        { id: "mcp:grok", label: "Grok app → Command Center connector (MCP)", mode: "founder-initiated, in the Grok app", execution: EXECUTION.REAL, billing: "no API billing (custom connectors are available to all Grok users)", limits: "free-tier limits", capabilities: ["read research tasks and submit findings without copy / paste"], status: "BLOCKED", founderAction: "needs the hosted Command Center (H1) and its connector endpoint (H1.5)", error: null, lastTest: null },
      ],
    },
  ];
  // Only a usable path carries its execution label; anything else is UNAVAILABLE and says what it would become.
  for (const p of list) {
    for (const i of p.integrations) {
      if (!["CONNECTED", "AVAILABLE"].includes(i.status)) {
        i.whenConnected = i.execution;
        i.execution = EXECUTION.UNAVAILABLE;
      }
    }
  }
  return list;
}

/** Run a connection test for an API integration and return the ledger record (no credentials in it). */
export async function testProvider(seat, { env = {}, entries = [], now, fetch: f = globalThis.fetch, sleep } = {}) {
  const r = apiSeat(seat, { env, entries, now, fetch: f, sleep, requireTest: false, forTest: true });
  if (!r.ok) return { integration: seat, ok: false, detail: `${r.code}: ${r.detail}` };
  try {
    const t = await r.adapter.testConnection();
    return { integration: seat, ok: t.ok && t.modelAvailable !== false, detail: t.detail };
  } catch (err) {
    return { integration: seat, ok: false, detail: `${err.code ?? "ERROR"}: ${String(err.detail ?? err.message).slice(0, 200)}` };
  }
}
