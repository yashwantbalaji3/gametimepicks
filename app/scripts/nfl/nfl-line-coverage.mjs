#!/usr/bin/env node
/**
 * PRIVATE NFL line coverage report with true denominators (launch program 2026-10-29). OFFLINE: reads files, calls
 * nothing (no provider, no network).
 *
 * Joins, for one NFL week:
 *   - the official per-game boards   app/public/data/nfl/player-board/<event>.json  (seasonType + week; the denominator)
 *   - every private capture          <private>/odds/nfl/<stamp>/capture-*.json       (propProbe lineProps / anytimeTd)
 *   - the credit ledger              --ledger <file> (p171-ledger.json; cumulative credits, per-game prop calls)
 * through the NFL adapter (lib/sports/nfl/prop-line-adapter.mjs — the page's exact rule) and writes
 *   <out>/week<N>.json + .md          PRIVATE (per-book player counts, remediation; never a price or a line)
 *   <out>/week<N>.public-summary.*    with --public-summary: counts and percentages only
 * stdout carries the public aggregate only — never a price, a line, a book or a player.
 *
 *   npx tsx scripts/nfl/nfl-line-coverage.mjs [--week 8] [--season-type 2] [--as-of ISO] [--private-dir /abs] [--out /abs]
 *       [--captures-dir /abs] [--ledger /abs/p171-ledger.json] [--public-summary]
 *
 * The private root is --private-dir, else GTP_PRIVATE_DATA_DIR, else ~/gtp-private. Every output directory is refused
 * when it is inside this repository or any git working tree (resolvePrivateDataDir).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePrivateDataDir, PRIVATE_DIR_ENV } from "../../src/lib/ops/private-data-dir.mjs";
import { buildNflLineCoverage, publicNflCoverageSummary, nflCoverageMarkdown } from "../../src/lib/sports/nfl/line-coverage.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] ?? null : null; };
const flag = (k) => process.argv.includes(k);
const refuse = (code, msg) => { console.error(`REFUSED: ${msg}`); process.exit(code); };

const WEEK = Number(arg("--week") ?? 8);
const SEASON_TYPE = Number(arg("--season-type") ?? 2);
if (!Number.isInteger(WEEK) || WEEK < 1) refuse(2, "--week must be a positive integer");
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");

const privRoot = arg("--private-dir") ?? (process.env[PRIVATE_DIR_ENV]?.trim() || path.join(os.homedir(), "gtp-private"));
const priv = resolvePrivateDataDir({ cliDir: privRoot, repoRoot: REPO });
if (!priv.ok) refuse(2, `private directory refused (${priv.reason})`);
const outDir = resolvePrivateDataDir({ cliDir: arg("--out") ?? path.join(priv.dir, "odds", "nfl", "coverage"), repoRoot: REPO });
if (!outDir.ok) refuse(2, `--out refused (${outDir.reason}) — coverage output never enters a repository`);

const boardDir = path.join(APP, "public", "data", "nfl", "player-board");
const boards = fs.readdirSync(boardDir).filter((f) => /^\d+\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(boardDir, f), "utf8")))
  .filter((b) => b.week === WEEK && b.seasonType === SEASON_TYPE);
if (!boards.length) refuse(3, `no official boards for seasonType ${SEASON_TYPE} week ${WEEK}`);

const capDir = arg("--captures-dir") ?? path.join(priv.dir, "odds", "nfl");
const captures = [];
if (fs.existsSync(capDir)) {
  for (const stamp of fs.readdirSync(capDir).sort()) {
    const d = path.join(capDir, stamp);
    if (!fs.statSync(d).isDirectory() || stamp === "coverage") continue;
    for (const f of fs.readdirSync(d).filter((n) => /^capture-.*\.json$/.test(n)).sort()) {
      let doc;
      try { doc = JSON.parse(fs.readFileSync(path.join(d, f), "utf8")); } catch { console.error(`skipped unreadable capture ${stamp}/${f}`); continue; }
      if (doc.artifact !== "nfl-odds-capture" || doc.sport !== "nfl") continue;
      captures.push({ file: `${stamp}/${f}`, doc });
    }
  }
}
const ledgerPath = arg("--ledger");
let ledger = null;
if (ledgerPath) {
  if (!fs.existsSync(ledgerPath)) refuse(3, `--ledger ${ledgerPath} does not exist`);
  ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
}
const AS_OF = arg("--as-of") ?? new Date().toISOString();
if (!Number.isFinite(Date.parse(AS_OF))) refuse(2, "--as-of must be an ISO instant");

const report = buildNflLineCoverage({ boards, captures, ledger, asOf: AS_OF });
fs.mkdirSync(outDir.dir, { recursive: true });
const base = path.join(outDir.dir, `week${WEEK}`);
fs.writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 1)}\n`);
fs.writeFileSync(`${base}.md`, nflCoverageMarkdown(report));
const pub = publicNflCoverageSummary(report);
const wrote = [`${base}.json`, `${base}.md`];
if (flag("--public-summary")) {
  fs.writeFileSync(`${base}.public-summary.json`, `${JSON.stringify(pub, null, 1)}\n`);
  fs.writeFileSync(`${base}.public-summary.md`, nflCoverageMarkdown(report, { publicOnly: true }));
  wrote.push(`${base}.public-summary.json`, `${base}.public-summary.md`);
}
// stdout: the public aggregate only (no per-game rows, no book names, no prices or lines).
console.log(JSON.stringify({ version: pub.version, asOf: pub.asOf, games: pub.games, displayAuthorized: pub.displayAuthorized, totals: pub.totals, byMarket: pub.byMarket, captures: captures.length, wrote }, null, 2));
