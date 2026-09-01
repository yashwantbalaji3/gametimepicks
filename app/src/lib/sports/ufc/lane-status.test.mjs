/**
 * The UFC lane-status artifact — the product-state contract for this sport.
 *
 * Run: npx tsx --test src/lib/sports/ufc/lane-status.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const ARTIFACT = path.join(APP, "public/data/admin/ufc-lane.json");
const lane = fs.existsSync(ARTIFACT) ? JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) : null;

test("the builder is wired into scheduled automation AND its commit allowlist", () => {
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/ufc-fight-week.yml"), "utf8");
  assert.match(wf, /build-ufc-lane-status\.mjs/, "the products stage wants SCHEDULED automation");
  assert.match(wf, /git add[\s\S]{0,400}app\/public\/data\/admin\/ufc-lane\.json/, "generated-and-never-committed is the 62-hour-outage shape");
  // And the ladder itself, which was in no workflow at all until tonight.
  assert.match(wf, /build-ufc-ladder\.mjs/);
  assert.match(wf, /git add[\s\S]{0,400}risk-ladder-ufc/);
});

test("INTERNAL_ADMIN, and never in the public export", () => {
  if (lane) assert.equal(lane.dataClass, "INTERNAL_ADMIN");
  assert.equal(fs.existsSync(path.join(APP, "out/data/admin/ufc-lane.json")), false);
});

test("THE LADDER ON THE PAGE MUST BELONG TO THE CARD ON THE PAGE", () => {
  if (!lane) return;
  /*
   * The whole three-dates defect in one field. A ladder written 2026-08-18 for an event on
   * 2026-08-22 was served through a latest.json fallback and published under 2026-08-21, and no
   * surface anywhere said which fights the prices belonged to.
   */
  /*
   * P224: the state set gained NO_CARDS_FOR_THIS_CARD. The lane used to call ANY same-dated ladder
   * "PUBLISHED_FOR_THIS_CARD" and then report `carded: 0, selection: null` beside it — a state named
   * for publication, asserting a ladder that does not exist. The producer had already fail-closed
   * (`state: "NO_PRICES"`, "no price capture for this card"); the summary discarded that answer.
   */
  assert.ok(["PUBLISHED_FOR_THIS_CARD", "NO_CARDS_FOR_THIS_CARD", "STALE_FOR_A_DIFFERENT_CARD", "UNKNOWN"].includes(lane.cards.state));
  if (lane.cards.state === "PUBLISHED_FOR_THIS_CARD") {
    assert.equal(lane.cards.date, lane.nextCard.slateDate, "a ladder for this card must carry this card's date");
    assert.ok(lane.cards.carded > 0, "a PUBLISHED state must have an actually published card behind it");
    assert.ok(lane.cards.selection?.length > 0, "and must state how it selected its sides");
  }
  if (lane.cards.state === "NO_CARDS_FOR_THIS_CARD") {
    assert.equal(lane.cards.date, lane.nextCard.slateDate, "an empty ladder still belongs to this card");
    assert.equal(lane.cards.carded, 0);
    assert.ok(lane.cards.detail?.length > 0, "and it names WHY nothing was carded");
    assert.ok(lane.cards.ladderState, "carrying the producer's own verdict rather than replacing it");
  }
});

test("IT REPORTS WHETHER THE SETTLER CAN GRADE THIS SPORT AT ALL", () => {
  if (!lane) return;
  /*
   * UFC published cards for four days that could never have been graded: the settler read only MLB's
   * ladder directory, and its results index matched fighter names across a 126-event corpus with no
   * date check. Both are now conditions on the artifact rather than assumptions.
   */
  assert.equal(lane.settlementReach.state, "IN_SCOPE", "cards must not publish into a lane the settler cannot reach");
  assert.equal(lane.settlementReach.readsUfcLadder, true);
  assert.equal(lane.settlementReach.constrainedToCardDate, true, "results must be confined to the card's own event date");
});

test("ABSENT is UNKNOWN, never a confident zero", () => {
  if (!lane) return;
  for (const [name, block] of Object.entries(lane.freshness ?? {})) {
    assert.ok(block.state === "READ" || block.state === "UNKNOWN", `${name}: unexpected ${block.state}`);
    if (block.state === "UNKNOWN") assert.ok(block.detail?.length > 0, `${name}: UNKNOWN must say why`);
    else assert.ok(Number.isFinite(block.ageHours));
  }
});

test("every blocker says WHOSE MOVE it is", () => {
  if (!lane) return;
  const STATES = new Set(["REALITY_GATED", "FOUNDER_ACTION", "ENGINEERING"]);
  for (const b of lane.blockers) {
    assert.ok(STATES.has(b.state), `${b.id}: unknown state ${b.state}`);
    assert.ok(b.detail?.length > 0, `${b.id}: a blocker with no detail cannot be acted on`);
  }
  // Calibration cannot be engineered forward — cards have to be fought. Filing it as work would put
  // it on a board where it would sit failing indefinitely.
  const cal = lane.blockers.find((b) => b.id === "calibration-sample");
  if (cal) assert.equal(cal.state, "REALITY_GATED");
});

test("the gate block agrees with the registry rather than restating it", () => {
  if (!lane) return;
  assert.equal(lane.gate.of, 12);
  assert.equal(lane.gate.proven + lane.gate.remaining.length, lane.gate.of, "every stage is either proven or remaining");
  for (const r of lane.gate.remaining) assert.ok(r.requiredProof?.length > 0, `${r.stage} must state what would prove it`);
});
