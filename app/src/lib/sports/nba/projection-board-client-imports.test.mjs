/**
 * /nba/projections (§13 amendment A): the board's client island must bundle for the browser. A transitive `node:` import
 * (the lane producer's receipt hashing uses node:crypto; the loader uses node:fs) would fail the Next build — the
 * island therefore imports only React and the import-free view ops.
 * Run: npx tsx --test src/lib/sports/nba/projection-board-client-imports.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const imports = (src) => [...src.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
const resolve = (spec, fromRel) => {
  const base = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? path.normalize(path.join(path.dirname(fromRel), spec)) : null;
  if (!base) return null; // a package
  for (const ext of ["", ".tsx", ".ts", ".mjs"]) if (fs.existsSync(path.join(APP, base + ext)) && fs.statSync(path.join(APP, base + ext)).isFile()) return base + ext;
  throw new Error(`unresolved import ${spec} from ${fromRel}`);
};

test("the projection board island's whole import graph is browser-safe (no node: module)", () => {
  const root = "src/components/nba/projection-board.tsx";
  assert.match(read(root), /^"use client";/);
  const seen = new Set();
  const queue = [root];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const spec of imports(read(rel))) {
      assert.ok(!spec.startsWith("node:") && !["fs", "path", "crypto", "child_process"].includes(spec), `${rel} imports ${spec}`);
      const next = resolve(spec, rel);
      if (next) queue.push(next);
    }
  }
  assert.deepEqual([...seen].sort(), ["src/components/nba/projection-board.tsx", "src/lib/sports/nba/projection-board-ops.mjs"]);
  assert.ok(!seen.has("src/lib/sports/nba/experimental-public-lane.mjs"), "the island never reaches the snapshot producer");
  assert.equal(imports(read("src/lib/sports/nba/projection-board-ops.mjs")).length, 0, "the view ops import nothing");
});
