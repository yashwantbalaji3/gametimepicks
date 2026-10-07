#!/usr/bin/env node
/**
 * NS-2 · NFL SIMULATION V2 — FORWARD GRADES (architecture audit §8A / II.D #6). PRIVATE. SHADOW. $0.
 *
 *   node app/scripts/nfl/grade-nfl-sim-v2-shadow.mjs --now <ISO> [--dry-run] [--repo-root <dir>]
 *
 * For every finished NFL game with a Sim V2 receipt of record, grades that receipt once against the official final and
 * the captured box score (data/internal/research/nfl/player-events-v1/<season>.json — the same capture the player
 * evaluations use), and writes data/internal/research/nfl/sim-v2/grades/<variant>/<eventId>.json write-once (`wx`).
 *
 *   variant median-anchored   receipts in sim-v2/shadow/          (tilts solved to the rounded margin/total medians)
 *   variant head-anchored     receipts in sim-v2/anchored-shadow/ (NS-1: tilts solved to the validated heads)
 *
 * THE RECEIPT OF RECORD is the latest one generated strictly before kickoff (the rule public-receipt.mjs uses). A
 * receipt that fails the receipt contract is recorded as INVALID_RECEIPT, and an NS-1 game that could not be anchored
 * as ANCHOR_UNSOLVED — both with no metrics, never silently skipped. A game with no captured final, a quarantined
 * capture, or a team mismatch stays PENDING (nothing written) — missing is not zero.
 *
 * Then rebuilds sim-v2/grades-summary.json (per variant × family) from every grade file; it is rewritten only when the
 * set of grades changes. Nothing public reads any of this.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeSimV2Receipt, NFL_SIM_V2_GRADER, summariseGrades } from "../../src/lib/sports/nfl/sim-v2/grade.mjs";
import { validateSimulationReceipt } from "../../src/lib/sports/nfl/sim-v2/receipt.mjs";
import { fnv1a64 } from "../../src/lib/forecast-ledger/identity.mjs";

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(arg("--repo-root") ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
const SIM = "data/internal/research/nfl/sim-v2";
export const VARIANTS = Object.freeze({ "median-anchored": `${SIM}/shadow`, "head-anchored": `${SIM}/anchored-shadow` });
const GRADES = `${SIM}/grades`;
const SUMMARY = `${SIM}/grades-summary.json`;
const EVENTS = "data/internal/research/nfl/player-events-v1";

const readJson = (abs) => { try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch { return null; } };

/** Every receipt (or unsolved record) under one variant directory, with its relative path. */
function readVariant(rel) {
  const root = path.join(ROOT, rel);
  const out = [];
  for (const d of fs.existsSync(root) ? fs.readdirSync(root).sort() : []) {
    const dir = path.join(root, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const doc = readJson(path.join(dir, f));
      if (doc) out.push({ file: `${rel}/${d}/${f}`, doc });
    }
  }
  return out;
}

/** The latest receipt generated strictly before its own kickoff, per event. */
export function receiptsOfRecord(entries) {
  const by = new Map();
  for (const e of entries) {
    const g = Date.parse(e.doc.generatedAt);
    const k = Date.parse(e.doc.eventStart);
    if (!Number.isFinite(g) || !Number.isFinite(k) || !(g < k)) continue;
    const id = String(e.doc.eventId);
    const cur = by.get(id);
    if (!cur || e.doc.generatedAt > cur.doc.generatedAt || (e.doc.generatedAt === cur.doc.generatedAt && e.file > cur.file)) by.set(id, e);
  }
  return by;
}

function finalsIndex() {
  const dir = path.join(ROOT, EVENTS);
  const out = new Map();
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /^\d{4}\.json$/.test(x)).sort() : []) {
    const doc = readJson(path.join(dir, f));
    const quarantined = new Set((doc?.quarantinedGames ?? []).map((q) => String(q.providerEventId ?? q)));
    for (const g of doc?.games ?? []) {
      if (quarantined.has(String(g.providerEventId))) continue;
      out.set(String(g.providerEventId), { ...g, source: `${EVENTS}/${f}@${doc.generatedAt}` });
    }
  }
  return out;
}

function main() {
  const now = arg("--now");
  if (!now || !Number.isFinite(Date.parse(now))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
  const dryRun = argv.includes("--dry-run");
  const nowMs = Date.parse(now);
  const finals = finalsIndex();
  let wrote = 0;
  let pending = 0;
  for (const [variant, rel] of Object.entries(VARIANTS)) {
    for (const [eventId, { file, doc }] of receiptsOfRecord(readVariant(rel))) {
      const outRel = `${GRADES}/${variant}/${eventId}.json`;
      const abs = path.join(ROOT, outRel);
      if (fs.existsSync(abs)) continue; // write-once: a game is graded exactly once per variant
      if (!(Date.parse(doc.eventStart) < nowMs)) continue;
      const g = finals.get(eventId);
      if (!g || !Number.isInteger(g.ftHome) || !Number.isInteger(g.ftAway)) { pending += 1; continue; }
      const head = {
        schemaVersion: "nfl-sim-v2-grade@1", grader: NFL_SIM_V2_GRADER, promotionState: "SHADOW", variant, eventId,
        receipt: file, receiptId: doc.simulationReceiptId ?? null, receiptGeneratedAt: doc.generatedAt, eventStart: doc.eventStart,
        final: { home: g.ftHome, away: g.ftAway, source: g.source },
      };
      let body;
      if (doc.schemaVersion === "nfl-sim-v2-anchor-unsolved@1" || doc.anchoring?.state === "ANCHOR_UNSOLVED") {
        body = { state: "ANCHOR_UNSOLVED", reason: doc.anchoring?.reason ?? null, rows: [] };
      } else if (doc.home?.abbr !== g.home || doc.away?.abbr !== g.away) {
        console.log(`PENDING ${variant} ${eventId}: receipt ${doc.away?.abbr}@${doc.home?.abbr} ≠ capture ${g.away}@${g.home}`);
        pending += 1;
        continue;
      } else {
        const problems = validateSimulationReceipt(doc);
        body = problems.length
          ? { state: "INVALID_RECEIPT", problems, rows: [] }
          : { state: "GRADED", rows: gradeSimV2Receipt(doc, { ftHome: g.ftHome, ftAway: g.ftAway, players: g.players }) };
      }
      const out = { ...head, ...body, gradedAt: now };
      const graded = out.rows.filter((r) => r.state === "GRADED").length;
      console.log(`${variant} ${eventId} ${doc.away?.abbr ?? "?"}@${doc.home?.abbr ?? "?"} ${g.ftAway}-${g.ftHome}: ${out.state} · ${graded} graded / ${out.rows.length - graded} void → ${outRel}`);
      if (dryRun) continue;
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, JSON.stringify(out) + "\n", { flag: "wx" });
      wrote += 1;
    }
  }
  console.log(`${dryRun ? "DRY_RUN — " : ""}wrote ${wrote} grade file(s); ${pending} finished game(s) still pending a captured final`);
  if (!dryRun) writeSummary(now);
}

function writeSummary(now) {
  const variants = {};
  const inputs = [];
  for (const variant of Object.keys(VARIANTS)) {
    const dir = path.join(ROOT, GRADES, variant);
    const docs = (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []).map((f) => readJson(path.join(dir, f))).filter(Boolean);
    inputs.push(...docs.map((d) => `${variant}/${d.eventId}/${d.receiptId}/${d.state}`));
    const states = {};
    for (const d of docs) states[d.state] = (states[d.state] ?? 0) + 1;
    variants[variant] = { games: docs.length, states, families: summariseGrades(docs.flatMap((d) => d.rows)) };
  }
  const inputsHash = fnv1a64(JSON.stringify(inputs));
  const abs = path.join(ROOT, SUMMARY);
  if (readJson(abs)?.inputsHash === inputsHash) { console.log("summary unchanged"); return; }
  const doc = {
    schemaVersion: "nfl-sim-v2-grades-summary@1", grader: NFL_SIM_V2_GRADER, promotionState: "SHADOW", generatedAt: now, inputsHash,
    note: "Forward evidence for NFL Simulation V2 only. Not a record, not a pick, never public. Coverage/CRPS/quantile score/log loss are separate metrics and are never pooled.",
    variants,
  };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(doc, null, 1) + "\n");
  console.log(`summary → ${SUMMARY}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
