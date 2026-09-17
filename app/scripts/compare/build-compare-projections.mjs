#!/usr/bin/env node
/**
 * Matchup Explorer + Compare projection builder (v1.4).
 *
 *   node scripts/compare/build-compare-projections.mjs            build and write data/compare-projection/v1/
 *   node scripts/compare/build-compare-projections.mjs --check    build in memory; exit 1 if the committed projection differs
 *
 * Reads the committed v1.3 RESEARCH PROJECTION (never the Data Platform — B1 is not widened), assembles the compare
 * projection through the pure lib/compare/projection-build.mjs, and writes compact deterministic files. Refresh order:
 * platform → research projection → THIS builder. A stale research projection is refused (its own --check must pass).
 *
 * Exit: 0 ok · 1 stale (--check) · 2 upstream research projection stale/invalid · 3 no research projection.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../src/lib/research-pages/projection-build.mjs";
import { RESEARCH_PROJECTION_DIR } from "../../src/lib/research-pages/contract.mjs";
import { COMPARE_PROJECTION_DIR, COMPARE_PROJECTION_SCHEMA_VERSION } from "../../src/lib/compare/contract.mjs";
import { readPublishedMatchupIds, readResearchInput } from "../../src/lib/compare/research-input.mjs";
import { COMPARE_BUILDER_ID, assembleCompareProjection } from "../../src/lib/compare/projection-build.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = path.join(APP, "..");
const RESEARCH = path.join(REPO, RESEARCH_PROJECTION_DIR);
const OUT = path.join(REPO, COMPARE_PROJECTION_DIR);
const CHECK = process.argv.includes("--check");
const SKIP_UPSTREAM = process.argv.includes("--skip-upstream-check");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

const t0 = performance.now();
if (!fs.existsSync(path.join(RESEARCH, "receipt.json"))) { console.error(`no research projection at ${RESEARCH_PROJECTION_DIR}`); process.exit(3); }
if (!SKIP_UPSTREAM) {
  try {
    execFileSync(process.execPath, [path.join(APP, "scripts/research/build-research-projections.mjs"), "--check"], { stdio: "pipe" });
  } catch (e) {
    console.error(`upstream research projection is STALE — refresh platform → research projection first:\n${e.stderr?.toString() ?? e.message}`);
    process.exit(2);
  }
}

const input = readResearchInput(REPO);

const stored = (p) => (p.endsWith(".jsonl") ? `${p}.gz` : p);
const read = (rel) => {
  const abs = path.join(OUT, stored(rel));
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  return (abs.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};
const previousMatchupIds = readPublishedMatchupIds(REPO);
const tLoad = performance.now();

let files, summary;
try {
  ({ files, summary } = assembleCompareProjection({ ...input, previousMatchupIds }));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const tBuild = performance.now();

const contentFiles = [...files.keys()].sort().map((p) => ({ path: stored(p), contentBytes: Buffer.byteLength(files.get(p)), sha256: sha(files.get(p)) }));
const receipt = {
  schemaVersion: COMPARE_PROJECTION_SCHEMA_VERSION,
  artifact: "compare-projection-receipt",
  builder: COMPARE_BUILDER_ID,
  researchContentSha256: input.researchContentSha256,
  matchupPages: summary.matchupPages,
  entities: summary.entities,
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
    console.error(`STALE: compare projection differs from a rebuild of the committed research projection (${changed.length} changed, ${unexpected.length} unexpected)`);
    for (const p of [...changed, ...unexpected].slice(0, 20)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`compare projection up to date (${files.size} files, ${summary.matchupPages} matchup pages) in ${Math.round(performance.now() - t0)} ms`);
  process.exit(0);
}

for (const p of changed) {
  const abs = path.join(OUT, stored(p));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const content = files.get(p);
  fs.writeFileSync(abs, p.endsWith(".jsonl") ? zlib.gzipSync(Buffer.from(content), { level: 9 }) : content);
}
for (const p of unexpected) fs.rmSync(path.join(OUT, p));

console.log(`compare projection v${COMPARE_PROJECTION_SCHEMA_VERSION}: ${files.size} files · ${changed.length} written · ${unexpected.length} removed`);
console.log(`  load ${Math.round(tLoad - t0)} ms · assemble ${Math.round(tBuild - tLoad)} ms · total ${Math.round(performance.now() - t0)} ms · content ${(receipt.contentBytes / 1048576).toFixed(1)} MB`);
const rd = JSON.parse(files.get("readiness.json"));
for (const [s, r] of Object.entries(rd.teams)) console.log(`  team compare ${s}: ${r.eligible}/${r.researchPages} ${r.shipped ? "SHIPPED" : `BLOCKED ${r.blocker}`}`);
for (const [s, r] of Object.entries(rd.players)) console.log(`  player compare ${s}: ${r.eligible}/${r.researchPages} ${r.shipped ? `SHIPPED families ${r.comparableFamilies.length}` : `BLOCKED ${r.blocker}`}`);
for (const [s, r] of Object.entries(rd.headToHead)) console.log(`  h2h ${s}: ${r.pairsWithMeetings}/${r.pairs} pairs · ${r.meetingRefs} meetings · worst ${r.worstPairMeetings} · inconsistent ${r.inconsistentRowsExcluded}`);
for (const [s, r] of Object.entries(rd.matchups)) console.log(`  matchups ${s}: ${r.generated}${r.indexable != null ? ` (index ${r.indexable} · noindex ${r.noindex} · final ${r.withFinal})` : ` ${r.blocker}`}${r.excluded ? ` excluded ${JSON.stringify(r.excluded)}` : ""}`);
