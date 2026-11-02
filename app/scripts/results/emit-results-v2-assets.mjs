#!/usr/bin/env node
/**
 * Emit the PUBLIC Results Day files (Results V2 pilot) — build step, like emit-forecast-record-assets.mjs.
 *
 *   data/results-projection/v1/<sport>/<date>.json (sealed, committed)
 *     →  app/public/data/results/v2/<sport>/<date>.{json,csv} + index.json
 *
 * The JSON is the sealed file byte for byte, the CSV is derived from it, and index.json lists what exists. This reads
 * nothing else: no data/internal file, so the only build input it adds is the sealed directory. The output directory is
 * wiped first so a withdrawn day never lingers as a stale download, and every file is scanned before it is written: a
 * price, a book or a range in a sealed file stops the build. No network, no clock: same sealed files, identical bytes.
 */
import fs from "node:fs";
import path from "node:path";

import { RESULTS_DAY_INDEX_SCHEMA, RESULTS_DAY_SCHEMA, canonicalDayJson, publicSafetyViolations, toDayCsv } from "../../src/lib/results/v2/contract.mjs";

const APP = process.cwd();
const SEALED = path.resolve(APP, "..", "data/results-projection/v1");
const OUT = path.join(APP, "public/data/results/v2");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

function refuseIfUnsafe(name, text) {
  const bad = publicSafetyViolations(text);
  if (bad.length) throw new Error(`${name}: ${bad[0]}`);
}

/** Read every sealed day under `sealedDir`, write the public set into `outDir` (wiped first). Returns { days, files } or null. */
export function emitResultsV2({ sealedDir = SEALED, outDir = OUT } = {}) {
  if (!fs.existsSync(sealedDir)) return null;
  const days = [];
  const files = {};
  for (const sport of fs.readdirSync(sealedDir).sort()) {
    const dir = path.join(sealedDir, sport);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const doc = JSON.parse(raw);
      const date = f.slice(0, 10);
      if (doc.schema !== RESULTS_DAY_SCHEMA || doc.sport !== sport || doc.date !== date) throw new Error(`${sport}/${f}: not a ${RESULTS_DAY_SCHEMA} for this path`);
      if (publicSafetyViolations(doc).length) throw new Error(`${sport}/${f}: ${publicSafetyViolations(doc)[0]}`);
      const csv = toDayCsv(doc);
      refuseIfUnsafe(`${sport}/${f}`, raw);
      refuseIfUnsafe(`${sport}/${date}.csv`, csv);
      files[`${sport}/${f}`] = raw;
      files[`${sport}/${date}.csv`] = csv;
      days.push({
        sport, date, ...doc.counts, evidence: doc.provenance.evidence, validationStatus: doc.provenance.validationStatus,
        json: `/data/results/v2/${sport}/${f}`, csv: `/data/results/v2/${sport}/${date}.csv`,
      });
    }
  }
  days.sort((a, b) => (a.date === b.date ? (a.sport < b.sport ? -1 : 1) : a.date < b.date ? 1 : -1));
  files["index.json"] = canonicalDayJson({ schema: RESULTS_DAY_INDEX_SCHEMA, days });
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(outDir, f)), { recursive: true });
    fs.writeFileSync(path.join(outDir, f), text);
  }
  return { days: days.length, files: Object.keys(files).sort() };
}

function main() {
  const out = emitResultsV2({ sealedDir: path.resolve(arg("sealed-dir", SEALED)), outDir: path.resolve(arg("out-dir", OUT)) });
  if (!out) {
    console.error("REFUSED: data/results-projection/v1 is missing — /results/day would publish an empty picker");
    process.exit(1);
  }
  console.log(`results v2: ${out.days} day(s), ${out.files.length} file(s) → public/data/results/v2/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
