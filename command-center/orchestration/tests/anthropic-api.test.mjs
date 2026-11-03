/**
 * Anthropic API seat tests. Run: node --test command-center/orchestration/tests/
 * The no-network guard is loaded first. Every request goes to a stubbed fetch handed to the SDK, so these tests
 * exercise the real SDK request path (URL, headers, body, retries, error classes) without reaching Anthropic.
 */
import { NETWORK_ATTEMPTS } from "../../tests/no-network-preload.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFileStore } from "../../ledger/store.mjs";
import { stepClock } from "../../lib/util.mjs";
import { createTaskLedger } from "../task-ledger.mjs";
import { runPipeline, validatePipeline } from "../pipelines.mjs";
import { budgetConfig } from "../budgets.mjs";
import { createLiveAdapters, liveAvailable, isLiveAdapter } from "../adapters.mjs";
import { createAnthropicAdapter, anthropicConfig, closeObjects, FALLBACK_PRICE_CEILING } from "../../providers/anthropic-api.mjs";

const ORIGIN = "2026-11-03T12:00:00.000Z";
const KEY = "dummy-not-a-key-7f3a";
const PRICE = { inPerM: 4, outPerM: 20 };
const SCHEMA = { type: "object", properties: { summary: { type: "string" }, changes: { type: "array", items: { type: "object", properties: { path: { type: "string" } } } } }, required: ["summary"] };

const message = (over = {}) => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", stop_details: null,
  content: [{ type: "text", text: JSON.stringify({ summary: "ok", changes: [] }) }],
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  ...over,
});

/** A fetch that answers from a queue of [status, body] and records every request. */
function stubFetch(replies) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : null });
    const [status, body] = replies.length > 1 ? replies.shift() : replies[0];
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "retry-after-ms": "1" } });
  };
  return { fetch, calls };
}
const adapter = (fetch) => createAnthropicAdapter({ apiKey: KEY, model: "claude-opus-5-5", price: PRICE, fetch });
const codeOfAsync = async (p) => {
  try { await p; } catch (e) { return e; }
  return null;
};

test("generate sends a structured Messages request with the fallback beta and prices the reported usage", async () => {
  const s = stubFetch([[200, message()]]);
  const r = await adapter(s.fetch).generate({ instructions: "be brief", input: "task", schema: SCHEMA, maxOutputTokens: 16000 });
  assert.equal(s.calls.length, 1);
  const c = s.calls[0];
  assert.match(c.url, /^https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.equal(c.headers.get("x-api-key"), KEY);
  assert.match(c.headers.get("anthropic-beta"), /server-side-fallback-2026-07-01/);
  assert.equal(c.body.model, "claude-opus-5-5");
  assert.equal(c.body.max_tokens, 16000);
  assert.equal(c.body.system, "be brief");
  assert.equal(c.body.fallbacks, "default");
  assert.equal(c.body.output_config.effort, "high");
  assert.equal(c.body.output_config.format.type, "json_schema");
  assert.equal(c.body.output_config.format.schema.additionalProperties, false);
  assert.equal(c.body.output_config.format.schema.properties.changes.items.additionalProperties, false);
  assert.equal("temperature" in c.body, false);
  assert.deepEqual(r.artifact, { summary: "ok", changes: [] });
  assert.deepEqual(r.usage, { tokensIn: 100, tokensOut: 50, usd: 0.0014, estimated: false });
  assert.equal(r.fallbackRan, false);
});

test("a refusal, a truncated answer and non-JSON text are errors, never artifacts", async () => {
  const refused = await codeOfAsync(adapter(stubFetch([[200, message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, content: [] })]]).fetch)
    .generate({ instructions: "", input: "x", schema: SCHEMA, maxOutputTokens: 100 }));
  assert.equal(refused.code, "PROVIDER_REFUSED");
  const cut = await codeOfAsync(adapter(stubFetch([[200, message({ stop_reason: "max_tokens" })]]).fetch)
    .generate({ instructions: "", input: "x", schema: SCHEMA, maxOutputTokens: 100 }));
  assert.equal(cut.code, "PROVIDER_BAD_RESPONSE");
  const prose = await codeOfAsync(adapter(stubFetch([[200, message({ content: [{ type: "text", text: "not json" }] })]]).fetch)
    .generate({ instructions: "", input: "x", schema: SCHEMA, maxOutputTokens: 100 }));
  assert.equal(prose.code, "PROVIDER_BAD_RESPONSE");
});

test("errors map to the shared codes, never carry the key, and 4xx is not retried while 429 is retried once", async () => {
  const auth = stubFetch([[401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }]]);
  const e1 = await codeOfAsync(adapter(auth.fetch).generate({ instructions: "", input: "x", schema: SCHEMA, maxOutputTokens: 100 }));
  assert.equal(e1.code, "PROVIDER_AUTH_FAILED");
  assert.equal(auth.calls.length, 1, "401 is not retried");
  assert.equal(String(e1.message).includes(KEY), false);
  const limited = stubFetch([[429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }]]);
  const e2 = await codeOfAsync(adapter(limited.fetch).generate({ instructions: "", input: "x", schema: SCHEMA, maxOutputTokens: 100 }));
  assert.equal(e2.code, "PROVIDER_RATE_LIMITED");
  assert.equal(limited.calls.length, 2, "one retry, then stop");
  const credit = stubFetch([[400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low" } }]]);
  const e3 = await codeOfAsync(adapter(credit.fetch).generate({ instructions: "", input: "x", schema: SCHEMA, maxOutputTokens: 100 }));
  assert.equal(e3.code, "PROVIDER_OUT_OF_CREDIT");
});

test("a fallback run is priced at the ceiling and marked as an estimate; the worst case always uses the ceiling", async () => {
  const s = stubFetch([[200, message({ model: "claude-opus-4-8", usage: { input_tokens: 100, output_tokens: 50, iterations: [{ type: "message" }, { type: "fallback_message" }] } })]]);
  const a = adapter(s.fetch);
  const r = await a.generate({ instructions: "", input: "x", schema: SCHEMA, maxOutputTokens: 100 });
  assert.equal(r.fallbackRan, true);
  assert.deepEqual(r.usage, { tokensIn: 100, tokensOut: 50, usd: (100 * 5 + 50 * 25) / 1e6, estimated: true });
  const worst = a.worstCase({ instructions: "", input: "x".repeat(4000), maxOutputTokens: 16000 });
  assert.ok(worst >= (16000 * FALLBACK_PRICE_CEILING.outPerM) / 1e6, "output worst case at the $25/M ceiling");
});

test("testConnection reads the model without generating; an unknown model is reported, not thrown", async () => {
  const ok = stubFetch([[200, { type: "model", id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-10-01T00:00:00Z" }]]);
  assert.deepEqual(await adapter(ok.fetch).testConnection(), { ok: true, detail: "model claude-opus-5-5 visible", modelAvailable: true });
  assert.match(ok.calls[0].url, /\/v1\/models\/claude-opus-5-5/);
  const missing = stubFetch([[404, { type: "error", error: { type: "not_found_error", message: "model not found" } }]]);
  assert.equal((await adapter(missing.fetch).testConnection()).modelAvailable, false);
});

test("config: Opus 5.5 by default at list price, overrides by env, every cap $0 unless set", () => {
  assert.deepEqual(anthropicConfig({}), { hasKey: false, model: "claude-opus-5-5", price: { inPerM: 4, outPerM: 20 }, effort: "high", capUsd: 0 });
  const c = anthropicConfig({ ANTHROPIC_API_KEY: "k", GTP_CC_ANTHROPIC_MODEL: "claude-sonnet-5-5", GTP_CC_ANTHROPIC_EFFORT: "low", GTP_CC_ANTHROPIC_MONTHLY_CAP_USD: "10" });
  assert.deepEqual(c, { hasKey: true, model: "claude-sonnet-5-5", price: { inPerM: 2, outPerM: 10 }, effort: "low", capUsd: 10 });
  assert.equal(anthropicConfig({ GTP_CC_ANTHROPIC_MODEL: "unknown-model" }).price, null);
  assert.deepEqual(closeObjects({ type: "object", additionalProperties: true }), { type: "object", additionalProperties: true });
});

test("live wiring: an API key selects the hosted adapter; a subscription token alone stays the local CLI path; neither is MOCK", () => {
  assert.deepEqual(liveAvailable("anthropic", { ANTHROPIC_API_KEY: "x" }), { provider: "anthropic", mode: "LIVE", missing: [], via: "api" });
  assert.deepEqual(liveAvailable("anthropic", { CLAUDE_CODE_OAUTH_TOKEN: "x" }), { provider: "anthropic", mode: "LIVE", missing: [], via: "local-cli" });
  assert.deepEqual(liveAvailable("anthropic", {}), { provider: "anthropic", mode: "MOCK", missing: ["ANTHROPIC_API_KEY"] });
  const built = createLiveAdapters({ env: { ANTHROPIC_API_KEY: KEY, CLAUDE_CODE_OAUTH_TOKEN: "also-present" }, fetch: stubFetch([[200, message()]]).fetch });
  assert.equal(built.adapters.anthropic.model, "claude-opus-5-5", "the API key wins over the subscription token");
  assert.equal(isLiveAdapter(built.adapters.anthropic), true);
  assert.equal(built.missing.anthropic, undefined);
  const unpriced = createLiveAdapters({ env: { ANTHROPIC_API_KEY: KEY, GTP_CC_ANTHROPIC_MODEL: "unknown-model" } });
  assert.equal(unpriced.adapters.anthropic, undefined);
  assert.match(unpriced.missing.anthropic[0], /no price known/);
});

test("budget hard stop: with the default $0 caps the Claude API call is refused before any request", async () => {
  const s = stubFetch([[200, message()]]);
  const { adapters } = createLiveAdapters({ env: { ANTHROPIC_API_KEY: KEY }, fetch: s.fetch });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-anthropic-test-"));
  const clock = stepClock(ORIGIN);
  const ledger = createTaskLedger({ store: createFileStore({ dir, clock }), clock, ledgerId: "a" });
  const pipeline = validatePipeline({
    id: "tiny-claude", title: "tiny", parentProject: "test",
    steps: [
      { key: "ceo", kind: "brief", title: "CEO", agent: { provider: "founder", seat: "founder", role: "ceo" }, approvalLevel: "A" },
      { key: "draft", kind: "work", title: "Draft", agent: { provider: "anthropic", seat: "api:anthropic", role: "engineer" }, approvalLevel: "A", costBudgetUsd: 1 },
      { key: "approval", kind: "approval", title: "Founder approval", agent: { provider: "founder", seat: "founder", role: "ceo" }, approvalLevel: "C", decider: "founder" },
    ],
  });
  const run = await runPipeline({ ledger, pipeline, objective: "x", adapters, config: budgetConfig(), now: () => ORIGIN });
  assert.equal(run.status, "BLOCKED");
  assert.equal(s.calls.length, 0, "no provider request");
  const t = Object.values(ledger.state().tasks).find((x) => x.stepKey === "draft");
  assert.deepEqual([t.blocker.class, t.blocker.code], ["FOUNDER", "BUDGET_HARD_STOP"]);
});

test("nothing in this file reached the network", () => {
  assert.deepEqual(NETWORK_ATTEMPTS, []);
});
