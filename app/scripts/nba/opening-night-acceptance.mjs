/**
 * NBA opening-night acceptance (NBA-12) — READ-ONLY. Reads the committed artifacts, prints the check table, writes
 * nothing unless --json/--md paths are given (and never inside data/ or app/public/).
 *
 * Run (from app/):
 *   node scripts/nba/opening-night-acceptance.mjs                         # now, committed artifacts
 *   node scripts/nba/opening-night-acceptance.mjs --now 2026-10-20T18:00:00Z --out out --md /tmp/acc.md --json /tmp/acc.json
 * Exit: 0 READY_SO_FAR / COMPLETE · 1 NOT_READY · 2 usage
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateOpeningNight, renderMarkdown, FAMILY_DIRS } from "../../src/lib/sports/nba/opening-acceptance.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const now = opt("--now") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
if (!Number.isFinite(Date.parse(now))) { console.error("REFUSED: --now must be an ISO instant"); process.exit(2); }

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const research = path.join(ROOT, "data", "internal", "research");
const forecastsByFamily = {};
for (const [family, dir] of Object.entries(FAMILY_DIRS)) {
  const d = path.join(research, "nba", dir);
  if (!fs.existsSync(d)) continue; // not armed
  forecastsByFamily[family] = readJson(path.join(d, "forecasts", "2026-10-20.json"));
}
const outDir = opt("--out");
const nbaHtml = outDir ? (() => { try { return fs.readFileSync(path.resolve(APP, outDir, "nba", "index.html"), "utf8"); } catch { return null; } })() : null;

const report = evaluateOpeningNight({
  now,
  schedule: readJson(path.join(APP, "public", "data", "nba", "schedule", "latest.json")),
  rosters: readJson(path.join(research, "nba", "rosters", "latest.json")),
  injuries: readJson(path.join(research, "injuries", "nba", "latest.json")),
  forecastsByFamily,
  finals: readJson(path.join(APP, "public", "data", "nba", "results", "finals-2026-27.json")),
  nbaHtml,
});

const guard = (p) => {
  const abs = path.resolve(p);
  if (abs.startsWith(path.join(ROOT, "data") + path.sep) || abs.startsWith(path.join(APP, "public") + path.sep)) {
    console.error(`REFUSED: ${p} is inside a data tree — acceptance never writes there`); process.exit(2);
  }
  return abs;
};
const md = renderMarkdown(report);
if (opt("--md")) fs.writeFileSync(guard(opt("--md")), md);
if (opt("--json")) fs.writeFileSync(guard(opt("--json")), JSON.stringify(report, null, 1) + "\n");
process.stdout.write(md);
process.exit(report.verdict === "NOT_READY" ? 1 : 0);
