/**
 * THE OPENAI PROVIDER CONTRACT — v1.6.1.
 *
 * Run: npx tsx --test src/lib/ask/ask-openai-provider.test.mjs
 *
 * Nothing here touches the network. The adapter's request body is built by a pure exported function
 * precisely so that the one thing that cannot be proven without a key — the exact bytes sent — can at
 * least be proven as a value offline.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ASK_BUDGET, ASK_ERROR } from "./contract.mjs";
import { ASK_FORBIDDEN_ARG_NAMES, ASK_FORBIDDEN_TOOL_NAMES, ASK_TOOLS, ASK_TOOL_NAMES, openAiToolList } from "./registry.mjs";
import { toProviderSchema } from "./schema.mjs";
import { plannerSystemPrompt } from "./planner.mjs";
import { writerSystemPrompt } from "./writer.mjs";
import { buildOpenAiRequest, createOpenAiProvider, extractOutputText, extractUsage } from "./provider-openai.mjs";

/*
 * A REALISTIC SYSTEM PROMPT, because a fixture that says "s" cannot exercise JSON mode's precondition.
 * Ask's real planner and writer prompts both end with this instruction; the fixture mirrors it so the
 * tests fail for the reasons the production path would.
 */
const SYSTEM = "You are the planner for Ask GameTime. Reply with ONE JSON object and nothing else.";

/* ═════════════  1. THE CATALOGUE THE MODEL ACTUALLY RECEIVES  ═════════════ */

/**
 * ⚠ THIS IS THE v1.6 DEFECT, WRITTEN AS A TEST.
 *
 * In v1.6 `providerToolList()` was implemented, exported, unit-tested — and never called. The prompt
 * told the model "never plan a call to a tool that is not in your tool list" and no list was ever
 * sent. The model invented tool names on six of twenty canary cases. Every one was refused by the
 * executor, so the boundary held perfectly while the product answered a third of its questions with a
 * refusal: a correctness failure wearing a safety success as a disguise.
 *
 * A test that only checks `openAiToolList()` would have passed in v1.6 too. So this asserts the
 * REQUEST BODY — the bytes that leave the process.
 */
/**
 * ⚠⚠ THE FIRST VERSION OF THIS TEST FAILED ITS OWN MUTATION PROBE.
 *
 * It called `buildOpenAiRequest({ ..., tools: openAiToolList() })` — handing the catalogue in itself,
 * then asserting the catalogue was there. Deleting `tools:` from the planner's actual call left it
 * green. That is v1.6's defect committed a second time, inside the test written to prevent it: the
 * mechanism was asserted, its USE was not.
 *
 * So the body is captured from a real `provider.plan()` through a fake fetch. Nothing is passed in;
 * whatever the planner sends is what gets inspected.
 */
function capturePlanBody() {
  let body = null;
  const provider = createOpenAiProvider({
    apiKey: "sk-test",
    model: "gpt-5-nano",
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ status: "completed", output_text: "{}", usage: {} }) };
    },
  });
  return provider.plan({ system: SYSTEM, user: "u" }).then(() => body);
}

test("every registered tool reaches the wire, with its description and its real argument schema", async () => {
  const body = await capturePlanBody();

  assert.ok(Array.isArray(body.tools), "the request carries no tools at all — the v1.6 defect exactly");
  assert.equal(body.tools.length, ASK_TOOL_NAMES.length, "the wire catalogue and the registry disagree on size");

  for (const name of ASK_TOOL_NAMES) {
    const sent = body.tools.find((t) => t.name === name);
    assert.ok(sent, `${name} is registered but never sent to the model`);
    assert.equal(sent.type, "function");

    const describe = ASK_TOOLS[name].describe;
    assert.ok(describe && describe.length > 20, `${name} has no usable description in the registry`);
    assert.equal(sent.description, describe, `${name}'s description drifted from the registry`);

    // The argument shape the model is shown must be the shape the executor enforces — same generator.
    assert.deepEqual(sent.parameters, toProviderSchema(ASK_TOOLS[name].args), `${name}'s argument schema drifted`);
    assert.equal(sent.parameters.additionalProperties, false, `${name} accepts unknown arguments`);
  }
});

test("the catalogue is exposed as schema but may not be called — the plan is the only way out", async () => {
  const body = await capturePlanBody();
  /*
   * Ask's planner emits a PLAN — a small DAG with dependency ordering that vendor function calling
   * cannot express. The schemas are sent so the model sees exactly which arguments are acceptable;
   * calling is disabled so it cannot answer in a shape the engine does not read.
   */
  assert.equal(body.tool_choice, "none");
  assert.deepEqual(body.text, { format: { type: "json_object" } }, "the planner must be held to JSON");
});

/* ═════════════  2. CAPABILITIES THAT MUST NOT EXIST  ═════════════ */

test("no arbitrary URL, file, shell or SQL capability is offered to OpenAI", async () => {
  const body = await capturePlanBody();
  const names = body.tools.map((t) => t.name);

  for (const forbidden of ASK_FORBIDDEN_TOOL_NAMES) {
    assert.ok(!names.includes(forbidden), `the forbidden capability ${forbidden} is exposed`);
  }

  for (const t of body.tools) {
    for (const arg of Object.keys(t.parameters.properties ?? {})) {
      assert.ok(
        !ASK_FORBIDDEN_ARG_NAMES.includes(arg),
        `${t.name} takes ${arg}, which turns a bounded tool into an unbounded one`,
      );
    }
  }

  // Nothing in the whole serialised catalogue should read like a network or filesystem escape hatch.
  const serialised = JSON.stringify(body.tools);
  for (const shape of ["http://", "https://", "file://", "process.env", "child_process"]) {
    assert.ok(!serialised.includes(shape), `the catalogue mentions ${shape}`);
  }
});

/* ═════════════  3. THE REQUEST BODY ITSELF  ═════════════ */

test("the request sends no sampling knob this model family rejects", async () => {
  const body = await capturePlanBody();
  /*
   * ⚠ v1.6 SPENT A DEPLOY CYCLE ON EXACTLY THIS. `temperature` is deprecated for claude-sonnet-5 and
   * 400'd every single call; the GPT-5 family rejects it for the same reason — they are reasoning
   * models. What holds Ask's output steady was never a sampling knob: it is a closed registry, an
   * executor that re-validates, evidence sentences instead of rows, and a numeric verifier.
   */
  for (const banned of ["temperature", "top_p", "top_k", "frequency_penalty", "presence_penalty"]) {
    assert.ok(!(banned in body), `the request sends ${banned}, which this model family rejects`);
  }
  assert.ok(body.max_output_tokens > 0, "the output ceiling must be sent, or a long answer truncates silently");
  assert.ok(body.input.some((m) => m.role === "system"), "the system prompt must travel in input, not instructions");
  assert.ok(body.input.some((m) => m.role === "user"), "the user message must be present");
});

test("JSON mode's own precondition is asserted before the request is sent", async () => {
  /*
   * ⚠ THIS COST THE FIRST REAL CALL. OpenAI refuses `text.format: json_object` unless the word "json"
   * appears in the INPUT MESSAGES. Ask's prompts say "Reply with ONE JSON object and nothing else",
   * but it sat in `instructions`, which does not count — so every call 400'd with a message that named
   * the cause precisely, and would have named nothing at all without the capture/disclosure split.
   *
   * The fix leaves a dependency on prompt wording. This turns that into an invariant: a prompt edit
   * that drops the word fails here, offline, instead of taking the whole feature down in preview.
   */
  const body = await capturePlanBody();
  assert.match(JSON.stringify(body.input).toLowerCase(), /json/, "JSON mode cannot succeed without it");

  assert.throws(
    () => buildOpenAiRequest({ model: "m", system: "no instruction here", user: "hello", maxTokens: 10 }),
    /requires the word 'json'/,
    "a request that cannot succeed must not be sent",
  );
  // With json off there is no such precondition, and none is imposed.
  assert.doesNotThrow(() => buildOpenAiRequest({ model: "m", system: "plain", user: "hello", maxTokens: 10, json: false }));
});

test("the REAL planner and writer prompts satisfy JSON mode — not just the fixture", () => {
  /*
   * The test above proves the guard works. This proves the guard is SATISFIED by the prompts actually
   * shipped, which is the property that decides whether Ask answers at all. Testing the fixture alone
   * would be the same error as v1.6's catalogue: asserting the mechanism rather than its use.
   */
  for (const [name, prompt] of [["planner", plannerSystemPrompt()], ["writer", writerSystemPrompt()]]) {
    assert.doesNotThrow(
      () => buildOpenAiRequest({ model: "gpt-5-nano", system: prompt, user: "anything", maxTokens: 10 }),
      `the ${name} prompt no longer contains the word JSON, so every OpenAI call would 400`,
    );
  }
});

test("the writer is given the contract's answer ceiling, not a vendor default", async () => {
  let seen = null;
  const provider = createOpenAiProvider({
    apiKey: "sk-test", model: "gpt-5-nano",
    fetchImpl: async (_url, init) => {
      seen = JSON.parse(init.body);
      return { ok: true, json: async () => ({ status: "completed", output_text: "{}", usage: {} }) };
    },
  });
  await provider.write({ system: SYSTEM, user: "u" });
  assert.equal(seen.max_output_tokens, ASK_BUDGET.maxAnswerTokens);
  // The writer chooses no tools, so it is sent none: a stage cannot use a capability it never receives.
  assert.ok(!seen.tools, "the writer was handed the tool catalogue it has no use for");
});

/* ═════════════  4. ERRORS, USAGE, ABORT  ═════════════ */

test("an upstream failure is classified, and its message is captured but redacted", async () => {
  const provider = createOpenAiProvider({
    apiKey: "sk-test",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { type: "authentication_error", message: "bad key sk-proj-AAAA_BBBB-12345678901234" } }),
    }),
  });
  const r = await provider.plan({ system: SYSTEM, user: "u" });

  assert.equal(r.ok, false);
  assert.equal(r.code, ASK_ERROR.PROVIDER_ERROR);
  assert.equal(r.status, 401);
  assert.equal(r.type, "authentication_error");
  assert.ok(r.explain.includes("bad key"), "the operator's copy of the message must survive");
  assert.ok(!JSON.stringify(r).includes("sk-proj-AAAA_BBBB-12345678901234"), "a key shape survived redaction");
});

test("a rate limit is its own code, and an unrecognised error type is not passed through", async () => {
  const limited = createOpenAiProvider({
    apiKey: "sk-test",
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { type: "rate_limit_error", message: "slow down" } }) }),
  });
  assert.equal((await limited.plan({ system: SYSTEM, user: "u" })).code, ASK_ERROR.RATE_LIMITED);

  const odd = createOpenAiProvider({
    apiKey: "sk-test",
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { type: "something_new_from_the_vendor", message: "x" } }) }),
  });
  assert.equal((await odd.plan({ system: SYSTEM, user: "u" })).type, "unrecognised_error_type");
});

test("usage is reported, including the reasoning tokens a reader never sees but the invoice does", () => {
  const usage = extractUsage({
    usage: {
      input_tokens: 1200,
      output_tokens: 340,
      output_tokens_details: { reasoning_tokens: 256 },
      input_tokens_details: { cached_tokens: 800 },
    },
  });
  assert.equal(usage.inputTokens, 1200);
  assert.equal(usage.outputTokens, 340);
  /*
   * On a reasoning model most billed output can be reasoning the reader never sees. A cost receipt
   * that reported only visible text would understate the invoice, and a migration justified on cost
   * cannot be measured with a number that is quietly wrong.
   */
  assert.equal(usage.reasoningTokens, 256);
  assert.equal(usage.cachedInputTokens, 800);
});

test("truncation is distinguishable from the model simply not writing JSON", () => {
  const provider = extractOutputText({ output: [{ content: [{ text: "part one " }, { text: "part two" }] }] });
  assert.equal(provider, "part one part two", "text spread across content parts must be joined");

  // The engine reads stopReason to tell "cut off mid-JSON" from "wrote prose": opposite fixes.
  assert.equal(extractOutputText({ output_text: "  hello  " }), "hello");
});

test("an abort before the call is a timeout refusal, not a silent hang", async () => {
  const controller = new AbortController();
  controller.abort();
  const provider = createOpenAiProvider({
    apiKey: "sk-test",
    fetchImpl: async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); },
  });
  const r = await provider.plan({ system: SYSTEM, user: "u", signal: controller.signal });
  assert.equal(r.ok, false);
  assert.equal(r.code, ASK_ERROR.PROVIDER_TIMEOUT);
});

test("a transient upstream condition is retried exactly once; a deterministic one is not", async () => {
  let calls = 0;
  const flaky = createOpenAiProvider({
    apiKey: "sk-test",
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503, json: async () => ({ error: { type: "server_error", message: "x" } }) };
      return { ok: true, json: async () => ({ status: "completed", output_text: "{}", usage: {} }) };
    },
  });
  assert.equal((await flaky.plan({ system: SYSTEM, user: "u" })).ok, true);
  assert.equal(calls, 2, "a 503 must be retried once");

  let hard = 0;
  const deterministic = createOpenAiProvider({
    apiKey: "sk-test",
    fetchImpl: async () => {
      hard += 1;
      return { ok: false, status: 400, json: async () => ({ error: { type: "invalid_request_error", message: "bad field" } }) };
    },
  });
  await deterministic.plan({ system: SYSTEM, user: "u" });
  assert.equal(hard, 1, "a 400 is deterministic — retrying it doubles the bill to learn nothing");
});

test("the API key travels in a header and never in the body", async () => {
  let init = null;
  const provider = createOpenAiProvider({
    apiKey: "sk-proj-SECRET_VALUE-0123456789",
    fetchImpl: async (_url, i) => {
      init = i;
      return { ok: true, json: async () => ({ status: "completed", output_text: "{}", usage: {} }) };
    },
  });
  await provider.plan({ system: SYSTEM, user: "u" });
  assert.match(init.headers.authorization, /^Bearer sk-proj-SECRET_VALUE-0123456789$/);
  assert.ok(!init.body.includes("SECRET_VALUE"), "the key appeared in the request body");
});
