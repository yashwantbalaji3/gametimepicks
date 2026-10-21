/**
 * Simulation Theater V2 · the `theater-pack@1` transport is lossless, and the theater's payload stays in budget.
 *
 * Run: npx tsx --test src/lib/simulation-theater/theater-pack.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { adaptAllReceipts, loadTheater, FIXTURE_EVENT_IDS } from "./loader.mjs";
import { PACK_VERSION, packTheater, unpackSample, unpackTheater } from "./theater-pack.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");

test("decode(encode(manifest)) is byte-identical to the adapter output for EVERY receipt on disk", () => {
  let n = 0;
  for (const a of adaptAllReceipts(REPO)) {
    if (!a.manifest) continue;
    const m = a.manifest;
    if (!Array.isArray(m.samples)) continue;
    const pack = packTheater(m);
    assert.equal(pack.v, PACK_VERSION);
    const back = unpackTheater(JSON.parse(JSON.stringify(pack))); // through JSON, as the RSC payload carries it
    assert.equal(JSON.stringify(back), JSON.stringify(m), `${a.file}: byte-identical`);
    assert.deepStrictEqual(back, m);
    assert.equal(back.receiptId, m.receiptId);
    assert.equal(back.receiptHash, m.receiptHash, "receipt hash unchanged");
    m.samples.forEach((s, i) => assert.deepStrictEqual(unpackSample(pack, i), s, `${a.file} sample ${i}`));
    n++;
  }
  assert.ok(n >= 100, `exercised ${n} receipts`);
  console.log(`# theater-pack: ${n} receipts round-trip byte-identical`);
});

test("pack refuses a manifest whose derived fields do not hold (never silently 'corrects' adapter output)", () => {
  const m = structuredClone(loadTheater(REPO, FIXTURE_EVENT_IDS[0]).manifest);
  m.samples[0].events[3].scoreBefore = { home: 99, away: 0 };
  assert.throws(() => packTheater(m), /scoreBefore/);
  const m2 = structuredClone(loadTheater(REPO, FIXTURE_EVENT_IDS[0]).manifest);
  m2.samples[0].events[2].participants = [{ playerId: "x" }];
  assert.throws(() => packTheater(m2), /participants/);
  assert.throws(() => unpackTheater({ v: "other@9" }), /unsupported/);
});

test("budget (spec §6.1): the inline sample data for five samples is ≤20 KB raw", () => {
  for (const id of FIXTURE_EVENT_IDS) {
    const t = loadTheater(REPO, id);
    if (!t.manifest) continue;
    const verbose = JSON.stringify(t.manifest).length;
    const packed = JSON.stringify(packTheater(t.manifest)).length;
    console.log(`# theater-pack: ${id} manifest ${verbose} B → pack ${packed} B (${t.manifest.samples.length} samples)`);
    assert.ok(packed <= 20 * 1024, `${id}: ${packed} B`);
    assert.ok(packed < verbose / 3, "the pack is at least 3× smaller than the verbose manifest");
  }
});

test("theater.css carries tokens only (no raw colour literal), like every other theater file", () => {
  const css = fs.readFileSync(path.join(APP, "src/components/simulation-theater/theater.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const hits = css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,|hsla?\(\s*\d/g) ?? [];
  assert.deepEqual(hits, []);
});
