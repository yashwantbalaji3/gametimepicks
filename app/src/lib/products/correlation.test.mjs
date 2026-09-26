/**
 * THE CORRELATION TAXONOMY (§15, step 3) — and the number this module refuses to produce.
 *
 * §15: "If exact correlation cannot be measured, constrain/refuse rather than invent precise joint
 * probability." So the tests below assert two things in equal measure: that the dependence this
 * repository CAN see is seen, and that nothing anywhere turns it into a coefficient.
 *
 * Run: cd app && npx tsx --test src/lib/products/correlation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeRecommendationReceipt, PROBABILITY_BASIS as B } from "./recommendation-receipt.mjs";
import {
  CORRELATION_KIND as K, DEPENDENCE, DETECTABLE,
  correlationBetween, constrainCard,
} from "./correlation.mjs";

const r = (o = {}) => makeRecommendationReceipt({
  sport: "nfl", eventId: "401872960", participantId: "p1", participantName: "A Player",
  team: "BAL", opponent: "DAL", marketFamily: "player_reception_yds",
  sportsbook: "draftkings", line: 58.5, price: -113,
  probabilityBasis: B.MODEL_VALIDATED, modelProbability: 0.55,
  availabilityState: "ACTIVE_CONFIRMED", roleState: "STARTER", ...o,
});

/* ── the number that must not exist ─────────────────────────────────────────────────────────── */

test("🔴 §15 · there is NO joint probability and NO correlation coefficient anywhere", () => {
  /*
   * A label cannot be multiplied; a ρ can. The moment a coefficient exists some caller multiplies
   * by it and the card acquires a joint probability nobody measured. This repository has never
   * measured one.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/products/correlation.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const banned of [/jointProbability/, /\bcoefficient\b/i, /\brho\b/, /\bcorrelationValue\b/]) {
    assert.equal(banned.test(code), false, `a quantity named by ${banned} must not exist`);
  }
  // And nothing multiplies two probabilities together.
  assert.equal(/modelProbability\s*\*/.test(code), false, "no path may multiply marginals");
  /* The answer carries labels. The ONLY number in it is the schema version — anything else numeric
     would be a magnitude, and a magnitude is the thing §15 says not to invent. */
  const out = correlationBetween(r(), r({ participantId: "p2" }));
  for (const [k, v] of Object.entries(out)) {
    if (k === "schemaVersion") continue;
    assert.notEqual(typeof v, "number", `${k} is a magnitude, and this module states no magnitudes`);
  }
  assert.equal(typeof out.dependence, "string", "dependence is a label");
});

/* ── what can actually be seen ──────────────────────────────────────────────────────────────── */

test("§15 · the same participant in two markets is DETERMINISTIC, not merely strong", () => {
  /*
   * "Over 60 receiving yards" and "over 4 receptions" for one player are two readings of one
   * afternoon. STRONG invites a caller to shade a joint down a little; DETERMINISTIC says the
   * shared cause IS the outcome.
   */
  const c = correlationBetween(r(), r({ marketFamily: "player_receptions" }));
  assert.ok(c.kinds.includes(K.SAME_PARTICIPANT));
  assert.equal(c.dependence, DEPENDENCE.DETERMINISTIC);
});

test("§15 · same team, opposing participants, same event, cross-sport and cross-event all fire", () => {
  assert.ok(correlationBetween(r(), r({ participantId: "p2" })).kinds.includes(K.SAME_TEAM));
  assert.ok(correlationBetween(r(), r({ participantId: "p2" })).kinds.includes(K.SAME_EVENT));

  const opposed = correlationBetween(r(), r({ participantId: "p2", team: "DAL", opponent: "BAL" }));
  assert.ok(opposed.kinds.includes(K.OPPOSING_PARTICIPANTS));

  const other = correlationBetween(r(), r({ sport: "ufc", eventId: "600061266", participantId: "f1", team: null, opponent: null }));
  assert.ok(other.kinds.includes(K.CROSS_SPORT));
  assert.ok(other.kinds.includes(K.CROSS_EVENT));
});

test("opponents are two sides of the SAME event, not two players who face each other's clubs", () => {
  /* Different fixtures, same club names — not opposed. */
  const elsewhere = correlationBetween(r(), r({ eventId: "401872961", participantId: "p2", team: "DAL", opponent: "BAL" }));
  assert.equal(elsewhere.kinds.includes(K.OPPOSING_PARTICIPANTS), false);
  assert.ok(elsewhere.kinds.includes(K.CROSS_EVENT));
});

test("🔴 every DETECTABLE claim is backed by a detector that actually fires", () => {
  /*
   * ⚠ THE DEFECT THIS PINS, and I wrote it. `DETECTABLE` said SAME_TEAM and OPPOSING_PARTICIPANTS
   * were detectable while the receipt carried neither `team` nor `opponent`, so both detectors
   * could never fire. Both fields were already in every optimizer leg; the receipt was dropping
   * them — the same narrowing-projection defect as the discarded probabilities.
   */
  const firing = new Set([
    ...correlationBetween(r(), r({ marketFamily: "x" })).kinds,
    ...correlationBetween(r(), r({ participantId: "p2" })).kinds,
    ...correlationBetween(r(), r({ participantId: "p2", team: "DAL", opponent: "BAL" })).kinds,
    ...correlationBetween(r(), r({ sport: "ufc", eventId: "E9", participantId: "f1", team: null, opponent: null })).kinds,
  ]);
  for (const [kind, claimed] of Object.entries(DETECTABLE)) {
    if (claimed) assert.ok(firing.has(kind), `${kind} is claimed detectable and no case makes it fire`);
  }
});

test("🔴 NONE_OBSERVED is not independence, and the undetectable kinds are always named", () => {
  const c = correlationBetween(
    r({ sport: "mlb", eventId: "822678", participantId: "m1", team: null, opponent: null }),
    r({ sport: "mlb", eventId: "822678", participantId: "m1", team: null, opponent: null }),
  );
  // Even a pair with nothing detectable must carry the list of what was never checked.
  const any = correlationBetween(r({ team: null, opponent: null, eventId: "A" }),
                                 r({ team: null, opponent: null, eventId: "A", participantId: "z" }));
  assert.ok(Array.isArray(any.undetectable) && any.undetectable.length > 0,
    "a pair must never be reported without the kinds nobody checked");
  for (const kind of [K.GAME_SCRIPT, K.ENVIRONMENT, K.AVAILABILITY]) {
    assert.ok(any.undetectable.includes(kind), `${kind} is real and unmeasured — it must be named`);
    assert.equal(DETECTABLE[kind], false);
  }
  assert.ok(c);
});

/* ── constraints, and the refusal ───────────────────────────────────────────────────────────── */

test("§15 · a card that breaks a constraint is refused with EVERY violation", () => {
  const card = [r(), r({ marketFamily: "player_receptions" }), r({ participantId: "p2" }), r({ participantId: "p3" })];
  const out = constrainCard(card, { maxPerParticipant: 1, maxPerEvent: 2, maxPerTeam: 2 });
  assert.equal(out.allowed, false);
  const kinds = out.violations.map((v) => v.kind);
  assert.ok(kinds.includes(K.SAME_PARTICIPANT), "p1 appears twice");
  assert.ok(kinds.includes(K.SAME_EVENT), "four legs from one game");
  assert.ok(kinds.includes(K.SAME_TEAM), "four legs from one club");
  for (const v of out.violations) assert.ok(v.count > v.limit, "a violation must state the count it exceeded");
});

test("§15 · a card within its constraints is allowed — and still says what was never checked", () => {
  const card = [r(), r({ eventId: "401872961", participantId: "p9", team: "NYJ", opponent: "DET" })];
  const out = constrainCard(card, { maxPerParticipant: 1, maxPerEvent: 1, maxPerTeam: 1 });
  assert.equal(out.allowed, true);
  assert.deepEqual(out.violations, []);
  /* ⚠ A silent pass would read as "this card is uncorrelated". It has not been shown to be free of
     game-script, weather or lineup dependence, none of which is detectable from a receipt. */
  for (const kind of [K.GAME_SCRIPT, K.ENVIRONMENT, K.AVAILABILITY]) {
    assert.ok(out.unconstrained.includes(kind), `${kind} must be named even on an allowed card`);
  }
});

test("§15 · cross-sport can be forbidden, and an empty card is trivially allowed", () => {
  const mixed = [r(), r({ sport: "ufc", eventId: "E9", participantId: "f1", team: null, opponent: null })];
  assert.equal(constrainCard(mixed, { allowCrossSport: false }).allowed, false);
  assert.equal(constrainCard(mixed, { allowCrossSport: true, maxPerEvent: 1, maxPerTeam: 1 }).allowed, true);
  assert.equal(constrainCard([], {}).allowed, true, "NO QUALIFYING PARLAY TODAY is a valid answer");
});

test("this module never selects and never scores — enforced by absence", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/products/correlation.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const banned of [/function select/, /\.sort\(/, /bestCard/, /rank/i]) {
    assert.equal(banned.test(code), false, `selection (${banned}) belongs to a product, not to this`);
  }
});
