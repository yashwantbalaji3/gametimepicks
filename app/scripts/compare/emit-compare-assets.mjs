#!/usr/bin/env node
/**
 * Emit the PUBLIC Compare assets (v1.4) — build step, like build-search-index.mjs.
 *
 *   data/compare-projection/v1 (committed)  →  app/public/data/compare/v1/  (gitignored, rebuilt every build)
 *     teams/<sport>/index.json   teams/<sport>/<slug>.json      (MLB, NFL)
 *     players/<sport>/index.json players/<sport>/<slug>.json    (NFL, EPL, MLB)
 *
 * Every emitted byte is a line of the committed, leak-guarded compare projection re-serialised as-is, so the public
 * surface is exactly what `compare-projection.test.mjs` proves. The directory is wiped first: an entity removed from
 * the projection can never linger as a stale public file. No network, no clock.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { COMPARE_PROJECTION_DIR, PLAYER_COMPARE_SPORTS, TEAM_COMPARE_SPORTS, assertCompareVersion } from "../../src/lib/compare/contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(APP, "..", COMPARE_PROJECTION_DIR);
const OUT = path.join(APP, "public/data/compare/v1");

if (!fs.existsSync(path.join(SRC, "receipt.json"))) {
  console.error(`[emit-compare-assets] no compare projection at ${COMPARE_PROJECTION_DIR} — run scripts/compare/build-compare-projections.mjs`);
  process.exit(1);
}
const t0 = performance.now();
fs.rmSync(OUT, { recursive: true, force: true });
let files = 0, bytes = 0;
const write = (rel, content) => {
  const abs = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  files += 1;
  bytes += Buffer.byteLength(content);
};
const lines = (rel) => zlib.gunzipSync(fs.readFileSync(path.join(SRC, rel))).toString("utf8").split("\n").filter(Boolean);

for (const [kind, sports] of [["teams", TEAM_COMPARE_SPORTS], ["players", PLAYER_COMPARE_SPORTS]]) {
  for (const sport of sports) {
    const seg = sport.toLowerCase();
    const index = fs.readFileSync(path.join(SRC, `indexes/${kind}-${seg}.json`), "utf8");
    assertCompareVersion(JSON.parse(index), `${kind}-${seg} index`);
    write(`${kind}/${seg}/index.json`, index);
    for (const line of lines(`${kind}/${sport}.jsonl.gz`)) {
      const e = assertCompareVersion(JSON.parse(line), `${kind}/${sport}`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) throw new Error(`unsafe slug ${e.slug}`);
      write(`${kind}/${seg}/${e.slug}.json`, line + "\n");
    }
  }
}
console.log(`[emit-compare-assets] ${files} files · ${(bytes / 1048576).toFixed(1)} MB → public/data/compare/v1 in ${Math.round(performance.now() - t0)} ms`);
