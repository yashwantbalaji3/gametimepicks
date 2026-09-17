#!/usr/bin/env node
/**
 * Emit the PUBLIC Research Lab assets (v1.5) — build step, like scripts/compare/emit-compare-assets.mjs.
 *
 *   data/lab-projection/v1 (committed)  →  app/public/data/lab/v1/  (gitignored, rebuilt every build)
 *     games/<sport>/index.json    games/<sport>/rows.json
 *     players/<sport>/index.json  players/<sport>/<season>.json
 *     seasons/<sport>/index.json  seasons/<sport>/rows.json
 *
 * Every emitted byte is a file of the committed, validated, leak-guarded Lab projection re-serialised as-is, so the
 * public surface is exactly what lab-projection.test.mjs proves. The directory is wiped first: a partition dropped
 * from the projection can never linger as a stale public file. No network, no clock.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { LAB_ASSET_PREFIX, LAB_MODE_SPORTS, LAB_PROJECTION_DIR, assertLabVersion, labAssetPath } from "../../src/lib/lab/contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(APP, "..", LAB_PROJECTION_DIR);
const OUT = path.join(APP, "public", LAB_ASSET_PREFIX.replace(/^\//, ""));

if (!fs.existsSync(path.join(SRC, "receipt.json"))) {
  console.error(`[emit-lab-assets] no lab projection at ${LAB_PROJECTION_DIR} — run scripts/lab/build-lab-projections.mjs`);
  process.exit(1);
}
const t0 = performance.now();
fs.rmSync(OUT, { recursive: true, force: true });
let files = 0, bytes = 0, largest = { path: null, bytes: 0 };
const read = (rel) => {
  const abs = path.join(SRC, rel);
  const buf = fs.readFileSync(abs);
  return (abs.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};
/** @param {string} publicPath a `/data/lab/v1/...` URL from labAssetPath — the ONLY shape emitted */
const write = (publicPath, content, where) => {
  if (!publicPath.startsWith(`${LAB_ASSET_PREFIX}/`)) throw new Error(`refused: ${publicPath} is outside the Lab asset prefix`);
  const rel = publicPath.slice(LAB_ASSET_PREFIX.length + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/.test(rel) || rel.includes("..")) throw new Error(`refused: unsafe asset path ${rel}`);
  assertLabVersion(JSON.parse(content), where);
  const abs = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  files += 1;
  const n = Buffer.byteLength(content);
  bytes += n;
  if (n > largest.bytes) largest = { path: rel, bytes: n };
};

for (const [mode, sports] of Object.entries(LAB_MODE_SPORTS)) {
  for (const sport of sports) {
    const seg = sport.toLowerCase();
    write(labAssetPath.index(mode, sport), read(`indexes/${mode}-${seg}.json`), `${mode} index ${sport}`);
    if (mode === "players") {
      const idx = JSON.parse(read(`indexes/players-${seg}.json`));
      for (const season of idx.seasons) write(labAssetPath.players(sport, season), read(`players/${sport}/${season}.json.gz`), `players ${sport} ${season}`);
    } else {
      write(mode === "games" ? labAssetPath.games(sport) : labAssetPath.seasons(sport), read(`${mode}/${sport}.json.gz`), `${mode} rows ${sport}`);
    }
  }
}
console.log(`[emit-lab-assets] ${files} files · ${(bytes / 1048576).toFixed(1)} MB → public${LAB_ASSET_PREFIX} in ${Math.round(performance.now() - t0)} ms (largest ${largest.path} ${(largest.bytes / 1024).toFixed(0)} KB)`);
