/**
 * TRUTH-001 · the recovered pregame forecasts and the forecast-of-record correction PROPOSALS stay NON-PUBLIC until the
 * founder reviews them for accuracy, provenance and data-publication rights (founder decisions, 2026-10-09).
 *
 * They are committed under app/public/data/mlb/corrections/ (the owner's working tree), which `output: "export"` mirrors
 * into out/data/. Today they are not served only because scripts/prune-internal-routes.mjs deletes every /data/ file no
 * shipped page names. This guard makes that explicit: if a page ever starts referencing them, the build fails here
 * instead of quietly publishing unreviewed records.
 *
 * Post-build (reads out/). Run: npm run build && npx tsx --test src/lib/mlb/recovery/recovery-not-public.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const NON_PUBLIC = ["data/mlb/corrections/pregame-forecast-recoveries.jsonl", "data/mlb/corrections/forecast-of-record-corrections.jsonl"];

test("the unreviewed MLB recovery records and correction proposals are not in the public export", (t) => {
  if (!fs.existsSync(OUT)) return t.skip("post-build: needs the built export at out/");
  for (const rel of NON_PUBLIC) {
    assert.equal(fs.existsSync(path.join(OUT, rel)), false, `${rel} must not be published until the founder approves it`);
  }
  // And no shipped page names them (so the prune would never have to keep them).
  const names = NON_PUBLIC.map((r) => path.basename(r));
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (full !== path.join(OUT, "data")) walk(full); continue; }
      if (!/\.(html|js|txt|json)$/.test(e.name)) continue;
      const s = fs.readFileSync(full, "utf8");
      for (const n of names) if (s.includes(n)) offenders.push(`${path.relative(OUT, full)} → ${n}`);
    }
  };
  walk(OUT);
  assert.deepEqual(offenders, []);
});
