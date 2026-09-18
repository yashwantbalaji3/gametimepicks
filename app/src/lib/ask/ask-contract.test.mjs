/**
 * ASK GAMETIME CONTRACT TESTS — the boundaries, asserted rather than described.
 *
 * Grouped by the thing that would be true if the boundary were gone. A test named "the executor
 * refuses an unknown tool" is worth more than one named "executor test", because the first one tells
 * you what broke when it goes red.
 *
 * NOTHING HERE TOUCHES THE NETWORK. The provider is the deterministic fake and the loader reads
 * fixtures, so the suite is offline, fast, and impossible to make expensive by accident.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ASK_BUDGET,
  ASK_ERROR,
  ASK_EXPECTED_PARLAY_SPORTS,
  ASK_FORBIDDEN_EV_COPY,
  ASK_RISK_PROFILES,
  RISK_SECTION_KEY,
  isAllowedAssetPath,
  isApprovedLink,
  recentShardOf,
} from "./contract.mjs";
import { ASK_FORBIDDEN_ARG_NAMES, ASK_FORBIDDEN_TOOL_NAMES, ASK_TOOLS, ASK_TOOL_NAMES, providerToolList, registryFingerprint } from "./registry.mjs";
import { validateArgs } from "./schema.mjs";
import { makeExecutor } from "./executor.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { buildEvidence } from "./evidence.mjs";
import { verifyAnswer, deterministicAnswer } from "./verifier.mjs";
import { parsePlan, plannerSystemPrompt, validatePlan } from "./planner.mjs";
import { parseAnswer, sanitiseMarkdown } from "./writer.mjs";
import { clearedState, normaliseContext, normaliseMessages, normalisePreferences, readPreferencesFromText, reduceConversation } from "./conversation.mjs";
import { missingAskConfig, redact, selectProvider, ASK_REQUIRED_ENV } from "./provider.mjs";
import { createFakeProvider } from "./provider-fake.mjs";
import { runAskTurn } from "./engine.mjs";
import { capabilityOf, canEnterPredictionProducts } from "../sport-capability-registry.ts";

/* ═══════════════════════════  1. THE CAPABILITY BOUNDARY  ═══════════════════════════ */

test("the registry contains no tool that could reach a file, a shell, a database or a URL", () => {
  for (const forbidden of ASK_FORBIDDEN_TOOL_NAMES) {
    assert.ok(!ASK_TOOL_NAMES.includes(forbidden), `the registry must not contain a tool named ${forbidden}`);
  }
  // The other half of the probe: a tool that is bounded today must not acquire an unbounded argument.
  for (const [name, def] of Object.entries(ASK_TOOLS)) {
    for (const arg of Object.keys(def.args)) {
      assert.ok(!ASK_FORBIDDEN_ARG_NAMES.includes(arg), `${name} must not take an argument named ${arg}`);
    }
  }
});

test("every declared tool is implemented, and every implemented tool is declared", () => {
  // makeExecutor's module body throws if these disagree; constructing one is the assertion.
  assert.doesNotThrow(() => makeExecutor({}));
  assert.equal(ASK_TOOL_NAMES.length, 14);
});

test("the planner prompt actually CONTAINS the tool catalogue", () => {
  /*
   * ⚠ THE CANARY'S BIGGEST FIND. `providerToolList()` was written, exported and never called. The
   * prompt told the model "never plan a call to a tool that is not in your tool list" and gave it no
   * list, so it invented plausible names — getSeasonStats, getPlayerRecentPerformance,
   * getParlayRecommendations — and the executor refused every one. The boundary held; the product
   * answered six of twenty questions with a refusal.
   *
   * The fake provider is a keyword router that never reads a catalogue, so it routed perfectly while
   * the real model was guessing. Only a real provider could show this, and only this guard keeps it
   * from coming back.
   */
  const prompt = plannerSystemPrompt();
  for (const name of ASK_TOOL_NAMES) {
    assert.ok(prompt.includes(name), `the planner prompt must name ${name} — otherwise the model must guess it`);
  }
  // And the descriptions, which are what teach it WHICH tool to pick.
  assert.ok(prompt.includes("Recorded FINAL team games"), "tool descriptions must reach the model, not just names");
  assert.ok(prompt.length > 3000, `the prompt is ${prompt.length} chars — too short to contain 14 tools`);
});

test("the provider tool list is generated from the same specs the executor enforces", () => {
  for (const tool of providerToolList()) {
    const def = ASK_TOOLS[tool.name];
    assert.ok(def, `${tool.name} is in the provider list but not the registry`);
    assert.deepEqual(
      Object.keys(tool.input_schema.properties).sort(),
      Object.keys(def.args).sort(),
      `${tool.name}: the schema shown to the model differs from the one the server enforces`,
    );
    assert.equal(tool.input_schema.additionalProperties, false);
  }
});

test("the registry fingerprint changes when a tool's arguments change", () => {
  const before = registryFingerprint();
  const original = ASK_TOOLS.runGameFinder.args.limit;
  ASK_TOOLS.runGameFinder.args.zzzProbe = { kind: "integer", min: 1, max: 2 };
  const after = registryFingerprint();
  delete ASK_TOOLS.runGameFinder.args.zzzProbe;
  assert.notEqual(before, after, "a receipt must not be able to name a contract that has since changed");
  assert.equal(registryFingerprint(), before, "the probe must restore the registry");
  assert.equal(ASK_TOOLS.runGameFinder.args.limit, original);
});

/* ═══════════════════════════  2. ARGUMENT AUTHORISATION  ═══════════════════════════ */

test("an unknown argument fails the call rather than being ignored", () => {
  const r = validateArgs(ASK_TOOLS.getPublishedForecasts.args, { includePrivate: true });
  assert.equal(r.ok, false);
  assert.equal(r.code, ASK_ERROR.UNKNOWN_ARGUMENT);
  assert.equal(r.detail, "includePrivate");
});

test("injection-shaped argument values are refused by type, not by pattern-matching the payload", () => {
  for (const value of ["DROP TABLE seasons", "../../.env", "<script>", "'; SELECT 1 --"]) {
    const r = validateArgs(ASK_TOOLS.resolveEntity.args, { kind: "player", text: "x", sport: value });
    assert.equal(r.ok, false, `sport=${value} must be refused`);
    assert.equal(r.code, ASK_ERROR.INVALID_ARGUMENT);
  }
  // A slug argument refuses anything that is not a canonical identifier.
  assert.equal(validateArgs(ASK_TOOLS.getMatchupContext.args, { sport: "MLB", gameId: "../secrets" }).ok, false);
});

test("numeric bounds are enforced in both directions and a non-calendar date is refused", () => {
  assert.equal(validateArgs(ASK_TOOLS.runGameFinder.args, { sport: "MLB", limit: 500 }).ok, false);
  assert.equal(validateArgs(ASK_TOOLS.runGameFinder.args, { sport: "MLB", limit: 0 }).ok, false);
  assert.equal(validateArgs(ASK_TOOLS.getPlayerRecentGames.args, { sport: "NFL", playerId: "p", limit: 7 }).ok, false, "limit must be 3, 5 or 10");
  assert.equal(validateArgs(ASK_TOOLS.runGameFinder.args, { sport: "MLB", fromDate: "2026-02-30" }).ok, false, "2026-02-30 is not a calendar date");
  assert.equal(validateArgs(ASK_TOOLS.runGameFinder.args, { sport: "MLB", fromDate: "2026-02-28" }).ok, true);
});

test("a required argument that is absent is named", () => {
  const r = validateArgs(ASK_TOOLS.getTeamComparison.args, { sport: "MLB", teamAId: "a" });
  assert.equal(r.code, ASK_ERROR.MISSING_ARGUMENT);
  assert.equal(r.detail, "teamBId");
});

/* ═══════════════════════════  3. THE ASSET LOADER  ═══════════════════════════ */

test("the loader refuses every path outside the allowlist", () => {
  const refused = [
    "/etc/passwd", "../../.env", "/data/ask/v1/../../../secret.json", "/data/internal/platform/v1/manifest.json",
    "https://example.com/data/ask/v1/help.json", "//evil.com/data/ask/v1/help.json", "/data/ask/v1/help.json?x=1",
    "/data/ask/v1/help.js", "/data/lab/v1/games/mlb/rows.json#frag",
  ];
  for (const p of refused) assert.equal(isAllowedAssetPath(p), false, `${p} must be refused`);

  const allowed = ["/data/ask/v1/help.json", "/data/lab/v1/games/mlb/rows.json", "/data/compare/v1/teams/mlb/index.json"];
  for (const p of allowed) assert.equal(isAllowedAssetPath(p), true, `${p} must be allowed`);
});

test("the loader enforces a per-turn asset budget", async () => {
  const fixtures = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`/data/ask/v1/recent/mlb/${i}.json`, { schemaVersion: 1, n: i }]),
  );
  const loader = makeAskLoader(fixtureFetchText(fixtures));
  const turn = loader.beginTurn();
  const results = [];
  for (let i = 0; i < 12; i += 1) results.push(await turn.load(`/data/ask/v1/recent/mlb/${i}.json`));
  assert.equal(results.filter((r) => r.ok).length, ASK_BUDGET.maxAssetsPerTurn);
  assert.equal(results[ASK_BUDGET.maxAssetsPerTurn].code, ASK_ERROR.BUDGET_EXCEEDED);
});

test("a fresh turn gets a fresh budget, and the memo does not leak across conversations", async () => {
  const loader = makeAskLoader(fixtureFetchText({ "/data/ask/v1/help.json": { schemaVersion: 1 } }));
  const a = loader.beginTurn();
  await a.load("/data/ask/v1/help.json");
  assert.equal(a.spent.assets, 1);
  const b = loader.beginTurn();
  assert.equal(b.spent.assets, 0, "a new turn must start with a clean budget");
});

/* ═══════════════════════════  4. THE EXECUTOR  ═══════════════════════════ */

const fixtureLoader = () => {
  const loader = makeAskLoader(fixtureFetchText({
    "/data/ask/v1/entities.json": {
      schemaVersion: 1,
      entries: [
        { id: "nfl-athlete-1", kind: "player", sport: "NFL", label: "Keenan Allen", slug: "keenan-allen", path: "/players/nfl/keenan-allen/" },
        { id: "nfl-athlete-2", kind: "player", sport: "NFL", label: "Josh Allen", slug: "josh-allen", path: "/players/nfl/josh-allen/" },
        { id: "mlb-team-121", kind: "team", sport: "MLB", label: "New York Mets", slug: "new-york-mets", path: "/teams/mlb/new-york-mets/" },
      ],
    },
    "/data/ask/v1/help.json": {
      schemaVersion: 1,
      chunks: [
        { id: "live", title: "Live games", section: "Live", route: "/live/", keywords: ["live", "nfl live"], text: "GameTime Live shows MLB. NFL live state is not available." },
        { id: "compare", title: "Comparing teams and players", section: "Research", route: "/compare/", keywords: ["compare"], text: "Compare puts two teams side by side." },
      ],
    },
  }));
  return loader.beginTurn();
};

test("the executor refuses a tool that is not in the registry", async () => {
  const ex = makeExecutor({ turn: fixtureLoader() });
  for (const name of ["readFile", "fetch", "shell", "sql", "getShadowMetrics", "__proto__"]) {
    const r = await ex.run({ name, arguments: { path: "/.env" } });
    assert.equal(r.status, "ERROR");
    assert.equal(r.error, ASK_ERROR.UNKNOWN_TOOL, `${name} must be refused as an unknown tool`);
  }
});

test("the executor bounds the number of tool calls in one turn", async () => {
  const ex = makeExecutor({ turn: fixtureLoader(), now: () => new Date("2026-09-17T12:00:00Z") });
  const out = [];
  for (let i = 0; i < ASK_BUDGET.maxToolCalls + 2; i += 1) {
    out.push(await ex.run({ name: "searchGameTimeHelp", arguments: { query: `question number ${i}` } }));
  }
  assert.equal(out.filter((r) => r.error === ASK_ERROR.BUDGET_EXCEEDED).length, 2);
});

test("an identical call is de-duplicated and produces one piece of evidence, not two", async () => {
  const ex = makeExecutor({ turn: fixtureLoader() });
  await ex.run({ name: "searchGameTimeHelp", arguments: { query: "compare" } });
  await ex.run({ name: "searchGameTimeHelp", arguments: { query: "compare" } });
  assert.equal(ex.spent.calls, 1, "the second identical call must not re-run");
  assert.equal(ex.evidence.length, 1, "a writer must not see the same finding twice");
});

test("resolveEntity asks rather than guessing when a name is ambiguous", async () => {
  const ex = makeExecutor({ turn: fixtureLoader() });
  const r = await ex.run({ name: "resolveEntity", arguments: { kind: "player", text: "Allen", sport: "NFL" } });
  assert.equal(r.error, ASK_ERROR.AMBIGUOUS_ENTITY);
  assert.equal(r.data.resolution, "AMBIGUOUS");
  assert.equal(r.data.candidates.length, 2);

  const exact = await ex.run({ name: "resolveEntity", arguments: { kind: "player", text: "keenan  ALLEN", sport: "NFL" } });
  assert.equal(exact.data.resolution, "EXACT", "case and spacing are spelling, not identity");
  assert.equal(exact.data.entity.id, "nfl-athlete-1");
});

/* ═══════════════════════════  5. SPORT ELIGIBILITY (THE NBA RULE)  ═══════════════════════════ */

test("NBA cannot enter prediction products, so Ask must never surface an NBA parlay candidate", () => {
  assert.equal(capabilityOf("nba").state, "HISTORICAL_ONLY");
  assert.equal(canEnterPredictionProducts("nba"), false);
  assert.deepEqual([...ASK_EXPECTED_PARLAY_SPORTS], ["mlb"]);
});

test("the parlay adapter drops an ineligible sport cut EVEN WHEN IT IS NOT EMPTY", async () => {
  /*
   * This is the probe that matters. The builder drops ineligible sports at write time, so an NBA cut
   * should never be in the artifact — but the artifact is a FILE, and a stale or hand-edited one is
   * exactly where a dormant cut reappears. Here the fixture deliberately contains a POPULATED nba
   * candidate; if the read-time check were removed, this test would surface it.
   */
  const loader = makeAskLoader(fixtureFetchText({
    "/data/ask/v1/parlays.json": {
      schemaVersion: 1,
      dates: ["2026-09-17"],
      byDate: {
        "2026-09-17": {
          date: "2026-09-17",
          generatedAt: "2026-09-17T10:00:00Z",
          eligibleSports: ["mlb"],
          profiles: {
            MEDIUM: [
              { slipId: "s-mlb", profile: "MEDIUM", sport: "MLB", legCount: 2, legs: [{ sport: "MLB", playerName: "A", oddsForSide: -110 }, { sport: "MLB", playerName: "B", oddsForSide: -110 }], score: 0.2, correlationPenalty: 0, payoutPer100: { american: 264, decimal: 3.64, profitPer100: 264 } },
              { slipId: "s-nba", profile: "MEDIUM", sport: "NBA", legCount: 2, legs: [{ sport: "NBA", playerName: "C", oddsForSide: -110 }, { sport: "NBA", playerName: "D", oddsForSide: -110 }], score: 0.9, correlationPenalty: 0, payoutPer100: null },
            ],
          },
        },
      },
      evOwner: null,
    },
  }));
  const ex = makeExecutor({ turn: loader.beginTurn() });
  const r = await ex.run({ name: "getParlayCandidates", arguments: { riskProfile: "MEDIUM", limit: 5 } });

  assert.equal(r.status, "OK");
  const ids = r.data.candidates.map((c) => c.slipId);
  assert.deepEqual(ids, ["s-mlb"], "the NBA candidate must be refused even though its score is higher");
  assert.ok(r.data.refusedSports.includes("NBA"), "the refusal must be reported, not silent");
});

test("the risk profiles are the optimizer artifact's own section keys", () => {
  assert.deepEqual([...ASK_RISK_PROFILES], ["LOW", "MEDIUM", "HIGH", "LONGSHOT"]);
  assert.deepEqual(RISK_SECTION_KEY, { LOW: "low", MEDIUM: "medium", HIGH: "high", LONGSHOT: "longshot" });
});

/* ═══════════════════════════  6. THE GROUNDING VERIFIER  ═══════════════════════════ */

const evidenceFor = (facts) => {
  const numbers = new Set();
  const identifiers = new Set();
  for (const text of facts) {
    for (const m of text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) numbers.add(String(Number(m[0].replace(/,/g, ""))));
    for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) numbers.add(m[0]);
  }
  return { facts: facts.map((text, i) => ({ id: `E1.${i + 1}`, source: "t", text })), numbers, identifiers, links: [], items: [], unsupported: [] };
};

test("a faithful restatement of the evidence verifies", () => {
  const ev = evidenceFor(["on 2026-09-15 the New York Mets scored 5 and allowed 7 against the Baltimore Orioles — a loss"]);
  const r = verifyAnswer("On 2026-09-15 the Mets scored 5 and allowed 7 to the Orioles, a loss.", ev);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test("changing a number in the evidence is caught", () => {
  const ev = evidenceFor(["the New York Mets scored 87 runs"]);
  const r = verifyAnswer("The Mets scored 88 runs.", ev);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === ASK_ERROR.UNSUPPORTED_CLAIM && v.detail.includes("88")));
});

test("inventing a number is caught", () => {
  const ev = evidenceFor(["Game Finder matched 79 recorded games"]);
  assert.equal(verifyAnswer("I found 79 games; the best had 412 total bases.", ev).ok, false);
});

test("shifting a date is caught — a date is a claim, not decoration", () => {
  const ev = evidenceFor(["on 2026-09-15 the Mets played the Orioles"]);
  const r = verifyAnswer("On 2026-09-16 the Mets played the Orioles.", ev);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.detail.includes("2026-09-16")));
});

test("a date that IS in the evidence does not fire — the ordering bug that rejected every correct answer", () => {
  /*
   * REGRESSION. The first verifier stripped years before ISO dates, so "2026-09-17" became "-09-17"
   * and the scanner read −17 as an unsupported number. Every correct answer containing a date was
   * rejected and replaced by the deterministic fallback.
   */
  const ev = evidenceFor(["on 2026-09-17 Arizona Diamondbacks 3, Miami Marlins 4"]);
  const r = verifyAnswer("On 2026-09-17 Arizona Diamondbacks 3, Miami Marlins 4.", ev);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test("an identifier containing digits is not read as a numeric claim", () => {
  // REGRESSION: `opt_2026-09-17_public_medium_mlb_513c61734f51` yielded 2026, −17, 513 and 61734.
  const ev = evidenceFor(["candidate opt_2026-09-17_public_medium_mlb_513c61734f51 is a 4-leg MEDIUM candidate"]);
  ev.identifiers.add("opt_2026-09-17_public_medium_mlb_513c61734f51");
  const r = verifyAnswer("Candidate opt_2026-09-17_public_medium_mlb_513c61734f51 is a 4-leg MEDIUM candidate.", ev);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test("a guarantee is refused, in either the user's words or the model's", () => {
  const ev = evidenceFor(["GameTime published 3 candidates"]);
  for (const bad of ["This is a guaranteed lock.", "You can't lose with this one.", "Easy money tonight.", "Double down and win it back."]) {
    assert.equal(verifyAnswer(bad, ev).ok, false, `"${bad}" must be refused`);
  }
});

test("an expected-value CLAIM is refused but the honest DENIAL of one is not", () => {
  const ev = evidenceFor(["GameTime published 3 candidates"]);
  assert.equal(verifyAnswer("This candidate has the highest expected value.", ev).ok, false);
  /*
   * REGRESSION. A substring match rejected Ask's own disclaimer — "GameTime does not publish a
   * price-aware expected value" — so the answer that correctly refuses to claim EV was itself refused.
   */
  assert.equal(verifyAnswer("GameTime does not publish a price-aware expected value, so these are not ranked by expected value.", ev).ok, true);
  assert.ok(ASK_FORBIDDEN_EV_COPY.includes("expected value"));
});

test("a model-authored URL is refused and stripped", () => {
  const ev = evidenceFor(["GameTime published 3 candidates"]);
  const r = verifyAnswer("Place it at [DraftKings](https://sportsbook.draftkings.com/parlay).", ev);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === ASK_ERROR.UNSUPPORTED_LINK));
  assert.ok(!String(r.repaired).includes("draftkings"));
});

test("an approved product route is accepted", () => {
  const ev = evidenceFor(["GameTime published 3 candidates"]);
  assert.equal(verifyAnswer("See [Parlay Lab](/parlay-lab/).", ev).ok, true);
  assert.equal(isApprovedLink("/research/lab/?mode=games&sport=mlb&season=MLB-2026"), true);
  assert.equal(isApprovedLink("https://evil.example/x"), false);
  assert.equal(isApprovedLink("/admin/secrets/"), false);
});

test("a paused market must not be given a pick, but explaining the pause is allowed", () => {
  const ev = evidenceFor(["BOS @ TEX · Over/Under is PAUSED by GameTime and publishes no pick. The stated reason: its live record is below a coin flip"]);
  assert.equal(verifyAnswer("GameTime picks the Over/Under over tonight.", ev).ok, false);
  /*
   * REGRESSION. The pause sentence itself contains "no pick", and a naive proximity search for the
   * word "pick" near the market name rejected the correct explanation.
   */
  assert.equal(verifyAnswer("The Over/Under is paused and publishes no pick, because its live record is below a coin flip.", ev).ok, true);
});

test("a date the evidence gave as a TIMESTAMP is supported when the answer writes it bare", () => {
  /*
   * ⚠ REGRESSION. Evidence says "updated 2026-09-17T10:09:03.504Z"; the answer says "2026-09-17".
   * The registration pattern ended in \b, which does not match before the "T", so the date was never
   * registered — and the verifier rejected a date its own evidence had supplied. Every forecast answer
   * that mentioned when a forecast was updated failed grounding.
   */
  const ev = evidenceFor(["for MIN @ LAA (MLB), GameTime has a published forecast, updated 2026-09-17T10:09:03.504Z"]);
  ev.numbers.add("2026-09-17");
  assert.equal(verifyAnswer("GameTime's MIN @ LAA forecast was updated on 2026-09-17.", ev).ok, true);
});

test("listing a paused market beside another market's pick is not presenting the paused one", () => {
  /*
   * ⚠ REGRESSION. "Over/Under: paused · Moneyline: GameTime picks MIN" — a window that stopped only at
   * a full stop ran from the first market's name into the second market's verb, rejecting a correct
   * answer. A separator ends a clause as surely as a full stop does.
   */
  const ev = evidenceFor(["MIN @ LAA · Over/Under is PAUSED by GameTime and publishes no pick"]);
  assert.equal(verifyAnswer("Over/Under: paused, no pick published · Moneyline: GameTime picks MIN.", ev).ok, true);
  // And the real violation is still caught.
  assert.equal(verifyAnswer("GameTime picks the Over/Under over tonight.", ev).ok, false);
});

test("a number the user supplied is theirs to state and is not a sports claim", () => {
  const ev = evidenceFor(["GameTime published 3 candidates"]);
  assert.equal(verifyAnswer("With your 250 bankroll, here are three candidates.", ev, { userNumbers: [250] }).ok, true);
  assert.equal(verifyAnswer("With your 250 bankroll, here are three candidates.", ev).ok, false, "without the user's own figure it is unsupported");
});

test("the deterministic fallback contains only evidence", () => {
  const ev = evidenceFor(["Game Finder matched 79 recorded games", "on 2026-09-15 the Mets scored 5"]);
  const a = deterministicAnswer(ev, { intent: "FACTUAL_GAME_QUERY" });
  assert.ok(a.deterministic);
  assert.equal(verifyAnswer(a.answerMarkdown, ev).ok, true, "the fallback must pass its own verifier");
});

/* ═══════════════════════════  7. PLANNER AND WRITER CONTRACTS  ═══════════════════════════ */

test("a plan naming a tool that does not exist is refused", () => {
  const r = validatePlan({ intent: "FACTUAL_GAME_QUERY", calls: [{ id: "c0", name: "readFile", arguments: {} }] });
  assert.equal(r.code, ASK_ERROR.UNKNOWN_TOOL);
});

test("a factual intent with no tool call is refused — that IS the tool-first violation", () => {
  const r = validatePlan({ intent: "FACTUAL_GAME_QUERY", calls: [] });
  assert.equal(r.code, ASK_ERROR.MALFORMED_PLAN);
  assert.match(r.detail, /produced no tool call/);
});

test("a plan exceeding the call budget is refused before anything runs", () => {
  const calls = Array.from({ length: ASK_BUDGET.maxToolCalls + 1 }, (_, i) => ({ id: `c${i}`, name: "getGameTimeNow", arguments: {} }));
  assert.equal(validatePlan({ intent: "FACTUAL_GAME_QUERY", calls }).code, ASK_ERROR.BUDGET_EXCEEDED);
});

test("a dependency on a call that does not exist is refused rather than half-executed", () => {
  const r = validatePlan({ intent: "FACTUAL_PLAYER_QUERY", calls: [{ id: "c0", name: "getGameTimeNow", arguments: {}, after: ["ghost"] }] });
  assert.equal(r.code, ASK_ERROR.MALFORMED_PLAN);
});

test("the plan parser survives a markdown fence and trailing prose but repairs nothing semantic", () => {
  const good = JSON.stringify({ intent: "SITE_HELP", calls: [{ id: "c0", name: "searchGameTimeHelp", arguments: { query: "compare" } }] });
  assert.equal(parsePlan("```json\n" + good + "\n```").ok, true);
  assert.equal(parsePlan(`Sure! ${good} Hope that helps.`).ok, true);
  assert.equal(parsePlan("The Mets probably won.").code, ASK_ERROR.MALFORMED_PLAN);
  assert.equal(parsePlan('{"intent":"NOT_A_REAL_INTENT","calls":[]}').code, ASK_ERROR.MALFORMED_PLAN);
});

test("the writer cannot emit a link — only reference one the evidence already carries", () => {
  const evidence = { facts: [{ id: "E1.1", text: "x" }], links: [{ id: "E1:lab", label: "Open Research Lab", href: "/research/lab/" }] };
  const r = parseAnswer(JSON.stringify({
    answerMarkdown: "Here.",
    citations: ["E1.1", "E9.9"],
    linkIds: ["E1:lab", "https://evil.example"],
    followUps: ["a", "b", "c", "d"],
  }), evidence);
  assert.equal(r.ok, true);
  assert.deepEqual(r.answer.citations, ["E1.1"], "a citation to a fact that does not exist is dropped");
  assert.equal(r.answer.links.length, 1);
  assert.equal(r.answer.links[0].href, "/research/lab/");
  assert.equal(r.answer.followUps.length, ASK_BUDGET.maxFollowUps);
});

test("markdown is sanitised server-side before it is ever sent", () => {
  const dirty = 'Fine.<script>alert(1)</script><a href="javascript:steal()">here</a><img onerror="x()">';
  const clean = sanitiseMarkdown(dirty);
  for (const bad of ["<script", "javascript:", "onerror=", "<a ", "<img"]) {
    assert.ok(!clean.includes(bad), `sanitised output must not contain ${bad}`);
  }
});

/* ═══════════════════════════  8. CONVERSATION STATE  ═══════════════════════════ */

test("a bankroll is read from a currency figure but never from a stat in a sentence", () => {
  assert.equal(readPreferencesFromText("$100, medium", { entertainmentBankroll: null, riskProfile: null }).entertainmentBankroll, 100);
  assert.equal(readPreferencesFromText("$100, medium", { entertainmentBankroll: null, riskProfile: null }).riskProfile, "MEDIUM");
  assert.equal(readPreferencesFromText("he rushed for 100 yards", { entertainmentBankroll: null, riskProfile: null }).entertainmentBankroll, null);
  assert.equal(readPreferencesFromText("my bankroll is 250", { entertainmentBankroll: null, riskProfile: null }).entertainmentBankroll, 250);
});

test("a bankroll outside the permitted range is dropped, not clamped", () => {
  assert.equal(normalisePreferences({ entertainmentBankroll: 1e9 }).entertainmentBankroll, null);
  assert.equal(normalisePreferences({ entertainmentBankroll: -5 }).entertainmentBankroll, null);
  assert.equal(normalisePreferences({ entertainmentBankroll: "not a number" }).entertainmentBankroll, null);
  assert.equal(normalisePreferences({ riskProfile: "reckless" }).riskProfile, null);
});

test("client-supplied page context is shape-checked and malformed context is dropped", () => {
  assert.equal(normaliseContext({ pageType: "player", id: "nfl-athlete-1" }).id, "nfl-athlete-1");
  assert.equal(normaliseContext({ pageType: "player", id: "../../etc/passwd" }), null);
  assert.equal(normaliseContext({ pageType: "admin", id: "x" }), null);
  assert.equal(normaliseContext({ pageType: "lab", labQuery: "?mode=games" }).labQuery, "?mode=games");
  assert.equal(normaliseContext("not an object"), null);
});

test("a message list must end with a user turn, and an oversized message is refused", () => {
  assert.equal(normaliseMessages([{ role: "assistant", text: "hi" }]).code, ASK_ERROR.MALFORMED_REQUEST);
  assert.equal(normaliseMessages([{ role: "user", text: "x".repeat(ASK_BUDGET.maxUserMessageChars + 1) }]).code, ASK_ERROR.REQUEST_TOO_LARGE);
  assert.equal(normaliseMessages([{ role: "user", text: "hello" }]).ok, true);
});

test("the reducer drops assistant prose so a previous ANSWER can never become a source", () => {
  const state = reduceConversation({
    messages: [
      { role: "user", text: "how did the Mets do" },
      { role: "assistant", text: "The Mets scored 47 runs." },
      { role: "user", text: "and last week?" },
    ],
  });
  assert.deepEqual(state.history, ["how did the Mets do"]);
  assert.ok(!JSON.stringify(state).includes("47"), "a generated summary must not re-enter as evidence");
});

test("clearing a conversation clears the bankroll with it", () => {
  const cleared = clearedState();
  assert.equal(cleared.wagering.entertainmentBankroll, null);
  assert.equal(cleared.wagering.riskProfile, null);
  assert.deepEqual(cleared.resolvedEntities, []);
  assert.deepEqual(cleared.history, []);
});

test("two conversations cannot see each other's state", () => {
  const a = reduceConversation({ messages: [{ role: "user", text: "$500 high risk parlays" }] });
  const b = reduceConversation({ messages: [{ role: "user", text: "what is confidence" }] });
  assert.equal(a.wagering.entertainmentBankroll, 500);
  assert.equal(b.wagering.entertainmentBankroll, null, "no module-level state may carry a bankroll between turns");
  assert.equal(b.wagering.riskProfile, null);
});

/* ═══════════════════════════  9. PROVIDER SELECTION AND SECRETS  ═══════════════════════════ */

test("Ask requires exactly one secret and does not inherit the slip reader's database", () => {
  assert.deepEqual([...ASK_REQUIRED_ENV], ["ANTHROPIC_API_KEY"]);
  for (const name of ASK_REQUIRED_ENV) assert.ok(!name.startsWith("NEXT_PUBLIC"), "a secret must never be a NEXT_PUBLIC variable");
  assert.deepEqual(missingAskConfig({}), ["ANTHROPIC_API_KEY"]);
  assert.deepEqual(missingAskConfig({ ANTHROPIC_API_KEY: "x" }), []);
});

test("with no key configured Ask fails closed rather than answering from memory", () => {
  const r = selectProvider({});
  assert.equal(r.ok, false);
  assert.equal(r.code, ASK_ERROR.PROVIDER_NOT_CONFIGURED);
});

test("the fake provider is refused in production", () => {
  assert.equal(selectProvider({ ASK_MODEL_PROVIDER: "fake" }, { isProduction: true }).ok, false);
  assert.equal(selectProvider({ ASK_MODEL_PROVIDER: "fake" }, { isProduction: false }).ok, true);
  assert.equal(selectProvider({ ASK_MODEL_PROVIDER: "fake", VERCEL_ENV: "production" }).ok, false);
});

test("an unknown provider name is a configuration error, not a silent default", () => {
  assert.equal(selectProvider({ ASK_MODEL_PROVIDER: "openai", ANTHROPIC_API_KEY: "x" }).ok, false);
});

test("a provider failure carries the upstream STATUS and error TYPE, and never its message", async () => {
  /*
   * A canary that can only report "provider error" cannot tell a bad key (401 authentication_error)
   * from a wrong model (404 not_found_error) from a rate limit — which is the difference between a
   * five-second fix and an afternoon. The status is a number and the type is an enum from a closed
   * allowlist; the upstream MESSAGE never crosses, because an error body can echo request content.
   */
  const { createAnthropicProvider } = await import("./provider-anthropic.mjs");

  const fakeFetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { type: "authentication_error", message: "invalid x-api-key: sk-ant-SECRET-VALUE" } }),
  });
  const provider = createAnthropicProvider({ apiKey: "sk-ant-test", fetchImpl: fakeFetch });
  const r = await provider.plan({ system: "s", user: "u" });

  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.type, "authentication_error");
  const serialised = JSON.stringify(r);
  assert.ok(!serialised.includes("SECRET-VALUE"), "the upstream message must never cross the adapter");
  assert.ok(!serialised.includes("invalid x-api-key"), "the upstream message must never cross the adapter");
});

test("an unrecognised upstream error type is reported as such, not passed through", async () => {
  const { createAnthropicProvider } = await import("./provider-anthropic.mjs");
  const fakeFetch = async () => ({ ok: false, status: 418, json: async () => ({ error: { type: "<script>alert(1)</script>" } }) });
  const r = await createAnthropicProvider({ apiKey: "k", fetchImpl: fakeFetch }).plan({ system: "s", user: "u" });
  assert.equal(r.type, "unrecognised_error_type", "a value outside the allowlist must not be repeated");
});

test("redaction removes credential shapes from anything destined for a log", () => {
  const s = redact("failed with x-api-key: sk-ant-abcdefghijklmnop and Authorization: Bearer abcdefghijklmnopqrstuvwx");
  assert.ok(!s.includes("sk-ant-abcdefghijklmnop"));
  assert.ok(!s.includes("abcdefghijklmnopqrstuvwx"));
});

/* ═══════════════════════════  10. END TO END, OFFLINE  ═══════════════════════════ */

const engineDeps = (behaviour) => ({
  provider: createFakeProvider({ behaviour }),
  turn: fixtureLoader(),
  now: () => new Date("2026-09-17T21:00:00-04:00"),
  liveFetch: async (sport) => (sport === "mlb"
    ? { schemaVersion: 1, sport: "mlb", fetchedAt: "2026-09-18T01:00:00Z", events: [{ eventId: "1", state: "LIVE", away: { abbreviation: "NYM", score: 3 }, home: { abbreviation: "PHI", score: 2 } }] }
    : { schemaVersion: 1, unavailable: true, reason: "UNSUPPORTED_SPORT" }),
});

const ask = (text, behaviour = "route") => runAskTurn({ messages: [{ role: "user", text }] }, engineDeps(behaviour));

test("a site-help question is answered and verified", async () => {
  const r = await ask("Why can't I compare UFC fighters?");
  assert.equal(r.ok, true);
  assert.equal(r.verified, true);
  assert.equal(r.receipt.verifierStatus, "PASS");
});

test("a parlay request with no stated preference asks ONE question and calls no tool", async () => {
  const r = await ask("Give me the best parlays to place today");
  assert.equal(r.clarification, true);
  assert.equal(r.receipt.toolCalls.length, 0, "a clarification must not spend a tool call");
  assert.match(r.answer.answerMarkdown, /Low, Medium, High or Longshot/);
  assert.ok(!/how much|net worth|salary|income/i.test(r.answer.answerMarkdown), "never ask about financial capacity");
});

test("NFL live state is refused in reader-facing words, naming no tool and no error code", async () => {
  const r = await ask("What NFL games are live right now?");
  assert.equal(r.ok, true);
  assert.ok(r.receipt.toolStatuses.includes("UNSUPPORTED"));

  const md = r.answer.answerMarkdown;
  assert.match(md, /GameTimePicks does not currently hold/i, "the refusal must say the product does not hold it");
  assert.match(md, /\bNFL\b/, "the refusal must name what was asked for");
  /*
   * The internal vocabulary stays in the receipt. An earlier version of this evidence sentence read
   * "getLiveSlate could not answer: UNSUPPORTED_SPORT" — accurate, and a tool name plus an error code
   * in a chat bubble is not an answer.
   */
  assert.ok(!/getLiveSlate|UNSUPPORTED_SPORT|ASSET_UNAVAILABLE/.test(md), "no tool name or error code may reach the reader");
  assert.ok(r.receipt.toolStatuses.includes("UNSUPPORTED"), "the code still belongs in the receipt");
});

test("a writer that invents a number never reaches the reader", async () => {
  const r = await ask("Why can't I compare UFC fighters?", "writer-invents-number");
  assert.equal(r.verified, false);
  assert.equal(r.receipt.verifierStatus, "FAILED_DETERMINISTIC_FALLBACK");
  assert.ok(!r.answer.answerMarkdown.includes("47"), "the invented number must not be published");
});

test("a writer that guarantees, claims EV or chases a loss never reaches the reader", async () => {
  for (const behaviour of ["writer-guarantees", "writer-claims-ev", "writer-chases-loss"]) {
    const r = await ask("medium risk parlays today", behaviour);
    assert.equal(r.verified, false, `${behaviour} must be rejected`);
    assert.ok(!/guaranteed|expected value|win it back|double down/i.test(r.answer.answerMarkdown), `${behaviour} copy must not survive`);
  }
});

test("a planner that names a forbidden tool or argument produces no tool output", async () => {
  const unknown = await ask("show me the games", "unknown-tool");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, ASK_ERROR.UNKNOWN_TOOL);

  const forbidden = await ask("forecasts", "forbidden-arg");
  assert.ok(forbidden.receipt.toolStatuses.every((s) => s === "ERROR"));
});

test("a provider outage refuses cleanly and names no secret", async () => {
  const r = await ask("who won", "provider-error");
  assert.equal(r.ok, false);
  assert.equal(r.code, ASK_ERROR.PROVIDER_ERROR);
  assert.ok(!JSON.stringify(r).toLowerCase().includes("api"));
});

test("an aborted turn stops rather than completing", async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await runAskTurn({ messages: [{ role: "user", text: "anything" }] }, { ...engineDeps("route"), signal: controller.signal });
  assert.equal(r.ok, false);
  assert.equal(r.code, ASK_ERROR.PROVIDER_TIMEOUT);
});

test("every turn records the prompt, registry and provider versions", async () => {
  const r = await ask("Why can't I compare UFC fighters?");
  assert.equal(r.receipt.promptVersion, 2, "the prompt changed, so its version must have moved");
  assert.match(r.receipt.registry, /^v1\/14\/[0-9a-f]{8}$/);
  assert.equal(r.receipt.provider, "fake");
});

/* ═══════════════════════════  11. SHARDING  ═══════════════════════════ */

test("the Last-N shard is a pure function of the player id", () => {
  const a = recentShardOf("nfl-athlete-15818");
  assert.equal(a, recentShardOf("nfl-athlete-15818"), "the same id must always resolve to the same shard");
  assert.ok(Number.isInteger(a) && a >= 0 && a < 8);
  const spread = new Set(Array.from({ length: 200 }, (_, i) => recentShardOf(`nfl-athlete-${i}`)));
  assert.ok(spread.size >= 6, "the hash must actually spread ids across shards");
});
