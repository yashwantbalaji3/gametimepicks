#!/usr/bin/env node
/**
 * NBA PRICED-LINE GRADES → the APPEND-ONLY priced prop-grade ledger. PRIVATE research, descriptive only. OFFLINE: it reads
 * committed files only (no network, no key), and makes no pick.
 *
 * The ONE writer of data/internal/research/nba/priced-props/ledger.jsonl (priced-prop-grading.test.mjs pins it).
 * Inputs, all committed:
 *   - price records: data/internal/research/odds/nba/props/*.json (`records`, gtp.nba.prop-price@1)
 *   - finals: app/public/data/nba/results/finals-<season>.json (write-once finals record)
 *   - box scores: the stored FINAL box scores, located exactly as Top Board / v0.1 shadow grading locate them
 * Grading and holds are PR 1169's (lib/sports/nba/priced-prop-grading.mjs over prop-settlement.mjs).
 *
 *   npx tsx scripts/nba/grade-nba-priced-props.mjs --now <ISO> [--write] [--out-dir DIR]
 *     default        dry run: grade and report, write nothing
 *     --write        append the new entries to the repo ledger
 *     --out-dir DIR  read/write DIR/priced-props/ledger.jsonl instead (a scratch run never touches the repo ledger)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nbaBoxscoreLocator, nbaPropResult, readNbaFinalsRecords } from "../../src/lib/sports/nba/prop-settlement-source.mjs";
import { boxscoreContentHash, boxscorePointsCheck } from "../../src/lib/sports/nba/experimental-grading-ledger.mjs";
import { finalFor } from "../../src/lib/sports/nba/finals-record.mjs";
import { HOLD, propGradeHolds } from "../../src/lib/sports/nba/prop-shadow-grading.mjs";
import {
  PRICED_DIR, PRICED_GRADER_VERSION, PRICED_LEDGER_FILE, appendPricedGrades, gradePricedRow, parsePricedLedger,
  pricedLedgerAppendOnlyViolations, pricedLedgerLines, pricedRow, summarisePricedGrades,
} from "../../src/lib/sports/nba/priced-prop-grading.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_REPO = path.resolve(APP, "..");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
export const pricedLedgerPath = (root, { outDir = false } = {}) =>
  outDir ? path.join(root, PRICED_DIR, PRICED_LEDGER_FILE) : path.join(root, "data", "internal", "research", "nba", PRICED_DIR, PRICED_LEDGER_FILE);
export class Refused extends Error {}

/** Grade (and with `write`, append). Returns a report; throws `Refused` on any refusal (nothing written). */
export function runPricedGrading({ repoRoot = DEFAULT_REPO, now, write = false, outDir = null, log = () => {} }) {
  if (!Number.isFinite(Date.parse(now ?? ""))) throw new Refused("--now must be ISO");
  const rel = (f) => path.relative(repoRoot, f);
  const propsDir = path.join(repoRoot, "data", "internal", "research", "odds", "nba", "props");
  const files = fs.existsSync(propsDir) ? fs.readdirSync(propsDir).filter((f) => f.endsWith(".json")).sort() : [];

  const finalsRecord = readNbaFinalsRecords({ repoRoot });
  const holds = propGradeHolds({ finalsRecord });
  const findBox = nbaBoxscoreLocator({ repoRoot });

  const repoLedger = pricedLedgerPath(repoRoot);
  const target = outDir ? pricedLedgerPath(path.resolve(outDir), { outDir: true }) : repoLedger;
  const source = outDir && fs.existsSync(target) ? target : repoLedger;
  const beforeText = fs.existsSync(source) ? fs.readFileSync(source, "utf8") : "";
  const parsed = parsePricedLedger(beforeText);
  if (parsed.errors.length) throw new Refused(`${rel(source)} is not valid JSONL: ${parsed.errors.join("; ")}`);
  const pre = pricedLedgerAppendOnlyViolations({ beforeText: "", afterText: beforeText });
  if (pre.length) throw new Refused(`${rel(source)} already violates the append-only rules: ${pre.join("; ")}`);

  const items = [];
  const held = new Map();
  const skipped = [];
  const boxCache = new Map();
  const boxFor = (id) => { if (!boxCache.has(id)) boxCache.set(id, findBox(id)); return boxCache.get(id); };
  for (const file of files) {
    const doc = readJson(path.join(propsDir, file));
    for (const rec of doc.records ?? []) {
      const row = pricedRow(rec, { sourceFile: rel(path.join(propsDir, file)) });
      if (!row) { skipped.push({ file, recordId: rec?.recordId ?? null, reason: "NOT_A_PRICE_RECORD" }); continue; }
      const id = row.eventId;
      const hold = holds.get(id);
      if (hold) { held.set(id, hold); continue; }
      const fin = finalFor(finalsRecord, id);
      const box = boxFor(id);
      if (box && fin.state === "FINAL") {
        const finRow = (finalsRecord.finals ?? []).find((f) => String(f.providerEventId) === id) ?? null;
        const pc = boxscorePointsCheck(box.doc, { homeTeamId: finRow?.home?.providerTeamId, awayTeamId: finRow?.away?.providerTeamId, ftHome: fin.ftHome, ftAway: fin.ftAway });
        if (pc?.agrees === false) { held.set(id, { hold: HOLD.BOXSCORE_POINTS_DISAGREE, reason: `box-score points ${pc.home}-${pc.away} vs recorded final ${fin.ftHome}-${fin.ftAway} (${box.file})` }); continue; }
      }
      const result = nbaPropResult({ finalsRecord, boxscore: box?.doc ?? null, boxscoreSource: box?.file ?? null, providerEventId: id, providerAthleteId: row.playerId });
      const g = gradePricedRow(row, result);
      items.push({
        ...row, ...g, date: doc.capturedFor ? String(doc.capturedFor).slice(0, 10) : null,
        inputs: {
          finalSource: result.provenance.finals, finalState: fin.state,
          final: fin.state === "PENDING" ? null : { ftHome: fin.ftHome, ftAway: fin.ftAway },
          boxscoreSource: box ? box.source : null, boxscoreFile: box ? box.file : null,
          boxscoreHash: box ? boxscoreContentHash(box.doc) : null, boxscoreCapturedAt: box?.doc?.capturedAt ?? null,
        },
      });
    }
  }
  for (const [id, h] of held) log(`  ${id}: ${h.hold} — ${h.reason} — no ledger entry`);

  const { appended, pricedMismatches } = appendPricedGrades(parsed.entries, items, { gradedAt: new Date(Date.parse(now)).toISOString(), graderVersion: PRICED_GRADER_VERSION });
  if (pricedMismatches.length) throw new Refused(`priced blocks changed since they were recorded (write-once): ${pricedMismatches.slice(0, 5).map((m) => m.key).join(", ")}`);
  const newText = pricedLedgerLines(appended);
  const afterText = beforeText + newText;
  const violations = pricedLedgerAppendOnlyViolations({ beforeText, afterText });
  if (violations.length) throw new Refused(`append-only guard: ${violations.slice(0, 5).join("; ")}`);

  const lineage = appended.reduce((m, e) => ({ ...m, [e.lineageReason]: (m[e.lineageReason] ?? 0) + 1 }), {});
  const summary = summarisePricedGrades([...parsed.entries, ...appended]);
  log(`[priced lines] files ${files.length} · items ${items.length} · held ${held.size} game(s) · skipped ${skipped.length} · ${write ? "appending" : "would append"} ${appended.length} ${JSON.stringify(lineage)} · ledger ${parsed.entries.length} → ${parsed.entries.length + appended.length}`);
  for (const [family, s] of Object.entries(summary)) log(`  [priced, descriptive] ${family}: rows ${s.rows} · graded ${s.graded} (over ${s.over} · under ${s.under} · push ${s.push}) · no measurement ${s.noMeasurement} · pending ${s.pending} · void ${s.voids}`);

  const report = { files: files.length, items: items.length, held: [...held.keys()], skipped, appended: appended.length, lineage, summary, ledger: rel(target), wrote: false };
  if (!write) { log("dry run — pass --write to append (descriptive only; nothing here is a pick)"); return report; }
  if (!appended.length) { log("ledger unchanged"); return report; }
  const nowText = fs.existsSync(source) ? fs.readFileSync(source, "utf8") : "";
  if (nowText !== beforeText) throw new Refused("ledger changed during this run");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (target === source && fs.existsSync(target)) fs.appendFileSync(target, newText);
  else fs.writeFileSync(target, afterText, { flag: "wx" }); // a new file only; never over an existing ledger
  const written = fs.readFileSync(target, "utf8");
  const post = pricedLedgerAppendOnlyViolations({ beforeText, afterText: written });
  if (written !== afterText || post.length) throw new Refused(`post-write check failed: ${post.join("; ") || "content differs from the planned append"}`);
  log(`wrote ${outDir ? target : rel(target)} (+${appended.length})`);
  return { ...report, wrote: true };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
  try {
    runPricedGrading({ now: arg("--now"), write: process.argv.includes("--write"), outDir: arg("--out-dir"), log: (s) => console.log(s) });
  } catch (e) {
    if (e instanceof Refused) { console.error(`REFUSED: ${e.message}`); process.exit(2); }
    throw e;
  }
}
