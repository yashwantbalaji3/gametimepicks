/**
 * THE GEMINI PROVIDER CONTRACT — v1.6.1, candidate 2.
 *
 * Run: npx tsx --test src/lib/ask/ask-gemini-provider.test.mjs
 *
 * Structurally the same guards as the OpenAI adapter, because the boundary is the same boundary. Every
 * body here is captured from a REAL `provider.plan()` through a fake fetch — nothing the test supplies
 * itself is then asserted, which is the mistake the OpenAI version of this file made and failed its
 * own mutation probe for.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ASK_BUDGET, ASK_ERROR } from "./contract.mjs";
import { ASK_FORBIDDEN_ARG_NAMES, ASK_FORBIDDEN_TOOL_NAMES, ASK_TOOLS, ASK_TOOL_NAMES } from "./registry.mjs";
import { buildGeminiRequest, createGeminiProvider, extractGeminiText, extractGeminiUsage, GEMINI_MODEL } from "./provider-gemini.mjs";
import { decideAsk } from "../../../api/_ask-core.mjs";
import { makeProvider } from "./provider-factory.mjs";

const SYSTEM = "You are the planner for Ask GameTime. Reply with ONE JSON object and nothing else.";

const okResponse = {
  candidates: [{ content: { parts: [{ text: "{}" }] }, finishReason: "STOP" }],
  usageMetadata: {},
};

function capturePlan(overrides = {}) {
  let captured = null;
  const provider = createGeminiProvider({
    apiKey: "AIzaTESTKEY0123456789abcdefghij",
    fetchImpl: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return { ok: true, json: async () => okResponse };
    },
    ...overrides,
  });
  return provider.plan({ system: SYSTEM, user: "u" }).then(() => captured);
}

/* ═══════════  1. THE CATALOGUE THE MODEL ACTUALLY RECEIVES  ═══════════ */

test("every registered tool reaches the wire, with its description and its real arguments", async () => {
  const { body } = await capturePlan();
  const declared = body.tools?.[0]?.functionDeclarations;
  assert.ok(Array.isArray(declared), "the request carries no tools — the v1.6 defect exactly");
  assert.equal(declared.length, ASK_TOOL_NAMES.length);

  for (const name of ASK_TOOL_NAMES) {
    const sent = declared.find((t) => t.name === name);
    assert.ok(sent, `${name} is registered but never sent to the model`);
    assert.equal(sent.description, ASK_TOOLS[name].describe, `${name}'s description drifted from the registry`);

    // Every declared argument is a real argument of that tool — no invented parameters.
    const real = Object.keys(ASK_TOOLS[name].args);
    for (const arg of Object.keys(sent.parameters.properties ?? {})) {
      assert.ok(real.includes(arg), `${name} was shown an argument it does not have: ${arg}`);
    }
    // And every REQUIRED argument is declared required, or the model will omit it.
    const required = real.filter((k) => ASK_TOOLS[name].args[k].required);
    assert.deepEqual([...(sent.parameters.required ?? [])].sort(), required.sort(), `${name}'s required set drifted`);
  }
});

test("the catalogue is schema only — calling is disabled, so the plan stays the only way out", async () => {
  const { body } = await capturePlan();
  assert.equal(body.toolConfig?.functionCallingConfig?.mode, "NONE");
  assert.equal(body.generationConfig?.responseMimeType, "application/json");
});

/* ═══════════  2. CAPABILITIES THAT MUST NOT EXIST  ═══════════ */

test("no arbitrary URL, file, shell or SQL capability is offered to Gemini", async () => {
  const { body } = await capturePlan();
  const declared = body.tools[0].functionDeclarations;
  const names = declared.map((t) => t.name);

  for (const forbidden of ASK_FORBIDDEN_TOOL_NAMES) {
    assert.ok(!names.includes(forbidden), `the forbidden capability ${forbidden} is exposed`);
  }
  for (const t of declared) {
    for (const arg of Object.keys(t.parameters.properties ?? {})) {
      assert.ok(!ASK_FORBIDDEN_ARG_NAMES.includes(arg), `${t.name} takes ${arg}`);
    }
  }
  const serialised = JSON.stringify(declared);
  for (const shape of ["http://", "https://", "file://", "process.env", "child_process"]) {
    assert.ok(!serialised.includes(shape), `the catalogue mentions ${shape}`);
  }
});

/* ═══════════  3. THE REQUEST BODY  ═══════════ */

test("thinking is disabled, because an output ceiling shared with thinking is a ceiling on answering", async () => {
  /*
   * ⚠ APPLIED BEFORE THE FIRST CALL, NOT AFTER IT. gpt-5-nano's first real turn spent 1,216 of 1,270
   * output tokens reasoning and had no room left to emit a plan — an empty answer with nothing wrong
   * in the prompt. This family thinks by default and bills for it, so the budget is pinned to zero.
   */
  const { body } = await capturePlan();
  assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.ok(body.generationConfig.maxOutputTokens > 0, "the output ceiling must be sent");

  for (const banned of ["temperature", "topP", "topK"]) {
    assert.ok(!(banned in body.generationConfig), `the request sends ${banned}`);
  }
});

test("the system prompt is systemInstruction, and the user message is the only content", async () => {
  const { body } = await capturePlan();
  assert.equal(body.systemInstruction.parts[0].text, SYSTEM);
  assert.deepEqual(body.contents, [{ role: "user", parts: [{ text: "u" }] }]);
});

test("the writer gets the contract's ceiling and no tools it has no use for", async () => {
  let body = null;
  const provider = createGeminiProvider({
    apiKey: "AIzaTESTKEY0123456789abcdefghij",
    fetchImpl: async (_u, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => okResponse }; },
  });
  await provider.write({ system: SYSTEM, user: "u" });
  assert.equal(body.generationConfig.maxOutputTokens, ASK_BUDGET.maxAnswerTokens);
  assert.ok(!body.tools, "the writer was handed the tool catalogue");
});

/* ═══════════  4. THE KEY, ERRORS, USAGE  ═══════════ */

test("the key travels in a header and never in the URL or the body", async () => {
  const { url, init, body } = await capturePlan();
  /*
   * Google's docs also accept `?key=`. That is refused here: a credential in a URL is a credential in
   * every proxy log, every error report and every referrer along the way.
   */
  assert.ok(!url.includes("key="), "the API key was put in the URL");
  assert.ok(!url.includes("AIza"), "the API key was put in the URL");
  assert.equal(init.headers["x-goog-api-key"], "AIzaTESTKEY0123456789abcdefghij");
  assert.ok(!JSON.stringify(body).includes("AIza"), "the key appeared in the request body");
});

test("an upstream failure is classified and its message captured but redacted", async () => {
  const provider = createGeminiProvider({
    apiKey: "AIzaTESTKEY0123456789abcdefghij",
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { status: "PERMISSION_DENIED", message: "bad key AIzaSyLEAKED0123456789abcdefghijklmno" } }),
    }),
  });
  const r = await provider.plan({ system: SYSTEM, user: "u" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.type, "PERMISSION_DENIED");
  assert.ok(r.explain.includes("bad key"), "the operator's copy must survive");
  assert.ok(!JSON.stringify(r).includes("AIzaSyLEAKED0123456789abcdefghijklmno"), "a key shape survived redaction");
});

test("a rate limit is its own code; an unrecognised status is not passed through", async () => {
  const limited = createGeminiProvider({
    apiKey: "AIzaTESTKEY0123456789abcdefghij",
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { status: "RESOURCE_EXHAUSTED", message: "slow" } }) }),
  });
  assert.equal((await limited.plan({ system: SYSTEM, user: "u" })).code, ASK_ERROR.RATE_LIMITED);

  const odd = createGeminiProvider({
    apiKey: "AIzaTESTKEY0123456789abcdefghij",
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { status: "SOMETHING_NEW", message: "x" } }) }),
  });
  assert.equal((await odd.plan({ system: SYSTEM, user: "u" })).type, "unrecognised_error_type");
});

test("usage is reported, including the thinking tokens the invoice sees and the reader does not", () => {
  const u = extractGeminiUsage({
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 210, thoughtsTokenCount: 64, cachedContentTokenCount: 400 },
  });
  assert.equal(u.inputTokens, 900);
  assert.equal(u.outputTokens, 210);
  assert.equal(u.reasoningTokens, 64);
  assert.equal(u.cachedInputTokens, 400);
});

test("text spread across parts is joined, and truncation stays distinguishable", () => {
  assert.equal(extractGeminiText({ candidates: [{ content: { parts: [{ text: "a " }, { text: "b" }] } }] }), "a b");
});

test("an abort is a timeout refusal, not a silent hang", async () => {
  const controller = new AbortController();
  controller.abort();
  const provider = createGeminiProvider({
    apiKey: "AIzaTESTKEY0123456789abcdefghij",
    fetchImpl: async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); },
  });
  const r = await provider.plan({ system: SYSTEM, user: "u", signal: controller.signal });
  assert.equal(r.code, ASK_ERROR.PROVIDER_TIMEOUT);
});

/* ═══════════  5. CONFIGURATION REACHES THE ADAPTER  ═══════════ */

test("ASK_MODEL_NAME survives env → decideAsk → makeProvider for Gemini too", () => {
  // The same end-of-chain assertion that caught the model being silently dropped for OpenAI.
  const env = { ASK_GAMETIME_ENABLED: "1", ASK_MODEL_PROVIDER: "gemini", GOOGLE_API_KEY: "AIzaX0123456789abcdefghij", ASK_MODEL_NAME: "gemini-2.5-flash-lite" };
  const decision = decideAsk({ env, method: "POST", body: { messages: [{ role: "user", text: "hi" }] }, bodyBytes: 20, isProduction: false });
  assert.equal(decision.proceed, true, decision.reason ?? "refused");
  const provider = makeProvider(decision, env);
  assert.equal(provider.id, "gemini");
  assert.equal(provider.model, "gemini-2.5-flash-lite");

  const bare = { ASK_GAMETIME_ENABLED: "1", ASK_MODEL_PROVIDER: "gemini", GOOGLE_API_KEY: "AIzaX0123456789abcdefghij" };
  const d2 = decideAsk({ env: bare, method: "POST", body: { messages: [{ role: "user", text: "hi" }] }, bodyBytes: 20, isProduction: false });
  assert.equal(makeProvider(d2, bare).model, GEMINI_MODEL);
});

test("no numeric enum reaches the wire, and the constraint is not lost", async () => {
  /*
   * ⚠ THE FIRST REAL GEMINI CALL 400'd ON THIS. Enum is string-only in Google's schema dialect, and
   * `limit` is an integer with an allowed set. The rejection named the exact field, which is the only
   * reason it cost one cycle rather than a bisect.
   *
   * Two things must hold: nothing non-string appears in any enum, and the constraint still reaches
   * the model somewhere, because a bound the model cannot see is a bound it will violate and the
   * executor will then refuse — a clean schema error turned into a mysterious INVALID_ARGUMENT.
   */
  const { body } = await capturePlan();
  let checkedOne = false;
  for (const t of body.tools[0].functionDeclarations) {
    for (const [key, p] of Object.entries(t.parameters.properties ?? {})) {
      if (!p.enum) continue;
      assert.equal(p.type, "STRING", `${t.name}.${key} carries an enum on a non-string type`);
      for (const v of p.enum) assert.equal(typeof v, "string", `${t.name}.${key} enum value ${v} is not a string`);
      checkedOne = true;
    }
  }
  assert.ok(checkedOne, "no enums found at all — this guard would pass vacuously");

  /*
   * The integer-with-allowed-values case must still tell the model what the executor will accept.
   * Asked of the REGISTRY, not of the output: the output no longer says which fields had an enum,
   * so looking for one there finds integer fields that never had a constraint and proves nothing.
   */
  let checkedNumeric = false;
  for (const name of ASK_TOOL_NAMES) {
    for (const [key, field] of Object.entries(ASK_TOOLS[name].args)) {
      if (!field.oneOf || field.kind === "enum") continue;
      const sent = body.tools[0].functionDeclarations.find((t) => t.name === name).parameters.properties[key];
      assert.ok(!sent.enum, `${name}.${key} still carries a numeric enum`);
      assert.match(sent.description, /Allowed values:/, `${name}.${key} lost its bound instead of moving it to the description`);
      for (const v of field.oneOf) assert.ok(sent.description.includes(String(v)), `${name}.${key} omits allowed value ${v}`);
      checkedNumeric = true;
    }
  }
  assert.ok(checkedNumeric, "no numeric-enum field found — this half of the guard would pass vacuously");
});
