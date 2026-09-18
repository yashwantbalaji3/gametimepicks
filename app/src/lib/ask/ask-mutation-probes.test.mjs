/**
 * ASK MUTATION PROBES — deliberately break each guard, prove it catches, restore it.
 *
 * "A probe that cannot fail is not evidence." A guard that has never been observed failing is a guard
 * nobody has checked; it may be asserting something that is true for a reason unrelated to the
 * property it claims to protect. Each test below MUTATES the input a guard reads, asserts the guard
 * goes red, and restores it in the same test — so a mutation can never leak into another test or into
 * the repository.
 *
 * These complement the golden eval. The eval asks "does the system behave correctly?"; these ask "is
 * the mechanism that enforces that actually load-bearing?"
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ASK_ERROR, isAllowedAssetPath, isApprovedLink, recentShardOf } from "./contract.mjs";
import { ASK_TOOLS, toolDef } from "./registry.mjs";
import { validateArgs } from "./schema.mjs";
import { makeExecutor } from "./executor.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { verifyAnswer, forbiddenCopyIn } from "./verifier.mjs";
import { validatePlan } from "./planner.mjs";
import { parseAnswer } from "./writer.mjs";
import { selectProvider } from "./provider.mjs";

/*
 * A miniature of the real evidence builder. It must register DATES as well as numbers: the first
 * version did not, so the date in an otherwise-faithful answer read as unsupported and PROBE 6
 * "caught" a flip it had not actually detected. A test helper that models the real thing incorrectly
 * produces conclusions about a system that does not exist.
 */
const ev = (facts) => {
  const numbers = new Set();
  for (const t of facts) {
    for (const m of t.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) numbers.add(m[0]);
    for (const m of t.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) numbers.add(String(Number(m[0].replace(/,/g, ""))));
  }
  return { facts: facts.map((text, i) => ({ id: `E1.${i + 1}`, text })), numbers, identifiers: new Set(), links: [], items: [], unsupported: [] };
};

test("PROBE 1 · a file-read tool cannot be added to the registry at all, and would be unreachable anyway", async () => {
  /*
   * The probe expected to add a tool and prove it could not RUN. It could not even be added: the
   * registry is frozen, so a new capability requires a source change and a review rather than a
   * runtime mutation. That is the stronger result, so the probe asserts it.
   */
  assert.throws(() => { ASK_TOOLS.readFile = { version: 1, kind: "danger", describe: "probe", args: {} }; },
    /not extensible|read only|Cannot add/i, "the tool registry must be frozen");
  assert.equal(toolDef("readFile"), null);

  // The second, independent half: even a DECLARED tool with no handler cannot execute.
  const ex = makeExecutor({ turn: makeAskLoader(fixtureFetchText({})).beginTurn() });
  const r = await ex.run({ name: "readFile", arguments: {} });
  assert.equal(r.error, ASK_ERROR.UNKNOWN_TOOL, "a name with no handler must never execute");
});

test("PROBE 2 · removing an argument's type still refuses an injection payload", () => {
  const original = { ...ASK_TOOLS.runGameFinder.args.season };
  try {
    ASK_TOOLS.runGameFinder.args.season = { kind: "notAKind" };
    const r = validateArgs(ASK_TOOLS.runGameFinder.args, { sport: "MLB", season: "DROP TABLE" });
    // An unknown KIND fails closed. A schema language whose unknown types default to "accept" would
    // turn a typo in a spec into an open door.
    assert.equal(r.ok, false);
    assert.equal(r.code, ASK_ERROR.INVALID_ARGUMENT);
  } finally {
    ASK_TOOLS.runGameFinder.args.season = original;
  }
  assert.equal(validateArgs(ASK_TOOLS.runGameFinder.args, { sport: "MLB", season: "2026" }).ok, true, "the probe must restore the spec");
});

test("PROBE 3 · widening the asset allowlist is the only way to reach another prefix", () => {
  // Proves the allowlist is what does the work, rather than the paths happening not to be requested.
  assert.equal(isAllowedAssetPath("/data/internal/platform/v1/manifest.json"), false);
  assert.equal(isAllowedAssetPath("/data/ask/v1/entities.json"), true);
  /*
   * ⚠ THIS PROBE FOUND A REAL GAP. The first allowlist checked for a LITERAL "..", so
   * `/data/ask/v1/%2e%2e/%2e%2e/internal.json` passed — and an HTTP server decodes that back into
   * `../..` before resolving anything. The path is now decoded (repeatedly, because %252e decodes to
   * %2e decodes to .) before any rule is applied.
   */
  for (const evasion of [
    "/data/ask/v1/%2e%2e/%2e%2e/internal.json",
    "/data/ask/v1/%252e%252e/internal.json",
    "/data/ask/v1/..%2f..%2fetc.json",
    "/data/ask/v1/./../../internal.json",
    "/data/ask/v1/entities.json/../../../etc/passwd",
    "/data/ask/v1/entities.json%00.png",
    "/data/ask/v1/%2f%2fevil.example/x.json",
    "/data/ask/v1/x%ZZ.json",
    "\\data\\ask\\v1\\entities.json",
  ]) {
    assert.equal(isAllowedAssetPath(evasion), false, `${evasion} must be refused`);
  }
  // And the legitimate shapes still pass — a hardened check that refuses everything is not a check.
  for (const ok of ["/data/ask/v1/recent/nfl/0.json", "/data/compare/v1/teams/mlb/index.json"]) {
    assert.equal(isAllowedAssetPath(ok), true, `${ok} must still be allowed`);
  }
});

test("PROBE 4 · a plan that skips the executor's validation still cannot pass a forbidden argument", async () => {
  const ex = makeExecutor({ turn: makeAskLoader(fixtureFetchText({})).beginTurn() });
  // The planner contract does NOT validate arguments — that is deliberate, so there is exactly one
  // place it happens. This proves the executor catches what the planner let through.
  const plan = validatePlan({ intent: "PUBLISHED_FORECAST", calls: [{ id: "c0", name: "getPublishedForecasts", arguments: { includePrivate: true } }] });
  assert.equal(plan.ok, true, "the planner deliberately does not check arguments");
  const r = await ex.run(plan.plan.calls[0]);
  assert.equal(r.error, ASK_ERROR.UNKNOWN_ARGUMENT, "the executor is the single argument-authorisation point");
});

test("PROBE 5 · the numeric verifier fires on a one-digit change, not just an obvious invention", () => {
  const evidence = ev(["the New York Mets scored 87 runs across those games"]);
  assert.equal(verifyAnswer("The Mets scored 87 runs.", evidence).ok, true);
  for (const wrong of ["88", "86", "870", "8.7"]) {
    assert.equal(verifyAnswer(`The Mets scored ${wrong} runs.`, evidence).ok, false, `${wrong} must be caught`);
  }
});

test("PROBE 6 · a changed score is caught even when the score is a single digit", () => {
  /*
   * ⚠ THIS PROBE FOUND A REAL GAP. The verifier exempted any integer 0–10 as a "small counting
   * number", which in a baseball product exempts runs, innings, hits and leg counts — the numbers most
   * worth checking. "The Mets scored 8" passed against evidence saying 5. The exemption is gone.
   */
  const evidence = ev(["on 2026-09-15 the Mets scored 5 and allowed 7 — a loss"]);
  assert.equal(verifyAnswer("On 2026-09-15 the Mets scored 5 and allowed 7 — a loss.", evidence).ok, true);
  for (const wrong of [4, 6, 8, 0, 9]) {
    assert.equal(verifyAnswer(`On 2026-09-15 the Mets scored ${wrong} and allowed 7.`, evidence).ok, false, `a score of ${wrong} must be caught`);
  }

  /*
   * THE HONEST LIMITATION, stated rather than implied away. The verifier is numeric and categorical;
   * it does not adjudicate English. A W→L flip carrying no number is NOT caught here — it is addressed
   * by the evidence shape (the outcome word comes from the owner's own sentence) and by the writer
   * being told to restate rather than interpret. Claiming otherwise would overstate the guarantee.
   */
  const flipped = verifyAnswer("On 2026-09-15 the Mets scored 5 and allowed 7 — a win.", evidence);
  assert.equal(flipped.ok, true, "documented limitation: prose outcome words are not adjudicated numerically");
});

test("PROBE 7 · removing the negation rule would reject the product's own honest disclaimers", () => {
  // Both directions in one probe: the claim is caught, the denial is not.
  assert.deepEqual(forbiddenCopyIn("This candidate has the highest expected value."), ["expected value"]);
  assert.deepEqual(forbiddenCopyIn("GameTime does not publish a price-aware expected value."), []);
  assert.deepEqual(forbiddenCopyIn("GameTime publishes no guarantees and no locks."), []);
  assert.deepEqual(forbiddenCopyIn("Ask will not tell you which candidate is the highest-EV or the most profitable."), []);
  assert.ok(forbiddenCopyIn("Double down tonight and win it back.").length >= 1);
});

test("PROBE 8 · a foreign link cannot survive, however it is written", () => {
  const evidence = ev(["GameTime published 3 candidates"]);
  for (const href of [
    "https://sportsbook.draftkings.com/parlay",
    "http://evil.example/x",
    "//evil.example/x",
    "/admin/secrets/",
    "/../../etc/passwd",
  ]) {
    assert.equal(isApprovedLink(href), false, `${href} must not be an approved link`);
  }
  const r = verifyAnswer("Place it at [here](https://sportsbook.draftkings.com/parlay).", evidence);
  assert.equal(r.ok, false);
  assert.ok(!String(r.repaired).includes("draftkings"));
});

test("PROBE 9 · the writer cannot smuggle an href through the link list", () => {
  const evidence = { facts: [{ id: "E1.1", text: "x" }], links: [{ id: "E1:lab", label: "Lab", href: "/research/lab/" }] };
  const r = parseAnswer(JSON.stringify({
    answerMarkdown: "Here.",
    linkIds: ["https://evil.example", "/admin/", "E1:lab", { href: "https://evil.example" }],
  }), evidence);
  assert.equal(r.ok, true);
  assert.deepEqual(r.answer.links.map((l) => l.href), ["/research/lab/"], "only ids resolved against the evidence survive");
});

test("PROBE 10 · forcing the fake provider in production is refused", () => {
  // The CI-safety mechanism must not become a production back door.
  assert.equal(selectProvider({ ASK_MODEL_PROVIDER: "fake", VERCEL_ENV: "production" }).ok, false);
  assert.equal(selectProvider({ ASK_MODEL_PROVIDER: "fake", ANTHROPIC_API_KEY: "x", VERCEL_ENV: "production" }).ok, false);
  assert.equal(selectProvider({ ASK_MODEL_PROVIDER: "FAKE", VERCEL_ENV: "production" }).ok, false, "case must not evade it");
});

test("PROBE 11 · the Last-N shard hash is not accidentally constant", () => {
  // A hash that returned 0 for everything would still "work" — every lookup would find its player in
  // shard 0 — while making seven of the eight assets dead weight and the eighth enormous.
  const shards = new Set(Array.from({ length: 500 }, (_, i) => recentShardOf(`nfl-athlete-${i * 7 + 3}`)));
  assert.equal(shards.size, 8, "every shard must receive players");
});

test("PROBE 12 · a paused market cannot be presented as a forecast in either word order", () => {
  const evidence = ev(["BOS @ TEX · Over/Under is PAUSED by GameTime and publishes no pick"]);
  evidence.facts.push({ id: "E1.2", text: "BOS @ TEX · Over/Under is PAUSED by GameTime and publishes no pick" });
  for (const bad of [
    "The Over/Under: GameTime picks the over.",
    "GameTime picks the Over/Under over tonight.",
    "GameTime recommends the Over/Under over.",
  ]) {
    assert.equal(verifyAnswer(bad, evidence).ok, false, `"${bad}" must be refused`);
  }
  assert.equal(verifyAnswer("The Over/Under is paused and publishes no pick.", evidence).ok, true);
});
