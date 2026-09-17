/**
 * DATA PLATFORM — PUBLIC EXPORT LEAK GUARD (post-build; v1.2 · §69 §112).
 *
 * The platform publishes nothing in v1.2. This proves the built static export (app/out) contains no store
 * path, no provenance source key, no platform artifact name and no internal repository path — so a future
 * accidental import of the read layer into a page fails here, not in production.
 *
 * Run (after `npm run build`): npx tsx --test src/lib/data-platform/export-leak.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const OUT = path.join(APP, "out");
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(html|js|json|txt|xml|map|css)$/.test(e.name)) acc.push(p);
  }
  return acc;
};

test("EX1 the static export contains no platform store, provenance key or internal path", () => {
  assert.ok(fs.existsSync(OUT), "run after `npm run build` (post-build phase)");
  const sourcesJson = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/platform/v1/sources.json"), "utf8"));
  const needles = [
    "internal/platform", "platform/v1", "gametime-data-platform", "data-platform/",
    "linescores-history", "player-events-v1", "id-bridge-v1", "espn-players-v1",
    ...sourcesJson.sources.map((s) => s.key), // e.g. "mlb.finals-history", "nfl.nflverse-player-games"
  ];
  const files = walk(OUT);
  assert.ok(files.length > 100, `export looks empty (${files.length} files)`);
  const hits = [];
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    for (const n of needles) if (s.includes(n)) hits.push(`${path.relative(OUT, f)} ⊃ ${n}`);
  }
  assert.deepEqual(hits.slice(0, 20), []);
  // positive control: the scan reads real content
  assert.ok(files.some((f) => fs.readFileSync(f, "utf8").includes("GameTime")));
});
