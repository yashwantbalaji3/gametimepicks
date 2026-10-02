/**
 * Session 9 · G — Ask explains NFL product eligibility from the PUBLIC family-gate record, never from a
 * hardcoded sentence: every reason is a blocker the record carries, with its evidence and what clears it,
 * and when a blocker clears upstream the answer changes with no Ask edit.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { makeExecutor } from "./executor.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { buildEvidence } from "./evidence.mjs";
import { createFakeProvider } from "./provider-fake.mjs";
import { FORBIDDEN_ASK_FIELDS } from "./contract.mjs";
import { buildPublicFamilyEligibility, PUBLIC_BLOCKER } from "../products/engine-v2/nfl-family-eligibility-public.mjs";

const NOW = () => new Date("2026-10-02T18:00:00Z");
const GATES = [
  { family: "anytime_td", state: "GATED", blockers: ["MODEL_FORWARD_ACCUMULATING", "ROLE_CONFIRMATION_UNAVAILABLE", "PRICES_NOT_CAPTURED", "SETTLEMENT_NOT_PROVEN", "NO_FOUNDER_GRANT"],
    evidence: { forward: { state: "ACCUMULATING", n: 524, needed: 1000, metrics: { level: 1.1823, ece: 0.0431 } }, slate: { candidates: 288, modelProbability: 288, roleConfirmed: 0, priced: 0, settlementProven: false } } },
  { family: "player_pass_yds", state: "GATED", publicationState: "ESTIMATE_BELOW_BAR", blockers: ["FAMILY_NOT_PUBLISHED", "NO_MODEL_PROBABILITY", "MODEL_FORWARD_ACCUMULATING", "ROLE_CONFIRMATION_UNAVAILABLE", "PRICES_NOT_CAPTURED", "SETTLEMENT_NOT_PROVEN", "NO_FOUNDER_GRANT"],
    evidence: { forward: { state: "ACCUMULATING", n: 66, needed: 300, metrics: { level: 1.0133, ece: 0.1077 } }, slate: { candidates: 27, modelProbability: 0, roleConfirmed: 0, priced: 0, settlementProven: false } } },
];
const pub = (gates) => buildPublicFamilyEligibility({ gates, generatedAt: "2026-10-02T18:00:00Z", sportState: "EXPERIMENTAL_PUBLIC", slate: { from: "2026-10-04", to: "2026-10-05", events: 15 } });
const projection = (doc) => ({ schemaVersion: 1, artifact: "ask-nfl-eligibility", available: true, generatedAt: doc.generatedAt, slate: doc.slate, sport: doc.sport, products: doc.products, families: doc.families });
const run = async (doc, args = {}) => {
  const ex = makeExecutor({ turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/nfl-eligibility.json": doc })).beginTurn(), now: NOW });
  const r = await ex.run({ id: "c1", name: "getNflProductEligibility", arguments: args });
  return { r, text: buildEvidence(ex.evidence).facts.map((f) => f.text).join("\n") };
};

test("why isn't NFL in Bank Builder: every product, every family, every blocker — with evidence and what clears it", async () => {
  const { r, text } = await run(projection(pub(GATES)));
  assert.equal(r.status, "OK");
  assert.match(text, /Bank Builder: NFL is not eligible on the NFL slate 2026-10-04 to 2026-10-05 \(15 games\)/);
  assert.match(text, /Suggested Parlays: NFL is not eligible/);
  assert.match(text, /NFL Anytime touchdown: not eligible for official products; GameTimePicks publishes a model probability/);
  assert.match(text, /NFL Passing yards: not eligible .* publishes no model probability/);
  assert.match(text, /no player's game-day role is positively confirmed/);
  assert.match(text, /no real pre-kickoff sportsbook price is held/);
  assert.match(text, /not yet been graded end to end through the automatic settlement path/);
  assert.match(text, /forward test: 524 of 1000 predictions graded so far, calibration level 1\.182, calibration error 0\.043/);
  assert.match(text, /288 candidate legs, 288 with a model probability, 0 with a confirmed role, 0 with a pregame price; settlement not yet proven/);
  assert.match(text, /this clears when real sportsbook prices are captured before kickoff/);
});

test("a blocker that clears upstream disappears from the answer — nothing is hardcoded", async () => {
  const cleared = GATES.map((g) => (g.family === "anytime_td" ? { ...g, blockers: g.blockers.filter((b) => b !== "SETTLEMENT_NOT_PROVEN"), evidence: { ...g.evidence, slate: { ...g.evidence.slate, settlementProven: true } } } : g));
  const { text } = await run(projection(pub(cleared)), { family: "anytime_td" });
  assert.doesNotMatch(text, /Anytime touchdown — this market has not yet been graded end to end/);
  assert.match(text, /settlement proven/);
  assert.match(text, /Anytime touchdown — no real pre-kickoff sportsbook price is held/, "the other blockers remain");
});

test("an unpublished record and an unknown market are said as such, never guessed", async () => {
  const none = await run({ schemaVersion: 1, artifact: "ask-nfl-eligibility", available: false, families: [] });
  assert.equal(none.r.status, "UNSUPPORTED");
  const bad = await run(projection(pub(GATES)), { family: "kicking_points" });
  assert.notEqual(bad.r.status, "OK");
});

test("the public record and its Ask projection carry no refused word (founder / estimate / internal …)", () => {
  const all = JSON.stringify(projection(pub(GATES))).toLowerCase() + JSON.stringify(Object.values(PUBLIC_BLOCKER)).toLowerCase(); // the values ship; the internal keys never do
  for (const w of FORBIDDEN_ASK_FIELDS) assert.ok(!all.includes(w.toLowerCase()), `refused word "${w}" in the public NFL eligibility record`);
  const committed = path.join(process.cwd(), "public/data/nfl/family-eligibility.json");
  if (fs.existsSync(committed)) {
    const raw = fs.readFileSync(committed, "utf8").toLowerCase();
    for (const w of FORBIDDEN_ASK_FIELDS) assert.ok(!raw.includes(w.toLowerCase()), `refused word "${w}" in ${committed}`);
  }
});

test("the seven NFL-eligibility questions route to getNflProductEligibility, not to today's cards or site help", async () => {
  const provider = createFakeProvider();
  const plan = async (q) => JSON.parse((await provider.plan({ user: `QUESTION: ${q}` })).text);
  for (const q of [
    "Why isn't NFL in today's Bank Builder?", "Why isn't NFL in Suggested Parlays?", "Which NFL families have model probabilities?",
    "What is blocking Anytime TD?", "Are NFL prop prices current?", "Is NFL settlement proven?", "What would need to happen before NFL becomes eligible?",
  ]) {
    const p = await plan(q);
    assert.equal(p.calls.at(-1).name, "getNflProductEligibility", q);
  }
  assert.equal((await plan("What is blocking Anytime TD?")).calls.at(-1).arguments.family, "anytime_td");
  assert.equal((await plan("What is today's Bank Builder?")).calls.at(-1).name, "getOfficialProductCards", "today's card is still the cards tool");
});
