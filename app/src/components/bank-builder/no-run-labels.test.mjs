/**
 * Public Bank Builder UI must not use "Run #1 / #2 / #3" labels — they read as internal/test runs.
 * Product language ("Completed ladder", "Active dual ladder", "Closed test ladder") is used instead.
 * (Code comments may still reference Run # for history; we scan only rendered chip/label strings.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const FILES = [
  "bank-builder-status-rail.tsx",
  "bank-builder-v2-panel.tsx",
  "dual-bank-builder-teaser.tsx",
];

// Strip line (//) and block (/* */) comments before scanning for rendered labels.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("no public 'Run #N · label' chips remain in Bank Builder components", () => {
  for (const f of FILES) {
    const src = stripComments(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.ok(!/Run #[123]\s*·/.test(src), `${f} still renders a "Run #N ·" chip label`);
  }
});

test("Bank Builder components use the product ladder vocabulary", () => {
  const all = FILES.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  assert.ok(/Completed ladder/.test(all), "uses 'Completed ladder'");
  assert.ok(/Active dual ladder|Dual ladder/.test(all), "uses 'Active dual ladder'/'Dual ladder'");
});
