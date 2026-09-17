#!/usr/bin/env node
/**
 * Research Lab projection builder (v1.5).
 *
 *   node scripts/lab/build-lab-projections.mjs            build and write data/lab-projection/v1/
 *   node scripts/lab/build-lab-projections.mjs --check    build in memory; exit 1 if the committed projection differs
 *
 * Reads the committed v1.4 COMPARE PROJECTION and the v1.3 research page registry (never the Data Platform — B1 is
 * not widened), assembles the Lab projection through the pure lib/lab/projection-build.mjs, and writes compact
 * deterministic files. Refresh order: platform → research → compare → THIS builder. A stale compare projection is
 * refused, which transitively refuses a stale research projection and a stale platform.
 *
 * No network, no clock in content: the receipt hashes content only, so a byte-identical rebuild leaves git clean.
 *
 * Exit: 0 ok · 1 stale (--check) · 2 upstream compare projection stale/invalid or assembly refused · 3 no compare projection.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../src/lib/research-pages/projection-build.mjs";
import { COMPARE_PROJECTION_DIR } from "../../src/lib/compare/contract.mjs";
import { LAB_PROJECTION_DIR, LAB_PROJECTION_SCHEMA_VERSION, labStoredGzipped } from "../../src/lib/lab/contract.mjs";
import { readLabInput } from "../../src/lib/lab/compare-input.mjs";
import { LAB_BUILDER_ID, assembleLabProjection } from "../../src/lib/lab/projection-build.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = path.join(APP, "..");
const COMPARE = path.join(REPO, COMPARE_PROJECTION_DIR);
const OUT = path.join(REPO, LAB_PROJECTION_DIR);
const CHECK = process.argv.includes("--check");
const SKIP_UPSTREAM = process.argv.includes("--skip-upstream-check");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

const t0 = performance.now();
if (!fs.existsSync(path.join(COMPARE, "receipt.json"))) { console.error(`no compare projection at ${COMPARE_PROJECTION_DIR}`); process.exit(3); }
if (!SKIP_UPSTREAM) {
  try {
    execFileSync(process.execPath, [path.join(APP, "scripts/compare/build-compare-projections.mjs"), "--check"], { stdio: "pipe" });
  } catch (e) {
    console.error(`upstream compare projection is STALE — refresh platform → research → compare first:\n${e.stderr?.toString() ?? e.message}`);
    process.exit(2);
  }
}

const input = readLabInput(REPO);
const stored = (p) => (labStoredGzipped(p) ? `${p}.gz` : p);
const read = (rel) => {
  const abs = path.join(OUT, stored(rel));
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  return (abs.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};
const tLoad = performance.now();

let files, summary;
try {
  ({ files, summary } = assembleLabProjection(input));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const tBuild = performance.now();

const contentFiles = [...files.keys()].sort().map((p) => ({ path: stored(p), contentBytes: Buffer.byteLength(files.get(p)), sha256: sha(files.get(p)) }));
const receipt = {
  schemaVersion: LAB_PROJECTION_SCHEMA_VERSION,
  artifact: "lab-projection-receipt",
  builder: LAB_BUILDER_ID,
  // The upstream chain, pinned by content: a compare refresh (and therefore a research or platform refresh) makes
  // this receipt stale, and --check fails until the Lab projection is rebuilt.
  compareContentSha256: input.compareContentSha256,
  researchContentSha256: input.researchContentSha256,
  rows: summary.rows,
  files: contentFiles,
  contentBytes: contentFiles.reduce((a, f) => a + f.contentBytes, 0),
  contentSha256: sha(contentFiles.map((f) => `${f.path}:${f.sha256}`).join("\n")),
};
files.set("receipt.json", canonicalJson(receipt, true));

const changed = [...files.keys()].filter((p) => read(p) !== files.get(p));
const expected = new Set([...files.keys()].map(stored));
const walk = (dir, rel = "") => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`])) : []);
const unexpected = walk(OUT).filter((p) => !expected.has(p));

if (CHECK) {
  if (changed.length || unexpected.length) {
    console.error(`STALE: lab projection differs from a rebuild of the committed compare projection (${changed.length} changed, ${unexpected.length} unexpected)`);
    for (const p of [...changed, ...unexpected].slice(0, 20)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`lab projection up to date (${files.size} files) in ${Math.round(performance.now() - t0)} ms`);
  process.exit(0);
}

for (const p of changed) {
  const abs = path.join(OUT, stored(p));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const content = files.get(p);
  fs.writeFileSync(abs, labStoredGzipped(p) ? zlib.gzipSync(Buffer.from(content), { level: 9 }) : content);
}
for (const p of unexpected) fs.rmSync(path.join(OUT, p));

console.log(`lab projection v${LAB_PROJECTION_SCHEMA_VERSION}: ${files.size} files · ${changed.length} written · ${unexpected.length} removed`);
console.log(`  load ${Math.round(tLoad - t0)} ms · assemble ${Math.round(tBuild - tLoad)} ms · total ${Math.round(performance.now() - t0)} ms · content ${(receipt.contentBytes / 1048576).toFixed(1)} MB`);
const rd = JSON.parse(files.get("readiness.json"));
for (const [s, r] of Object.entries(rd.games)) console.log(`  game finder ${s}: ${r.shipped ? `${r.rows} finals · ${r.seasons.length} seasons · host known ${r.hostKnown}/${r.rows} · matchup page ${r.withMatchupPage} · excluded ${JSON.stringify(r.excluded)}` : `BLOCKED ${r.blocker}`}`);
for (const [s, r] of Object.entries(rd.players)) console.log(`  player explorer ${s}: ${r.shipped ? `${r.rows} rows · ${r.players} players · ${r.families.length} families · ${r.seasons.length} seasons` : `BLOCKED ${r.blocker}`}`);
for (const [s, r] of Object.entries(rd.seasons)) console.log(`  season explorer ${s}: ${r.shipped ? `${r.rows} team-seasons · ${r.seasons.length} seasons` : `BLOCKED ${r.blocker}`}`);
