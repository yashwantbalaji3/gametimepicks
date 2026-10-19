#!/usr/bin/env node
/**
 * Grade the frozen NBA Top Boards into an APPEND-ONLY private ledger. OFFLINE: reads only committed files.
 *
 * Box scores come from the same places grade-nba-experimental-forecasts.mjs reads them — the canonical corpus
 * (data/internal/research/nba/boxscores/<id>.json) and the per-family fetch caches (<family dir>/boxscores/<id>.json)
 * that its --fetch step fills — so in the nightly job this runs AFTER that grader and never touches the network.
 * A game with no final box score yet is PENDING (never a loss); a postponed / cancelled game is VOID.
 *
 *   node scripts/nba/grade-nba-top-boards.mjs [--family v0.1] [--date YYYY-MM-DD] [--now ISO] [--write]
 *        [--boards-dir DIR] [--ledger FILE] [--boxscore-dir DIR ...]
 * Exit 0 ok · 1 usage / refused.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { DEFAULT_BOARD_FAMILY } from "../../src/lib/sports/nba/top-boards.mjs";
import { appendGrades, boardRows, emptyGradesLedger, gradeBoardRow, ledgerAppendOnlyViolations, SETTLEMENT } from "../../src/lib/sports/nba/top-board-grading.mjs";
import { boardFamilySpec, parseArgs, V1_FALLBACK } from "./top-board-families.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const NBA = path.join(REPO, "data", "internal", "research", "nba");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

/** Box-score lookup across the canonical corpus and every family's fetch cache (plus any extra dirs). */
export function boxscoreLocator(extraDirs = []) {
  const dirs = [
    ...extraDirs.map((d) => [path.resolve(d), "extra"]),
    [path.join(NBA, "boxscores"), "corpus"],
    ...[...Object.values(FAMILIES), V1_FALLBACK].map((f) => [path.join(NBA, f.dir, "boxscores"), `${f.dir}-fetch`]),
  ];
  return (id) => {
    for (const [dir, source] of dirs) {
      const f = path.join(dir, `${id}.json`);
      if (fs.existsSync(f)) { try { return { doc: readJson(f), source, file: path.relative(REPO, f) }; } catch { /* unreadable → absent */ } }
    }
    return null;
  };
}

/** statusRaw per event from the committed results + schedule captures (results win: they only hold finals). */
export function statusLocator() {
  const m = new Map();
  for (const f of [path.join(APP, "public", "data", "nba", "schedule", "latest.json"), path.join(APP, "public", "data", "nba", "results", "latest.json")]) {
    try { for (const r of readJson(f).rows ?? []) if (r?.providerEventId) m.set(String(r.providerEventId), r.statusRaw ?? null); } catch { /* absent capture → unknown */ }
  }
  return (id) => m.get(String(id)) ?? null;
}

function main() {
  const argv = process.argv.slice(2);
  const { opt, flag } = parseArgs(argv);
  let spec;
  try { spec = boardFamilySpec(opt("--family") ?? DEFAULT_BOARD_FAMILY); } catch (e) { console.error(e.message); process.exit(1); }
  const NOW = opt("--now") ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now must be ISO"); process.exit(1); }
  const ONLY = opt("--date");
  if (ONLY && !/^\d{4}-\d{2}-\d{2}$/.test(ONLY)) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }
  const BOARDS = opt("--boards-dir") ? path.resolve(opt("--boards-dir")) : path.join(NBA, "top-boards", spec.family);
  const LEDGER = opt("--ledger") ? path.resolve(opt("--ledger")) : path.join(BOARDS, "ledger.json");
  const extra = argv.flatMap((a, i) => (a === "--boxscore-dir" && argv[i + 1] ? [argv[i + 1]] : []));
  if (!fs.existsSync(BOARDS)) { console.log(`[top-board grades ${spec.family}] no boards directory ${path.relative(REPO, BOARDS)} — nothing to grade`); return; }

  const findBox = boxscoreLocator(extra);
  const statusOf = statusLocator();
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().filter((f) => !ONLY || f === `${ONLY}.json`);
  const beforeText = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, "utf8") : null;
  const before = beforeText ? JSON.parse(beforeText) : emptyGradesLedger({ family: spec.family });
  if (before.family !== spec.family) { console.error(`REFUSED: ledger family ${before.family} ≠ ${spec.family}`); process.exit(1); }

  const grades = [];
  const sources = new Map();
  for (const f of files) {
    const doc = readJson(path.join(BOARDS, f));
    if (doc.family !== spec.family) { console.error(`REFUSED: ${f} declares family ${doc.family}, not ${spec.family}`); process.exit(1); }
    const rows = boardRows(doc);
    const counts = {};
    for (const row of rows) {
      const box = findBox(row.eventId);
      const g = { ...gradeBoardRow(row, { boxscore: box?.doc ?? null, gameStatus: statusOf(row.eventId) }), date: doc.date, edition: row.edition };
      if (box) sources.set(g.rowId, { boxscore: box.source, file: box.file, capturedAt: box.doc?.capturedAt ?? null });
      grades.push(g);
      counts[g.settlement.status] = (counts[g.settlement.status] ?? 0) + 1;
    }
    console.log(`[${spec.family}] ${doc.date}: rows ${rows.length} · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}`);
  }
  const { ledger, appended } = appendGrades(before, grades, { gradedAt: NOW, sourceOf: (g) => sources.get(g.rowId) ?? null });
  ledger.updatedAt = appended.length ? NOW : before.updatedAt ?? null;
  const wl = ledger.entries.filter((e) => [SETTLEMENT.WIN, SETTLEMENT.LOSS, SETTLEMENT.PUSH].includes(e.settlement?.status)).length;
  console.log(`appended ${appended.length} entr${appended.length === 1 ? "y" : "ies"} (${[...new Set(appended.map((e) => e.lineageReason))].join(", ") || "none"}) · W/L/P entries in ledger: ${wl} (no line is recorded, so none can exist)`);
  const v = ledgerAppendOnlyViolations({ before, after: ledger });
  if (v.length) { console.error(`REFUSED: ${v.join("; ")}`); process.exit(1); }
  if (!flag("--write")) { console.log("dry run — pass --write to append"); return; }
  if (!appended.length && beforeText) { console.log("ledger unchanged"); return; }
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  if ((fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, "utf8") : null) !== beforeText) { console.error("REFUSED: ledger changed during this run"); process.exit(1); }
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + "\n");
  console.log(`wrote ${path.relative(REPO, LEDGER)} (${ledger.entries.length} entries)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
