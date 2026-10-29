#!/usr/bin/env node
/**
 * PRIVATE NBA line coverage report with true denominators (launch program 2026-10-29). Offline: reads files, calls nothing.
 *
 * Joins, for one slate date:
 *   - the committed lane       app/public/data/nba/experimental-public/<date>.json   (or --lane <file>; the denominator)
 *   - that date's captures     <private>/odds/nba/props/*.json                       (adapter records + refusals)
 *   - the private board        <private>/odds/nba/line-board/<date>.json             (read for its asOf + cross-check)
 *   - optionally a built export (--export <dir>): rendered comparison rows on /nba/projections/<date>/ and game pages
 * and writes <out>/<date>.json (private: names allowed, never a price) + <out>/<date>.md (aggregates only).
 * --public-summary also writes <out>/<date>.public-summary.{json,md}: counts and percentages only.
 * stdout carries aggregates only — never a price, a line or a player.
 *
 *   npx tsx scripts/nba/nba-line-coverage.mjs --date YYYY-MM-DD [--as-of ISO] [--private-dir /abs] [--out /abs]
 *       [--props-dir /abs] [--lane /abs/lane.json] [--export /abs/export-dir] [--public-summary]
 *
 * The private root is --private-dir, else GTP_PRIVATE_DATA_DIR, else ~/gtp-private. Every output directory is refused
 * when it is inside this repository or any git working tree (resolvePrivateDataDir).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePrivateDataDir, PRIVATE_DIR_ENV } from "../../src/lib/ops/private-data-dir.mjs";
import { buildNbaLineCoverage, countRenderedComparisons, publicCoverageSummary, coverageMarkdown } from "../../src/lib/sports/nba/line-coverage.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] ?? null : null; };
const flag = (k) => process.argv.includes(k);
const refuse = (code, msg) => { console.error(`REFUSED: ${msg}`); process.exit(code); };

const DATE = arg("--date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) refuse(2, "--date YYYY-MM-DD required");
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");

const privRoot = arg("--private-dir") ?? (process.env[PRIVATE_DIR_ENV]?.trim() || path.join(os.homedir(), "gtp-private"));
const priv = resolvePrivateDataDir({ cliDir: privRoot, repoRoot: REPO });
if (!priv.ok) refuse(2, `private directory refused (${priv.reason})`);
const outReq = arg("--out") ?? path.join(priv.dir, "odds", "nba", "coverage");
const outDir = resolvePrivateDataDir({ cliDir: outReq, repoRoot: REPO });
if (!outDir.ok) refuse(2, `--out refused (${outDir.reason}) — coverage output names players and never enters a repository`);

const lanePath = arg("--lane") ?? path.join(APP, "public", "data", "nba", "experimental-public", `${DATE}.json`);
if (!fs.existsSync(lanePath)) refuse(3, `no lane for ${DATE}`);
const lane = JSON.parse(fs.readFileSync(lanePath, "utf8"));
if (lane.date !== DATE) refuse(3, `lane date ${lane.date} is not ${DATE}`);
const laneEvents = new Set((lane.games ?? []).map((g) => String(g.providerEventId)));

// Captures for this slate: any file touching a lane event, or captured on the slate's UTC date or the next one.
const propsDir = arg("--props-dir") ?? path.join(priv.dir, "odds", "nba", "props");
const nextDay = new Date(Date.parse(`${DATE}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const captures = [];
if (fs.existsSync(propsDir)) {
  for (const f of fs.readdirSync(propsDir).filter((n) => n.endsWith(".json")).sort()) {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(propsDir, f), "utf8")); } catch { console.error(`skipped unreadable capture ${f}`); continue; }
    const day = String(doc.capturedFor ?? f).slice(0, 10);
    const touches = (doc.records ?? []).some((r) => laneEvents.has(String(r.eventId)))
      || (doc.refusals ?? []).some((r) => laneEvents.has(String(r.eventId)))
      || (doc.coverage?.events?.matchedEventIds ?? []).some((e) => laneEvents.has(String(e)));
    if (touches || day === DATE || day === nextDay) captures.push({ file: f, doc });
  }
}

const boardPath = path.join(priv.dir, "odds", "nba", "line-board", `${DATE}.json`);
const privateBoard = fs.existsSync(boardPath) ? JSON.parse(fs.readFileSync(boardPath, "utf8")) : null;
const AS_OF = arg("--as-of") ?? privateBoard?.asOf ?? new Date().toISOString();
if (!Number.isFinite(Date.parse(AS_OF))) refuse(2, "--as-of must be an ISO instant");

let rendered = null;
const exportDir = arg("--export");
if (exportDir) {
  if (!fs.existsSync(exportDir)) refuse(3, `--export ${exportDir} does not exist`);
  const read = (rel) => { const p = path.join(exportDir, rel, "index.html"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null; };
  const pages = [{ page: `/nba/projections/${DATE}/`, html: read(path.join("nba", "projections", DATE)) }];
  for (const e of laneEvents) pages.push({ page: `/nba/simulation/${e}/`, html: read(path.join("nba", "simulation", e)) });
  rendered = countRenderedComparisons(pages);
}

const report = buildNbaLineCoverage({ lane, captures, asOf: AS_OF, rendered });
report.privateBoard = privateBoard
  ? { present: true, asOf: privateBoard.asOf ?? null, agrees: privateBoard.asOf === AS_OF ? privateBoard.coverage?.compared === report.boardCoverage.compared && privateBoard.coverage?.playerFamilies === report.boardCoverage.playerFamilies : null }
  : { present: false };

fs.mkdirSync(outDir.dir, { recursive: true });
const base = path.join(outDir.dir, DATE);
fs.writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 1)}\n`);
fs.writeFileSync(`${base}.md`, coverageMarkdown(report));
const pub = publicCoverageSummary(report);
const wrote = [`${base}.json`, `${base}.md`];
if (flag("--public-summary")) {
  fs.writeFileSync(`${base}.public-summary.json`, `${JSON.stringify(pub, null, 1)}\n`);
  fs.writeFileSync(`${base}.public-summary.md`, coverageMarkdown(report, { publicOnly: true }));
  wrote.push(`${base}.public-summary.json`, `${base}.public-summary.md`);
}
// stdout: the public aggregate only.
console.log(JSON.stringify({ ...pub, privateBoard: report.privateBoard, wrote }, null, 2));
