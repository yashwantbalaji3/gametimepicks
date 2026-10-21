#!/usr/bin/env node
/**
 * NBA PLAYER SHADOW GRADES → the APPEND-ONLY prop-grade ledger. PRIVATE research. OFFLINE: no network, no odds.
 *
 * The ONE writer of data/internal/research/nba/prop-grades/v0.1/ledger.jsonl (settlement-contract.test.mjs pins it;
 * every rule lives in src/lib/sports/nba/prop-shadow-grading.mjs, which writes nothing).
 *
 * What it grades: each official v0.1 player row frozen before tip — `nbaOfficialSnapshot` over the committed
 * experimental-v0.1/forecasts/<date>.json (receipt intact, generated strictly before tip) — for pts, reb, ast,
 * threePm, pra, ptsReb and ptsAst: frozen median vs the box-score actual. No price, no sportsbook line, no pick.
 *
 * Inputs (all read-only, all committed): the finals record app/public/data/nba/results/finals-<season>.json, and the
 * stored box scores in the order Top Board grading reads them (prop-settlement-source.mjs nbaBoxscoreDirs: canonical
 * corpus, then each family's fetch cache). In the nightly job it runs AFTER family grading, which fills those caches.
 *
 * Never graded (no ledger entry): a finals-record conflict (FINAL_UNDER_REVIEW), an explicit HOLD (401901822), a final
 * whose team ids disagree with the forecast, a box score whose summed points disagree with the recorded final, and a
 * game whose official snapshot is refused (broken receipt, not pre-tip).
 *
 *   npx tsx scripts/nba/grade-nba-player-props.mjs (--date YYYY-MM-DD | --since YYYY-MM-DD) [--now ISO] [--write]
 *        [--out-dir DIR] [--boxscore-dir DIR ...]
 *   dry run by default; --write appends the new lines.
 *   --out-dir DIR       the ledger goes to DIR/prop-grades/v0.1/ledger.jsonl (the repo's ledger is read as the starting
 *                       point and never written).
 *   --boxscore-dir DIR  extra read-only box-score directory searched first (e.g. scratch box scores). Only with
 *                       --out-dir when --write is given: a scratch source never writes the repo's ledger.
 * Exit 0 ok · 1 usage / refused.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { familySpec } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { nbaOfficialSnapshot, SnapshotRefusal } from "../../src/lib/consistency/official-snapshot.mjs";
import { nbaBoxscoreLocator, nbaPropResult, readNbaFinalsRecords } from "../../src/lib/sports/nba/prop-settlement-source.mjs";
import { boxscoreContentHash, boxscorePointsCheck } from "../../src/lib/sports/nba/experimental-grading-ledger.mjs";
import { finalFor } from "../../src/lib/sports/nba/finals-record.mjs";
import {
  HOLD, PROP_GRADES_DIR, PROP_GRADE_LEDGER_FILE, PROP_SHADOW_FAMILY, PROP_SHADOW_GRADER_VERSION,
  appendPropShadowGrades, currentShadowGrades, frozenShadowRows, gradeShadowRow, parsePropLedger, propGradeHolds,
  propLedgerAppendOnlyViolations, propLedgerLines, summariseShadowGrades,
} from "../../src/lib/sports/nba/prop-shadow-grading.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_REPO = path.resolve(APP, "..");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

/** The ledger path for a repo root (or an --out-dir root). */
export const propLedgerPath = (root, { outDir = false } = {}) =>
  outDir ? path.join(root, PROP_GRADES_DIR, PROP_SHADOW_FAMILY, PROP_GRADE_LEDGER_FILE)
    : path.join(root, "data", "internal", "research", "nba", PROP_GRADES_DIR, PROP_SHADOW_FAMILY, PROP_GRADE_LEDGER_FILE);

class Refused extends Error {}

/**
 * Grade (and with `write`, append). Returns a report; throws `Refused` on any refusal (nothing written).
 * @param {{ repoRoot?: string, date?: string|null, since?: string|null, now: string, write?: boolean, outDir?: string|null,
 *           extraBoxscoreDirs?: string[], log?: (s: string) => void }} opts
 */
export function runPropShadowGrading({ repoRoot = DEFAULT_REPO, date = null, since = null, now, write = false, outDir = null, extraBoxscoreDirs = [], log = () => {} }) {
  if (!date === !since) throw new Refused("give exactly one of --date YYYY-MM-DD or --since YYYY-MM-DD");
  if ((date && !DATE.test(date)) || (since && !DATE.test(since))) throw new Refused("dates are YYYY-MM-DD");
  if (!Number.isFinite(Date.parse(now ?? ""))) throw new Refused("--now must be ISO");
  if (write && extraBoxscoreDirs.length && !outDir) throw new Refused("--boxscore-dir with --write only together with --out-dir: a scratch source never writes the repo's ledger");

  const rel = (f) => path.relative(repoRoot, f);
  const forecastsDir = path.join(repoRoot, "data", "internal", "research", "nba", familySpec(PROP_SHADOW_FAMILY).dir, "forecasts");
  const files = fs.existsSync(forecastsDir)
    ? fs.readdirSync(forecastsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().filter((f) => (date ? f === `${date}.json` : f.slice(0, 10) >= since))
    : [];

  const finalsRecord = readNbaFinalsRecords({ repoRoot });
  const holds = propGradeHolds({ finalsRecord });
  const findBox = nbaBoxscoreLocator({ repoRoot, extraDirs: extraBoxscoreDirs });

  const repoLedger = propLedgerPath(repoRoot);
  const target = outDir ? propLedgerPath(path.resolve(outDir), { outDir: true }) : repoLedger;
  const source = outDir && fs.existsSync(target) ? target : repoLedger;
  const beforeText = fs.existsSync(source) ? fs.readFileSync(source, "utf8") : "";
  const parsed = parsePropLedger(beforeText);
  if (parsed.errors.length) throw new Refused(`${rel(source)} is not valid JSONL: ${parsed.errors.join("; ")}`);
  const before = parsed.entries;
  const preViolations = propLedgerAppendOnlyViolations({ beforeText: "", afterText: beforeText });
  if (preViolations.length) throw new Refused(`${rel(source)} already violates the append-only rules: ${preViolations.join("; ")}`);

  const items = [];
  const held = [];
  const refused = [];
  const perDate = [];
  const perEvent = {};
  for (const file of files) {
    const forecastPath = path.join(forecastsDir, file);
    const doc = readJson(forecastPath);
    const day = doc.date ?? file.slice(0, 10);
    const counts = {};
    for (const game of doc.games ?? []) {
      const id = String(game.providerEventId);
      let snapshot;
      try { snapshot = nbaOfficialSnapshot(id, { official: { doc, path: rel(forecastPath) } }); } catch (e) {
        if (!(e instanceof SnapshotRefusal)) throw e;
        refused.push({ date: day, eventId: id, code: e.code, message: e.message });
        continue;
      }
      const hold = holds.get(id);
      if (hold) { held.push({ date: day, eventId: id, ...hold }); continue; }
      const fin = finalFor(finalsRecord, id);
      const finRow = (finalsRecord.finals ?? []).find((f) => String(f.providerEventId) === id) ?? null;
      if (finRow && (String(finRow.home?.providerTeamId) !== String(game.home?.providerTeamId) || String(finRow.away?.providerTeamId) !== String(game.away?.providerTeamId))) {
        held.push({ date: day, eventId: id, hold: HOLD.TEAM_ID_MISMATCH, reason: `final ${finRow.home?.providerTeamId}/${finRow.away?.providerTeamId} vs forecast ${game.home?.providerTeamId}/${game.away?.providerTeamId}` });
        continue;
      }
      const box = findBox(id);
      if (box && fin.state === "FINAL") {
        const pc = boxscorePointsCheck(box.doc, { homeTeamId: game.home?.providerTeamId, awayTeamId: game.away?.providerTeamId, ftHome: fin.ftHome, ftAway: fin.ftAway });
        if (pc?.agrees === false) {
          held.push({ date: day, eventId: id, hold: HOLD.BOXSCORE_POINTS_DISAGREE, reason: `box-score points ${pc.home}-${pc.away} vs recorded final ${fin.ftHome}-${fin.ftAway} (${box.file})` });
          continue;
        }
      }
      const boxscoreHash = box ? boxscoreContentHash(box.doc) : null;
      for (const row of frozenShadowRows(snapshot, { date: day, forecastFile: rel(forecastPath) })) {
        const result = nbaPropResult({ finalsRecord, boxscore: box?.doc ?? null, boxscoreSource: box?.file ?? null, providerEventId: id, providerAthleteId: row.playerId });
        const g = gradeShadowRow(row, result);
        counts[g.state] = (counts[g.state] ?? 0) + 1;
        const ek = `${day}|${id}`;
        perEvent[ek] ??= {};
        perEvent[ek][g.state] = (perEvent[ek][g.state] ?? 0) + 1;
        items.push({
          ...row, ...g,
          inputs: {
            finalSource: result.provenance.finals, finalState: fin.state,
            final: fin.state === "PENDING" ? null : { ftHome: fin.ftHome, ftAway: fin.ftAway },
            boxscoreSource: box ? box.source : null, boxscoreFile: box ? box.file : null, boxscoreHash,
            boxscoreCapturedAt: box?.doc?.capturedAt ?? null,
          },
        });
      }
    }
    perDate.push({ date: day, counts });
    log(`[prop shadow ${PROP_SHADOW_FAMILY}] ${day}: games ${(doc.games ?? []).length} · rows ${Object.values(counts).reduce((s, n) => s + n, 0)} · ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(" · ") || "none"}`);
  }
  for (const h of held) log(`  ${h.eventId} (${h.date}): ${h.hold} — ${h.reason} — no ledger entry`);
  for (const r of refused) log(`  ${r.eventId} (${r.date}): official snapshot refused (${r.code}) — no ledger entry`);

  const { appended, frozenMismatches } = appendPropShadowGrades(before, items, { gradedAt: new Date(Date.parse(now)).toISOString(), graderVersion: PROP_SHADOW_GRADER_VERSION });
  if (frozenMismatches.length) throw new Refused(`frozen rows changed since they were recorded (write-once receipts): ${frozenMismatches.slice(0, 5).map((m) => m.key).join(", ")}${frozenMismatches.length > 5 ? ` … ${frozenMismatches.length} in all` : ""}`);
  const newText = propLedgerLines(appended);
  const afterText = beforeText + newText;
  const violations = propLedgerAppendOnlyViolations({ beforeText, afterText });
  if (violations.length) throw new Refused(`append-only guard: ${violations.slice(0, 5).join("; ")}`);

  const lineage = appended.reduce((m, e) => ({ ...m, [e.lineageReason]: (m[e.lineageReason] ?? 0) + 1 }), {});
  const heldIds = new Map([...holds, ...held.map((h) => [h.eventId, h])]);
  const summary = summariseShadowGrades(currentShadowGrades([...before, ...appended], { held: heldIds }));
  log(`${write ? "appending" : "would append"} ${appended.length} entr${appended.length === 1 ? "y" : "ies"} ${JSON.stringify(lineage)} · held ${held.length} game(s) · snapshot refused ${refused.length} · ledger ${before.length} → ${before.length + appended.length} lines`);
  for (const [family, s] of Object.entries(summary)) {
    if (s.graded || s.noMeasurement || s.voids) log(`  [shadow, descriptive] ${family}: graded ${s.graded} · MAE ${s.mae == null ? "—" : s.mae.toFixed(3)} · at/below median ${s.atOrBelowMedian}/${s.graded} · p10–p90 covered ${s.band80Covered}/${s.band80N} · no measurement ${s.noMeasurement} · void ${s.voids}`);
  }

  const report = { files: files.length, perDate, perEvent, held, refused, appended: appended.length, lineage, summary, ledger: rel(target), wrote: false };
  if (!write) { log("dry run — pass --write to append to the ledger (nothing here is a price or a pick)"); return report; }
  if (!appended.length) { log("ledger unchanged"); return report; }
  const nowText = fs.existsSync(source) ? fs.readFileSync(source, "utf8") : "";
  if (nowText !== beforeText) throw new Refused("ledger changed during this run");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (target === source && fs.existsSync(target)) fs.appendFileSync(target, newText);
  else fs.writeFileSync(target, afterText, { flag: "wx" }); // a new file only; never over an existing ledger
  const written = fs.readFileSync(target, "utf8");
  const post = propLedgerAppendOnlyViolations({ beforeText, afterText: written });
  if (written !== afterText || post.length) throw new Refused(`post-write check failed: ${post.join("; ") || "content differs from the planned append"}`);
  log(`wrote ${outDir ? target : rel(target)} (+${appended.length} line${appended.length === 1 ? "" : "s"})`);
  return { ...report, wrote: true };
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
  const known = new Set(["--date", "--since", "--now", "--write", "--out-dir", "--boxscore-dir"]);
  const unknown = argv.filter((a, i) => a.startsWith("--") && !known.has(a) && !["--date", "--since", "--now", "--out-dir", "--boxscore-dir"].includes(argv[i - 1]));
  if (unknown.length) { console.error(`REFUSED: unknown option ${unknown.join(", ")}`); process.exit(1); }
  try {
    runPropShadowGrading({
      date: opt("--date"), since: opt("--since"), now: opt("--now") ?? new Date().toISOString(), write: argv.includes("--write"),
      outDir: opt("--out-dir"), extraBoxscoreDirs: argv.flatMap((a, i) => (a === "--boxscore-dir" && argv[i + 1] ? [argv[i + 1]] : [])),
      log: (s) => console.log(s),
    });
  } catch (e) {
    if (e instanceof Refused) { console.error(`REFUSED: ${e.message}`); process.exit(1); }
    throw e;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
