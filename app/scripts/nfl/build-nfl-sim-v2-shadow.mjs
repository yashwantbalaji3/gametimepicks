#!/usr/bin/env node
/**
 * NFL SIMULATION ENGINE V2 — SHADOW RECEIPTS (Session 13 · Phase D). PRIVATE. $0 (no provider call, no market input).
 *
 *   node app/scripts/nfl/build-nfl-sim-v2-shadow.mjs --now <ISO> [--event <providerEventId>]… [--runs 10000] [--dry-run]
 *
 * For each NOT-YET-STARTED event kicking off within 8 days, writes a SimulationReceiptV2 to
 * data/internal/research/nfl/sim-v2/shadow/<run date>/<eventId>-<inputHash>.json — write-once (`wx`), and only when the
 * inputs changed since the last receipt for that event (same input hash ⇒ UNCHANGED, nothing written). A started game is
 * never simulated; an existing receipt is never rewritten. Scheduled by .github/workflows/nfl-sim-v2-shadow.yml.
 *
 * Inputs, all model-owned and frozen into the receipt's inputSnapshotIds:
 *   anchors       the forecast-of-record receipt's published total and margin medians → team means
 *                 (home = (total + margin) / 2, away = (total − margin) / 2) — the engine's ONLY team-strength input
 *   params        data/internal/research/nfl/sim-v2/drive-params-2015-2025.json (fit-drive-sim-v2.mjs), by sha256
 *   role shares   data/internal/research/nfl/role-shares-v1/current.json (generatedAt)
 *   availability  injuries capture (isBlockingStatus) + active roster (activeRosterIndex) — blocked players get no opportunity
 * The sportsbook is never read.
 *
 * SHADOW: nothing public reads these receipts. The page label "EXPECTED STATISTICAL SUMMARIES · NOT ONE SIMULATED GAME"
 * stays until V2 passes its validation contract and the founder/model gate (docs/SIMULATION_ENGINE_V2.md).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileParams, NFL_SIM_V2_ENGINE, NFL_SIM_V2_VERSION, prepareTeamPlayers } from "../../src/lib/sports/nfl/sim-v2/engine.mjs";
import { calibrate, runBatch } from "../../src/lib/sports/nfl/sim-v2/simulate.mjs";
import { buildNflSimulationReceipt, playersFromRoleShares } from "../../src/lib/sports/nfl/sim-v2/receipt.mjs";
import { forecastOfRecord } from "../../src/lib/forecast-ledger/adapters/nfl.mjs";
import { fnv1a64 } from "../../src/lib/forecast-ledger/identity.mjs";
import { isBlockingStatus } from "../../src/lib/sports/injuries/contract.mjs";
import { activeRosterIndex } from "../../src/lib/sports/nfl/board-roster-integrity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PARAMS = "data/internal/research/nfl/sim-v2/drive-params-2015-2025.json";
const ROLE_SHARES = "data/internal/research/nfl/role-shares-v1/current.json";
const INJURIES = "data/internal/research/injuries/nfl/latest.json";
const ROSTERS = "app/public/data/nfl/rosters/latest.json";
const OUT_DIR = "data/internal/research/nfl/sim-v2/shadow";

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const args = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const sha256 = (rel) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex");

export function anchorsFromReceipt(r) {
  const s = r?.forecastSummary;
  const t = s?.total?.median;
  const m = s?.margin?.median;
  if (!Number.isFinite(t) || !Number.isFinite(m)) return null;
  return {
    home: (t + m) / 2,
    away: (t - m) / 2,
    source: `forecast receipt total.median ${t} / margin.median ${m} (${r.model?.id}@v${r.model?.version})`,
    modelVersion: { forecastModel: `${r.model?.id}@v${r.model?.version}`, winHead: r.model?.winHead?.id ?? null, marginHead: r.model?.marginHead?.id ?? null, totalsHead: r.model?.totalsHead?.id ?? null },
  };
}

function main() {
  const now = arg("--now");
  if (!now || !Number.isFinite(Date.parse(now))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
  const runs = Number(arg("--runs", 10000));
  const dryRun = argv.includes("--dry-run");
  const wanted = new Set(args("--event"));

  const receiptRoot = path.join(ROOT, "data/internal/nfl/forecast-receipts");
  const receipts = [];
  for (const d of fs.readdirSync(receiptRoot).sort()) {
    for (const f of fs.readdirSync(path.join(receiptRoot, d)).filter((x) => x.endsWith(".json"))) {
      receipts.push({ file: `${d}/${f}`, receipt: JSON.parse(fs.readFileSync(path.join(receiptRoot, d, f), "utf8")) });
    }
  }
  const nowMs = Date.parse(now);
  const latestBefore = forecastOfRecord(receipts.filter((x) => Date.parse(x.receipt.generatedAt) <= nowMs));
  const compiled = compileParams(read(PARAMS));
  const paramsRef = { file: PARAMS, sha256: sha256(PARAMS), trainingWindow: compiled.raw.trainingWindow };
  const roleShares = read(ROLE_SHARES);
  const injuries = read(INJURIES);
  const rosters = read(ROSTERS);
  const blocked = new Set((injuries.entries ?? []).filter((e) => e?.athleteId && isBlockingStatus(e.status)).map((e) => `nfl-athlete-${e.athleteId}`));
  const { active } = activeRosterIndex(rosters);
  const availability = `injuries@${injuries.generatedAt ?? "?"}+rosters@${rosters.capturedAt ?? rosters.generatedAt ?? "?"}`;

  /* A receipt is re-written only when its INPUTS change (new anchors, availability, role shares, params): every
     receipt id embeds its input hash, so an hourly run over an unchanged game is a no-op, and a game whose
     availability moved gets a new receipt beside the old one — the latest pre-kickoff receipt is the one of record. */
  const outRoot = path.join(ROOT, OUT_DIR);
  const existingIds = new Set();
  for (const d of fs.existsSync(outRoot) ? fs.readdirSync(outRoot) : []) {
    const dir = path.join(outRoot, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try { existingIds.add(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).simulationReceiptId); } catch { /* unreadable: ignored */ }
    }
  }
  const HORIZON_MS = 8 * 86400000;

  let wrote = 0;
  for (const [eventId, { file, receipt: r }] of latestBefore) {
    if (wanted.size && !wanted.has(eventId)) continue;
    if (!(Date.parse(r.kickoffUtc) > nowMs)) continue; // never simulate a started game
    if (Date.parse(r.kickoffUtc) - nowMs > HORIZON_MS) continue; // this week's games only
    if (r.seasonType === 1) continue; // regular season / postseason only
    const anchors = anchorsFromReceipt(r);
    if (!anchors) { console.log(`SKIP ${eventId}: receipt has no total/margin medians`); continue; }
    const teamBlock = (abbr) => roleShares.teams?.[abbr] ?? null;
    const excludedFor = (abbr) => {
      const block = teamBlock(abbr);
      const onRoster = active.get(abbr);
      const ids = new Set();
      for (const k of ["passAttempts", "targets", "rushAttempts"]) {
        for (const p of block?.[k]?.players ?? []) if (blocked.has(p.playerId) || (onRoster && !onRoster.has(p.playerId))) ids.add(p.playerId);
      }
      return ids;
    };
    // The starting QB: the passer the event's availability-gated board publishes (one-passer rule), when it exists.
    const boardPath = path.join(ROOT, `app/public/data/nfl/player-board/${eventId}.json`);
    const board = fs.existsSync(boardPath) ? JSON.parse(fs.readFileSync(boardPath, "utf8")) : null;
    const starterFor = (abbr) => {
      const qbs = (board?.players ?? []).filter((p) => p.team === abbr && p.markets?.player_pass_yds);
      return qbs.length === 1 ? qbs[0].playerId : null;
    };
    const inputs = [r.home.abbr, r.away.abbr].map((abbr) => playersFromRoleShares(teamBlock(abbr), excludedFor(abbr), { starterQb: starterFor(abbr) }));
    if (!inputs[0].players.length || !inputs[1].players.length) { console.log(`SKIP ${eventId}: no role shares for a team`); continue; }
    const prep = inputs.map(prepareTeamPlayers);
    const inputHash = fnv1a64(JSON.stringify({
      engine: NFL_SIM_V2_VERSION, params: paramsRef.sha256, anchors: [anchors.home, anchors.away], runs,
      players: inputs.map((t) => t.players.map((p) => [p.playerId, p.passShare, p.targetShare, p.carryShare, p.catchRate, p.ypr, p.ypc])),
    }));
    if (existingIds.has(`nfl-sim-v2:${eventId}:${inputHash}`)) { console.log(`${eventId} ${r.matchup}: UNCHANGED inputs — receipt exists`); continue; }
    const baseSeed = fnv1a64(`${NFL_SIM_V2_ENGINE}|${eventId}|${inputHash}`).slice(0, 8);
    const postseason = r.seasonType === 3;
    const calibration = calibrate({ compiled, anchors, baseSeed, postseason });
    const batch = runBatch({ compiled, thetas: calibration.thetas, players: prep, baseSeed, runs, postseason });
    const receipt = buildNflSimulationReceipt({
      event: { eventId, kickoffUtc: r.kickoffUtc, home: r.home, away: r.away },
      compiled, paramsRef, anchors, calibration, prep, batch, baseSeed, inputHash, generatedAt: now, postseason,
      inputs: { forecastReceipt: `data/internal/nfl/forecast-receipts/${file}`, roleShares: `${ROLE_SHARES}@${roleShares.generatedAt}`, availability, params: paramsRef.sha256 },
    });
    const outRel = `${OUT_DIR}/${now.slice(0, 10)}/${eventId}-${inputHash}.json`;
    const a = receipt.aggregate;
    console.log(`${eventId} ${r.matchup}: P(home) ${a.winProbability.home} · OT ${a.overtimeProbability} · total p50 ${a.total.p50} · margin p50 ${a.margin.p50} · failed runs ${receipt.validation.failedRuns}/${runs} → ${outRel}`);
    if (dryRun) continue;
    const abs = path.join(ROOT, outRel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    try {
      fs.writeFileSync(abs, JSON.stringify(receipt) + "\n", { flag: "wx" });
      wrote += 1;
    } catch (e) {
      if (e.code === "EEXIST") console.log(`  EXISTS: ${outRel} — write-once, left untouched`);
      else throw e;
    }
  }
  console.log(dryRun ? "DRY_RUN" : `wrote ${wrote} shadow receipt(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
