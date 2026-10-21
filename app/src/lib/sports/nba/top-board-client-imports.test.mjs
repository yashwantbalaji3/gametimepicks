/**
 * The private board table is a CLIENT component: everything it imports must bundle for the browser. A transitive
 * `node:` import (e.g. receipt hashing via top-boards.mjs) fails the Next build (found by CI on #1151).
 * Run: npx tsx --test src/lib/sports/nba/top-board-client-imports.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const imports = (src) => [...src.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
const resolve = (spec, fromRel) => {
  if (spec.startsWith("@/")) return `src/${spec.slice(2)}`;
  if (spec.startsWith(".")) return path.normalize(path.join(path.dirname(fromRel), spec));
  return null; // a package
};

test("the client board table's whole import graph is browser-safe (no node: module)", () => {
  const seen = new Set();
  const queue = ["src/components/nba/top-board-table.tsx"];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const spec of imports(read(rel))) {
      assert.ok(!spec.startsWith("node:"), `${rel} imports ${spec}`);
      const next = resolve(spec, rel);
      if (next) queue.push(next);
    }
  }
  assert.ok(seen.has("src/lib/sports/nba/top-board-view-ops.mjs"));
  assert.ok(!seen.has("src/lib/sports/nba/top-boards.mjs"), "the client never reaches the board producer (receipt hashing)");
});
