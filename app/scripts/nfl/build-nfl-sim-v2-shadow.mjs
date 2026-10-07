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
 * --anchor heads (NS-1, architecture audit §8A, founder F-5): solve the tilts against the VALIDATED heads instead —
 * P(home | decided) = the forecast's unrounded win head, mean total = the totals head's unrounded mean — and write to
 * data/internal/research/nfl/sim-v2/anchored-shadow/ (its own directory, so the median-anchored receipts the separate
 * Simulation page reads are untouched). A game whose heads cannot be recovered exactly, or whose tilts cannot reach
 * both tolerances, gets an ANCHOR_UNSOLVED record and no anchored simulation (audit II.0 #5).
 *
 * SHADOW: nothing public reads these receipts. The page label "EXPECTED STATISTICAL SUMMARIES · NOT ONE SIMULATED GAME"
 * stays until V2 passes its validation contract and the founder/model gate (docs/SIMULATION_ENGINE_V2.md).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileParams, NFL_SIM_V2_ENGINE, NFL_SIM_V2_VERSION, prepareTeamPlayers } from "../../src/lib/sports/nfl/sim-v2/engine.mjs";
import { batchMoments, calibrate, calibrateToHeads, HEAD_ANCHOR_METHOD, HEAD_ANCHOR_TOLERANCE, runBatch } from "../../src/lib/sports/nfl/sim-v2/simulate.mjs";
import {
  foldTotalsV3, totalsV3Gate, gamesFromTable, etDateOf, toNflverseAbbr, NFL_TOTALS_V3_HEAD_ID,
  TOTALS_REPLAY_RECEIPT, TOTALS_REPLAY_PREREG, GAMES_HISTORY, EFFICIENCY_HISTORY, CURRENT_SEASON,
} from "../../src/lib/sports/nfl/totals-play-efficiency.mjs";
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
const ANCHORED_DIR = "data/internal/research/nfl/sim-v2/anchored-shadow";
const VALIDATED_WIN_HEAD = "nfl-win-elo-mov-v1";

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

/**
 * NS-1 win target from the forecast of record. The producer publishes home = head × (1 − tieMass), where tieMass is
 * game-sim v1's tie count / 10,000 (exact to 4 places), so head = homeUnrounded / (1 − tieMass) recovers the head's
 * P(home | decided) exactly. Whichever head published is the target; `validatedHead` says whether it was the
 * adopted Elo-MOV head or the incumbent fallback the forecast names.
 */
export function winHeadTarget(r) {
  const w = r?.forecastSummary?.winProbability;
  const hu = w?.homeUnrounded;
  const tie = w?.tieMass;
  if (!Number.isFinite(hu) || !Number.isFinite(tie) || !(tie >= 0 && tie < 1)) return { state: "REFUSED", reason: "forecast has no unrounded win probability / tie mass" };
  const pHome = hu / (1 - tie);
  if (!(pHome > 0 && pHome < 1)) return { state: "REFUSED", reason: `recovered win head ${pHome} outside (0, 1)` };
  const head = r.model?.winHead ?? {};
  return {
    state: "READY",
    pHome,
    winHeadId: head.id ?? null,
    validatedHead: head.id === VALIDATED_WIN_HEAD && !head.fallbackFrom,
    source: "forecastSummary.winProbability.homeUnrounded / (1 − tieMass)",
  };
}

/**
 * NS-1 total target: the v3 totals head's unrounded mean, re-folded point-in-time exactly as the forecast builder
 * folded it (whole ET days strictly before min(game day, forecast run day)). The forecast receipt records only the
 * rounded median, so the re-fold must prove it is the same fold: same games folded and same last day as the receipt
 * records, else REFUSED. Only the v3 head is reproduced; a forecast on the v1 fallback is REFUSED (stated, not guessed).
 */
export function makeTotalsHeadTarget(totalsV3) {
  return (r) => {
    const th = r?.model?.totalsHead;
    if (th?.id !== NFL_TOTALS_V3_HEAD_ID) return { state: "REFUSED", reason: `totals head is ${th?.id ?? "absent"}; only ${NFL_TOTALS_V3_HEAD_ID} is reproduced` };
    if (totalsV3?.state !== "READY") return { state: "REFUSED", reason: `totals v3 inputs unavailable: ${totalsV3?.reason ?? "?"}` };
    const beforeDate = [etDateOf(r.kickoffUtc), etDateOf(r.generatedAt)].sort()[0];
    const folded = foldTotalsV3({ games: totalsV3.games, efficiencyRows: totalsV3.efficiencyRows, frozen: totalsV3.frozen, fit: totalsV3.fit, beforeDate });
    if (folded.gamesFolded !== th.gamesFolded || folded.lastDateFolded !== th.foldedThrough) {
      return { state: "REFUSED", reason: `re-fold does not reproduce the forecast's fold (${folded.gamesFolded} games through ${folded.lastDateFolded} vs ${th.gamesFolded} through ${th.foldedThrough})` };
    }
    const home = toNflverseAbbr(r.home.abbr);
    const away = toNflverseAbbr(r.away.abbr);
    if (!folded.hasTeam(home) || !folded.hasTeam(away)) return { state: "REFUSED", reason: "a team is unrated in the re-fold" };
    const total = folded.muFor(home, away);
    const median = r.forecastSummary?.total?.median;
    // Sanity: the published median is the snapped median of Normal(total, σ) draws, so it sits within ~1.5 of it.
    if (!Number.isFinite(total) || !Number.isFinite(median) || Math.abs(total - median) > 1.5) {
      return { state: "REFUSED", reason: `re-folded total ${total} is not consistent with the published median ${median}` };
    }
    return { state: "READY", total, totalsHeadId: th.id, source: `foldTotalsV3 before ${beforeDate} (${folded.gamesFolded} games, matches receipt)` };
  };
}

function loadTotalsV3() {
  const gate = totalsV3Gate(read(TOTALS_REPLAY_RECEIPT), read(TOTALS_REPLAY_PREREG));
  if (gate.state !== "READY") return gate;
  const history = read(GAMES_HISTORY);
  const effHistory = read(EFFICIENCY_HISTORY);
  if (!history?.games?.length || !effHistory?.rows?.length) return { state: "REFUSED", reason: "the committed game or play-efficiency history is unreadable" };
  const current = read(CURRENT_SEASON);
  const captured = current?.state === "CAPTURED";
  const lastHistorySeason = history.seasons[1];
  return {
    ...gate,
    games: [...gamesFromTable(history), ...(captured ? gamesFromTable(current).filter((g) => g.season > lastHistorySeason) : [])],
    efficiencyRows: [...effHistory.rows, ...(captured ? current.efficiencyRows.filter((x) => x.season > lastHistorySeason) : [])],
  };
}

function main() {
  const now = arg("--now");
  if (!now || !Number.isFinite(Date.parse(now))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
  const runs = Number(arg("--runs", 10000));
  const dryRun = argv.includes("--dry-run");
  const wanted = new Set(args("--event"));
  const anchorMode = arg("--anchor", "medians");
  if (!["medians", "heads"].includes(anchorMode)) { console.error("REFUSED: --anchor medians|heads"); process.exit(2); }
  const heads = anchorMode === "heads";
  const outDir = heads ? ANCHORED_DIR : OUT_DIR;
  const totalsHeadTarget = heads ? makeTotalsHeadTarget(loadTotalsV3()) : null;

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
  const outRoot = path.join(ROOT, outDir);
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
    let targets = null;
    if (heads) {
      const win = winHeadTarget(r);
      const tot = totalsHeadTarget(r);
      targets = { win, tot };
    }
    const hashBody = {
      engine: NFL_SIM_V2_VERSION, params: paramsRef.sha256, anchors: [anchors.home, anchors.away], runs,
      players: inputs.map((t) => t.players.map((p) => [p.playerId, p.passShare, p.targetShare, p.carryShare, p.catchRate, p.ypr, p.ypc])),
    };
    // Head mode hashes its own targets too (a new head value is a new input); median mode's hash is unchanged.
    if (heads) hashBody.headAnchor = { method: HEAD_ANCHOR_METHOD, pHome: targets.win.pHome ?? null, total: targets.tot.total ?? null, refused: [targets.win.reason ?? null, targets.tot.reason ?? null] };
    const inputHash = fnv1a64(JSON.stringify(hashBody));
    const idPrefix = heads ? "nfl-sim-v2-anchored" : "nfl-sim-v2";
    if (existingIds.has(`${idPrefix}:${eventId}:${inputHash}`)) { console.log(`${eventId} ${r.matchup}: UNCHANGED inputs — receipt exists`); continue; }
    const baseSeed = fnv1a64(`${NFL_SIM_V2_ENGINE}|${eventId}|${inputHash}`).slice(0, 8);
    const postseason = r.seasonType === 3;
    const calibration = calibrate({ compiled, anchors, baseSeed, postseason });
    let batch;
    let anchoring = null;
    let thetas = calibration.thetas;
    if (heads) {
      const refused = [targets.win, targets.tot].filter((t) => t.state !== "READY").map((t) => t.reason);
      const solved = refused.length
        ? { state: "ANCHOR_UNSOLVED", reason: `head targets unavailable: ${refused.join("; ")}`, achieved: null, thetas: null, iterations: 0, evaluations: 0 }
        : calibrateToHeads({ compiled, players: prep, targets: { pHome: targets.win.pHome, total: targets.tot.total }, baseSeed, runs, postseason, start: calibration.thetas });
      const record = {
        method: HEAD_ANCHOR_METHOD,
        state: solved.state,
        ...(solved.reason ? { reason: solved.reason } : {}),
        tolerance: HEAD_ANCHOR_TOLERANCE,
        targets: {
          pHomeDecided: targets.win.pHome ?? null, winHead: targets.win.winHeadId ?? null, validatedWinHead: targets.win.validatedHead ?? null, winSource: targets.win.source ?? targets.win.reason,
          meanTotal: targets.tot.total ?? null, totalsHead: targets.tot.totalsHeadId ?? null, totalSource: targets.tot.source ?? targets.tot.reason,
        },
        achieved: solved.achieved,
        thetas: solved.thetas,
        iterations: solved.iterations,
        batchEvaluations: solved.evaluations,
        startedFrom: { method: "median anchors (calibrate)", thetas: calibration.thetas },
        publishedWinProbability: r.forecastSummary?.winProbability ? { home: r.forecastSummary.winProbability.home, away: r.forecastSummary.winProbability.away } : null,
      };
      if (solved.state !== "ANCHORED") {
        console.log(`${eventId} ${r.matchup}: ANCHOR_UNSOLVED — ${solved.reason}`);
        if (dryRun) continue;
        const outRel = `${outDir}/${now.slice(0, 10)}/${eventId}-${inputHash}.json`;
        const doc = { schemaVersion: "nfl-sim-v2-anchor-unsolved@1", simulationReceiptId: `${idPrefix}:${eventId}:${inputHash}`, eventId, eventStart: r.kickoffUtc, promotionState: "SHADOW", anchoring: record, inputSnapshotIds: { forecastReceipt: `data/internal/nfl/forecast-receipts/${file}` }, generatedAt: now };
        const abs = path.join(ROOT, outRel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        try { fs.writeFileSync(abs, JSON.stringify(doc) + "\n", { flag: "wx" }); wrote += 1; } catch (e) { if (e.code !== "EEXIST") throw e; }
        continue;
      }
      thetas = solved.thetas;
      batch = runBatch({ compiled, thetas, players: prep, baseSeed, runs, postseason });
      // The checked batch must be the solved batch (the check draws no randoms): same moments, or refuse to write.
      const m = batchMoments(batch);
      if (m.pHomeDecided !== solved.achieved.pHomeDecided || m.meanTotal !== solved.achieved.meanTotal) throw new Error(`${eventId}: checked batch differs from the solved batch`);
      anchoring = record;
    } else {
      batch = runBatch({ compiled, thetas, players: prep, baseSeed, runs, postseason });
    }
    const receipt = buildNflSimulationReceipt({
      event: { eventId, kickoffUtc: r.kickoffUtc, home: r.home, away: r.away },
      compiled, paramsRef, anchors, calibration: heads ? { thetas, achieved: batchMoments(batch).meanPts } : calibration, prep, batch, baseSeed, inputHash, generatedAt: now, postseason,
      ...(heads ? { anchoring, idPrefix } : {}),
      inputs: { forecastReceipt: `data/internal/nfl/forecast-receipts/${file}`, roleShares: `${ROLE_SHARES}@${roleShares.generatedAt}`, availability, params: paramsRef.sha256 },
    });
    const outRel = `${outDir}/${now.slice(0, 10)}/${eventId}-${inputHash}.json`;
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
