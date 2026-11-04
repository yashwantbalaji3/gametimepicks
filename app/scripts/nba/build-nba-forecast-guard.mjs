/**
 * NBA FORECAST GUARD · BUILD (once per slate, beside the lane). Writes app/public/data/nba/forecast-guard/<date>.json from
 * the committed lane file and the committed box scores (forecast-guard.mjs buildForecastGuard). Write-once: an existing
 * file that differs is REFUSED, never rewritten. No network, no wall clock: the same commit always builds the same bytes.
 *
 *   node scripts/nba/build-nba-forecast-guard.mjs --date 2026-11-05 [--write] [--out <dir>]
 * Prints `guard=WROTE|NOOP|DRY|REFUSED|NO_LANE` as its last line. Exit 1 only for REFUSED.
 * --out writes elsewhere (impact reports on past slates; never the committed folder for a date before the cut-over).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guardSummary } from "../../src/lib/sports/nba/forecast-guard.mjs";
import { buildGuardFromRepo } from "../../src/lib/sports/nba/forecast-guard-build.mjs";
import { FORECAST_GUARD } from "../../src/lib/sports/nba/forecast-guard-accessor.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const DATE = opt("--date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }
const OUT = opt("--out") ? path.resolve(opt("--out")) : path.join(APP, "public", "data", FORECAST_GUARD.dir);

let lane = null;
try { lane = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "nba", "experimental-public", `${DATE}.json`), "utf8")); } catch { /* none */ }
if (!lane || lane.date !== DATE) { console.log(`no committed lane for ${DATE}`); console.log("guard=NO_LANE"); process.exit(0); }

const doc = buildGuardFromRepo(REPO, lane);
const text = `${JSON.stringify(doc, null, 1)}\n`;
const s = guardSummary(doc);
console.log(`${DATE}: ${s.players} rows · pass ${s.pass} (cell-only ${s.cellOnly}) · review ${s.review} · blocked ${s.blocked} · favoured under review ${s.favouredReview} · box scores ${doc.inputs.boxscores.selected}`);
const file = path.join(OUT, `${DATE}.json`);
let existing = null;
try { existing = fs.readFileSync(file, "utf8"); } catch { /* none */ }
if (existing != null) {
  if (existing === text) { console.log("guard=NOOP"); process.exit(0); }
  console.error(`REFUSED: ${path.relative(REPO, file)} is already written and differs — a guard document is write-once`);
  console.log("guard=REFUSED"); process.exit(1);
}
if (!argv.includes("--write")) { console.log("guard=DRY"); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(file, text);
console.log(`  wrote ${path.relative(REPO, file)}`);
console.log("guard=WROTE");
