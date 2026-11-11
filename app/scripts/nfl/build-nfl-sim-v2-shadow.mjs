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
 * SCHEMA UPGRADE (2026-11-11): a receipt written by an older receipt schema (e.g. @2, no count PMFs) with the SAME inputs
 * counts as a change for a game that has not started — a NEW receipt is written beside it under the current schema
 * (id `nfl-sim-v2:<event>:<inputHash>:<tag>`, file `<event>-<inputHash>-<tag>.json`, tag from the schema version). The
 * old receipt is never rewritten or deleted; the receipt of record stays the latest one generated before kickoff.
 *
 * Inputs, all model-owned and frozen into the receipt's inputSnapshotIds:
 *   anchors       the forecast-of-record receipt's published total and margin medians → team means
 *                 (home = (total + margin) / 2, away = (total − margin) / 2) — the engine's ONLY team-strength input
 *   params        data/internal/research/nfl/sim-v2/drive-params-2015-2025.json (fit-drive-sim-v2.mjs), by sha256
 *   role shares   data/internal/research/nfl/role-shares-v1/current.json (generatedAt)
 *   availability  eligibility contract v1 (injuries + roster captures, participation-eligibility.mjs) + active roster — a non-ELIGIBLE player gets no opportunity
 * The sportsbook is never read.
 *
 * Each receipt also carries `representativeRunBoxes` (nfl-representative-run-boxes@1, sim-v2/receipt.mjs +
 * lib/simulation-theater/nfl-stored-run-box.mjs): every representative run's player box, folded from its play log
 * HERE with the inputs above and sha256-sealed, so the Theater page reads player lines from the receipt alone and never
 * re-derives them from role shares / injuries (which move after each receipt and are not build inputs). Receipts
 * written before the field existed are left as they are; their runs show "Player box score unavailable for this run".
 *
 * SHADOW: nothing public reads these receipts. The page label "EXPECTED STATISTICAL SUMMARIES · NOT ONE SIMULATED GAME"
 * stays until V2 passes its validation contract and the founder/model gate (docs/SIMULATION_ENGINE_V2.md).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileParams, N_TSTAT, NFL_SIM_V2_ENGINE, NFL_SIM_V2_VERSION, prepareTeamPlayers, TEAM_STAT } from "../../src/lib/sports/nfl/sim-v2/engine.mjs";
import { calibrate, calibratePassWeights, calibrateToYards, runBatch } from "../../src/lib/sports/nfl/sim-v2/simulate.mjs";
import { buildNflSimulationReceipt, playersFromRoleShares, SIMULATION_RECEIPT_SCHEMA } from "../../src/lib/sports/nfl/sim-v2/receipt.mjs";
import { forecastOfRecord } from "../../src/lib/forecast-ledger/adapters/nfl.mjs";
import { fnv1a64 } from "../../src/lib/forecast-ledger/identity.mjs";
import { simStarterDecision, starterOptions } from "../../src/lib/sports/nfl/sim-v2/starter-qb.mjs";
import { shareExclusions, teamIdsFromRoster } from "../../src/lib/sports/nfl/participation-eligibility.mjs";
import { activeRosterIndex } from "../../src/lib/sports/nfl/board-roster-integrity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PARAMS = "data/internal/research/nfl/sim-v2/drive-params-2015-2025.json";
const ROLE_SHARES = "data/internal/research/nfl/role-shares-v1/current.json";
const INJURIES = "data/internal/research/injuries/nfl/latest.json";
const ROSTERS = "app/public/data/nfl/rosters/latest.json";
/* PD decision B (2026-11-11): QB-conditioned receipts (the starter's mean passing yards matched to the board's projection,
   sim-v2/simulate.mjs calibratePassWeights) are a DEMO lane until the founder approves: opt-in by
   GTP_NFL_SIM_QB_CONDITION=1, written to their own directory, never mixed into the shadow receipts of record. */
/* Founder D3 (2026-11-11, DEVELOPMENT ONLY): the JOINT CHALLENGER — team yardage anchored to the board's player
   projections (calibrateToYards), the starter conditioned on the board, points and win% following from the same drives;
   the official forecast is a CHECK recorded in the receipt. Implies QB conditioning; its own directory. */
const JOINT = process.env.GTP_NFL_SIM_JOINT === "1";
const QB_CONDITION = JOINT || process.env.GTP_NFL_SIM_QB_CONDITION === "1";
/* Founder directive 2026-11-11 (~18:00Z) item 5: a team whose starter is NOT confirmed gets one SCENARIO receipt per
   alternative starter ("if X starts", data/internal/nfl/qb-fallback unconfirmedScenarios), simulated in the same engine
   with that QB as the starter. Opt-in (GTP_NFL_SIM_QB_SCENARIOS=1), its own directory, write-once, never a receipt of
   record and never presented as confirmed. */
const QB_SCENARIOS = process.env.GTP_NFL_SIM_QB_SCENARIOS === "1";
const SCENARIO_DIR = "data/internal/research/nfl/sim-v2/scenarios";
const OUT_DIR = JOINT ? "data/internal/research/nfl/sim-v2/joint-challenger" : QB_CONDITION ? "data/internal/research/nfl/sim-v2/shadow-qb-conditioned" : "data/internal/research/nfl/sim-v2/shadow";

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const args = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const sha256 = (rel) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex");

/** "simulation-receipt@2.2" → "s2.2": the id/file tag of a receipt re-written for a schema upgrade. */
export const schemaTag = (schema) => `s${String(schema).split("@")[1]}`;

/** Every existing shadow receipt id → its schemaVersion (unreadable files ignored). */
export function existingReceiptIndex(outRoot) {
  const index = new Map();
  for (const d of fs.existsSync(outRoot) ? fs.readdirSync(outRoot).sort() : []) {
    const dir = path.join(outRoot, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      try { const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); index.set(r.simulationReceiptId, r.schemaVersion ?? null); } catch { /* unreadable: ignored */ }
    }
  }
  return index;
}

/**
 * PURE: what the shadow build does for one game with these inputs.
 *   STARTED         kickoff at/before now — never simulated, nothing written (old receipts untouched)
 *   UNCHANGED       a current-schema receipt with this input hash exists (plain or upgrade id)
 *   SCHEMA_UPGRADE  only an older-schema receipt with this input hash exists → a new, tagged receipt
 *   NEW             no receipt with this input hash
 */
export function planShadowReceipt({ eventId, inputHash, kickoffUtc, nowMs, existing, schema = SIMULATION_RECEIPT_SCHEMA }) {
  if (!(Date.parse(kickoffUtc) > nowMs)) return { action: "STARTED" };
  const base = `nfl-sim-v2:${eventId}:${inputHash}`;
  const tag = schemaTag(schema);
  if (existing.get(base) === schema || existing.get(`${base}:${tag}`) === schema) return { action: "UNCHANGED", id: existing.get(base) === schema ? base : `${base}:${tag}` };
  if (existing.has(base)) return { action: "SCHEMA_UPGRADE", id: `${base}:${tag}`, idSuffix: tag, fileStem: `${eventId}-${inputHash}-${tag}`, from: existing.get(base) };
  return { action: "NEW", id: base, idSuffix: null, fileStem: `${eventId}-${inputHash}` };
}

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
  const { active } = activeRosterIndex(rosters);
  /* ELIGIBILITY CONTRACT v1 (2026-11-09): only an ELIGIBLE player (injuries AND roster captures) holds a share —
     the replay in sim-v2/player-run.mjs applies the same rule at the receipt's own instant. */
  const eligibilityCtx = { asOf: now, injuries, roster: rosters, teamIdByAbbr: teamIdsFromRoster(rosters) };
  const availability = `injuries@${injuries.generatedAt ?? "?"}+rosters@${rosters.capturedAt ?? rosters.generatedAt ?? "?"}`;

  /* A receipt is re-written only when its INPUTS change (new anchors, availability, role shares, params) or it predates
     the current receipt schema (planShadowReceipt): every
     receipt id embeds its input hash, so an hourly run over an unchanged game is a no-op, and a game whose
     availability moved gets a new receipt beside the old one — the latest pre-kickoff receipt is the one of record. */
  const existing = existingReceiptIndex(path.join(ROOT, OUT_DIR));
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
      const ids = shareExclusions(block, abbr, eligibilityCtx);
      for (const k of ["passAttempts", "targets", "rushAttempts"]) {
        for (const p of block?.[k]?.players ?? []) if (onRoster && !onRoster.has(p.playerId)) ids.add(p.playerId);
      }
      return ids;
    };
    // The starting QB: the board's own decision (depth-chart QB1, or WITHHELD) — never the largest raw role share.
    const boardPath = path.join(ROOT, `app/public/data/nfl/player-board/${eventId}.json`);
    const board = fs.existsSync(boardPath) ? JSON.parse(fs.readFileSync(boardPath, "utf8")) : null;
    const starters = [r.home.abbr, r.away.abbr].map((abbr) => simStarterDecision(board, abbr));
    for (const [i, d] of starters.entries()) if (d.state !== "STARTER") console.log(`${eventId} ${[r.home.abbr, r.away.abbr][i]}: passing to OTHER — ${d.reason}`);
    const inputs = [r.home.abbr, r.away.abbr].map((abbr, i) => playersFromRoleShares(teamBlock(abbr), excludedFor(abbr), starterOptions(starters[i])));
    if (!inputs[0].players.length || !inputs[1].players.length) { console.log(`SKIP ${eventId}: no role shares for a team`); continue; }
    const prep = inputs.map(prepareTeamPlayers);
    if (QB_SCENARIOS && !dryRun) {
      const fallback = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, `data/internal/nfl/qb-fallback/${eventId}.json`), "utf8")); } catch { return null; } })();
      for (const [side, abbr] of [r.home.abbr, r.away.abbr].entries()) {
        if (starters[side].state === "STARTER") continue;
        const sc = (fallback?.unconfirmedScenarios ?? []).find((x) => x.team === abbr);
        for (const opt of sc?.options ?? []) {
          const altInputs = inputs.map((t, i) => (i === side ? playersFromRoleShares(teamBlock(abbr), excludedFor(abbr), { starterQb: opt.starter.playerId, starterName: opt.starter.name, strictStarter: true }) : t));
          const altPrep = altInputs.map(prepareTeamPlayers);
          const h = fnv1a64(JSON.stringify({ engine: NFL_SIM_V2_VERSION, params: paramsRef.sha256, anchors: [anchors.home, anchors.away], runs, scenario: { team: abbr, starter: opt.starter.playerId }, players: altInputs.map((t) => t.players.map((p) => [p.playerId, p.passShare, p.targetShare, p.carryShare, p.catchRate, p.ypr, p.ypc])) }));
          const tag = `scenario-${abbr}-${String(opt.starter.playerId).replace(/^nfl-athlete-/, "")}`;
          const rel = `${SCENARIO_DIR}/${now.slice(0, 10)}/${eventId}-${h}-${tag}.json`;
          if (fs.existsSync(path.join(ROOT, rel))) { console.log(`  scenario EXISTS: ${rel}`); continue; }
          const seed = fnv1a64(`${NFL_SIM_V2_ENGINE}|${eventId}|${h}`).slice(0, 8);
          const cal = calibrate({ compiled, anchors, baseSeed: seed, postseason: r.seasonType === 3 });
          const b = runBatch({ compiled, thetas: cal.thetas, players: altPrep, baseSeed: seed, runs, postseason: r.seasonType === 3 });
          const scen = buildNflSimulationReceipt({
            event: { eventId, kickoffUtc: r.kickoffUtc, home: r.home, away: r.away },
            compiled, paramsRef, anchors, calibration: cal, prep: altPrep, batch: b, baseSeed: seed, inputHash: h, generatedAt: now, postseason: r.seasonType === 3, idSuffix: tag,
            inputs: { forecastReceipt: `data/internal/nfl/forecast-receipts/${file}`, roleShares: `${ROLE_SHARES}@${roleShares.generatedAt}`, availability, params: paramsRef.sha256, starters: { [r.home.abbr]: starters[0], [r.away.abbr]: starters[1] }, scenario: { team: abbr, confirmed: false, label: opt.scenario, starter: opt.starter, tier: opt.tier, reason: sc.reason } },
          });
          fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
          fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(scen) + "\n", { flag: "wx" });
          console.log(`  scenario ${opt.scenario} (${abbr}) → ${rel} · failed runs ${scen.validation.failedRuns}/${runs}`);
        }
      }
    }
    const inputHash = fnv1a64(JSON.stringify({
      engine: NFL_SIM_V2_VERSION, params: paramsRef.sha256, anchors: [anchors.home, anchors.away], runs,
      players: inputs.map((t) => t.players.map((p) => [p.playerId, p.passShare, p.targetShare, p.carryShare, p.catchRate, p.ypr, p.ypc])),
    }));
    const plan = planShadowReceipt({ eventId, inputHash, kickoffUtc: r.kickoffUtc, nowMs, existing });
    if (plan.action === "STARTED") continue;
    if (plan.action === "UNCHANGED") { console.log(`${eventId} ${r.matchup}: UNCHANGED inputs — receipt exists`); continue; }
    if (plan.action === "SCHEMA_UPGRADE") console.log(`${eventId} ${r.matchup}: SCHEMA UPGRADE ${plan.from} → ${SIMULATION_RECEIPT_SCHEMA} (inputs unchanged; the old receipt is kept)`);
    const baseSeed = fnv1a64(`${NFL_SIM_V2_ENGINE}|${eventId}|${inputHash}`).slice(0, 8);
    const postseason = r.seasonType === 3;
    const calibration = calibrate({ compiled, anchors, baseSeed, postseason });
    if (QB_CONDITION) {
      /* the board's projection mean for each team's simulated starter: an established row on the public board, or the
         experimental projection in data/internal/nfl/qb-fallback (the same numbers the flag-ON pages show) */
      const fallback = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, `data/internal/nfl/qb-fallback/${eventId}.json`), "utf8")); } catch { return null; } })();
      const targetFor = (d) => {
        if (d.state !== "STARTER") return null;
        const row = (board?.players ?? []).find((p) => p.playerId === d.starterQb && p.markets?.player_pass_yds);
        if (row) return { mean: row.markets.player_pass_yds.mean, source: "player board (tier a)" };
        const e = (fallback?.starters ?? []).find((x) => x.starter?.playerId === d.starterQb);
        return e ? { mean: e.projection.mean, source: `experimental ${e.tier}` } : null;
      };
      const t = starters.map(targetFor);
      if (JOINT) {
        /* the board's implied team yardage: the starter's passing mean (or, with no projected starter, the official-anchored
           sim's own team passing) + the board's rushers' means scaled up by the carry share they cover */
        const off = runBatch({ compiled, thetas: calibration.thetas, players: prep, baseSeed, runs: 1500, check: false, postseason });
        const simPass = (side) => { let a = 0; for (let k = 0; k < off.runs; k++) a += off.team[(k * 2 + side) * N_TSTAT + TEAM_STAT.passYds]; return a / off.runs; };
        const simRush = (side) => { let a = 0; for (let k = 0; k < off.runs; k++) a += off.team[(k * 2 + side) * N_TSTAT + TEAM_STAT.rushYds]; return a / off.runs; };
        const yardTargets = [r.home.abbr, r.away.abbr].map((abbr, side) => {
          const pass = t[side]?.mean ?? simPass(side);
          const rushers = (board?.players ?? []).filter((p) => p.team === abbr && p.markets?.player_rush_yds);
          const share = new Map(inputs[side].players.map((p) => [p.playerId, p.carryShare]));
          const covered = rushers.reduce((a, p) => a + (share.get(p.playerId) ?? 0), 0);
          const rush = rushers.length && covered >= 0.5 ? rushers.reduce((a, p) => a + p.markets.player_rush_yds.mean, 0) / covered : simRush(side);
          return { pass, rush, total: pass + rush, rushSource: rushers.length && covered >= 0.5 ? `board rushers (carry share covered ${covered.toFixed(2)})` : "official-anchored sim (board rushers cover < 0.5 of carries)" };
        });
        const officialThetas = calibration.thetas;
        const officialMeans = calibration.achieved;
        const j = calibrateToYards({ compiled, targets: yardTargets.map((y) => y.total), baseSeed, postseason, start: officialThetas });
        calibration.thetas = j.thetas;
        calibration.achieved = j.achieved;
        calibration.jointChallenger = { anchoredTo: "board player projections (team yards)", yardTargets, achievedYards: j.achieved.map((v) => Number(v.toFixed(1))), officialCheck: { anchors: { home: anchors.home, away: anchors.away }, thetas: officialThetas, meanPoints: officialMeans } };
      }
      const starterSlots = starters.map((d, i) => (d.state === "STARTER" ? prep[i].slots.findIndex((x) => x.playerId === d.starterQb) : -1));
      const q = calibratePassWeights({ compiled, thetas: calibration.thetas, players: prep, baseSeed, targets: t.map((x) => x?.mean ?? null), starterSlots, postseason });
      calibration.passWeights = q.weights.map((w) => Number(w.toFixed(4)));
      calibration.qbConditioning = { targets: t, achieved: q.achieved.map((v) => (v == null ? null : Number(v.toFixed(2)))), bounded: q.bounded };
    }
    const batch = runBatch({ compiled, thetas: calibration.thetas, players: prep, baseSeed, runs, postseason, passWeight: calibration.passWeights ?? null });
    if (JOINT) {
      /* the joint game's own mean points (the official forecast is the check in calibration.jointChallenger.officialCheck) */
      const pts = (side) => { let a = 0; for (let k = 0; k < batch.runs; k++) a += batch.scores[2 * k + side]; return a / batch.runs; };
      calibration.achieved = [pts(0), pts(1)];
    }
    const receipt = buildNflSimulationReceipt({
      event: { eventId, kickoffUtc: r.kickoffUtc, home: r.home, away: r.away },
      compiled, paramsRef, anchors, calibration, prep, batch, baseSeed, inputHash, generatedAt: now, postseason, idSuffix: plan.idSuffix,
      inputs: { forecastReceipt: `data/internal/nfl/forecast-receipts/${file}`, roleShares: `${ROLE_SHARES}@${roleShares.generatedAt}`, availability, params: paramsRef.sha256, starters: { [r.home.abbr]: starters[0], [r.away.abbr]: starters[1] } },
    });
    const outRel = `${OUT_DIR}/${now.slice(0, 10)}/${plan.fileStem}.json`;
    const a = receipt.aggregate;
    console.log(`${eventId} ${r.matchup}: P(home) ${a.winProbability.home} · OT ${a.overtimeProbability} · total p50 ${a.total.p50} · margin p50 ${a.margin.p50} · failed runs ${receipt.validation.failedRuns}/${runs} · player boxes stored ${receipt.representativeRunBoxes?.pack?.r?.length ?? 0}, refused ${Object.keys(receipt.representativeRunBoxes?.refusals ?? {}).length} → ${outRel}`);
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
