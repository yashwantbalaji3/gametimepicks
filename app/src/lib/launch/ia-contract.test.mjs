/**
 * IA-contract guards (Program 166 · Release A): one documented IA, every anchor real, every
 * section owned by exactly one group, the nav rendered from the contract.
 *
 * Run: npx tsx --test src/lib/launch/ia-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { IA_SECTIONS, LAUNCH_IA_VERSION } from "./ia-contract.mjs";

const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "launch", "page.tsx"), "utf8");

test("eleven groups, unique anchors, every anchor exists on the page, authorities named", () => {
  assert.equal(LAUNCH_IA_VERSION, 1);
  assert.equal(IA_SECTIONS.length, 11);
  const all = IA_SECTIONS.flatMap((g) => g.anchors);
  assert.equal(new Set(all).size, all.length, "a section belongs to exactly one group");
  for (const a of all) {
    assert.ok(page.includes(`id="${a}"`) || page.includes(`aria-labelledby="${a}"`), `anchor #${a} exists on /launch`);
  }
  for (const g of IA_SECTIONS) assert.ok(g.authority.length > 10, g.group);
});

test("the nav renders FROM the contract and the page carries the read-only rule", () => {
  assert.match(page, /IA_SECTIONS\.map/, "menu and truth cannot drift");
  assert.match(page, /receipts close work/i);
  assert.match(page, /no ownership, account, credential, or control transfer/i, "the transition section is documentation only");
});
