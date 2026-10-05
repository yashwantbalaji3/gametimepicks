#!/usr/bin/env node
/**
 * BUILD THE UNIVERSAL FORECAST LEDGER (Session 13 · Phase B). $0 — reads committed owner files, spends nothing.
 *
 *   node app/scripts/results/build-forecast-ledger.mjs --now <ISO> [--dry-run] [--check] [--verify-against <git-ref>]
 *
 * Reads every owner listed in lib/forecast-ledger/adapters/* and writes, under data/internal/forecast-ledger/v1/:
 *   <sport>.jsonl   one row per forecast observation (sorted by forecastId, one JSON object per line)
 *   manifest.json   content-derived counts + per-sport content hash + the declared coverage gaps
 *
 * Determinism: no wall clock reaches the output. `--now` only decides which events have started (a forecast enters
 * the ledger once its event has started — before that the owner may still revise it). Unchanged owners → byte-identical
 * files, so a nightly run with nothing new commits nothing.
 *
 * Append-only: before writing, the candidate is compared with the ledger at `--verify-against` (default HEAD) and the
 * write is REFUSED on any violation (lib/forecast-ledger/append-only.mjs). `--check` exits 1 if the committed files
 * differ from a fresh build (CI drift check).
 *
 * Run from the repo root or app/ — paths resolve from this file.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readNflSideCutover, readNflWinnerCorrections } from "../../src/lib/results/nfl-model-favored-io.mjs";
import { nflGameRows, nflPropRows, nflReconciliationRows, nflTopBoardRows, forecastOfRecord } from "../../src/lib/forecast-ledger/adapters/nfl.mjs";
import { mlbGameRows, mlbProjectedRows, homerNukesRows } from "../../src/lib/forecast-ledger/adapters/mlb.mjs";
import { eplDerivedRows, eplEventIndex, eplMatchRows, eplPlayerRows, ligue1DerivedRows, ligue1Rows } from "../../src/lib/forecast-ledger/adapters/soccer.mjs";
import { ufcWinnerRows } from "../../src/lib/forecast-ledger/adapters/ufc.mjs";
import { compareLedgers, pairRekeys } from "../../src/lib/forecast-ledger/append-only.mjs";
import { buildManifest, composeLedger, serializeRow } from "../../src/lib/forecast-ledger/compose.mjs";
import { LEDGER_SCHEMA_VERSION } from "../../src/lib/forecast-ledger/contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const APP = path.join(ROOT, "app");
const PUB = path.join(APP, "public/data");
const INT = path.join(ROOT, "data/internal");
export const LEDGER_DIR_REL = "data/internal/forecast-ledger/v1";
const OUT = path.join(ROOT, LEDGER_DIR_REL);
export const SPORT_FILES = Object.freeze({ NFL: "nfl.jsonl", MLB: "mlb.jsonl", EPL: "epl.jsonl", LIGUE_1: "ligue-1.jsonl", UFC: "ufc.jsonl" });

const arg = (k, d = null) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(k);

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const readJsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const listJson = (dir, re = /\.json$/) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort() : []);

export function readSources(now) {
  // NFL game forecasts — owner-graded events with the receipt they graded, plus started-but-ungraded events.
  const settleDir = path.join(INT, "nfl/experimental-settlement");
  const settledEvents = [];
  for (const f of listJson(settleDir, /^\d{4}-\d{2}-\d{2}\.json$/)) {
    for (const e of readJson(path.join(settleDir, f)).events ?? []) {
      const rel = e.lineage?.receiptFile;
      const abs = rel ? path.join(ROOT, rel) : null;
      settledEvents.push({ event: e, receipt: abs && fs.existsSync(abs) ? readJson(abs) : null });
    }
  }
  const receiptRoot = path.join(INT, "nfl/forecast-receipts");
  const receipts = [];
  for (const d of fs.existsSync(receiptRoot) ? fs.readdirSync(receiptRoot).sort() : []) {
    for (const f of listJson(path.join(receiptRoot, d))) {
      receipts.push({ file: `${d}/${f}`, receipt: readJson(path.join(receiptRoot, d, f)) });
    }
  }
  const ofRecord = forecastOfRecord(receipts);
  for (const v of ofRecord.values()) v.relPath = `data/internal/nfl/forecast-receipts/${v.file}`;

  // NFL props — the canonical prop-settlement ledger.
  const propDir = path.join(INT, "nfl/prop-settlement");
  const propRows = listJson(propDir).flatMap((f) => readJson(path.join(propDir, f)).rows ?? []);

  // NFL Top-5 frozen boards + withdrawal sidecar.
  const tbDir = path.join(PUB, "results/top-boards");
  const boards = listJson(tbDir, /^\d{4}-\d{2}-\d{2}\.json$/).map((f) => ({ file: `results/top-boards/${f}`, board: readJson(path.join(tbDir, f)) }));
  const wdDir = path.join(PUB, "results/top-board-withdrawals");
  const withdrawals = listJson(wdDir, /^\d{4}-\d{2}-\d{2}\.json$/).flatMap((f) => readJson(path.join(wdDir, f)).events ?? []);

  // NFL Weeks 1–2 props: the week reconciliation (name + team rows) + roster captures for the exact id crosswalk.
  const reconDir = path.join(PUB, "nfl/reconciliation");
  const reconWeeks = listJson(reconDir, /^\d+-\d+\.json$/).map((f) => ({ file: `nfl/reconciliation/${f}`, doc: readJson(path.join(reconDir, f)) }));
  const rosterDir = path.join(PUB, "nfl/rosters");
  const rosterCaptures = listJson(rosterDir, /^capture-\d{4}-\d{2}-\d{2}T\d{4}\.json$/).map((f) => {
    const m = /^capture-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})\.json$/.exec(f);
    return { stampMs: Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`), doc: readJson(path.join(rosterDir, f)) };
  });

  // MLB game grades + the model id of each SNAPSHOT source (git sources stay null: a shallow checkout could not
  // reproduce them, and a value that depends on clone depth would break append-only).
  const mlbGraded = readJsonl(path.join(PUB, "mlb/results/game-predictions-graded.jsonl"));
  const mlbProjected = readJsonl(path.join(PUB, "mlb/results/game-projected-scores-graded.jsonl"));
  const sourceModels = new Map();
  for (const src of new Set(mlbGraded.map((g) => g.forecastSource))) {
    const m = /^snapshot:(\d{4}-\d{2}-\d{2}\/snapshot-\d+\.json)$/.exec(String(src ?? ""));
    if (!m) continue;
    const p = path.join(INT, "mlb/prediction-snapshots", m[1]);
    if (!fs.existsSync(p)) continue;
    const v = readJson(p).decisionEngineVersion;
    if (typeof v === "string") sourceModels.set(src, { modelId: v, modelVersion: null });
  }
  const hnDir = path.join(PUB, "mlb/homer-nukes");
  const hn = listJson(hnDir, /^settled-\d{4}-\d{2}-\d{2}\.json$/).map((f) => ({ file: `mlb/homer-nukes/${f}`, doc: readJson(path.join(hnDir, f)) }));

  const eplMatch = readJsonl(path.join(PUB, "soccer/epl/results/graded-forecasts.jsonl"));
  const eplPlayers = readJsonl(path.join(PUB, "soccer/epl/results/graded-player-projections.jsonl"));
  const eplDerived = readJsonl(path.join(PUB, "soccer/epl/results/graded-derived-markets.jsonl"));
  // Every published EPL match id (forecast files + the match grade log) — the player rows join to these exactly.
  const eplDir = path.join(PUB, "soccer/epl/forecasts");
  const eplEvents = new Map();
  const addEvent = (r) => { if (r?.eventId && !eplEvents.has(`${r.eventId}|${r.matchup}`)) eplEvents.set(`${r.eventId}|${r.matchup}`, { eventId: r.eventId, kickoffUtc: r.kickoffUtc, matchup: r.matchup }); };
  eplMatch.forEach(addEvent);
  for (const f of listJson(eplDir, /^\d{4}-\d{2}-\d{2}\.json$/)) for (const r of readJson(path.join(eplDir, f)).rows ?? []) addEvent(r);
  const eplIndex = eplEventIndex([...eplEvents.keys()].sort().map((k) => eplEvents.get(k)));
  const l1Path = path.join(PUB, "soccer/ligue-1/results/graded.json");
  const ligue1 = fs.existsSync(l1Path) ? readJson(l1Path) : null;
  const ligue1Derived = readJsonl(path.join(PUB, "soccer/ligue-1/results/graded-derived-markets.jsonl"));
  const ufc = readJsonl(path.join(INT, "research/ufc/model-vs-market/graded.jsonl"));

  // Canonical team ids (the research-projection entity index Ask and Research resolve against): abbr → id, exact.
  const registry = readJson(path.join(ROOT, "data/research-projection/v1/index.json"));
  const nflTeams = (registry.entries ?? []).filter((e) => e.sport === "NFL" && e.kind === "team" && e.hint && e.id);
  const counts = new Map();
  for (const e of nflTeams) counts.set(e.hint, (counts.get(e.hint) ?? 0) + 1);
  const teamIds = new Map(nflTeams.filter((e) => counts.get(e.hint) === 1).map((e) => [e.hint, e.id]));
  // EPL clubs: exact display name → id, only where exactly one canonical team carries that name.
  const eplTeams = (registry.entries ?? []).filter((e) => e.sport === "EPL" && e.kind === "team" && e.label && e.id);
  const eplLabelCounts = new Map();
  for (const e of eplTeams) eplLabelCounts.set(e.label, (eplLabelCounts.get(e.label) ?? 0) + 1);
  const eplTeamIds = new Map(eplTeams.filter((e) => eplLabelCounts.get(e.label) === 1).map((e) => [e.label, e.id]));

  const mlbTeams = (registry.entries ?? []).filter((e) => e.sport === "MLB" && e.kind === "team" && e.hint && e.id);
  const mlbHintCounts = new Map();
  for (const e of mlbTeams) mlbHintCounts.set(e.hint, (mlbHintCounts.get(e.hint) ?? 0) + 1);
  const mlbTeamIds = new Map(mlbTeams.filter((e) => mlbHintCounts.get(e.hint) === 1).map((e) => [e.hint, e.id]));

  const winnerCorrections = readNflWinnerCorrections(ROOT);
  const sideCutoverAt = readNflSideCutover(ROOT);
  return { now, teamIds, winnerCorrections, sideCutoverAt, eplTeamIds, eplDerived, mlbTeamIds, mlbProjected, reconWeeks, rosterCaptures, settledEvents, ofRecord, propRows, boards, withdrawals, mlbGraded, sourceModels, hn, eplMatch, eplPlayers, eplIndex, ligue1, ligue1Derived, ufc };
}

export function buildRows(src, report = {}) {
  const props = nflPropRows(src.propRows);
  const eplPlayers = eplPlayerRows(src.eplPlayers, src.eplIndex);
  report.eplPlayerUnresolved = eplPlayers.unresolved;
  const eplDerived = eplDerivedRows(src.eplDerived ?? [], src.eplTeamIds ?? new Map());
  report.eplClubUnresolved = eplDerived.unresolved;
  const mlbProjected = mlbProjectedRows(src.mlbProjected ?? [], src.mlbTeamIds ?? new Map());
  report.mlbTeamUnresolved = mlbProjected.unresolved;
  const recon = nflReconciliationRows({ weeks: src.reconWeeks ?? [], captures: src.rosterCaptures ?? [] });
  report.nflReconciliationUnresolved = recon.unresolved;
  const heldIds = new Set(props.map((r) => r.forecastId));
  return composeLedger([
    { source: "nfl-experimental-settlement", rows: nflGameRows({ settledEvents: src.settledEvents, receiptsOfRecord: src.ofRecord, now: src.now, teamIds: src.teamIds, winnerCorrections: src.winnerCorrections, sideCutoverAt: src.sideCutoverAt }) },
    { source: "nfl-prop-settlement", rows: props },
    { source: "results-top-board", rows: nflTopBoardRows({ boards: src.boards, withdrawals: src.withdrawals, heldIds, now: src.now }) },
    { source: "nfl-week-reconciliation", rows: recon.rows },
    { source: "mlb-game-grades", rows: mlbGameRows(src.mlbGraded, src.sourceModels) },
    { source: "mlb-projected-score-grades", rows: mlbProjected.rows },
    { source: "mlb-homer-nukes-settled", rows: homerNukesRows(src.hn) },
    { source: "epl-match-grades", rows: eplMatchRows(src.eplMatch) },
    { source: "epl-player-grades", rows: eplPlayers.rows },
    { source: "epl-derived-market-grades", rows: eplDerived.rows },
    { source: "ligue-1-grades", rows: ligue1Rows(src.ligue1) },
    { source: "ligue-1-derived-market-grades", rows: ligue1DerivedRows(src.ligue1Derived ?? []) },
    { source: "ufc-model-vs-market-grades", rows: ufcWinnerRows(src.ufc) },
  ]);
}

export function renderFiles(rows) {
  const files = {};
  for (const [sport, file] of Object.entries(SPORT_FILES)) {
    const rs = rows.filter((r) => r.sport === sport);
    files[file] = rs.map(serializeRow).join("\n") + (rs.length ? "\n" : "");
  }
  files["manifest.json"] = JSON.stringify(buildManifest(rows, { schemaVersion: LEDGER_SCHEMA_VERSION, sportFiles: SPORT_FILES }), null, 2) + "\n";
  return files;
}

/** The committed ledger at a git ref (empty if the ref has no ledger yet — the first build). */
export function ledgerAtRef(ref) {
  const rows = [];
  for (const file of Object.values(SPORT_FILES)) {
    let text = "";
    try {
      text = execFileSync("git", ["show", `${ref}:${LEDGER_DIR_REL}/${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      continue;
    }
    for (const l of text.split("\n")) if (l.trim()) rows.push(JSON.parse(l));
  }
  return rows;
}

function main() {
  const now = arg("--now");
  if (!now || !Number.isFinite(Date.parse(now))) {
    console.error("REFUSED: --now <ISO> required");
    process.exit(1);
  }
  const report = {};
  const rows = buildRows(readSources(now), report);
  const files = renderFiles(rows);
  const manifest = JSON.parse(files["manifest.json"]);

  if (has("--check")) {
    const drift = Object.entries(files).filter(([f, text]) => {
      const p = path.join(OUT, f);
      return !fs.existsSync(p) || fs.readFileSync(p, "utf8") !== text;
    }).map(([f]) => f);
    // --check compares content; a nightly-only difference (new settlements since the commit) is reported, not hidden.
    console.log(drift.length ? `DRIFT: ${drift.join(", ")}` : "LEDGER_CURRENT");
    process.exit(drift.length ? 1 : 0);
  }

  const ref = arg("--verify-against", "HEAD");
  const prev = ledgerAtRef(ref);
  /* Stage 3C: a directional W/L may change on a settled row only when a committed correction log restates it. */
  const restatedEvents = readNflWinnerCorrections(ROOT);
  const directionalRestated = new Set(rows.filter((r) => r.sport === "NFL" && r.family === "nfl_game_winner" && restatedEvents.has(r.eventId)).map((r) => r.forecastId));
  let violations = compareLedgers(prev, rows, { directionalRestated });
  /*
   * --rekey <migrationId>: the one audited path for an identity change (Session 13: subject ids moved to the
   * platform's canonical ids — mlbam-N → mlb-player-N, epl-player-N → epl-athlete-N, nfl-team-<ABBR> → nfl-team-<ESPN
   * id>). A MISSING_ROW is forgiven only when pairRekeys finds its exact successor; every other violation still refuses.
   */
  const rekey = arg("--rekey");
  if (rekey) {
    const src = readSources(now);
    const map = (id) => {
      let m;
      if ((m = /^mlbam-(\d+)$/.exec(id))) return `mlb-player-${m[1]}`;
      if ((m = /^epl-player-(\d+)$/.exec(id))) return `epl-athlete-${m[1]}`;
      if ((m = /^nfl-team-([A-Z]{2,3})$/.exec(id))) return src.teamIds.get(m[1]) ?? null;
      return null;
    };
    const { pairs, unexplained } = pairRekeys(prev, rows, map);
    const forgiven = new Set(pairs.map((p) => p.from));
    violations = violations.filter((v) => !(v.kind === "MISSING_ROW" && forgiven.has(v.forecastId)));
    console.log(`REKEY ${rekey}: ${pairs.length} row(s) re-keyed, ${unexplained.length} unexplained`);
    if (!unexplained.length && !violations.length && !has("--dry-run")) {
      const mDir = path.join(OUT, "migrations");
      fs.mkdirSync(mDir, { recursive: true });
      fs.writeFileSync(path.join(mDir, `${rekey}.json`), JSON.stringify({
        schemaVersion: "forecast-ledger-migration@1", migration: rekey, verifiedAgainst: ref,
        rule: "subject ids moved to the platform's canonical ids; every other immutable field identical (pairRekeys)",
        count: pairs.length, pairs,
      }, null, 1) + "\n");
    }
  }
  console.log(`forecast ledger: ${rows.length} rows (${prev.length} at ${ref}) · ${JSON.stringify(manifest.totals.settlement)}`);
  for (const [s, m] of Object.entries(manifest.sports)) console.log(`  ${s}: ${m.rows} rows · ${JSON.stringify(m.families)}`);
  if (report.eplPlayerUnresolved) console.log(`  EPL player rows with no exact published event id (not emitted): ${report.eplPlayerUnresolved}`);
  if (report.mlbTeamUnresolved) console.log(`  MLB projected-runs rows whose team abbreviation is not exactly one canonical team (not emitted): ${report.mlbTeamUnresolved}`);
  if (report.eplClubUnresolved) console.log(`  EPL clean-sheet rows whose club is not exactly one canonical team (not emitted): ${report.eplClubUnresolved}`);
  if (report.nflReconciliationUnresolved?.length) console.log(`  NFL Weeks 1–2 rows with no unique roster match (not emitted): ${report.nflReconciliationUnresolved.length}`);
  if (violations.length) {
    console.error(`APPEND_ONLY_VIOLATION: ${violations.length}`);
    for (const v of violations.slice(0, 25)) console.error(`  ${v.kind} ${v.forecastId} ${v.detail}`);
    process.exit(3);
  }
  if (has("--dry-run")) {
    console.log("DRY_RUN: nothing written");
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  let changed = 0;
  for (const [f, text] of Object.entries(files)) {
    const p = path.join(OUT, f);
    if (fs.existsSync(p) && fs.readFileSync(p, "utf8") === text) continue;
    fs.writeFileSync(p, text);
    changed += 1;
  }
  console.log(changed ? `WROTE ${changed} file(s) to ${LEDGER_DIR_REL}` : "UNCHANGED");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
