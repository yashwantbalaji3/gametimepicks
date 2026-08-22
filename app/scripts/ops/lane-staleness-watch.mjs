#!/usr/bin/env node
/**
 * Read every sport's lane-status artifact and report what cannot be true at once.
 *
 *   npx tsx app/scripts/ops/lane-staleness-watch.mjs --now <iso> [--json out.json]
 *
 * Exit 0 always. This reports; the caller decides whether to page. A watchdog that can fail the run
 * it watches is its own outage — the same rule the cron-slot watchdog follows.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { laneStaleness } from "../../src/lib/ops/lane-staleness.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now", new Date().toISOString());

const DIR = path.join(APP, "public", "data", "admin");
const SPORTS = ["epl", "ufc"];
const lanes = SPORTS.map((sport) => {
  try { return { sport, artifact: JSON.parse(fs.readFileSync(path.join(DIR, `${sport}-lane.json`), "utf8")) }; }
  catch { return { sport, artifact: null }; }
});

const out = laneStaleness(lanes, NOW);
console.log(`lane staleness: ${out.worst} · ${out.checked} lane(s) · ${out.findings.length} finding(s)`);
for (const f of out.findings) console.log(`  ${f.severity.padEnd(5)} ${f.sport} · ${f.id} — ${f.detail}`);
if (!out.findings.length) console.log("  every published lane agrees with itself");

const json = arg("--json");
if (json) {
  fs.mkdirSync(path.dirname(json), { recursive: true });
  fs.writeFileSync(json, `${JSON.stringify({ kind: "lane-staleness", generatedAt: NOW, ...out }, null, 2)}\n`);
}
