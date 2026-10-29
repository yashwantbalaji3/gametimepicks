/**
 * The pre-fight receipt for all three UFC heads.
 *
 * Run: npx tsx --test src/lib/sports/ufc/prefight-heads.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildPreFightHeads, finishIndexFromCorpus, gradePreFightHeads } from "./prefight-heads.mjs";
import { boutKey } from "./model-vs-market.mjs";

const bout = (id, red, blue, prediction) => ({ boutId: id, red: { name: red }, blue: { name: blue }, scheduledRounds: 3, prediction });
const full = {
  winner: { name: "Ana Bé", probability: 0.62, byFighter: { "Ana Bé": 0.62, "Cy Dee": 0.38 } },
  method: { most: "DEC", probabilities: { ko: 0.3, submission: 0.2, decision: 0.5 } },
  rounds: { endsIn: "3+", probabilities: { round1: 0.2, round2: 0.15, round3plus: 0.65 }, goesTheDistance: 0.5 },
  basis: "BOTH_FIGHTERS",
};
const card = (bouts, start = "2026-10-31T21:00Z") => ({
  generatedAt: "2026-10-29T17:10:30Z",
  event: { providerEventId: "1", name: "UFC Test", slateDate: "2026-10-31", startUtc: start },
  model: { id: "ufc-fight-model@test", verdicts: { winner: "PASS", method: "PASS", round: "PASS" } },
  bouts,
});

test("freezes method and round for every read bout, priced or not, and copies the published numbers unchanged", () => {
  const { rows, skipped } = buildPreFightHeads({
    card: card([bout("11", "Ana Bé", "Cy Dee", full), bout("12", "Ed Eff", "Gi Ho", null)]),
    capturedAt: "2026-10-30T12:00:00Z",
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(skipped, [{ boutId: "12", reason: "the model published no read for this bout" }]);
  const r = rows[0];
  assert.equal(r.boutId, boutKey("2026-10-31", "Ana Bé", "Cy Dee"), "same folded, date-qualified key as the winner snapshot");
  assert.equal(r.providerBoutId, "11");
  assert.deepEqual(r.method, { ko: 0.3, submission: 0.2, decision: 0.5 });
  assert.deepEqual(r.rounds, { round1: 0.2, round2: 0.15, round3plus: 0.65 });
  assert.equal(r.goesTheDistance, 0.5);
  assert.equal(r.winner.probability, 0.62);
  assert.equal(r.modelId, "ufc-fight-model@test");
  assert.deepEqual(r.coherence, { methodSumsToOne: true, roundsSumToOne: true, round3plusCoversDecision: true, goesTheDistanceIsDecision: true });
});

test("refuses at or after the card start: a frozen row can never have seen a result", () => {
  const c = card([bout("11", "Ana Bé", "Cy Dee", full)]);
  assert.equal(buildPreFightHeads({ card: c, capturedAt: "2026-10-31T21:00:00Z" }).rows.length, 0);
  assert.equal(buildPreFightHeads({ card: c, capturedAt: "2026-11-01T01:00:00Z" }).rows.length, 0);
  assert.equal(buildPreFightHeads({ card: c, capturedAt: "not a time" }).rows.length, 0);
  assert.equal(buildPreFightHeads({ card: { ...c, event: { ...c.event, startUtc: null } }, capturedAt: "2026-10-30T00:00:00Z" }).rows.length, 0);
});

test("flags incoherent published heads instead of hiding them", () => {
  const bad = { ...full, rounds: { endsIn: "1", probabilities: { round1: 0.5, round2: 0.2, round3plus: 0.3 }, goesTheDistance: 0.45 } };
  const { rows } = buildPreFightHeads({ card: card([bout("11", "Ana Bé", "Cy Dee", bad)]), capturedAt: "2026-10-30T00:00:00Z" });
  assert.equal(rows[0].coherence.round3plusCoversDecision, false, "P(3+) 0.30 < P(decision) 0.50 is impossible");
  assert.equal(rows[0].coherence.goesTheDistanceIsDecision, false, "0.45 is not the method head's 0.50");
});

test("a head the card withheld stays null rather than being filled in", () => {
  const winnerOnly = { winner: full.winner, method: null, rounds: null };
  const { rows } = buildPreFightHeads({ card: card([bout("11", "Ana Bé", "Cy Dee", winnerOnly)]), capturedAt: "2026-10-30T00:00:00Z" });
  assert.equal(rows[0].method, null);
  assert.equal(rows[0].rounds, null);
  assert.equal(rows[0].goesTheDistance, null);
  assert.equal(rows[0].coherence.round3plusCoversDecision, null);
});

test("grades method, round and distance once a result exists; pending is never a miss; draws are void", () => {
  const { rows } = buildPreFightHeads({
    card: card([bout("11", "Ana Bé", "Cy Dee", full), bout("13", "Jo Ka", "Lu Mo", full), bout("14", "No Pa", "Qu Ra", full)]),
    capturedAt: "2026-10-30T00:00:00Z",
  });
  const finishes = finishIndexFromCorpus({ results: [
    { eventDate: "2026-10-31", fighterA: "Cy Dee", fighterB: "Ana Be", winner: "Ana Be", method: "ko_tko", round: 1, resultStatus: "final" },
    { eventDate: "2026-10-31", fighterA: "Jo Ka", fighterB: "Lu Mo", winner: null, method: "decision", round: 3, resultStatus: "draw" },
  ] });
  const { graded, pending, voided } = gradePreFightHeads(rows, finishes);
  assert.equal(graded.length, 1);
  assert.deepEqual(pending, [boutKey("2026-10-31", "No Pa", "Qu Ra")]);
  assert.equal(voided.length, 1);
  const g = graded[0];
  assert.deepEqual(g.observed, { method: "ko", roundClass: "round1", round: 1, wentTheDistance: false });
  assert.ok(Math.abs(g.method.logLoss - -Math.log(0.3)) < 1e-6);
  assert.ok(Math.abs(g.rounds.logLoss - -Math.log(0.2)) < 1e-6);
  assert.equal(g.method.topClassHit, false);
  assert.ok(Math.abs(g.goesTheDistance.brier - 0.25) < 1e-6);
});

test("the committed card's published heads are coherent (P(3+) covers P(decision), distance = decision)", () => {
  const p = path.join(process.cwd(), "public/data/ufc/card-latest.json");
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!c?.event?.startUtc) return; // no card in the window: nothing published to check
  const before = new Date(Date.parse(c.event.startUtc) - 60_000).toISOString();
  const { rows } = buildPreFightHeads({ card: c, capturedAt: before });
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.coherence)) assert.notEqual(v, false, `${r.boutId} ${k}`);
  }
});
