/**
 * The UFC fight model may only reach a page while its own evaluation says PASS — PER HEAD.
 *
 * The failure this prevents is the one this repository keeps hitting: a model is demoted or fails a
 * bar, and a page keeps rendering its numbers because nothing mechanically connects the verdict to
 * the output. Here the evaluation carries one verdict per head, the card builder gates on each, and
 * this guard asserts they agree — so a future FAIL on any single head empties that head alone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(APP, p), "utf8"));
const EVAL = "public/data/ufc/fight-model-evaluation.json";
const CARD = "public/data/ufc/card-latest.json";
const have = () => fs.existsSync(path.join(APP, EVAL)) && fs.existsSync(path.join(APP, CARD));

test("each published head agrees with its own verdict", () => {
  if (!have()) return;
  const ev = read(EVAL), card = read(CARD);
  if (!card.bouts?.length) return;

  for (const [head, key] of [["winner", "winner"], ["method", "method"], ["rounds", "round"]]) {
    const published = (card.model?.publishes ?? []).includes(head);
    assert.equal(published, ev.verdicts[key] === "PASS",
      `card publishes ${head}=${published} while the evaluation verdict is ${ev.verdicts[key]}`);
  }

  for (const b of card.bouts) {
    if (!b.prediction) {
      assert.ok((b.unmodelledReason ?? "").length > 20, `${b.boutId}: a bout without a prediction must say why`);
      continue;
    }
    for (const [head, key] of [["winner", "winner"], ["method", "method"], ["rounds", "round"]]) {
      if (ev.verdicts[key] !== "PASS") {
        assert.equal(b.prediction[head], null, `${b.boutId}: ${head} failed its bar and must publish nothing`);
      }
    }
    if (b.prediction.winner) {
      const p = b.prediction.winner.probability;
      assert.ok(p >= 0.5 && p < 1, `${b.boutId}: the winner probability is stated for the PREDICTED side, so it cannot be below 0.5`);
      const sum = Object.values(b.prediction.winner.byFighter).reduce((s, v) => s + v, 0);
      assert.ok(Math.abs(sum - 1) < 0.01, `${b.boutId}: the two fighters' win probabilities must sum to 1`);
    }
    for (const dist of [b.prediction.method?.probabilities, b.prediction.rounds?.probabilities]) {
      if (!dist) continue;
      const sum = Object.values(dist).reduce((s, v) => s + v, 0);
      assert.ok(Math.abs(sum - 1) < 0.01, `${b.boutId}: a published distribution must sum to 1, got ${sum.toFixed(3)}`);
    }
  }
});

test("CORNER CANONICALISATION — the winner head is not reading the source's listing order", () => {
  if (!have()) return;
  const ev = read(EVAL);
  // The source lists the winner first in ~64% of rows. Corners are assigned alphabetically so the
  // label sits near 50%; if this drifts, the ordering is leaking and every win figure is an artifact.
  assert.ok(Math.abs(ev.cornerCanonicalisation.aWinRate - 0.5) <= 0.03,
    `canonical corner A wins ${(ev.cornerCanonicalisation.aWinRate * 100).toFixed(1)}% — the ordering leaks the result`);
  assert.match(ev.cornerCanonicalisation.rule, /alphabetical/i);

  // And the card builder must sort corners the same way the model was trained.
  const builder = fs.readFileSync(path.join(APP, "scripts/ufc/build-ufc-card.mjs"), "utf8");
  assert.match(builder, /\.sort\(\(x, y\) => x\.localeCompare\(y\)\)/,
    "the card must canonicalise corners exactly as training did, or every win probability inverts");
});

test("every fighter on the card carries an id-derived portrait", () => {
  if (!have()) return;
  const card = read(CARD);
  for (const b of card.bouts ?? []) {
    for (const f of [b.red, b.blue]) {
      assert.ok(f.athleteId, `${f.name}: a fighter must carry the athlete id the portrait resolves from`);
      assert.match(f.photoUrl ?? "", /headshots\/mma\/players\/full\/\d+\.png$/,
        `${f.name}: portrait URL is derived from the athlete id, never guessed from a name`);
    }
  }
});

test("the moneyline refusal stays stated in words", () => {
  if (!have()) return;
  const card = read(CARD);
  assert.ok((card.model?.notModelled?.moneyline ?? "").length > 40,
    "no sportsbook comparison is published, and the reason must be stated rather than left as a gap");
});
