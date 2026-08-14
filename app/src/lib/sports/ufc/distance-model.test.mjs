/**
 * The UFC distance model may only reach a page while its own evaluation says PASS.
 *
 * The failure this prevents is the one this repository keeps hitting: a model is demoted or fails a
 * bar, and a page keeps rendering its numbers because nothing mechanically connects the verdict to
 * the output. Here the artifact carries the verdict, the card builder gates on it, and this guard
 * asserts the two agree — so a future FAIL empties the card rather than needing someone to notice.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(APP, p), "utf8"));

test("the published card agrees with the model's own verdict", () => {
  const evalPath = "public/data/ufc/distance-model-evaluation.json";
  const cardPath = "public/data/ufc/card-latest.json";
  if (!fs.existsSync(path.join(APP, evalPath)) || !fs.existsSync(path.join(APP, cardPath))) return;
  const ev = read(evalPath);
  const card = read(cardPath);
  if (!card.bouts?.length) return;

  const publishes = (card.model?.publishes ?? []).includes("goes_the_distance");
  assert.equal(publishes, ev.verdict === "PASS",
    `the card publishes distance=${publishes} while the evaluation verdict is ${ev.verdict}`);
  assert.equal(card.model?.verdict, ev.verdict, "the card records the verdict it was built under");

  for (const b of card.bouts) {
    if (ev.verdict === "PASS") {
      assert.ok(b.distance && b.distance.probability > 0 && b.distance.probability < 1, `${b.boutId}: a published probability must be a real probability`);
      assert.ok(["MODELLED", "PRIOR_ONLY"].includes(b.distance.state), `${b.boutId}: every probability declares whether it is a read or the base rate`);
    } else {
      assert.equal(b.distance, null, `${b.boutId}: a FAILED model must publish no probability`);
    }
  }
});

test("method of victory and moneyline are refused IN WORDS, not merely absent", () => {
  const cardPath = "public/data/ufc/card-latest.json";
  if (!fs.existsSync(path.join(APP, cardPath))) return;
  const card = read(cardPath);
  if (!card.bouts?.length) return;
  for (const k of ["methodOfVictory", "moneyline"]) {
    assert.ok((card.model?.notModelled?.[k] ?? "").length > 40,
      `${k} must carry a stated reason, so its absence reads as a decision rather than an oversight`);
  }
  // The bias that makes method unmodellable must stay named — it is the whole reason for the refusal.
  assert.match(card.model.notModelled.methodOfVictory, /zero KOs/i,
    "the method refusal names the sample bias that causes it");
});

test("every fighter on the card carries an id-derived portrait", () => {
  const cardPath = "public/data/ufc/card-latest.json";
  if (!fs.existsSync(path.join(APP, cardPath))) return;
  const card = read(cardPath);
  for (const b of card.bouts ?? []) {
    for (const f of [b.red, b.blue]) {
      assert.ok(f.athleteId, `${f.name}: a fighter must carry the athlete id the portrait resolves from`);
      assert.match(f.photoUrl ?? "", /headshots\/mma\/players\/full\/\d+\.png$/, `${f.name}: portrait URL is derived from the athlete id, never guessed from a name`);
    }
  }
});
