#!/usr/bin/env node
/**
 * Team + Player Research projection builder (v1.3) — THE ONE app consumer of the Data Platform store.
 *
 *   node scripts/research/build-research-projections.mjs            build and write data/research-projection/v1/
 *   node scripts/research/build-research-projections.mjs --check    build in memory; exit 1 if the committed projection differs
 *
 * Opens the committed platform ONCE (after verifying its manifest), assembles the projection through the pure
 * lib/research-pages/projection-build.mjs, and writes compact files that research PAGES read at build time. Pages never
 * import the platform (pinned: data-platform/boundary.test.mjs B1 allowlist + research-pages/boundary.test.mjs).
 *
 * Content files are hashed UNCOMPRESSED and written only when their content changed, so an unchanged platform
 * leaves git clean. The receipt carries no wall clock (determinism, §114).
 *
 * Exit: 0 ok · 1 stale (--check) · 2 platform integrity failure · 3 no platform store.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readSportFromDisk, readStoreText, verifyManifest } from "../../src/lib/data-platform/readers.mjs";
import { assembleResearchProjection, canonicalJson, PROJECTION_BUILDER_ID } from "../../src/lib/research-pages/projection-build.mjs";
import { RESEARCH_PROJECTION_DIR, RESEARCH_PROJECTION_SCHEMA_VERSION, RESEARCH_SPORTS } from "../../src/lib/research-pages/contract.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PLATFORM = path.join(REPO, "data/internal/platform/v1");
const OUT = path.join(REPO, RESEARCH_PROJECTION_DIR);
const CHECK = process.argv.includes("--check");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

const t0 = performance.now();
if (!fs.existsSync(path.join(PLATFORM, "manifest.json"))) { console.error(`no platform store at ${path.relative(REPO, PLATFORM)}`); process.exit(3); }
const integrity = await verifyManifest(PLATFORM);
if (!integrity.ok) { console.error(`platform manifest integrity FAILED:\n  ${integrity.problems.slice(0, 10).join("\n  ")}`); process.exit(2); }

const manifestText = fs.readFileSync(path.join(PLATFORM, "manifest.json"), "utf8");
const seasons = JSON.parse(readStoreText(path.join(PLATFORM, "seasons.json"))).records;
const sports = {};
for (const s of RESEARCH_SPORTS) {
  const d = readSportFromDisk(PLATFORM, s);
  if (!d) { console.error(`platform has no ${s} partition`); process.exit(3); }
  sports[s] = d;
}
const tLoad = performance.now();

const { files, summary } = assembleResearchProjection({ manifestSha256: sha(manifestText), seasons, sports });
const tBuild = performance.now();

// Store: `.jsonl` content is stored gzipped; the receipt hashes the uncompressed content.
const stored = (p) => (p.endsWith(".jsonl") ? `${p}.gz` : p);
const contentFiles = [...files.keys()].sort().map((p) => ({ path: stored(p), contentBytes: Buffer.byteLength(files.get(p)), sha256: sha(files.get(p)) }));
const receipt = {
  schemaVersion: RESEARCH_PROJECTION_SCHEMA_VERSION,
  artifact: "research-projection-receipt",
  builder: PROJECTION_BUILDER_ID,
  platformManifestSha256: sha(manifestText),
  pages: summary.pages,
  dataCutoffs: summary.cutoffs,
  files: contentFiles,
  contentBytes: contentFiles.reduce((a, f) => a + f.contentBytes, 0),
  contentSha256: sha(contentFiles.map((f) => `${f.path}:${f.sha256}`).join("\n")),
};
files.set("receipt.json", canonicalJson(receipt, true));

const read = (rel) => {
  const abs = path.join(OUT, stored(rel));
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  return (abs.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};
const changed = [...files.keys()].filter((p) => read(p) !== files.get(p));
const expected = new Set([...files.keys()].map(stored));
const walk = (dir, rel = "") => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`])) : []);
const unexpected = walk(OUT).filter((p) => !expected.has(p));

if (CHECK) {
  if (changed.length || unexpected.length) {
    console.error(`STALE: research projection differs from a rebuild of the committed platform (${changed.length} changed, ${unexpected.length} unexpected)`);
    for (const p of [...changed, ...unexpected].slice(0, 20)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`research projection up to date (${files.size} files, ${summary.pages} pages) in ${Math.round(performance.now() - t0)} ms`);
  process.exit(0);
}

for (const p of changed) {
  const abs = path.join(OUT, stored(p));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const content = files.get(p);
  fs.writeFileSync(abs, p.endsWith(".jsonl") ? zlib.gzipSync(Buffer.from(content), { level: 9 }) : content);
}
for (const p of unexpected) fs.rmSync(path.join(OUT, p));

console.log(`research projection v${RESEARCH_PROJECTION_SCHEMA_VERSION}: ${summary.pages} pages · ${files.size} files · ${changed.length} written · ${unexpected.length} removed`);
console.log(`  load ${Math.round(tLoad - t0)} ms · assemble ${Math.round(tBuild - tLoad)} ms · total ${Math.round(performance.now() - t0)} ms · content ${(receipt.contentBytes / 1048576).toFixed(1)} MB`);
const rd = JSON.parse(files.get("readiness.json"));
for (const [s, r] of Object.entries(rd.sports)) {
  console.log(`  ${s}: teams ${r.teams ? `${r.teams.published}/${r.teams.total} (index ${r.teams.indexable})` : "n/a"} · players ${r.players.published}/${r.players.total} (index ${r.players.indexable}) · excluded ${JSON.stringify(r.players.excluded)}`);
}
