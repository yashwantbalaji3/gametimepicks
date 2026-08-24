/**
 * CLAIMS CONTRACT (Program 202 · Release D).
 *
 * The D1 inventory found the major surfaces already CLEAN: no hard-coded evidence counts survive
 * in JSX (P195's "hand-typed caveats drift toward flattery" lesson did its work), the three-layer
 * pattern exists with owners feeding every layer — StatusChip (headline vocabulary), the hubs'
 * dynamic leads (explanation: NFL renders the model's own recorded honestLimit, guard-held in the
 * lead on purpose; EPL renders its artifact's trackRecord + the graded-record caption), and
 * Explain/details disclosures (evidence). So this release is the CONTRACT over that pattern, not
 * component churn: a ratchet keeping evidence literals out of JSX forever, the risk vocabulary
 * pinned to its canonical owner, and NO_PLAY / LANE_CLOSED / unavailable provably distinguishable.
 *
 * Run: npx tsx --test src/lib/uiux/claims-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { RISK_ORDER, RISK_RUBRIC } from "../prefs/bettor-tiers.mjs";
import { TIER_INTENT } from "../home/suggested-parlays.mjs";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("D6 ratchet · no digit-bearing evidence claim lives in render-layer JSX — counts come from owners", () => {
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!p.endsWith(".tsx")) continue;
      /*
       * Comments stripped FIRST — the repo's denial-trap lesson (a comment explaining removed
       * wording is not the wording). Then: a quoted literal like "8 graded" / "3 of 30 matches"
       * is an evidence count frozen into JSX — it rots the moment the next receipt lands.
       */
      const src = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const m of src.matchAll(/"[^"{}\n]*\b\d+\s+(graded|settled|matches toward|of \d+ (matches|games|samples))\b[^"{}\n]*"/g)) {
        offenders.push(`${path.relative(app, p)}: ${m[0].slice(0, 70)}`);
      }
    }
  };
  walk(path.join(app, "src/components"));
  walk(path.join(app, "src/app"));
  assert.deepEqual(offenders, [], `evidence counts frozen into JSX:\n  ${offenders.join("\n  ")}`);
});

test("D2 · the three layers are owner-fed where the big claims are made", () => {
  const nfl = read("src/app/nfl/page.tsx");
  assert.match(nfl, /\{index\?\.model\?\.plainEnglish\?\.honestLimit\}/,
    "NFL's lead claim is the model's own recorded sentence — never hand-maintained");
  const epl = read("src/app/epl/page.tsx");
  assert.match(epl, /set\?\.trackRecord/, "EPL's claim is its artifact's own trackRecord");
  assert.match(epl, /gradedRecordCaption/, "EPL's sample line derives from the graded record owner");
  const chip = read("src/components/ui/status-chip.tsx");
  assert.match(chip, /friendlyStatusLabel/, "the shared chip renders the canonical status vocabulary");
});

test("D3 · risk vocabulary has one owner and no hype synonyms beside it", () => {
  assert.deepEqual([...RISK_ORDER], ["low", "medium", "high", "longshot"]);
  assert.equal(RISK_RUBRIC.version, 1, "claims cite a versioned rubric");
  for (const tier of RISK_ORDER) {
    assert.ok(TIER_INTENT[tier], `${tier}: public language exists in the canonical owner`);
    assert.ok(!/safe|lock|guarantee|sure thing|can'?t miss/i.test(TIER_INTENT[tier]),
      `${tier}: the public language never translates risk into hype`);
  }
});

test("D4 · NO_PLAY, LANE_CLOSED and unavailable are visually distinct states, never one grey mush", () => {
  const preview = read("src/components/home/suggested-parlays-preview.tsx");
  assert.match(preview, /no play/, "NO_PLAY renders in words");
  assert.match(preview, /unavailable/, "a refused/missing cell renders as unavailable, not as no-play");
  assert.match(preview, /closed/, "a closed lane renders its closure, separate from any tier chip");
  // And the deliberate-presentation rule: no-play must not look like broken loading.
  assert.ok(!/Loading|Spinner|skeleton/i.test(preview), "refusals never wear loading affordances");
});
