/**
 * UFC BOUT STORY (P325) — one fight's read from the same bout object the card walkthrough reads; refused with the
 * artifact's own reason when the model did not read the bout; the same invariants the adapters test holds.
 * Run: npx tsx --test src/lib/simulate/presentation/ufc-bout.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildUfcBoutPresentation, buildUfcPresentation } from "./ufc.ts";
import { isPresentable } from "./types.ts";

const card = {
  generatedAt: "2026-09-14T14:27:00Z",
  event: { providerEventId: "401903500", name: "UFC Test Night", venue: "T-Arena", startUtc: "2026-09-19T22:00:00Z", slateDate: "2026-09-19" },
  model: { id: "ufc-model-v3", verdicts: { winner: "PASS", method: "PASS", round: "PASS" }, publishes: ["winner", "method", "rounds"], evidence: { winner: { accuracy: 0.66, baselineAccuracy: 0.6, n: 1200 } } },
  bouts: [
    { boutId: "b1", titleFight: true, weightClass: "Flyweight", scheduledRounds: 5, startUtc: "2026-09-20T02:00:00Z", red: { name: "Red Fighter", record: "20-3", priorBoutsInCorpus: 12 }, blue: { name: "Blue Fighter", record: "15-1", priorBoutsInCorpus: 9 },
      prediction: { winner: { name: "Blue Fighter", probability: 0.61, byFighter: { "Red Fighter": 0.39, "Blue Fighter": 0.61 } }, method: { most: "DEC", probabilities: { ko: 0.3, submission: 0.1, decision: 0.6 } }, rounds: { endsIn: "3+", probabilities: { round1: 0.2, round2: 0.15, round3plus: 0.65 }, goesTheDistance: 0.55 }, priorFights: { a: 12, b: 9 } } },
    { boutId: "b2", weightClass: "Lightweight", scheduledRounds: 3, red: { name: "Debut Guy", priorBoutsInCorpus: 0 }, blue: { name: "Vet", priorBoutsInCorpus: 8 }, prediction: null, unmodelledReason: "One fighter has no bouts in the corpus." },
  ],
};

test("a read bout gets its own story: outcome, method and rounds (only because the verdicts pass), limits, closing", () => {
  const m = buildUfcBoutPresentation(card.bouts[0], card);
  assert.ok(isPresentable(m));
  assert.deepEqual(m.chapters.map((c) => c.id), ["event", "outcome", "distribution", "margin", "limits", "closing"]);
  assert.equal(new Set(m.chapters.map((c) => c.id)).size, m.chapters.length);
  for (const c of m.chapters) { assert.ok(c.line.length > 10, `${c.id} has a sentence`); for (const b of c.bars) assert.ok(b.p >= 0 && b.p <= 1); }
  assert.match(m.chapters[1].line, /Blue Fighter is the model's side at 61%/);
  assert.equal(m.chapters.find((c) => c.kind === "distribution").axisCaption, "Finish type · model probability");
  assert.equal(m.reportHref, "/ufc/bout/b1/");
  assert.equal(m.readiness, "ready");
  assert.equal(m.provenance.runCount, null, "no run count is invented for a fight read");
});

test("method and rounds are withheld when the card's verdicts do not publish them", () => {
  const quiet = { ...card, model: { ...card.model, verdicts: { winner: "PASS", method: "FAIL", round: "FAIL" }, publishes: ["winner"] } };
  const m = buildUfcBoutPresentation(card.bouts[0], quiet);
  assert.deepEqual(m.chapters.map((c) => c.id), ["event", "outcome", "limits", "closing"]);
});

test("an unread bout is refused with the artifact's own reason; a missing card is refused too", () => {
  const m = buildUfcBoutPresentation(card.bouts[1], card);
  assert.equal(m.unavailable, true);
  assert.equal(m.reason, "One fighter has no bouts in the corpus.");
  assert.equal(buildUfcBoutPresentation(card.bouts[0], null).unavailable, true);
});

test("the bout story and the card story agree on the main event's numbers", () => {
  const bout = buildUfcBoutPresentation(card.bouts[0], card);
  const cardStory = buildUfcPresentation(card);
  const a = bout.chapters.find((c) => c.kind === "outcome").bars;
  const b = cardStory.chapters.find((c) => c.kind === "outcome").bars;
  assert.deepEqual(a, b);
});
