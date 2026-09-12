import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { roundPhrase } from "./round-phrase.mjs";

test("the bucket carries the mass it holds, so the label can vary", () => {
  assert.equal(roundPhrase({ endsIn: "3+", probabilities: { round1: 0.321, round2: 0.166, round3plus: 0.513 } }), "round 3 or later (51%)");
  assert.equal(roundPhrase({ endsIn: "3+", probabilities: { round1: 0.088, round2: 0.101, round3plus: 0.811 } }), "round 3 or later (81%)");
  assert.equal(roundPhrase({ endsIn: "1", probabilities: { round1: 0.44, round2: 0.2, round3plus: 0.36 } }), "round 1 (44%)");
});

test("a missing distribution degrades to the bucket, never to an invented number", () => {
  assert.equal(roundPhrase({ endsIn: "2" }), "round 2");
  assert.equal(roundPhrase({ endsIn: "3+", probabilities: {} }), "round 3 or later");
  assert.equal(roundPhrase(null), null);
  assert.equal(roundPhrase({}), null);
});

test("LIVE · the published card's own numbers show why the bare bucket said nothing", () => {
  /* "3 or later" contains rounds 3, 4, 5 and every decision, so it cannot lose the argmax: on the
     2026-09-12 card it held 51%–81% on every bout and the label read the same eleven times. The
     mass is what varies, and it is now on the label. */
  const p = path.join(process.cwd(), "public", "data", "ufc", "card-latest.json");
  if (!fs.existsSync(p)) return;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  const found = [];
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      if (o.endsIn != null && o.probabilities) found.push(o);
      Object.values(o).forEach(walk);
    }
  };
  walk(doc);
  if (!found.length) return;
  const phrases = new Set(found.map((r) => roundPhrase(r)));
  const buckets = new Set(found.map((r) => r.endsIn));
  assert.ok(phrases.size > buckets.size, `the phrase must distinguish more than the bucket did (${buckets.size} buckets, ${phrases.size} phrases)`);
});
