/**
 * ADAPTERS — one interface over Claude (Anthropic Messages API for hosted runs; the Claude Code CLI on the founder's
 * subscription only for local runs), ChatGPT (OpenAI Responses
 * API) and Grok (xAI Responses API with the x_search tool), plus the two non-model participants (the CEO's brief and
 * our own deterministic checks).
 *
 *   adapter = { provider, model, worstCase(request) → USD, run(request) → { artifact, usage: {usd, estimated, …}, citations? } }
 *
 * LIVE vs MOCK is decided by WHICH FACTORY built the adapter, never by its output: only createLiveAdapters() brands an
 * adapter live (a module-private WeakSet), and the task ledger records an output as LIVE only when the adapter is
 * branded AND every input it was built on is LIVE. A mock adapter's model id starts with "mock-", which the ledger
 * also refuses to record as LIVE.
 *
 * liveAvailable(provider, env) looks only at whether the configured variable NAMES are present in the environment
 * (`name in env`); it never reads a value. The live OpenAI / xAI adapters reuse providers/openai-api.mjs and
 * providers/xai-api.mjs unchanged. The live Claude adapter uses providers/anthropic-api.mjs when ANTHROPIC_API_KEY is
 * present (the hosted worker path); otherwise it falls back to providers/claude-code-cli.mjs (read-only tools) on a
 * machine with CLAUDE_CODE_OAUTH_TOKEN. A subscription token is never treated as an API credential.
 */
import { canonicalJson, digestOf, REPO_ROOT } from "../lib/util.mjs";
import { createOpenAIAdapter, openaiConfig } from "../providers/openai-api.mjs";
import { createXaiAdapter, xaiConfig } from "../providers/xai-api.mjs";
import { createAnthropicAdapter, anthropicConfig } from "../providers/anthropic-api.mjs";
import { startClaudeRun } from "../providers/claude-code-cli.mjs";
import { resolveClaudeBin, childEnv } from "../providers/claude-preflight.mjs";

/** Variable NAMES each provider needs for a live run. Values are never read by liveAvailable(). */
export const LIVE_ENV = Object.freeze({
  anthropic: Object.freeze(["ANTHROPIC_API_KEY"]),
  openai: Object.freeze(["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_PRICE_IN_PER_M", "OPENAI_PRICE_OUT_PER_M"]),
  xai: Object.freeze(["XAI_API_KEY"]),
});
/** A second way to satisfy a provider: Claude on the founder's subscription, local machine only. */
export const LIVE_ENV_LOCAL = Object.freeze({ anthropic: Object.freeze(["CLAUDE_CODE_OAUTH_TOKEN"]) });

/** @returns {{ provider: string, mode: "LIVE"|"MOCK", missing: string[] }} */
export function liveAvailable(provider, env = process.env) {
  const names = LIVE_ENV[provider];
  if (!names) return { provider, mode: "MOCK", missing: [`no live adapter for ${provider}`] };
  const missing = names.filter((n) => !(n in env));
  const local = LIVE_ENV_LOCAL[provider];
  if (missing.length && local && local.every((n) => n in env)) return { provider, mode: "LIVE", missing: [], via: "local-cli" };
  return { provider, mode: missing.length ? "MOCK" : "LIVE", missing, ...(missing.length ? {} : { via: "api" }) };
}

const LIVE = new WeakSet();
export const isLiveAdapter = (adapter) => LIVE.has(adapter);

// ───────────────────────────────────────────── MOCK ─────────────────────────────────────────────

const MOCK_NOTE = "MOCK OUTPUT — produced by a local stand-in; no provider was called and no work was done.";

/**
 * Deterministic stand-ins. `script` controls the review loop: reviewVerdicts[round-1] for each review round
 * (default: changes on round 1, approve on round 2) and failures[provider] = number of leading calls that throw a
 * retryable error (to exercise retries and the breaker).
 */
export function createMockAdapters(script = {}) {
  const verdicts = script.reviewVerdicts ?? ["changes", "approve"];
  const failures = { ...(script.failures ?? {}) };
  const calls = [];
  const mk = (provider, model, produce) => Object.freeze({
    provider, model, kind: "mock",
    worstCase: () => 0,
    async run(req) {
      calls.push({ provider, taskId: req.task.taskId, step: req.step.key });
      if (failures[provider] > 0) {
        failures[provider] -= 1;
        const e = new Error(`MOCK_PROVIDER_ERROR: scripted failure for ${provider}`);
        e.code = "PROVIDER_ERROR";
        e.retryable = true;
        throw e;
      }
      return { artifact: { mock: true, note: MOCK_NOTE, ...produce(req) }, usage: { usd: 0, estimated: false, tokensIn: 0, tokensOut: 0 }, citations: [] };
    },
  });
  const adapters = {
    founder: mk("founder", "mock-ceo-brief", (r) => ({ brief: r.objective, pipeline: r.pipeline })),
    anthropic: mk("anthropic", "mock-claude", (r) => ({
      summary: `[MOCK] ${r.step.kind === "fix" ? "remediation" : r.step.kind === "review" ? "verification" : "implementation"} for: ${r.objective}`,
      addressed: r.step.kind === "fix" ? (r.inputs.find((i) => i.artifact?.findings)?.artifact.findings ?? []).map((f) => f.id) : [],
      verdict: r.step.kind === "review" ? pick(verdicts, r.round) : undefined,
      findings: r.step.kind === "review" && pick(verdicts, r.round) === "changes" ? [{ id: `F${r.round}-1`, severity: "major", text: "[MOCK] scripted finding" }] : undefined,
      changes: r.step.kind === "review" ? undefined : [{ path: "(mock — no file was changed)", description: "[MOCK] placeholder change" }],
    })),
    openai: mk("openai", "mock-chatgpt", (r) => {
      const verdict = r.step.kind === "review" ? pick(verdicts, r.round) : undefined;
      return {
        verdict,
        findings: verdict === "changes" ? [{ id: `F${r.round}-1`, severity: "major", text: "[MOCK] scripted review finding: missing test for the failure path" }] : [],
        summary: `[MOCK] independent review round ${r.round ?? 1}`,
      };
    }),
    xai: mk("xai", "mock-grok", (r) => ({
      summary: `[MOCK] X research for: ${r.objective}`,
      findings: [{ claim: "[MOCK] placeholder finding", url: "https://example.invalid/mock-1" }],
    })),
    deterministic: mk("deterministic", "mock-deterministic", (r) => (r.step.kind === "gate" ? gateChecks(r) : { verdict: "pass", screens: [], summary: "[MOCK] visual QA — no screen was captured" })),
  };
  return { adapters, calls };
}

const pick = (list, round = 1) => list[Math.min(Math.max(1, round) - 1, list.length - 1)];

/**
 * The release gate's checks are real code in both modes; only its inputs differ. It never passes MOCK lineage as
 * releasable.
 */
export function gateChecks(req) {
  const st = req.state;
  const runTasks = st.taskOrder.map((id) => st.tasks[id]).filter((t) => t.runId === req.task.runId && t.taskId !== req.task.taskId);
  const checks = [
    { id: "all-prior-steps-finished", pass: runTasks.every((t) => ["DONE", "APPROVED"].includes(t.state)) },
    { id: "independent-review-approved", pass: st.verdicts.some((v) => runTasks.some((t) => t.taskId === v.reviewTaskId) && v.verdict === "approve") },
    { id: "no-open-blockers", pass: runTasks.every((t) => !t.blocker) },
    { id: "no-budget-refusals", pass: !st.refusals.some((r) => runTasks.some((t) => t.taskId === r.taskId)) },
    { id: "every-output-attributed", pass: runTasks.every((t) => t.outputs.every((o) => o.mode && o.provider && o.cost)) },
  ];
  const mockLineage = req.inputs.some((i) => i.mode !== "LIVE");
  const pass = checks.every((c) => c.pass);
  return { checks, pass, mockLineage, releasable: pass && !mockLineage, summary: mockLineage ? "checks evaluated on MOCK outputs — NOT releasable" : pass ? "all checks pass" : "checks failed" };
}

// ───────────────────────────────────────────── LIVE ─────────────────────────────────────────────

const REVIEW_SCHEMA = {
  type: "object", additionalProperties: false, required: ["verdict", "findings", "summary"],
  properties: {
    verdict: { type: "string", enum: ["approve", "changes"] },
    summary: { type: "string" },
    findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "severity", "text"], properties: { id: { type: "string" }, severity: { type: "string" }, text: { type: "string" } } } },
  },
};
const WORK_SCHEMA = {
  type: "object", additionalProperties: false, required: ["summary", "changes"],
  properties: {
    summary: { type: "string" },
    changes: { type: "array", items: { type: "object", additionalProperties: false, required: ["path", "description"], properties: { path: { type: "string" }, description: { type: "string" } } } },
  },
};
const RESEARCH_SCHEMA = {
  type: "object", additionalProperties: false, required: ["summary", "findings"],
  properties: { summary: { type: "string" }, findings: { type: "array", items: { type: "object", required: ["claim", "url"], properties: { claim: { type: "string" }, url: { type: "string" } } } } },
};
/**
 * Model tiers. A request names a tier (light | standard | strong); each provider maps it to a model from its own
 * environment, falling back to the standard model when a tier isn't configured. No model id or price is hardcoded
 * here: the founder sets them from the provider's current pricing page. Output tokens are capped per tier.
 */
export const TIERS = Object.freeze(["light", "standard", "strong"]);
export const TIER_MAX_OUTPUT = Object.freeze({ light: 2000, standard: 4000, strong: 8000 });
const tierOf = (req) => (TIERS.includes(req.tier) ? req.tier : "standard");
const outTokens = (req) => Math.min(Number(req.maxOutputTokens) || Infinity, TIER_MAX_OUTPUT[tierOf(req)]);
/** { model, price } for a tier from `<prefix>MODEL_<TIER>` and `<prefix>PRICE_IN/OUT_PER_M_<TIER>`, or null. */
function tierEnv(env, modelVar, inVar, outVar, tier) {
  if (tier === "standard") return null;
  const T = tier.toUpperCase();
  const model = env[`${modelVar}_${T}`];
  const i = Number(env[`${inVar}_${T}`]);
  const o = Number(env[`${outVar}_${T}`]);
  return model && i > 0 && o > 0 ? { model, price: { inPerM: i, outPerM: o } } : null;
}

/** A step may carry its own output schema (the handoff loop's completion reports and evaluations do). */
const schemaFor = (step) => step.schema ?? (step.kind === "review" ? REVIEW_SCHEMA : step.kind === "research" ? RESEARCH_SCHEMA : WORK_SCHEMA);
const promptOf = (req) => canonicalJson({ objective: req.objective, step: req.step.key, instructions: req.instructions, inputs: req.inputs.map((i) => ({ digest: i.digest, provider: i.provider, artifact: i.artifact })), ...(req.context ? { context: req.context } : {}) });

/**
 * Live adapters for every provider whose variables are present. Constructing one reads the credential VALUE only to
 * place it in the request header (inside providers/*-api.mjs); nothing here logs or records it. Providers without
 * their variables are simply absent from the result, with the missing names listed.
 */
export function createLiveAdapters({ env = process.env, fetch: f = globalThis.fetch, sleep, claudeTimeoutMs = 20 * 60_000, claudeMaxBudgetUsd = 1 } = {}) {
  const adapters = {};
  const missing = {};
  const brand = (a) => { LIVE.add(a); return Object.freeze(a); };

  const oa = liveAvailable("openai", env);
  if (oa.mode === "LIVE") {
    const cfg = openaiConfig(env);
    if (!cfg.price || !cfg.model) missing.openai = ["OPENAI_MODEL / OPENAI_PRICE_* are present but not usable numbers"];
    else {
      const apis = {};
      const apiFor = (req) => {
        const t = tierOf(req);
        const c = tierEnv(env, "OPENAI_MODEL", "OPENAI_PRICE_IN_PER_M", "OPENAI_PRICE_OUT_PER_M", t) ?? cfg;
        return (apis[t] ??= createOpenAIAdapter({ apiKey: env.OPENAI_API_KEY, model: c.model, price: c.price, fetch: f, sleep }));
      };
      adapters.openai = brand({
        provider: "openai", model: cfg.model, kind: "live",
        worstCase: (req) => apiFor(req).worstCase({ instructions: req.instructions, input: promptOf(req), maxOutputTokens: outTokens(req) }),
        run: async (req) => apiFor(req).generate({ instructions: req.instructions, input: promptOf(req), schema: schemaFor(req.step), schemaName: req.step.kind, maxOutputTokens: outTokens(req) }),
      });
    }
  } else missing.openai = oa.missing;

  const xa = liveAvailable("xai", env);
  if (xa.mode === "LIVE") {
    const cfg = xaiConfig(env);
    if (!cfg.price) missing.xai = [`no price known for ${cfg.model}`];
    else {
      const api = createXaiAdapter({ apiKey: env.XAI_API_KEY, model: cfg.model, price: cfg.price, fetch: f, sleep });
      adapters.xai = brand({
        provider: "xai", model: cfg.model, kind: "live",
        worstCase: (req) => api.worstCase({ instructions: req.instructions, input: promptOf(req), maxOutputTokens: outTokens(req) }),
        run: async (req) => api.research({ instructions: req.instructions, input: promptOf(req), maxOutputTokens: outTokens(req) }),
      });
    }
  } else missing.xai = xa.missing;

  const an = liveAvailable("anthropic", env);
  const bin = an.via === "local-cli" ? resolveClaudeBin(env) : null;
  if (an.via === "api") {
    const cfg = anthropicConfig(env);
    if (!cfg.price) missing.anthropic = [`no price known for ${cfg.model} (set GTP_CC_ANTHROPIC_PRICE_IN_PER_M / _OUT_PER_M)`];
    else {
      const apis = {};
      const apiFor = (req) => {
        const t = tierOf(req);
        const c = tierEnv(env, "GTP_CC_ANTHROPIC_MODEL", "GTP_CC_ANTHROPIC_PRICE_IN_PER_M", "GTP_CC_ANTHROPIC_PRICE_OUT_PER_M", t) ?? cfg;
        return (apis[t] ??= createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY, model: c.model, price: c.price, effort: cfg.effort, fetch: f }));
      };
      adapters.anthropic = brand({
        provider: "anthropic", model: cfg.model, kind: "live",
        worstCase: (req) => apiFor(req).worstCase({ instructions: req.instructions, input: promptOf(req), maxOutputTokens: outTokens(req) }),
        run: async (req) => apiFor(req).generate({ instructions: req.instructions, input: promptOf(req), schema: schemaFor(req.step), maxOutputTokens: outTokens(req) }),
      });
    }
  } else if (an.via === "local-cli" && bin) {
    adapters.anthropic = brand({
      provider: "anthropic", model: env.GTP_CC_CLAUDE_MODEL || "claude-code (subscription default)", kind: "live",
      // total_cost_usd from Claude Code is an API-equivalent ESTIMATE; on the subscription it is not a charge.
      worstCase: () => claudeMaxBudgetUsd,
      async run(req) {
        const run = startClaudeRun({
          bin, cwd: REPO_ROOT, env: childEnv(env, { allowOauthToken: true }), prompt: `${req.instructions}\n\n${promptOf(req)}`,
          schema: schemaFor(req.step), allowedTools: ["Read", "Grep", "Glob"], disallowedTools: ["Edit", "Write", "Bash", "WebFetch", "WebSearch"],
          tools: ["Read", "Grep", "Glob"], maxTurns: 20, maxBudgetUsd: claudeMaxBudgetUsd, timeoutMs: claudeTimeoutMs,
          model: env.GTP_CC_CLAUDE_MODEL || null,
        });
        const r = await run.done;
        if (!r.ok || !r.structured) {
          const e = new Error(`${r.endedBy ?? "CLAUDE_RUN_FAILED"}: ${r.endedDetail ?? r.subtype ?? "no structured output"}`);
          e.code = r.endedBy === "AUTH_FAILED" ? "PROVIDER_AUTH_FAILED" : "PROVIDER_ERROR";
          e.retryable = r.endedBy === "RUN_TIMEOUT";
          throw e;
        }
        return { artifact: r.structured, usage: { usd: r.estUsageUsd ?? claudeMaxBudgetUsd, estimated: true, tokensIn: r.usage?.inputTokens ?? null, tokensOut: r.usage?.outputTokens ?? null } };
      },
    });
  } else if (!missing.anthropic) missing.anthropic = an.mode === "LIVE" ? ["the claude executable was not found on PATH (or GTP_CC_CLAUDE_BIN)"] : an.missing;

  // The CEO's brief is the objective exactly as the caller typed it: real input, no model, no cost.
  adapters.founder = brand({
    provider: "founder", model: null, kind: "live",
    worstCase: () => 0,
    run: async (req) => ({ artifact: { brief: req.objective, pipeline: req.pipeline }, usage: { usd: 0, estimated: false } }),
  });
  // Our own code: the release gate is real in both modes. Visual QA has no live renderer wired here yet.
  adapters.deterministic = brand({
    provider: "deterministic", model: "gtp-cc-release-gate@1", kind: "live",
    worstCase: () => 0,
    async run(req) {
      if (req.step.kind !== "gate") {
        const e = new Error("NOT_WIRED: live visual QA is not connected to the orchestration core yet (see README)");
        e.code = "NOT_WIRED";
        throw e;
      }
      return { artifact: gateChecks(req), usage: { usd: 0, estimated: false } };
    },
  });
  return { adapters, missing };
}

/** sha256 of an artifact as the ledger records it. */
export const artifactDigest = (artifact) => digestOf(artifact);
