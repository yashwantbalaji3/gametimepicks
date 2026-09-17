#!/usr/bin/env node
/**
 * Validate the COMMITTED Data Platform store (no rebuild, no network):
 *   1. manifest integrity — every content file present and hashing to the manifest
 *   2. whole-store validation — schema, identity, aliases, referential integrity, participants, time, stats
 *
 *   node scripts/data-platform/validate.mjs          exit 0 valid · 1 invalid · 3 no store
 */
import fs from "node:fs";
import { readStore, verifyManifest } from "../../src/lib/data-platform/readers.mjs";
import { validateStore } from "../../src/lib/data-platform/validate.mjs";
import { PLATFORM_DIR } from "./sources.mjs";

if (!fs.existsSync(`${PLATFORM_DIR}/manifest.json`)) { console.error(`no platform store at ${PLATFORM_DIR}`); process.exit(3); }
const t0 = performance.now();
const integrity = await verifyManifest(PLATFORM_DIR);
const t1 = performance.now();
const store = readStore(PLATFORM_DIR);
const t2 = performance.now();
const v = validateStore(store);
const t3 = performance.now();
console.log(`manifest integrity: ${integrity.ok ? "OK" : "FAILED"} (${integrity.files} files, ${Math.round(t1 - t0)} ms)`);
for (const p of integrity.problems.slice(0, 20)) console.log(`  ${p}`);
console.log(`store validation: ${v.ok ? "OK" : "FAILED"} — ${v.checked.records} records, ${v.checked.aliases} alias round trips (load ${Math.round(t2 - t1)} ms, validate ${Math.round(t3 - t2)} ms)`);
for (const e of v.errors) console.log(`  ${e.code} ×${e.count} ${JSON.stringify(e.samples.slice(0, 2))}`);
process.exit(integrity.ok && v.ok ? 0 : 1);
