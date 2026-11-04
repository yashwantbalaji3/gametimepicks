#!/usr/bin/env node
/**
 * SITE ↔ ENGINE PARITY for the four BBM V2 lanes (PD, 2026-11-04). FAIL-CLOSED: exit 1 unless every field of every lane
 * equals the engine's canonical record (lib/products/challenge-lanes/parity.mjs). Reads the committed public projections
 * and the encrypted price displays; the key comes from GTP_ODDS_DISPLAY_KEY or, failing that, from the repo-root .env,
 * read in-process (never echoed). The full report (it holds odds) goes ONLY to --out under ~/gtp-evidence; stdout gets
 * the verdict and the failing field names.
 *
 * RESEARCH (PD 2026-11-04): each product's research file for --date (default: the build's ET day) against the site's
 * research section (researchParity). No research file for a product is not a failure — the section then renders
 * nothing — and the report says "none"; a file that does not verify fails.
 *
 *   npx tsx scripts/bbm/site-parity.mjs [--out <file>] [--date YYYY-MM-DD]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLaneProjection } from "../../src/lib/challenge-lanes/public-reader.mjs";
import { readLanePrices } from "../../src/lib/challenge-lanes/price-display.mjs";
import { LANE_IDS } from "../../src/lib/challenge-lanes/lanes.mjs";
import { loadChallengeLane, keyFromRepoEnv, etProductDay } from "../../src/lib/products/challenge-lanes/load.mjs";
import { laneParity, parityReport, researchParity, diversityParity } from "../../src/lib/products/challenge-lanes/parity.mjs";
import { readResearchDisplay } from "../../src/lib/challenge-lanes/research-io.mjs";
import { researchView } from "../../src/lib/products/challenge-lanes/research.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEY = "GTP_ODDS_DISPLAY_KEY";
function keyEnv() {
  if (process.env[KEY]) return { [KEY]: process.env[KEY] };
  const v = keyFromRepoEnv(APP);
  return v ? { [KEY]: v } : {};
}
const outArg = process.argv.indexOf("--out");
const out = outArg > 0 ? process.argv[outArg + 1] : path.join(os.homedir(), "gtp-evidence", "bbm-v2", "parity", "site-parity.json");
const env = keyEnv();
const perLane = [];
const refusals = [];
for (const laneId of LANE_IDS) {
  const r = readLaneProjection({ appDir: APP, laneId });
  if (!r.ok) { refusals.push(`${laneId} ${r.refusal}`); continue; }
  const prices = readLanePrices({ appDir: APP, laneId, env });
  const { view } = loadChallengeLane({ appDir: APP, laneId, env });
  perLane.push(laneParity({ doc: r.doc, prices, view }));
}
/* Diversification across the four lanes the site would render. */
perLane.push(diversityParity(LANE_IDS.map((laneId) => loadChallengeLane({ appDir: APP, laneId, env }).view)));
const dateArg = process.argv.indexOf("--date");
const date = dateArg > 0 ? process.argv[dateArg + 1] : etProductDay();
const research = {};
for (const product of ["bank-builder", "moonshot"]) {
  let display;
  try { display = readResearchDisplay({ appDir: APP, product, date, env }); } catch (e) { refusals.push(`research ${product}/${date} ${e instanceof Error ? e.message : e}`); continue; }
  if (!display) { research[product] = "none"; continue; }
  research[product] = display.priced ? "priced" : "unpriced";
  perLane.push(researchParity({ block: display, view: researchView(display), laneId: `research:${product}` }));
}
const report = parityReport(perLane);
const ok = report.ok && refusals.length === 0 && Boolean(env[KEY]);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ ok, keyPresent: Boolean(env[KEY]), date, research, refusals, ...report }, null, 1)}\n`);
console.log(JSON.stringify({ ok, keyPresent: Boolean(env[KEY]), date, research, lanes: perLane.length, rows: report.rows.length, refusals, failures: report.failures, report: out }, null, 1));
process.exit(ok ? 0 : 1);
