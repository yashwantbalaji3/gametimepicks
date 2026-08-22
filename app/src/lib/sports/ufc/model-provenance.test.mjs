/**
 * A VERDICT MUST VOUCH FOR THE CODE THAT IS RUNNING.
 *
 * Run: npx tsx --test src/lib/sports/ufc/model-provenance.test.mjs
 *
 * /ufc publishes PASS verdicts and held-out metrics beside every bout prediction. Those verdicts came
 * from an evaluation of lib/fight-model.mjs — and on 2026-08-17 that library was changed EIGHTEEN
 * MINUTES after the evaluation was last written, then never re-evaluated. For four days the verdicts
 * described one model and the predictions came from another.
 *
 * Re-running moved the winner head's gain from 0.0147 to 0.0317 on the same 8,642 fights. It
 * improved, which is luck. The same silence would have concealed a regression exactly as well, and
 * the page would have carried a PASS for code that could no longer earn one.
 *
 * A stale evaluation is not a smaller claim than a wrong one. It is a claim about something that no
 * longer exists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const APP = process.cwd();
const evaluation = (() => { try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/fight-model-evaluation.json"), "utf8")); } catch { return null; } })();
const card = (() => { try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/card-latest.json"), "utf8")); } catch { return null; } })();
const LIB = path.join(APP, "scripts/ufc/lib/fight-model.mjs");

test("LIVE · the committed evaluation vouches for the library actually on disk", () => {
  if (!evaluation) return;
  const current = createHash("sha256").update(fs.readFileSync(LIB, "utf8")).digest("hex").slice(0, 16);
  assert.equal(
    evaluation.sourceHash, current,
    "the evaluation was computed from different code than is running — re-run scripts/ufc/evaluate-ufc-fight-model.mjs",
  );
});

test("the card builder REFUSES rather than publishing against a stale evaluation", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/ufc/build-ufc-card.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(code, /evaluation\.sourceHash !== currentHash/, "the mismatch must be checked");
  assert.match(code, /process\.exit\(1\)/, "and must stop the run, not warn");
  // The refusal has to name the remedy. A refusal nobody can act on gets bypassed.
  assert.match(src, /Re-run: node scripts\/ufc\/evaluate-ufc-fight-model\.mjs/);
});

test("the published model id is DERIVED, never a literal", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/ufc/build-ufc-card.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // It was the literal "ufc-fight-v1", which would have said v1 however far the model drifted.
  assert.doesNotMatch(code, /id:\s*"ufc-fight-v1"/, "a hand-typed version does not change when the model does");
  assert.match(code, /id: evaluation\.modelId/);
  if (card?.model) assert.match(card.model.id, /^ufc-fight-model@[0-9a-f]{12}$/, "the card must carry a fingerprinted id");
});

test("the id changes when the model's DEFINITION changes", async () => {
  const { modelId } = await import("../../../../scripts/ufc/lib/fight-model.mjs");
  const a = modelId({ winnerGain: 0.005, winnerAccuracy: 0.52, methodGain: 0.005, roundGain: 0.005, calibrationZ: 2 });
  const b = modelId({ winnerGain: 0.01, winnerAccuracy: 0.52, methodGain: 0.005, roundGain: 0.005, calibrationZ: 2 });
  assert.notEqual(a, b, "moving a bar must produce a different model id");
  assert.equal(a, modelId({ winnerGain: 0.005, winnerAccuracy: 0.52, methodGain: 0.005, roundGain: 0.005, calibrationZ: 2 }), "and the same definition must be stable");
});

test("SOURCE HASH AND MODEL ID CATCH DIFFERENT THINGS — both are needed", () => {
  /*
   * The change that caused this was a NaN fix. It altered behaviour without touching a feature set or
   * a bar, so the definition fingerprint would not have moved. Hashing the library's own bytes is
   * what catches it; fingerprinting the definition is what survives a refit on a longer corpus
   * without churning. Neither is sufficient alone.
   */
  if (!evaluation) return;
  assert.ok(/^[0-9a-f]{16}$/.test(evaluation.sourceHash ?? ""), "the source hash must be recorded");
  assert.ok(/^ufc-fight-model@[0-9a-f]{12}$/.test(evaluation.modelId ?? ""), "the definition fingerprint must be recorded");
  assert.notEqual(evaluation.sourceHash, evaluation.modelId, "they are different instruments answering different questions");
});

test("every ladder leg names the model that chose it", () => {
  const ladder = (() => { try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data/parlays/risk-ladder-ufc/latest.json"), "utf8")); } catch { return null; } })();
  if (!ladder?.cards?.length) return;
  // A settled leg that cannot name its model cannot contribute to any track record, because nobody
  // can say what the record is of.
  for (const c of ladder.cards) {
    for (const l of c.legs ?? []) {
      assert.match(String(l.modelId ?? ""), /^ufc-fight-model@/, `${l.player}: a leg must name its model`);
    }
  }
});

test("the deployed model has a model card, and it is not the superseded Elo's", () => {
  const p = path.join(APP, "..", "data/internal/research/ufc/model-card-fight-v1.json");
  if (!fs.existsSync(p)) assert.fail("the deployed model must have a model card");
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  // Both pre-existing cards described ufc-model-v1-abstaining-elo — a model no reader was shown.
  assert.equal(c.supersedes, "ufc-model-v1-abstaining-elo");
  if (evaluation) assert.equal(c.modelId, evaluation.modelId, "the card must describe the deployed model");
  // Derived, never authored: a hand-copied metric is how a card comes to flatter its model.
  if (evaluation?.heads?.winner) assert.equal(c.heads.winner.gain, evaluation.heads.winner.gain);
  assert.ok(c.limitations.length >= 4, "a model card without limitations is advertising");
  assert.ok(c.limitations.some((l) => /no-vig|against a price/i.test(l)), "it must state it has never been scored against a price");
});
