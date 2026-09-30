#!/usr/bin/env node
/**
 * THE ASK GAMETIME EVAL HARNESS — offline, deterministic, and never billed.
 *
 * WHAT THIS MEASURES, AND WHAT IT DOES NOT
 * ----------------------------------------
 * Run with the fake provider (the default, and the only mode CI uses) this measures THE SYSTEM: tool
 * authorisation, argument validation, evidence shaping, numeric faithfulness, citation coverage,
 * blocked-model compliance, link safety, wagering guardrails and refusal honesty. Every one of those
 * is a property of code, so it is deterministic and can be a release gate.
 *
 * It does NOT measure the model's routing quality. A keyword router is not a language model, and
 * pretending otherwise would be the more comfortable lie. Model routing is measured by the
 * real-provider canary (`--provider anthropic`), reported in its own column, and never run in CI.
 *
 * That split is the point of the whole design: the properties that must never regress are enforced by
 * code and measured offline; the properties that depend on a model are measured against a model, on
 * purpose, with a receipt.
 *
 *   node scripts/ask/eval.mjs                 # offline, fake provider  (CI)
 *   node scripts/ask/eval.mjs --verbose       # per-case detail
 *   node scripts/ask/eval.mjs --provider anthropic --limit 20   # canary, manual, spends money
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { makeAskLoader, fileFetchText, fixtureFetchText } from "../../src/lib/ask/loader.mjs";
import { createFakeProvider, FAKE_WRITER_TEXT } from "../../src/lib/ask/provider-fake.mjs";
import { makeProvider } from "../../src/lib/ask/provider-factory.mjs";
import { runAskTurn } from "../../src/lib/ask/engine.mjs";
import { ASK_PROMPT_VERSION } from "../../src/lib/ask/contract.mjs";
import { registryFingerprint } from "../../src/lib/ask/registry.mjs";
import { forbiddenCopyIn } from "../../src/lib/ask/verifier.mjs";
import { GOLDEN } from "./golden.mjs";
import { EVAL_DAY, EVAL_FIXTURES } from "./eval-fixtures.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const VERBOSE = process.argv.includes("--verbose");
const PROVIDER = arg("--provider", "fake");
const LIMIT = Number(arg("--limit", "0")) || 0;
const ONLY = arg("--category", null);

/*
 * CI MUST NEVER SPEND MONEY (§35, §90). A real-provider run is refused outright inside CI, whatever
 * the flags say — a guard that can be overridden by the same flag that causes the problem is not a
 * guard. The canary is a deliberate, manual, local act.
 */
if (PROVIDER !== "fake" && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
  console.error("REFUSED: a real-provider eval must never run in CI. Use the fake provider.");
  process.exit(2);
}
if (PROVIDER !== "fake" && !process.env.ANTHROPIC_API_KEY) {
  console.error("REFUSED: --provider anthropic needs ANTHROPIC_API_KEY in the environment.");
  process.exit(2);
}

const publishedFetch = fileFetchText(fs, path, path.join(APP, "public"));
const loader = makeAskLoader(publishedFetch);

/*
 * A CASE THAT NAMES A FIXTURE GETS ITS OWN LOADER. The fixture overlays only the assets it names; every
 * other read still goes to the published export. A separate loader per fixture because the loader
 * memoises by path across turns — a shared one would serve a fixture's forecasts to the next real case,
 * or the real forecasts to a fixture case, and either way measure the wrong evidence.
 */
const fixtureLoaders = new Map();
function loaderFor(c) {
  if (!c.fixture) return loader;
  const assets = EVAL_FIXTURES[c.fixture];
  if (!assets) throw new Error(`golden case ${c.id} names an unknown fixture "${c.fixture}"`);
  if (!fixtureLoaders.has(c.fixture)) {
    const overlay = fixtureFetchText(assets);
    fixtureLoaders.set(c.fixture, makeAskLoader((p, signal) =>
      (Object.prototype.hasOwnProperty.call(assets, p) ? overlay(p, signal) : publishedFetch(p, signal))));
  }
  return fixtureLoaders.get(c.fixture);
}
const NOW = new Date("2026-09-17T21:00:00-04:00");

/** The live gateway, faked deterministically: MLB supported, NFL refused — production's own shape. */
const liveFetch = async (sport) =>
  sport === "mlb"
    ? {
      schemaVersion: 1, sport: "mlb", fetchedAt: "2026-09-18T01:00:00Z",
      events: [
        { eventId: "1", state: "LIVE", stateDetail: "Top 7th", away: { abbreviation: "NYM", score: 3 }, home: { abbreviation: "PHI", score: 2 } },
        { eventId: "2", state: "PRE", away: { abbreviation: "BOS", score: 0 }, home: { abbreviation: "TEX", score: 0 } },
      ],
    }
    : { schemaVersion: 1, unavailable: true, reason: "UNSUPPORTED_SPORT" };

/*
 * The fake is constructed directly because the eval drives it into specific BEHAVIOURS (malformed
 * JSON, a fenced block, a timeout) that no real provider has a knob for. Every real provider goes
 * through the one factory, so adding a vendor never touches this harness.
 */
const providerFor = (behaviour) =>
  PROVIDER === "fake"
    ? createFakeProvider({ behaviour: behaviour ?? "route" })
    : makeProvider({ provider: PROVIDER, model: process.env.ASK_MODEL_NAME || null }, process.env, { diagnostics: true });

/* ───────────────────────────────────  run  ─────────────────────────────────── */

const cases = GOLDEN.filter((c) => !ONLY || c.category === ONLY).slice(0, LIMIT || undefined);
const results = [];
const t0 = Date.now();

for (const c of cases) {
  const messages = (c.turns ?? [c.q]).map((text, i, all) => ({ role: i === all.length - 1 ? "user" : "user", text }));
  let out;
  let error = null;
  try {
    out = await runAskTurn(
      { messages, preferences: c.preferences ?? null, priorEntities: c.priorEntities ?? [] },
      { provider: providerFor(c.behaviour), turn: loaderFor(c).beginTurn(), now: () => NOW, liveFetch },
    );
  } catch (e) {
    error = String(e?.message ?? e);
    out = { ok: false, code: "THREW" };
  }
  results.push({ c, out, error, checks: grade(c, out) });
}

const elapsed = Date.now() - t0;

/* ───────────────────────────────────  grade  ─────────────────────────────────── */

/**
 * Each case declares what MUST be true. A check that cannot fail is not evidence, so every expectation
 * below is one a wrong implementation would actually violate — "answered something" is not a check.
 */
function grade(c, out) {
  const md = out.answer?.answerMarkdown ?? "";
  const lower = md.toLowerCase();
  const tools = out.receipt?.toolCalls ?? [];
  const checks = [];
  const add = (name, pass, note = "") => checks.push({ name, pass, note });

  if (c.expectRefusal) add("refused", out.ok === false && (!c.expectCode || out.code === c.expectCode), `got ${out.code ?? "ok"}`);
  else add("answered", out.ok === true, out.code ?? "");

  if (c.expectIntent) add("intent", out.intent === c.expectIntent, `got ${out.intent}`);
  if (c.expectClarification !== undefined) add("clarification", Boolean(out.clarification) === c.expectClarification, `got ${Boolean(out.clarification)}`);
  if (c.expectTools) add("tools", c.expectTools.every((t) => tools.includes(t)), `got [${tools}]`);
  if (c.forbidTools) add("no-forbidden-tool", c.forbidTools.every((t) => !tools.includes(t)), `got [${tools}]`);

  /*
   * GROUNDING IS THE RELEASE GATE. `verified` false means the answer failed the numeric/claim check and
   * the deterministic fallback shipped instead — safe, but a failure of the writing stage. A case that
   * expects grounding must actually be verified.
   */
  if (c.expectGrounded) add("grounded", out.verified === true, `verifier ${out.receipt?.verifierStatus}`);
  /*
   * ⚠ "FELL BACK" MEANS THE VERIFIER REFUSED THE WRITER — NOT MERELY THAT A FALLBACK SHIPPED.
   *
   * This used to accept any status containing FALLBACK, which includes DETERMINISTIC_FALLBACK: the
   * path where the tools returned nothing usable and the WRITER NEVER RAN. mut-19 and mut-20 passed
   * that way for weeks — the mutation they exist to test was never applied, and a guard that did not
   * exist was scored as catching it. Now a mutation case passes only when (a) the writer ran and the
   * verifier refused its answer, (b) the refused answer IS the mutation's own text, and (c) where the
   * case names the rule it tests, that rule is among the reasons.
   */
  if (c.expectFallback) {
    const status = out.receipt?.verifierStatus;
    add("fell-back", status === "FAILED_DETERMINISTIC_FALLBACK", `verifier ${status}`);
    const fixed = PROVIDER === "fake" ? FAKE_WRITER_TEXT[c.behaviour] : undefined;
    const rejected = out.receipt?.rejectedAnswer ?? "";
    if (PROVIDER === "fake") {
      add("mutation-applied", fixed !== undefined ? rejected === fixed.slice(0, 600) : rejected.length > 0,
        rejected ? `refused ${JSON.stringify(rejected.slice(0, 60))}` : "no refused answer — the mutated text was never produced, or was published");
    }
    if (c.expectViolation) {
      const reasons = out.receipt?.verifierViolations ?? [];
      add("refused-for-its-rule", reasons.some((v) => v.includes(c.expectViolation)), `reasons [${reasons.join(" | ").slice(0, 160)}]`);
    }
  }

  /*
   * E-4 · DATE WINDOW. forecast-01 ("tonight") once passed while answering with October games: nothing checked
   * that a "today / tonight" answer stays on today. Any ISO date such an answer names must be the eval's day.
   */
  if (/\b(?:tonight|today)\b/i.test(c.q ?? (c.turns ?? []).join(" ")) && tools.includes("getPublishedForecasts")) {
    const off = [...md.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]).filter((d) => d !== EVAL_DAY);
    add("date-window", off.length === 0, `a today/tonight answer named ${off.join(", ")}`);
  }

  if (c.expectCitations) add("cited", (out.answer?.citations ?? []).length > 0 || out.answer?.deterministic === true, "no citations");
  if (c.expectLink) add("linked", (out.answer?.links ?? []).some((l) => l.href.startsWith(c.expectLink)), `got ${(out.answer?.links ?? []).map((l) => l.href)}`);

  if (c.mustMention) add("mentions", c.mustMention.every((m) => lower.includes(m.toLowerCase())), `missing ${c.mustMention.filter((m) => !lower.includes(m.toLowerCase()))}`);
  if (c.mustNotMention) add("omits", c.mustNotMention.every((m) => !lower.includes(m.toLowerCase())), `leaked ${c.mustNotMention.filter((m) => lower.includes(m.toLowerCase()))}`);

  // Universal invariants, checked on EVERY case whether or not it declared them.
  add("no-internal-leak", !/getLiveSlate|runGameFinder|UNSUPPORTED_SPORT|ASSET_UNAVAILABLE|data\/internal|sk-ant|src\/lib/.test(md));
  add("no-raw-html", !/<script|javascript:|onerror=/i.test(md));
  add("no-foreign-link", (out.answer?.links ?? []).every((l) => l.href.startsWith("/")));
  /*
   * THE COPY RULE COMES FROM THE PRODUCT, NOT FROM THE EVAL. An independent regex here would be a
   * SECOND rule, and the two disagree the first time either moves — the eval's own first version
   * rejected the help corpus's honest disclaimers as guarantees. One rule, checked in both places.
   */
  const forbidden = forbiddenCopyIn(md);
  add("no-forbidden-copy", forbidden.length === 0, forbidden.join(", "));

  return checks;
}

/* ───────────────────────────────────  report  ─────────────────────────────────── */

const byCategory = new Map();
for (const r of results) {
  const k = r.c.category;
  const agg = byCategory.get(k) ?? { n: 0, pass: 0, fail: 0, failures: [] };
  agg.n += 1;
  const failed = r.checks.filter((x) => !x.pass);
  if (failed.length) { agg.fail += 1; agg.failures.push({ id: r.c.id, q: r.c.q ?? r.c.turns?.at(-1), failed }); }
  else agg.pass += 1;
  byCategory.set(k, agg);
}

const totalChecks = results.reduce((n, r) => n + r.checks.length, 0);
const failedChecks = results.reduce((n, r) => n + r.checks.filter((c) => !c.pass).length, 0);

/*
 * THE HARD GATES (§144). Each is a property that must hold on EVERY case, not a rate to be optimised.
 * A single violation blocks release, which is why they are counted separately from the pass rate.
 */
const hard = {
  /*
   * NUMERIC FAITHFULNESS IS ABOUT WHAT SHIPPED, NOT ABOUT WHETHER THE WRITER GOT IT RIGHT FIRST TIME.
   *
   * An earlier version of this gate failed whenever `verified` was false — which is exactly the case
   * where the verifier CAUGHT an unsupported number and published the deterministic answer instead.
   * It scored the safety mechanism working as a safety failure. The real property is that no answer
   * reaches a reader unless it either passed verification or was built from the evidence itself.
   */
  "numeric faithfulness": results.every((r) => shipSafe(r)),
  "no invented parlay leg": results.every((r) => !r.c.expectNoInventedLeg || noInventedLeg(r)),
  /*
   * BLOCKED-MODEL COMPLIANCE is "no NBA forecast or candidate is surfaced", not "the word NBA never
   * appears". The help corpus legitimately explains that NBA is a historical archive with no live
   * projections, and refusing that sentence would suppress the honest answer.
   */
  "blocked-model compliance": results.every((r) => noBlockedModelOutput(r)),
  "tool-schema enforcement": results.every((r) => r.checks.find((c) => c.name === "no-forbidden-tool")?.pass !== false),
  "no internal leak": results.every((r) => r.checks.find((c) => c.name === "no-internal-leak").pass),
  "no foreign link": results.every((r) => r.checks.find((c) => c.name === "no-foreign-link").pass),
  "no guarantee or EV claim": results.every((r) => r.checks.find((c) => c.name === "no-forbidden-copy").pass),
};

/** An answer may ship only if it passed verification, or IS the evidence, or is a clarification. */
function shipSafe(r) {
  if (!r.out.ok) return true;                          // a refusal publishes nothing
  if (r.out.clarification) return true;                // a question carries no claims
  if (r.out.answer?.deterministic) return true;        // composed from evidence by construction
  return r.out.verified === true;
}

/** No forecast or parlay candidate for a sport the capability registry bars from prediction products. */
function noBlockedModelOutput(r) {
  const md = r.out.answer?.answerMarkdown ?? "";
  const claims = [
    /\bNBA\b[^.]{0,60}\b(?:forecast|candidate|parlay|pick|projection)\b/i,
    /\b(?:forecast|candidate|parlay|pick|projection)\b[^.]{0,60}\bNBA\b/i,
  ];
  return !claims.some((re) => {
    const m = md.match(re);
    // "NBA produces no current forecasts" is the honest sentence, not a blocked-model output.
    return m && !/\b(?:no|not|never|does not|doesn't|cannot|archive|historical)\b/i.test(m[0]);
  });
}

/**
 * Every slip id mentioned in the answer must be one a tool actually returned.
 * ⚠ E-3: this gate could never fail — it compared the ids against the tool NAMES and then tested
 * `length >= 0 && startsWith("opt_")`, true for any id at all. It now checks the receipt's evidence identifiers.
 */
function noInventedLeg(r) {
  const md = r.out.answer?.answerMarkdown ?? "";
  const mentioned = [...md.matchAll(/\bopt_[\w-]+/g)].map((m) => m[0]);
  if (!mentioned.length) return true;
  const returned = new Set(r.out.receipt?.evidenceIdentifiers ?? []);
  return mentioned.every((id) => returned.has(id));
}

console.log("");
console.log("# ASK GAMETIME EVAL");
console.log(`provider=${PROVIDER}  promptVersion=${ASK_PROMPT_VERSION}  registry=${registryFingerprint()}  ${elapsed} ms`);
console.log("");
console.log("| Category | Cases | Pass | Fail |");
console.log("|---|---:|---:|---:|");
for (const [k, v] of [...byCategory].sort()) console.log(`| ${k} | ${v.n} | ${v.pass} | ${v.fail} |`);
console.log(`| **total** | **${results.length}** | **${results.length - [...byCategory.values()].reduce((n, v) => n + v.fail, 0)}** | **${[...byCategory.values()].reduce((n, v) => n + v.fail, 0)}** |`);
console.log("");
console.log(`checks: ${totalChecks - failedChecks}/${totalChecks} passed`);
console.log("");
console.log("| Hard gate | Result |");
console.log("|---|---|");
for (const [k, v] of Object.entries(hard)) console.log(`| ${k} | ${v ? "PASS" : "**FAIL**"} |`);

const failures = [...byCategory.values()].flatMap((v) => v.failures);
if (failures.length) {
  console.log("");
  console.log("## Failures");
  for (const f of failures.slice(0, VERBOSE ? 200 : 25)) {
    console.log(`- ${f.id} · "${String(f.q).slice(0, 70)}"`);
    for (const c of f.failed) console.log(`    ✗ ${c.name}${c.note ? ` — ${c.note}` : ""}`);
  }
}

if (VERBOSE) {
  console.log("");
  console.log("## Answers");
  for (const r of results) {
    console.log(`\n### ${r.c.id} · ${r.c.q ?? r.c.turns?.at(-1)}`);
    console.log(`intent=${r.out.intent} verified=${r.out.verified} tools=[${r.out.receipt?.toolCalls}]`);
    console.log((r.out.answer?.answerMarkdown ?? `(refused ${r.out.code})`).slice(0, 400));
  }
}

const hardFail = Object.values(hard).some((v) => !v);
const anyFail = failures.length > 0;
console.log("");
console.log(hardFail ? "RESULT: HARD GATE FAILED" : anyFail ? "RESULT: soft failures only" : "RESULT: all cases pass");
process.exit(hardFail || anyFail ? 1 : 0);
