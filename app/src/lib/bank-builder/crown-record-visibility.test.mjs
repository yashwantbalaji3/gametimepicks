/**
 * Bank Builder completed-record visibility — MIGRATED from the methodology content contract
 * (2026-07-30 public cleanup). /methodology no longer carries product mechanics, but the completed
 * ladder record is an accountability record: it must stay visible SOMEWHERE public, derived from the
 * ONE canonical artifact (mr-dub/banked-ladders.json via crownLadderSummary), never hardcoded and
 * never understated. Money is read, never written.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd(); // app/
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the canonical crown summary still yields the real completed record (known-positive)", async () => {
  const { crownLadderSummary } = await import("./crown-summary.ts");
  const crown = crownLadderSummary(path.join(APP, "public", "data"));
  assert.ok(crown, "canonical banked-ladders artifact is readable");
  assert.equal(crown.finalLabel, "$10,376.17", "crown ladder final");
  assert.equal(crown.recordLabel, "5–0", "crown ladder record");
  assert.equal(crown.laddersCompleted, 2, "both officially completed ladders counted");
  assert.equal(crown.crownTotalLabel, "$20,465.40", "the FULL banked crown, not just run #1");
});

test("the completed record stays visible from the canonical source on / and /bank-builder", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /crownLadderSummary/, "home derives the record from the canonical crown summary");
  const bb = read("src/app/bank-builder/page.tsx");
  assert.match(bb, /banked-ladders\.json/, "/bank-builder reads the SAME canonical artifact");
  assert.match(bb, /completed/i, "/bank-builder presents the finished runs as completed");
  assert.ok(!/a new ladder is coming soon/i.test(bb), "the record is not understated as 'coming soon'");
});

test("no route hardcodes the crown figures — the canonical loader is the only source (known-negative)", () => {
  const pages = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx") pages.push(p);
    }
  };
  walk(path.join(APP, "src", "app"));
  assert.ok(pages.length > 10, "route scan found the app pages");
  for (const p of pages) {
    const src = fs.readFileSync(p, "utf8");
    assert.ok(!src.includes("10,376.17") && !src.includes("20,465.40"),
      `${path.relative(APP, p)} hardcodes a crown figure`);
  }
});
