#!/usr/bin/env node
/**
 * NBA Top Boards — daily performance report (PRIVATE). OFFLINE: reads only committed files.
 *
 * For one ET date: the frozen board file, the append-only grades ledger, the family's forecast artifact (for the
 * played-but-not-simulated check) and the committed box scores. Writes
 *   data/internal/research/nba/reports/daily/<date>.json  and  <date>.md
 * (or --out-dir). The report is rebuilt from the ledger each run; it holds no state of its own.
 *
 *   node scripts/nba/nba-daily-performance-report.mjs [--family v0.1] [--date YYYY-MM-DD] [--now ISO] [--write]
 *        [--boards-dir DIR] [--ledger FILE] [--out-dir DIR] [--boxscore-dir DIR ...]
 *   --date default: the ET date before --now (last night's slate)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { etDateOf } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { DEFAULT_BOARD_FAMILY } from "../../src/lib/sports/nba/top-boards.mjs";
import { emptyGradesLedger } from "../../src/lib/sports/nba/top-board-grading.mjs";
import { buildDailyReport, reportMarkdown } from "../../src/lib/sports/nba/top-board-report.mjs";
import { boardFamilySpec, parseArgs } from "./top-board-families.mjs";
import { boxscoreLocator } from "./grade-nba-top-boards.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const NBA = path.join(REPO, "data", "internal", "research", "nba");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

function main() {
  const argv = process.argv.slice(2);
  const { opt, flag } = parseArgs(argv);
  let spec;
  try { spec = boardFamilySpec(opt("--family") ?? DEFAULT_BOARD_FAMILY); } catch (e) { console.error(e.message); process.exit(1); }
  const NOW = opt("--now") ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now must be ISO"); process.exit(1); }
  const DATE = opt("--date") ?? etDateOf(new Date(Date.parse(NOW) - 86_400_000).toISOString());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }
  const BOARDS = opt("--boards-dir") ? path.resolve(opt("--boards-dir")) : path.join(NBA, "top-boards", spec.family);
  const LEDGER = opt("--ledger") ? path.resolve(opt("--ledger")) : path.join(BOARDS, "ledger.json");
  const OUT = opt("--out-dir") ? path.resolve(opt("--out-dir")) : path.join(NBA, "reports", "daily");
  const extra = argv.flatMap((a, i) => (a === "--boxscore-dir" && argv[i + 1] ? [argv[i + 1]] : []));

  const boardFile = path.join(BOARDS, `${DATE}.json`);
  const boardDoc = fs.existsSync(boardFile) ? readJson(boardFile) : null;
  const ledger = fs.existsSync(LEDGER) ? readJson(LEDGER) : emptyGradesLedger({ family: spec.family });
  const forecastFile = path.join(NBA, spec.dir, "forecasts", `${DATE}.json`);
  const forecastArtifact = fs.existsSync(forecastFile) ? readJson(forecastFile) : null;
  const find = boxscoreLocator(extra);
  const report = buildDailyReport({ date: DATE, family: spec.family, generatedAt: NOW, boardDoc, ledger, forecastArtifact, boxscoreOf: (id) => find(id)?.doc ?? null });
  const md = reportMarkdown(report);
  const s = report.s05_settlement.counts;
  console.log(`[report ${spec.family}] ${DATE}: rows ${report.s03_rowsPublishedPrivate.total} · graded ${report.s04_graded.projectionGraded} · W ${s.WIN} L ${s.LOSS} P ${s.PUSH} V ${s.VOID} · pending ${s.PENDING} · ungradable ${s.UNGRADABLE}`);
  if (!flag("--write")) { console.log("dry run — pass --write to persist"); console.log(md); return; }
  fs.mkdirSync(OUT, { recursive: true });
  // One family per file name when it is not the champion, so two families never overwrite each other's report.
  const stem = spec.family === DEFAULT_BOARD_FAMILY ? DATE : `${DATE}.${spec.family}`;
  fs.writeFileSync(path.join(OUT, `${stem}.json`), JSON.stringify(report, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT, `${stem}.md`), md);
  console.log(`wrote ${path.relative(REPO, path.join(OUT, stem))}.{json,md}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
