/**
 * CROSS-PRODUCT PREDICTION CONSISTENCY · AUDIT OVER COMMITTED ARTIFACTS (read-only).
 *
 * Builds the official snapshot for every NFL event that has all its sources committed (forecast receipts, player
 * board, World Model V2, sim-v2 shadow receipt) and for the NBA v1 forecasts of the configured dates, then holds
 * every product surface that can be loaded from committed files against it:
 *
 *   NFL  game page view (forecast-view gameView/playerRows, exactly the page's logic on the same documents) · the
 *        public forecast copy (forecasts/latest.json ∪ frozen-latest) · /nfl Top boards (forecast-view topBoards) ·
 *        weekly boards · frozen live props (Live Hub / Results, incl. the graded "implied side") · sim-v2 batch
 *        distributions (/nfl/simulation) · the Theater default run · World Model V2 (game, players, its restated
 *        record, sampled worlds).
 *   NBA  official snapshot = Elo side + v0.1 players (official-snapshot.mjs) · the public /nba experimental lane ·
 *        the private top boards of every family · the supporting v1 simulation (favourite + anchor check,
 *        nbaSimAnchorCheck) · its stored runs (Theater default + box-score invariants).
 *   Code static scan (static-scan.mjs).
 *
 * Nothing is written. Every file read is recorded in `manifest` (path → sha256 of its bytes) so a baseline can tell a
 * discrepancy introduced by CODE (its sources unchanged) from one that arrived with new DATA (a source changed).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  NBA_LANE_FAMILIES, NBA_OFFICIAL_FAMILY, NBA_SUPPORTING_FAMILY, SOURCE_ROLE, SnapshotRefusal, nbaOfficialSnapshot, nbaSupportingGame, nflOfficialSnapshot, playerOf,
} from "./official-snapshot.mjs";
import { evaluateMarket, LEAN } from "./market-evaluator.mjs";
import { officialTargets, runsFromNbaSamples, runsFromNflSimReceipt, selectOfficialRepresentative } from "./representative.mjs";
import {
  CODES, SEVERITY, TOLERANCE, boxScoreChecks, discrepancy, leanContradictions, nameKeyedRows, nbaRunInvariants, nflRunInvariants,
  postLockRewrites, projectionMismatches, scenarioLeaks, surfaceVersionMix, unqualifiedAsQualified, versionMixFromSources, worldModelWorldInvariants,
} from "./checks.mjs";
import { staticScan } from "./static-scan.mjs";
import { MARKET_KEY, boardTabs, gameView, topBoards } from "../sports/nfl/forecast-view.mjs";
import { loadForecastViews } from "../sports/nfl/forecast-view-load.mjs";
import { readWorldModelArtifacts } from "../sports/nfl/world-model-v2/read.mjs";
import { readShadowReceipts, simulationOfRecord } from "../sports/nfl/sim-v2/public-receipt.mjs";
import { DEFAULT_BOARD_FAMILY } from "../sports/nba/top-boards.mjs";

export const AUDIT_VERSION = "gtp.consistency.audit@1";
export const DEFAULT_NBA_DATES = Object.freeze(["2026-10-20"]);

export const OWNERS = Object.freeze({
  forecastView: "NFL forecast-view owner (app/src/lib/sports/nfl/forecast-view.mjs) — release-owner session",
  worldModel: "World Model V2 producer (app/scripts/nfl/build-nfl-world-model-v2.mjs) — release-owner session",
  simV2: "sim-v2 producer (app/scripts/nfl/build-nfl-sim-v2-shadow.mjs) — release-owner session",
  theater: "Simulation Theater (PR 1140 branch) — theater session",
  liveProps: "live props / settlement (app/src/lib/sports/nfl/live-prop-state.mjs) — release-owner session",
  weeklyBoards: "weekly boards producer — release-owner session",
  playerBoard: "player board producer — release-owner session",
  nbaBoards: "NBA top boards (app/src/lib/sports/nba/top-boards.mjs) — NBA department",
  nbaForecast: "NBA forecast builders (v0.1 official, v1 supporting) — release-owner session",
  nbaLane: "NBA experimental public lane (app/src/lib/sports/nba/experimental-public-lane.mjs, #1146) — release-owner session",
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** File reader that records every path it touches. */
function reader(repoRoot) {
  const manifest = {};
  const read = (rel) => {
    const abs = path.join(repoRoot, rel);
    let buf;
    try { buf = fs.readFileSync(abs); } catch { return null; }
    manifest[rel] = sha256(buf);
    try { return { path: rel, doc: JSON.parse(buf.toString("utf8")), sha256: manifest[rel] }; } catch { return null; }
  };
  return { read, manifest };
}

/* ═══════════════════════════════════════ NFL ═══════════════════════════════════════ */

const RECEIPTS_REL = "data/internal/nfl/forecast-receipts";
const PUB = "app/public/data/nfl";

/** Board family key ↔ view family key ↔ sim-v2 stat key. */
const VIEW_OF = Object.freeze(Object.fromEntries(Object.entries(MARKET_KEY).map(([v, m]) => [m, v])));
const SIM_STAT = Object.freeze({ player_pass_yds: "passYds", player_rush_yds: "rushYds", player_reception_yds: "recYds", player_receptions: "rec" });
const WM_FAMILY = Object.freeze({ player_pass_yds: "passingYards", player_rush_yds: "rushingYards", player_reception_yds: "receivingYards", player_receptions: "receptions" });
/** The headline value each surface shows for a family: expected receptions, median yards, the anytime-TD probability. */
const officialHeadline = (fam, e) => (fam === "anytime_td" ? e.expected : fam === "player_receptions" ? e.expected : e.median);

/** NFL events with every source committed. */
export function nflEventsWithAllSources(repoRoot) {
  const ids = (dir, re) => {
    const abs = path.join(repoRoot, dir);
    return fs.existsSync(abs) ? new Set(fs.readdirSync(abs).map((f) => f.match(re)?.[1]).filter(Boolean)) : new Set();
  };
  const board = ids(`${PUB}/player-board`, /^(\d+)\.json$/);
  const wm = ids(`${PUB}/world-model-v2`, /^(\d+)\.json$/);
  const rc = new Set();
  const rroot = path.join(repoRoot, RECEIPTS_REL);
  if (fs.existsSync(rroot)) for (const d of fs.readdirSync(rroot)) { const dd = path.join(rroot, d); if (fs.statSync(dd).isDirectory()) for (const f of fs.readdirSync(dd)) { const m = f.match(/^(\d+)(?:-rev-\d{4}Z)?\.json$/); if (m) rc.add(m[1]); } }
  const sroot = path.join(repoRoot, "data/internal/research/nfl/sim-v2/shadow");
  const sim = new Set();
  if (fs.existsSync(sroot)) for (const d of fs.readdirSync(sroot)) { const dd = path.join(sroot, d); if (fs.statSync(dd).isDirectory()) for (const f of fs.readdirSync(dd)) { const m = f.match(/^(\d+)-[0-9a-f]+\.json$/); if (m) sim.add(m[1]); } }
  return [...board].filter((id) => wm.has(id) && rc.has(id) && sim.has(id)).sort();
}

function nflReceipts(repoRoot, read, id) {
  const out = [];
  const rroot = path.join(repoRoot, RECEIPTS_REL);
  for (const d of fs.readdirSync(rroot).sort()) {
    const dd = path.join(rroot, d);
    if (!fs.statSync(dd).isDirectory()) continue;
    for (const f of fs.readdirSync(dd).sort()) {
      if (!(f === `${id}.json` || f.startsWith(`${id}-rev-`))) continue;
      const a = read(`${RECEIPTS_REL}/${d}/${f}`);
      if (a) out.push({ file: a.path, receipt: a.doc, sha256: a.sha256 });
    }
  }
  return out;
}

/**
 * Sim anchoring tolerance (founder decision 2026-10-20): the sim-v2 receipt of record agrees with the official game
 * forecast when |ΔpHome| ≤ 0.02 AND |Δ margin p50| ≤ 0.5 AND |Δ total p50| ≤ 0.5 points (official median vs the
 * batch's p50). Exact stored numbers on both sides.
 */
export const SIM_ANCHOR_TOLERANCE = Object.freeze({ pHome: 0.02, marginP50: 0.5, totalP50: 0.5 });

export function simAnchorCheck(snapshot, aggregate, tol = SIM_ANCHOR_TOLERANCE) {
  const g = snapshot.game;
  const terms = [
    { term: "pHome", official: g.pHome, simulated: aggregate?.winProbability?.home ?? null, tolerance: tol.pHome },
    { term: "marginP50", official: g.margin?.median ?? null, simulated: aggregate?.margin?.p50 ?? null, tolerance: tol.marginP50 },
    { term: "totalP50", official: g.total?.median ?? null, simulated: aggregate?.total?.p50 ?? null, tolerance: tol.totalP50 },
  ].map((t) => ({ ...t, diff: isNum(t.official) && isNum(t.simulated) ? t.simulated - t.official : null }));
  const failed = terms.filter((t) => t.diff == null || Math.abs(t.diff) > t.tolerance);
  return { anchored: failed.length === 0, terms, failed };
}

function auditNflEvent(ctx, id) {
  const { repoRoot, read } = ctx;
  const out = [];
  const receipts = nflReceipts(repoRoot, read, id);
  const board = read(`${PUB}/player-board/${id}.json`);
  const wm = read(`${PUB}/world-model-v2/${id}.json`);
  const simRec = simulationOfRecord(ctx.shadowEntries, id);
  const sim = simRec ? read(simRec.file) : null;

  let snapshot;
  try {
    snapshot = nflOfficialSnapshot(id, { receipts, playerBoard: board, worldModel: wm, simReceipt: sim });
  } catch (e) {
    if (!(e instanceof SnapshotRefusal)) throw e;
    return { snapshot: null, refusal: { sport: "NFL", eventId: id, code: e.code, message: e.message }, discrepancies: [], evaluations: [] };
  }
  const recordPath = snapshot.sources[0].path;
  const boardPath = board.path;
  const official = (pid, fam) => playerOf(snapshot, pid)?.families?.[fam] ?? null;
  const wmDisplayed = ctx.showableWorlds.has(id);
  const evaluations = [];

  /* 1 · sources built from other inputs (World Model V2, sim-v2, the board itself) */
  out.push(...versionMixFromSources({
    snapshot,
    displayed: {
      // founder decision 2026-10-20: World Model V2 renders only on the game page, as a labelled supporting block
      // (never on the Top boards); a stale input is still a displayed stale input until the producer rebuilds it.
      SUPPORTING_SIMULATION: wmDisplayed ? ["nfl-game-page.supporting-simulation"] : [],
      SHADOW: simRec?.showable ? ["nfl-simulation-v2", "simulation-theater"] : [],
      OFFICIAL: ["nfl-player-board"],
    },
    owner: { SUPPORTING_SIMULATION: OWNERS.worldModel, SHADOW: OWNERS.simV2, OFFICIAL: OWNERS.playerBoard },
  }));

  /* 2 · receipts written at/after lock (excluded from the record, still on disk) */
  const lateReceipts = receipts.filter((r) => Date.parse(r.receipt.generatedAt) >= Date.parse(snapshot.lockAt));
  if (lateReceipts.length) {
    out.push(...postLockRewrites({
      snapshot,
      artifacts: [{ surface: "nfl-forecast-receipts", path: lateReceipts[0].file, generatedAt: lateReceipts[0].receipt.generatedAt, severity: SEVERITY.WARN, detail: `${lateReceipts.length} receipt(s) written at/after kickoff; excluded from the record by forecastOfRecord`, correction: "No producer should write a forecast receipt for a locked game; keep any post-lock run outside the receipts tree." }],
      owner: OWNERS.playerBoard,
    }));
  }

  /* 3 · the game page view — exactly what the page renders when the event is in the public forecast copy (the loader's
     own view, with the snapshot it built from that copy); otherwise the page's logic on the receipt of record + this
     snapshot + WMv2 + board. */
  const pub = ctx.publicViews.get(id);
  const view = pub ?? gameView({ forecast: receipts.find((r) => r.file === recordPath).receipt, world: wmDisplayed ? wm?.doc : null, board: board.doc, official: snapshot });
  const playerPairs = [];
  const missing = [];
  const viewFamilies = {};
  const legs = [];
  for (const row of view.players) {
    for (const [vf, e] of Object.entries(row.families)) {
      const fam = MARKET_KEY[vf];
      viewFamilies[fam] = e.source === "worldModel" ? snapshot.sources.find((s) => s.role === "SUPPORTING_SIMULATION")?.modelVersion ?? "nfl-world-model-v2" : e.modelVersion ?? snapshot.modelVersions.players[fam];
      legs.push({ subjectId: row.playerId, label: row.name, family: fam, sourceRole: e.source === "worldModel" ? "SUPPORTING_SIMULATION" : "OFFICIAL", source: e.source });
      const o = official(row.playerId, fam);
      if (!o) { missing.push({ subjectId: row.playerId, label: row.name, family: fam, field: "noOfficialCounterpart", expected: 0, actual: 1 }); continue; }
      playerPairs.push({ subjectId: row.playerId, label: row.name, family: fam, field: "headline", expected: officialHeadline(fam, o), actual: e.value, tolerance: TOLERANCE.exact });
    }
  }
  out.push(...projectionMismatches({
    snapshot, surface: "nfl-game-page.players", sources: [recordPath, boardPath, wm?.path].filter(Boolean), pairs: [...playerPairs, ...missing], owner: OWNERS.forecastView,
    detail: "founder decision 2026-10-20: the NFL player board is the OFFICIAL source for player projections; World Model V2 is a SUPPORTING_SIMULATION only",
    correction: "Show the board's official projection; World Model V2 stays clearly labelled as a supporting simulation and is never the headline 'Projected' value.",
  }));
  out.push(...surfaceVersionMix({
    snapshot, surface: "nfl-game-page.players", families: viewFamilies, officialVersions: snapshot.modelVersions.players, owner: OWNERS.forecastView, sources: [boardPath, wm?.path].filter(Boolean),
    correction: "One model per family per snapshot: forecast-view PLAYER_FAMILIES must point every family at the official source.",
  }));
  if (view.simulation) {
    const sw = view.simulation;
    /* A supporting simulation is allowed to differ from the official numbers ONLY when it is labelled as such (role,
       the shared label, not official, not graded) and carries the revision notice whenever its input is not the
       record's. Labelled ⇒ its differences are recorded as WARN under its own surface; unlabelled ⇒ ERROR, as before. */
    const labelled = sw.role === "SUPPORTING_SIMULATION" && typeof sw.label === "string" && /not the official projection/.test(sw.label) && sw.official === false && sw.graded === false;
    const supAligned = snapshot.sources.find((x) => x.role === "SUPPORTING_SIMULATION")?.alignedWithOfficial;
    const noticeOk = supAligned !== false || (typeof sw.revisionNotice === "string" && sw.revisionNotice.length > 0);
    if (!labelled || !noticeOk) {
      out.push(discrepancy({
        code: CODES.SCENARIO_LEAK, severity: SEVERITY.ERROR, snapshot, surface: "nfl-game-page.simulation",
        identity: { subjectId: id, family: "game", field: !labelled ? "supportingLabel" : "revisionNotice" }, sources: [wm.path],
        expected: !labelled ? "labelled SUPPORTING_SIMULATION" : "older-revision notice", actual: !labelled ? (sw.role ?? null) : null,
        correction: "World Model V2 renders only inside its labelled supporting block, with the older-revision notice when its input hash is not the record's.", owner: OWNERS.forecastView,
      }));
    }
    out.push(...projectionMismatches({
      snapshot, surface: labelled && noticeOk ? "nfl-game-page.supporting-simulation" : "nfl-game-page.simulation", sources: [recordPath, wm.path], owner: OWNERS.worldModel,
      severity: labelled && noticeOk ? SEVERITY.WARN : SEVERITY.ERROR,
      detail: labelled && noticeOk ? "shown only as a labelled supporting simulation (not the official projection, not graded)" : null,
      pairs: [
        { subjectId: id, family: "game", field: "pHome", expected: snapshot.game.pHome, actual: sw.winProbability?.home, tolerance: TOLERANCE.fourDp },
        { subjectId: id, family: "game", field: "marginMedian", expected: snapshot.game.margin.median, actual: sw.margin?.median, tolerance: TOLERANCE.wholeNumber },
        { subjectId: id, family: "game", field: "marginMean", expected: snapshot.game.margin.expected, actual: sw.margin?.mean, tolerance: TOLERANCE.twoDp },
        { subjectId: id, family: "game", field: "totalMedian", expected: snapshot.game.total.median, actual: sw.total?.median, tolerance: TOLERANCE.wholeNumber },
        { subjectId: id, family: "game", field: "totalMean", expected: snapshot.game.total.expected, actual: sw.total?.mean, tolerance: TOLERANCE.twoDp },
      ].map((p) => ({ ...p, groupSubject: p.field })),
      correction: "The game page shows one win chance and one score distribution per game — the official snapshot's. A supporting simulation's different numbers are not shown beside it as a second forecast.",
    }));
    const worlds = (wm.doc.sampledWorlds ?? []).map((w) => ({ ...w, runIndex: w.worldIndex }));
    out.push(...boxScoreChecks({ snapshot, surface: "nfl-game-page.sampled-worlds", runs: worlds, validator: worldModelWorldInvariants, owner: OWNERS.worldModel, sources: [wm.path], correction: "Every displayed world must satisfy points = scoring composition." }));
  }

  /* 4 · the public forecast copy (what /nfl and the game page actually read today) */
  if (pub) {
    const r = pub.record;
    out.push(...projectionMismatches({
      snapshot, surface: "nfl-public-forecast", sources: [recordPath, `${PUB}/forecasts/latest.json`], owner: OWNERS.forecastView,
      pairs: [
        { subjectId: id, family: "game", field: "pHome", expected: snapshot.game.pHomePublished, actual: r.winProbability.home, tolerance: TOLERANCE.exact },
        { subjectId: id, family: "game", field: "projectedHome", expected: snapshot.game.projectedScore.home, actual: r.projectedScore?.home, tolerance: TOLERANCE.exact },
        { subjectId: id, family: "game", field: "projectedAway", expected: snapshot.game.projectedScore.away, actual: r.projectedScore?.away, tolerance: TOLERANCE.exact },
        { subjectId: id, family: "game", field: "marginMedian", expected: snapshot.game.margin.median, actual: r.margin?.median, tolerance: TOLERANCE.exact },
        { subjectId: id, family: "game", field: "totalMedian", expected: snapshot.game.total.median, actual: r.total?.median, tolerance: TOLERANCE.exact },
      ].map((p) => ({ ...p, groupSubject: p.field })),
      correction: "The public forecast file must carry the receipt of record byte-for-byte.",
    }));
    out.push(...postLockRewrites({ snapshot, artifacts: [{ surface: "nfl-public-forecast", path: `${PUB}/forecasts/latest.json`, generatedAt: r.generatedAt }], owner: OWNERS.forecastView }));
  }

  /* 5 · /nfl Top boards — the same rows, ranked (only meaningful before kickoff) */
  const tb = topBoards([view], { now: snapshot.generatedAt, size: 10 });
  const tbTabs = boardTabs(tb.boards);
  const tbLegs = []; const tbPairs = []; const tbRows = [];
  for (const [vf, b] of Object.entries(tb.boards)) {
    const fam = MARKET_KEY[vf];
    // what the list SAYS it is: a family labelled as an estimate (forecast-view ESTIMATE_NOTE) is not presented as qualified
    const presentedAs = tbTabs.families.find((x) => x.key === vf)?.estimate ? "ESTIMATE" : "QUALIFIED";
    for (const r of b.rows) {
      const o = official(r.playerId, fam);
      tbLegs.push({ subjectId: r.playerId, label: r.name, family: fam, sourceRole: r.entry.source === "worldModel" ? "SUPPORTING_SIMULATION" : "OFFICIAL", source: r.entry.source });
      if (o) tbPairs.push({ subjectId: r.playerId, label: r.name, family: fam, field: "headline", expected: officialHeadline(fam, o), actual: r.entry.value });
      tbRows.push({ subjectId: r.playerId, label: r.name, family: fam, presentedAs, qualified: !!o && o.state === "PUBLISHED", reasons: !o ? ["NOT_IN_OFFICIAL_SNAPSHOT"] : o.state !== "PUBLISHED" ? [`FAMILY_${o.state}`] : [] });
    }
  }
  out.push(...projectionMismatches({ snapshot, surface: "nfl-top-boards", sources: [boardPath, wm?.path].filter(Boolean), pairs: tbPairs, owner: OWNERS.forecastView, detail: "founder decision 2026-10-20: the player board is the official player source", correction: "Rank by the board's official projection; World Model V2 stays clearly labelled as a supporting simulation." }));
  out.push(...scenarioLeaks({ snapshot, surface: "nfl-top-boards", legs: tbLegs, sources: [boardPath, wm?.path].filter(Boolean), owner: OWNERS.forecastView, correction: "A Top-10 product ranks official numbers only; a supporting simulation never feeds a ranked product." }));
  out.push(...unqualifiedAsQualified({ snapshot, surface: "nfl-top-boards", rows: tbRows, severity: SEVERITY.WARN, owner: OWNERS.forecastView, sources: [boardPath], correction: "A family the board marks ESTIMATE / WITHHELD is not ranked as a published projection (or the list says ESTIMATE on every row)." }));

  /* 6 · weekly boards (the frozen weekly Top-5/10 file of the event's week) */
  const wbRel = `${PUB}/weekly-boards/${board.doc.seasonType}-${String(board.doc.week).padStart(2, "0")}.json`;
  const wb = read(wbRel);
  if (wb) {
    const pairs = [];
    const lateRows = [];
    const headlineSplit = [];
    for (const b of wb.doc.boards ?? []) {
      for (const r of b.rows ?? []) {
        if (String(r.providerEventId) !== id) continue;
        const o = official(r.playerId, b.family);
        if (!o) { pairs.push({ subjectId: r.playerId, label: r.name, family: b.family, field: "noOfficialCounterpart", expected: 0, actual: 1 }); continue; }
        const isProb = b.metric === "probability";
        pairs.push({ subjectId: r.playerId, label: r.name, family: b.family, field: "value", expected: isProb ? o.expected : o.median, actual: r.value, tolerance: TOLERANCE.fourDp });
        if (b.family === "player_receptions" && b.metric === "median") headlineSplit.push({ subjectId: r.playerId, label: r.name, family: b.family, field: "headlineDefinition", groupSubject: "headlineDefinition", expected: o.expected, actual: r.value, tolerance: TOLERANCE.fourDp });
        if (!isProb && isNum(r.median)) pairs.push({ subjectId: r.playerId, label: r.name, family: b.family, field: "median", expected: o.median, actual: r.median, tolerance: TOLERANCE.wholeNumber });
      }
      if ((b.rows ?? []).some((r) => String(r.providerEventId) === id)) lateRows.push(b.id);
    }
    out.push(...projectionMismatches({ snapshot, surface: "nfl-weekly-boards", sources: [wbRel, boardPath], pairs, owner: OWNERS.weeklyBoards, correction: "Weekly boards copy the official snapshot's numbers exactly (value and the printed median)." }));
    out.push(...projectionMismatches({
      snapshot, surface: "nfl-weekly-boards", sources: [wbRel, boardPath], pairs: headlineSplit, severity: SEVERITY.WARN, owner: OWNERS.weeklyBoards,
      detail: "receptions: weekly boards headline the median, the game page and /nfl Top boards headline the expected count (forecast-view)",
      correction: "One headline definition per family across every surface (pick expected or median for receptions and use it everywhere).",
    }));
    if (lateRows.length) out.push(...postLockRewrites({ snapshot, artifacts: [{ surface: "nfl-weekly-boards", path: wbRel, generatedAt: wb.doc.generatedAt, detail: `boards ${lateRows.join(",")} still list this event` }], owner: OWNERS.weeklyBoards }));
    out.push(...nameKeyedRows({ snapshot, surface: "nfl-weekly-boards", rows: (wb.doc.boards ?? []).flatMap((b) => b.rows ?? []).filter((r) => String(r.providerEventId) === id), owner: OWNERS.weeklyBoards, correction: "Rows carry the owner id." }));
  }

  /* 7 · frozen live props (Live Hub frozen pregame forecasts + the Results record of the implied side) */
  const lpRel = `${PUB}/live-props/${id}.json`;
  const lp = read(lpRel);
  if (lp) {
    const pairs = [];
    const leanPairs = [];
    const now = lp.doc.frozenFrom ?? board.doc.generatedAt;
    for (const row of lp.doc.rows ?? []) {
      const o = official(row.playerId, row.family);
      const pr = row.frozen?.projection ?? {};
      if (o) {
        if (row.family === "anytime_td") pairs.push({ subjectId: row.playerId, label: row.name, family: row.family, field: "probability", expected: o.expected, actual: pr.probability, tolerance: TOLERANCE.fourDp });
        else pairs.push({ subjectId: row.playerId, label: row.name, family: row.family, field: "frozenMedian", expected: o.median, actual: pr.median, tolerance: TOLERANCE.fourDp });
      } else if (pr.median != null || pr.probability != null) {
        pairs.push({ subjectId: row.playerId, label: row.name, family: row.family, field: "noOfficialCounterpart", expected: 0, actual: 1 });
      }
      const m = row.frozen?.market;
      if (m && isNum(m.line)) {
        const ev = evaluateMarket({ snapshot, playerId: row.playerId, family: row.family, line: m.line, book: m.sportsbook ?? null, overAmerican: m.overOdds ?? m.yesOdds ?? null, underAmerican: m.underOdds ?? m.noOdds ?? null, capturedAt: m.capturedAt ?? null, now });
        evaluations.push({ surface: "nfl-live-props", eventId: id, playerId: row.playerId, family: row.family, line: m.line, lean: ev.lean, withheldReasons: ev.withheldReasons, key: ev.identity?.key ?? null });
        // live-prop-state's graded side: projection median vs frozen line, only for PUBLISHED families
        const productLean = row.familyState === "PUBLISHED" && isNum(pr.median) && row.family !== "anytime_td"
          ? (pr.median > m.line ? LEAN.OVER : pr.median < m.line ? LEAN.UNDER : LEAN.NONE) : null;
        leanPairs.push({ subjectId: row.playerId, label: row.name, family: row.family, line: m.line, book: m.sportsbook, productLean, evaluation: ev });
      }
    }
    const lateBoard = Date.parse(board.doc.generatedAt) > Date.parse(lp.doc.frozenFrom ?? "");
    out.push(...projectionMismatches({
      snapshot, surface: "nfl-live-props.frozen", sources: [lpRel, boardPath], pairs, owner: OWNERS.liveProps,
      severity: lateBoard ? SEVERITY.WARN : SEVERITY.ERROR,
      detail: lateBoard ? `frozen at ${lp.doc.frozenFrom}; the last pre-lock board is ${board.doc.generatedAt}` : null,
      correction: "The Live Hub's frozen pregame forecast is the official snapshot frozen at lock (same snapshotId); a freeze from an earlier board must be re-frozen or labelled with its own snapshot.",
    }));
    out.push(...leanContradictions({
      snapshot, surface: "nfl-live-props.graded-side", sources: [lpRel, boardPath], pairs: leanPairs, owner: OWNERS.liveProps,
      correction: "Grade the frozen shared-evaluator lean; a projection below the line is not an UNDER, and a lean the price does not support is not graded as a forecast side.",
    }));
    out.push(...nameKeyedRows({ snapshot, surface: "nfl-live-props", rows: lp.doc.rows ?? [], owner: OWNERS.liveProps, correction: "Rows carry the owner id." }));
  }

  /* 8 · sim-v2 batch distributions (/nfl/simulation) and the Theater default run */
  if (sim) {
    const a = sim.doc.aggregate ?? {};
    const g = snapshot.game;
    out.push(...projectionMismatches({
      snapshot, surface: "nfl-simulation-v2.game", sources: [recordPath, sim.path], owner: OWNERS.simV2,
      pairs: [
        { subjectId: id, family: "game", field: "pHome", expected: g.pHome, actual: a.winProbability?.home, tolerance: TOLERANCE.fourDp },
        { subjectId: id, family: "game", field: "marginMedian", expected: g.margin.median, actual: a.margin?.p50, tolerance: TOLERANCE.wholeNumber },
        { subjectId: id, family: "game", field: "marginMean", expected: g.margin.expected, actual: a.margin?.mean, tolerance: TOLERANCE.twoDp },
        { subjectId: id, family: "game", field: "totalMedian", expected: g.total.median, actual: a.total?.p50, tolerance: TOLERANCE.wholeNumber },
        { subjectId: id, family: "game", field: "totalMean", expected: g.total.expected, actual: a.total?.mean, tolerance: TOLERANCE.twoDp },
        { subjectId: id, family: "game", field: "homeScoreMedian", expected: g.projectedScore.home, actual: a.score?.home?.p50, tolerance: TOLERANCE.wholeNumber },
        { subjectId: id, family: "game", field: "awayScoreMedian", expected: g.projectedScore.away, actual: a.score?.away?.p50, tolerance: TOLERANCE.wholeNumber },
      ].map((p) => ({ ...p, groupSubject: p.field })),
      correction: "The Simulation page and Theater show the official snapshot's win chance and score distribution; the shadow engine's own batch numbers stay internal (or are re-anchored to the official snapshot).",
    }));
    /* founder decision 2026-10-20: the NFL Theater stays NON-PUBLIC until the drive engine is re-anchored so that its
       own distribution matches the official game forecast (SIM_ANCHOR_TOLERANCE). */
    const anchor = simAnchorCheck(snapshot, a);
    if (!anchor.anchored) {
      out.push(discrepancy({
        code: CODES.PROJECTION_MISMATCH, severity: SEVERITY.ERROR, snapshot, surface: "simulation-theater.anchor",
        identity: { subjectId: id, family: "game", field: "simAnchor" }, sources: [sim.path, recordPath],
        expected: anchor.terms.map((t) => `${t.term} ${t.official} ±${t.tolerance}`).join("; "),
        actual: anchor.terms.map((t) => `${t.term} ${t.simulated}`).join("; "),
        count: anchor.failed.length, examples: anchor.failed,
        detail: `sim-v2 receipt of record ${sim.path} is not anchored to the official game forecast`,
        correction: "Re-anchor the drive engine to the official forecast's distribution (not only its medians) before any public Theater replay; until then the NFL Theater stays non-public.",
        owner: OWNERS.simV2,
      }));
    }
    ctx.anchors.push({ sport: "NFL", eventId: id, simPath: sim.path, ...anchor });

    const ppairs = [];
    for (const p of sim.doc.playerStatDistributions ?? []) {
      if (!p.playerId || p.playerId === "OTHER") continue;
      for (const [fam, st] of Object.entries(SIM_STAT)) {
        const d = p.stats?.[st];
        const o = official(p.playerId, fam);
        if (!d || !o) continue;
        if (fam === "player_receptions") ppairs.push({ subjectId: p.playerId, label: p.name, family: fam, field: "expected", expected: o.expected, actual: d.mean, tolerance: TOLERANCE.twoDp });
        else ppairs.push({ subjectId: p.playerId, label: p.name, family: fam, field: "median", expected: o.median, actual: d.p50, tolerance: TOLERANCE.wholeNumber });
      }
      const atd = official(p.playerId, "anytime_td");
      if (atd && isNum(p.anytimeTd)) ppairs.push({ subjectId: p.playerId, label: p.name, family: "anytime_td", field: "probability", expected: atd.expected, actual: p.anytimeTd, tolerance: TOLERANCE.fourDp });
    }
    out.push(...projectionMismatches({ snapshot, surface: "nfl-simulation-v2.players", sources: [boardPath, sim.path], pairs: ppairs, owner: OWNERS.simV2, correction: "The Theater's projected box score is the official player board's expectations; a run's lines are one game, not the projection." }));

    const runs = runsFromNflSimReceipt(sim.doc);
    const sel = selectOfficialRepresentative(runs, officialTargets(snapshot));
    const current = runs.find((r) => r.sourceKind === "MEDIAN_LIKE") ?? runs[0] ?? null;
    if (sel.official && current && sel.official.run.runIndex !== current.runIndex) {
      out.push(discrepancy({
        code: CODES.PROJECTION_MISMATCH, severity: SEVERITY.ERROR, snapshot, surface: "simulation-theater.default",
        identity: { subjectId: id, family: "game", field: "representativeRun" }, sources: [sim.path, recordPath],
        expected: sel.official.run.runIndex, actual: current.runIndex,
        examples: [{ official: { runIndex: sel.official.run.runIndex, home: sel.official.run.home, away: sel.official.run.away, distance: sel.distance }, current: { runIndex: current.runIndex, home: current.home, away: current.away, kind: current.sourceKind } }],
        correction: "Default the Theater to selectOfficialRepresentative(runs, officialTargets(snapshot)); show the current pick as a labelled What-If.", owner: OWNERS.theater,
      }));
    }
    if (sel.official && !sel.withinTolerance) {
      out.push(discrepancy({
        code: CODES.PROJECTION_MISMATCH, severity: SEVERITY.WARN, snapshot, surface: "simulation-theater.default",
        identity: { subjectId: id, family: "game", field: "representativeDistance" }, sources: [sim.path],
        expected: `≤ ${0.5}`, actual: sel.distance, correction: "Select from the full replayable batch (seed + runIndex), not only the 5 stored runs.", owner: OWNERS.theater,
      }));
    }
    ctx.representatives.push({ sport: "NFL", eventId: id, snapshotId: snapshot.snapshotId, official: sel.official ? { runIndex: sel.official.run.runIndex, home: sel.official.run.home, away: sel.official.run.away } : null, distance: sel.distance, withinTolerance: sel.withinTolerance, currentDefault: current ? { runIndex: current.runIndex, kind: current.sourceKind } : null, whatIf: sel.whatIf.map((w) => ({ runIndex: w.run.runIndex, kind: w.kind, label: w.label })) });
    out.push(...boxScoreChecks({ snapshot, surface: "simulation-theater.runs", runs, validator: nflRunInvariants, owner: OWNERS.simV2, sources: [sim.path], correction: "Every stored run must satisfy Σ quarters = final = last drive score." }));
    out.push(...postLockRewrites({ snapshot, artifacts: [{ surface: "nfl-simulation-v2", path: sim.path, generatedAt: sim.doc.generatedAt }], owner: OWNERS.simV2 }));
  }

  /* 9 · World Model V2: its restated "forecast of record" + its own lock discipline */
  if (wm) {
    const f = wm.doc.forecastOfRecord ?? {};
    out.push(...projectionMismatches({
      snapshot, surface: "world-model-v2.forecastOfRecord", sources: [wm.path, recordPath], owner: OWNERS.worldModel,
      pairs: [
        { subjectId: id, family: "game", field: "pHome", expected: snapshot.game.pHomePublished, actual: f.winProbability?.home, tolerance: TOLERANCE.fourDp },
        { subjectId: id, family: "game", field: "marginMedian", expected: snapshot.game.margin.median, actual: f.marginMedianHome, tolerance: TOLERANCE.exact },
        { subjectId: id, family: "game", field: "totalMedian", expected: snapshot.game.total.median, actual: f.totalMedian, tolerance: TOLERANCE.exact },
        { subjectId: id, family: "game", field: "projectedHome", expected: snapshot.game.projectedScore.home, actual: f.projectedScore?.home, tolerance: TOLERANCE.exact },
        { subjectId: id, family: "game", field: "projectedAway", expected: snapshot.game.projectedScore.away, actual: f.projectedScore?.away, tolerance: TOLERANCE.exact },
      ].map((p) => ({ ...p, groupSubject: p.field })),
      correction: "World Model V2 restates the forecast of record it was built from; when that is not the official record, the world is stale and must be rebuilt (or hidden) before it is shown.",
    }));
    out.push(...postLockRewrites({ snapshot, artifacts: [{ surface: "world-model-v2", path: wm.path, generatedAt: wm.doc.run?.generatedAt }], owner: OWNERS.worldModel }));
    out.push(...nameKeyedRows({ snapshot, surface: "world-model-v2", rows: wm.doc.players ?? [], owner: OWNERS.worldModel, correction: "Rows carry the owner id." }));
  }

  out.push(...nameKeyedRows({ snapshot, surface: "nfl-player-board", rows: board.doc.players ?? [], owner: OWNERS.playerBoard, correction: "A board row without an owner id is withheld, never joined by name." }));
  return { snapshot, refusal: null, discrepancies: out, evaluations };
}

/* ═══════════════════════════════════════ NBA ═══════════════════════════════════════ */

const NBA_FORECASTS = (family, date) => `data/internal/research/nba/experimental-${family}/forecasts/${date}.json`;
const NBA_LANE = (date) => `app/public/data/nba/experimental-public/${date}.json`;
const NBA_BOARDS_DIR = "data/internal/research/nba/top-boards";
const NBA_STAT_FAMILY = Object.freeze({ pts: "pts", reb: "reb", ast: "ast", threePm: "threePm" });
/** The lane's display rule (experimental-public-lane.mjs r1): one decimal, half away from zero via Math.round. */
const r1 = (x) => (isNum(x) ? Math.round(x * 10) / 10 : null);

/**
 * NBA SUPPORTING-SIMULATION ANCHOR (the NBA counterpart of `simAnchorCheck`). The Theater replays stored v1 runs while
 * the official forecast is the Elo side + v0.1 players; a public Theater must not show a simulation that tells another
 * story. Terms (exact stored numbers both sides):
 *   side     v1 sim favourite (pHome vs 0.5) = official Elo side
 *   pHome    |v1 sim pHome − official Elo pHome| ≤ tolerance.pHome
 *   players  per official (player, family ∈ pts/reb/ast/threePm) with a v1 counterpart: z = |v1 unconditional mean −
 *            v0.1 mean| / v0.1 sd ≤ tolerance.playerZ (v1 stores means conditional on playing: r·μ is compared).
 *   inputs   both receipts frozen on the same injury + roster inputs (reported; not a gate term on its own).
 * TOLERANCE STATUS. pHome reuses the founder's NFL anchor value (0.02, 2026-10-20); playerZ 0.25 is PROPOSED by this
 * audit. Neither is founder-approved FOR NBA, so `approved: false` keeps the Theater gate closed even if every term
 * passes (methodology constants need a source and founder approval).
 */
export const NBA_SIM_ANCHOR_TOLERANCE = Object.freeze({
  pHome: SIM_ANCHOR_TOLERANCE.pHome,
  playerZ: 0.25,
  approved: false,
  basis: "pHome = founder NFL anchor tolerance (2026-10-20) proposed for NBA; playerZ = proposed; both await founder approval",
});
const ANCHOR_FAMILIES = Object.freeze(["pts", "reb", "ast", "threePm"]);

export function nbaSimAnchorCheck(snapshot, supportingGame, tol = NBA_SIM_ANCHOR_TOLERANCE) {
  const sim = supportingGame?.forecast?.sim ?? null;
  const offSide = snapshot?.game?.winner?.side ?? null;
  const simSide = isNum(sim?.pHome) ? (sim.pHome > 0.5 ? "HOME" : sim.pHome < 0.5 ? "AWAY" : null) : null;
  const terms = [
    { term: "side", official: offSide, simulated: simSide, tolerance: null, diff: null, pass: offSide != null && simSide === offSide },
    (() => {
      const official = snapshot?.game?.pHome ?? null; const simulated = sim?.pHome ?? null;
      const diff = isNum(official) && isNum(simulated) ? simulated - official : null;
      return { term: "pHome", official, simulated, tolerance: tol.pHome, diff, pass: diff != null && Math.abs(diff) <= tol.pHome };
    })(),
  ];
  const byId = new Map();
  for (const side of ["home", "away"]) for (const p of supportingGame?.forecast?.players?.[side] ?? []) byId.set(String(p.providerAthleteId), p);
  const players = [];
  for (const p of snapshot?.players ?? []) {
    const v = byId.get(p.playerId);
    for (const fam of ANCHOR_FAMILIES) {
      const o = p.families?.[fam];
      if (!o || !isNum(o.expected) || !isNum(o.sd) || o.sd <= 0) continue;
      const d = v?.[fam];
      const r = isNum(v?.playRate) && v.playRate > 0 && v.playRate <= 1 ? v.playRate : 1;
      const simulated = v && isNum(d?.mean) ? (v.conditioning ? r * d.mean : d.mean) : null;
      const z = isNum(simulated) ? Math.abs(simulated - o.expected) / o.sd : null;
      players.push({ playerId: p.playerId, family: fam, official: o.expected, simulated, z, pass: z != null && z <= tol.playerZ });
    }
  }
  const failedPlayers = players.filter((x) => !x.pass);
  const worst = players.filter((x) => isNum(x.z)).sort((a, b) => b.z - a.z || a.playerId.localeCompare(b.playerId)).slice(0, 5);
  terms.push({ term: "players", official: players.length, simulated: players.length - failedPlayers.length, tolerance: tol.playerZ, diff: null, pass: players.length > 0 && failedPlayers.length === 0, failed: failedPlayers.length, worst });
  const sup = (snapshot?.sources ?? []).find((s) => s.role === SOURCE_ROLE.SUPPORTING_SIMULATION) ?? null;
  const failed = terms.filter((t) => !t.pass);
  return {
    anchored: !!supportingGame && failed.length === 0,
    toleranceApproved: tol.approved === true,
    sameInputs: sup ? sup.alignedWithOfficial : null,
    tolerance: tol,
    terms,
    failed,
  };
}

function auditNbaDate(ctx, date) {
  const { repoRoot, read } = ctx;
  const off = read(NBA_FORECASTS(NBA_OFFICIAL_FAMILY, date));
  const sup = read(NBA_FORECASTS(NBA_SUPPORTING_FAMILY, date));
  const lane = read(NBA_LANE(date));
  const results = [];
  if (!off && !sup) return results;
  const boards = [];
  const bdir = path.join(repoRoot, NBA_BOARDS_DIR);
  if (fs.existsSync(bdir)) for (const fam of fs.readdirSync(bdir).sort()) { const b = read(`${NBA_BOARDS_DIR}/${fam}/${date}.json`); if (b) boards.push(b); }
  const ids = [...new Set([...(off?.doc.games ?? []), ...(sup?.doc.games ?? [])].map((g) => String(g.providerEventId)))].sort();
  const officialSrc = off ? { doc: off.doc, path: off.path, sha256: off.sha256 } : null;
  const supportingSrc = sup ? { doc: sup.doc, path: sup.path, sha256: sup.sha256 } : null;

  for (const id of ids) {
    const out = [];
    let snapshot;
    try { snapshot = nbaOfficialSnapshot(id, { official: officialSrc, supporting: supportingSrc }); } catch (e) {
      if (!(e instanceof SnapshotRefusal)) throw e;
      results.push({ snapshot: null, refusal: { sport: "NBA", eventId: id, code: e.code, message: e.message }, discrepancies: [], evaluations: [] });
      continue;
    }
    const official = (pid, fam) => playerOf(snapshot, pid)?.families?.[fam] ?? null;
    const officialFamily = NBA_OFFICIAL_FAMILY;
    const supGame = nbaSupportingGame(supportingSrc, id).game;

    // the public /nba lane (#1146) shows exactly the official snapshot (display rule: 1 dp)
    const laneGame = (lane?.doc?.games ?? []).find((x) => String(x.providerEventId) === id) ?? null;
    if (laneGame) {
      const surface = "nba-public-lane";
      const sources = [lane.path, off.path];
      const pairs = [];
      for (const side of ["away", "home"]) {
        for (const row of laneGame.players?.[side] ?? []) {
          const pid = String(row.providerAthleteId ?? "");
          const p = playerOf(snapshot, pid);
          if (!p) { pairs.push({ subjectId: pid, label: row.name, family: "player", field: "noOfficialCounterpart", expected: 0, actual: 1 }); continue; }
          if (p.side !== side) pairs.push({ subjectId: pid, label: row.name, family: "player", field: "side", expected: 0, actual: 1 });
          pairs.push({ subjectId: pid, label: row.name, family: "minutes", field: "expectedMinutes", expected: r1(p.expectedMinutes), actual: row.expectedMinutes, tolerance: TOLERANCE.exact });
          for (const fam of NBA_LANE_FAMILIES) {
            const o = p.families?.[fam];
            if (!o) { pairs.push({ subjectId: pid, label: row.name, family: fam, field: "noOfficialCounterpart", expected: 0, actual: 1 }); continue; }
            if (o.publicDisplay !== "MEDIAN_1DP") pairs.push({ subjectId: pid, label: row.name, family: fam, field: "publicDisplay", expected: 0, actual: 1 });
            pairs.push({ subjectId: pid, label: row.name, family: fam, field: "median1dp", expected: r1(o.median), actual: row.medians?.[fam], tolerance: TOLERANCE.exact });
          }
        }
      }
      const shown = new Set(["away", "home"].flatMap((s) => (laneGame.players?.[s] ?? []).map((r) => String(r.providerAthleteId))));
      for (const p of snapshot.players) {
        if (p.families?.pts?.publicDisplay === "MEDIAN_1DP" && !shown.has(p.playerId)) pairs.push({ subjectId: p.playerId, label: p.displayName, family: "player", field: "missingFromLane", expected: 0, actual: 1 });
      }
      out.push(...projectionMismatches({ snapshot, surface, sources, pairs, owner: OWNERS.nbaLane, correction: "The lane copies the official snapshot's v0.1 medians (1 dp) and expected minutes for exactly the players the official rule marks MEDIAN_1DP." }));
      const sideAbbr = snapshot.game.winner.side === "HOME" ? snapshot.home.abbr : snapshot.game.winner.side === "AWAY" ? snapshot.away.abbr : null;
      if ((laneGame.elo?.favoured ?? null) !== sideAbbr) {
        out.push(discrepancy({ code: CODES.LEAN_CONTRADICTION, severity: SEVERITY.ERROR, snapshot, surface, identity: { subjectId: id, family: "game", field: "favoured" }, sources, expected: sideAbbr, actual: laneGame.elo?.favoured ?? null, correction: "The lane's favoured team is the official Elo side.", owner: OWNERS.nbaLane }));
      }
      const offSrc = snapshot.sources.find((s) => s.role === SOURCE_ROLE.OFFICIAL);
      if (laneGame.frozenAt !== g0(off, id)?.receipt?.generatedAt || laneGame.receipt?.payloadSha256 !== offSrc?.inputRef) {
        out.push(...postLockRewrites({ snapshot, artifacts: [{ surface, path: lane.path, frozenHash: offSrc?.inputRef ?? null, currentHash: laneGame.receipt?.payloadSha256 ?? null, detail: `lane frozenAt ${laneGame.frozenAt} vs official receipt ${g0(off, id)?.receipt?.generatedAt}` }], owner: OWNERS.nbaLane }));
      }
    }

    // the supporting v1 simulation the Theater replays: same favourite, anchored to the official forecast
    if (supGame) {
      const anchor = nbaSimAnchorCheck(snapshot, supGame);
      ctx.anchors.push({ sport: "NBA", eventId: id, snapshotId: snapshot.snapshotId, ...anchor });
      const sideTerm = anchor.terms.find((t) => t.term === "side");
      if (!sideTerm.pass && sideTerm.official && sideTerm.simulated) {
        out.push(discrepancy({ code: CODES.LEAN_CONTRADICTION, severity: SEVERITY.ERROR, snapshot, surface: "simulation-theater.supporting", identity: { subjectId: id, family: "game", field: "side" }, sources: [sup.path, off.path], expected: sideTerm.official, actual: sideTerm.simulated, correction: "The simulation the Theater replays must favour the official Elo side.", owner: OWNERS.nbaForecast }));
      }
    }

    // private top boards of every family
    for (const b of boards) {
      const fam = b.doc.family;
      const famGames = fam === officialFamily ? off : fam === NBA_SUPPORTING_FAMILY ? sup : null;
      for (const ed of b.doc.editions ?? []) {
        const gm = (ed.games ?? []).find((x) => String(x.eventId) === id);
        if (!gm) continue;
        const pairs = [];
        for (const board of Object.values(ed.boards ?? {})) {
          for (const r of board.rows ?? []) {
            if (String(r.eventId) !== id) continue;
            const pid = String(r.player?.providerAthleteId ?? "");
            const o = official(pid, NBA_STAT_FAMILY[r.stat] ?? r.stat);
            if (!o) { pairs.push({ subjectId: pid, label: r.player?.name, family: r.stat, field: "noOfficialCounterpart", expected: 0, actual: 1 }); continue; }
            pairs.push({ subjectId: pid, label: r.player?.name, family: r.stat, field: "p50", expected: o.median, actual: r.projection?.p50, tolerance: TOLERANCE.twoDp });
            pairs.push({ subjectId: pid, label: r.player?.name, family: r.stat, field: "mean", expected: o.expected, actual: r.projection?.mean, tolerance: TOLERANCE.twoDp });
          }
        }
        const surface = `nba-top-board.${fam}`;
        out.push(...projectionMismatches({ snapshot, surface, sources: [b.path, off.path], pairs, owner: OWNERS.nbaBoards, correction: fam === officialFamily ? "Board rows copy the official snapshot's p50/mean exactly." : `The ${fam} board ranks a different model's numbers for the same game; only the official family (${officialFamily}) may feed a board.` }));
        if (fam !== officialFamily) {
          out.push(discrepancy({ code: CODES.MODEL_VERSION_MIX, severity: SEVERITY.ERROR, snapshot, surface, identity: { subjectId: id, family: fam, field: "boardFamily" }, sources: [b.path], expected: `${officialFamily} (${snapshot.modelVersions.players.pts})`, actual: `${fam} (${b.doc.modelVersion})`, correction: "One model family per snapshot: retire or relabel non-official boards for this event.", owner: OWNERS.nbaBoards }));
        }
        const frozen = g0(famGames, id)?.receipt?.payloadSha256 ?? null;
        if (frozen && gm.gamePayloadSha256 && gm.gamePayloadSha256 !== frozen) {
          out.push(...postLockRewrites({ snapshot, artifacts: [{ surface, path: b.path, frozenHash: frozen, currentHash: gm.gamePayloadSha256, detail: `board froze a different game payload than the ${fam} receipt` }], owner: OWNERS.nbaBoards }));
        }
      }
    }
    if (DEFAULT_BOARD_FAMILY !== officialFamily) {
      out.push(discrepancy({ code: CODES.MODEL_VERSION_MIX, severity: SEVERITY.ERROR, snapshot, surface: "nba-top-board.default-family", identity: { subjectId: id, family: DEFAULT_BOARD_FAMILY, field: "DEFAULT_BOARD_FAMILY" }, sources: ["app/src/lib/sports/nba/top-boards.mjs"], expected: officialFamily, actual: DEFAULT_BOARD_FAMILY, correction: `DEFAULT_BOARD_FAMILY must name the official snapshot's family (${officialFamily}).`, owner: OWNERS.nbaBoards }));
    }

    // Theater default + box scores (private): the stored v1 runs, measured against the OFFICIAL snapshot
    if (supGame) {
      const runs = runsFromNbaSamples(supGame);
      const sel = selectOfficialRepresentative(runs, officialTargets(snapshot));
      const current = runs.find((r) => r.sourceKind === "typical") ?? runs[0] ?? null;
      if (sel.official && current && sel.official.run.runIndex !== current.runIndex) {
        out.push(discrepancy({ code: CODES.PROJECTION_MISMATCH, severity: SEVERITY.ERROR, snapshot, surface: "simulation-theater.default", identity: { subjectId: id, family: "game", field: "representativeRun" }, sources: [sup.path, off.path], expected: sel.official.run.runIndex, actual: current.runIndex, examples: [{ official: { runIndex: sel.official.run.runIndex, home: sel.official.run.home, away: sel.official.run.away, distance: sel.distance }, current: { runIndex: current.runIndex, home: current.home, away: current.away, kind: current.sourceKind } }], correction: "Default the Theater to selectOfficialRepresentative (official side + official player expectations).", owner: OWNERS.theater }));
      }
      ctx.representatives.push({ sport: "NBA", eventId: id, snapshotId: snapshot.snapshotId, official: sel.official ? { runIndex: sel.official.run.runIndex, home: sel.official.run.home, away: sel.official.run.away } : null, distance: sel.distance, withinTolerance: sel.withinTolerance, sideConstraint: sel.sideConstraint ?? null, currentDefault: current ? { runIndex: current.runIndex, kind: current.sourceKind } : null, whatIf: sel.whatIf.map((w) => ({ runIndex: w.run.runIndex, kind: w.kind, label: w.label })) });
      out.push(...boxScoreChecks({ snapshot, surface: "simulation-theater.runs", runs, validator: nbaRunInvariants, owner: OWNERS.nbaForecast, sources: [sup.path], correction: "Every stored sample must satisfy the engine's seven invariants." }));
      out.push(...nameKeyedRows({ snapshot, surface: "simulation-theater.runs", rows: runs.flatMap((r) => r.players ?? []).map((p) => ({ playerId: p.playerId, name: p.stats?.name })), owner: OWNERS.nbaForecast, correction: "Sample players carry providerAthleteId." }));
    }
    results.push({ snapshot, refusal: null, discrepancies: out, evaluations: [] });
  }
  return results;
}

/** The game of an artifact read (or null). */
function g0(a, id) {
  return (a?.doc?.games ?? []).find((x) => String(x.providerEventId) === String(id)) ?? null;
}

/* ═══════════════════════════════════════ entry points ═══════════════════════════════════════ */

const ORDER = Object.keys(CODES);
const sortDiscrepancies = (list) => list.slice().sort((a, b) => a.fingerprint.localeCompare(b.fingerprint) || ORDER.indexOf(a.code) - ORDER.indexOf(b.code));

/**
 * Run the whole audit.
 * @param {{ repoRoot: string, nflEvents?: string[], nbaDates?: string[], includeStatic?: boolean }} o
 */
export function runConsistencyAudit({ repoRoot, nflEvents = null, nbaDates = DEFAULT_NBA_DATES, includeStatic = true } = {}) {
  const { read, manifest } = reader(repoRoot);
  const publicDir = path.join(repoRoot, "app/public");
  const ctx = {
    repoRoot, read,
    shadowEntries: readShadowReceipts(repoRoot),
    showableWorlds: new Set(readWorldModelArtifacts(publicDir).map((a) => String(a.identity.providerEventId))),
    publicViews: new Map(loadForecastViews(publicDir).map((v) => [String(v.providerEventId), v])),
    representatives: [],
    anchors: [],
  };
  for (const e of ctx.shadowEntries) manifest[e.file] ??= sha256(fs.readFileSync(path.join(repoRoot, e.file)));
  const events = nflEvents ?? nflEventsWithAllSources(repoRoot);
  const results = [];
  for (const id of events) results.push(auditNflEvent(ctx, id));
  for (const d of nbaDates) results.push(...auditNbaDate(ctx, d));
  const staticFindings = includeStatic ? staticScan(repoRoot) : [];
  const discrepancies = sortDiscrepancies([...results.flatMap((r) => r.discrepancies), ...staticFindings]);
  return {
    version: AUDIT_VERSION,
    events: { NFL: events, NBA: results.filter((r) => r.snapshot?.sport === "NBA").map((r) => r.snapshot.eventId) },
    snapshots: results.filter((r) => r.snapshot).map((r) => ({ sport: r.snapshot.sport, eventId: r.snapshot.eventId, snapshotId: r.snapshot.snapshotId, publication: r.snapshot.publication, lockAt: r.snapshot.lockAt, modelVersions: r.snapshot.modelVersions, sources: r.snapshot.sources.map((s) => ({ role: s.role, path: s.path, modelVersion: s.modelVersion, alignedWithOfficial: s.alignedWithOfficial })) })),
    refusals: results.filter((r) => r.refusal).map((r) => r.refusal),
    evaluations: results.flatMap((r) => r.evaluations),
    representatives: ctx.representatives,
    simAnchors: ctx.anchors,
    discrepancies,
    summary: summarize(discrepancies),
    manifest,
  };
}

export function summarize(discrepancies) {
  const by = {};
  for (const d of discrepancies) {
    const k = `${d.sport}|${d.code}`;
    by[k] ??= { sport: d.sport, code: d.code, records: 0, items: 0, errors: 0, warnings: 0 };
    by[k].records += 1; by[k].items += d.count ?? 1;
    if (d.severity === SEVERITY.ERROR) by[k].errors += 1; else by[k].warnings += 1;
  }
  return Object.values(by).sort((a, b) => a.sport.localeCompare(b.sport) || ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
}

/** Codes that must be empty, for one event, before a public Theater flag may turn ON. */
export const THEATER_GATE_CODES = Object.freeze([CODES.SCENARIO_LEAK, CODES.BOX_SCORE_INCONSISTENT, CODES.MODEL_VERSION_MIX]);

/**
 * The subset of discrepancies that must be empty before a public Simulation Theater flag may turn ON for an event:
 *   · the default run is the official representative chosen from the official snapshot
 *     (no PROJECTION_MISMATCH on simulation-theater.* or on the simulation surfaces the Theater shows, and no static
 *     Theater selection-rule finding for the sport);
 *   · no SCENARIO_LEAK for the event;
 *   · box scores consistent (no BOX_SCORE_INCONSISTENT for the event);
 *   · no MODEL_VERSION_MIX for the event;
 *   · the event has an official snapshot (a refusal blocks).
 * @returns {{ sport, eventId, open: boolean, blockers: object[] }}
 */
export function theaterActivationGate(sport, eventId, { audit = null, repoRoot = null } = {}) {
  const a = audit ?? runConsistencyAudit({ repoRoot, nflEvents: String(sport).toUpperCase() === "NFL" ? [String(eventId)] : [], nbaDates: String(sport).toUpperCase() === "NBA" ? DEFAULT_NBA_DATES : [] });
  const S = String(sport).toUpperCase(); const id = String(eventId);
  const theaterSurface = (s) => /^simulation-theater/.test(s) || /^nfl-simulation-v2/.test(s);
  const blockers = a.discrepancies.filter((d) => {
    if (d.sport !== S && !(d.static && d.sport === "ALL" && d.code === CODES.SCENARIO_LEAK)) return false;
    if (d.static) return (d.surface ?? "").startsWith("simulation-theater") || d.code === CODES.SCENARIO_LEAK;
    if (d.eventId !== id) return false;
    if (THEATER_GATE_CODES.includes(d.code)) return true;
    return d.code === CODES.PROJECTION_MISMATCH && theaterSurface(d.surface);
  });
  const refusal = a.refusals.find((r) => r.sport === S && r.eventId === id);
  if (refusal) blockers.unshift({ code: "NO_OFFICIAL_SNAPSHOT", severity: SEVERITY.ERROR, sport: S, eventId: id, detail: refusal.message, fingerprint: `REFUSAL|${S}|${id}` });
  // NBA: no public replay unless the supporting v1 simulation is anchored to the official forecast under an
  // approved tolerance (nbaSimAnchorCheck; NBA_SIM_ANCHOR_TOLERANCE is not yet founder-approved).
  if (S === "NBA" && !refusal && known(a, S, id)) {
    const anc = (a.simAnchors ?? []).find((x) => x.sport === "NBA" && x.eventId === id);
    if (!anc) blockers.unshift({ code: "NO_SUPPORTING_SIMULATION", severity: SEVERITY.ERROR, sport: S, eventId: id, detail: "no verified pre-tip v1 game to replay", fingerprint: `NOSIM|${S}|${id}` });
    else {
      if (!anc.anchored) blockers.unshift({ code: "SIM_NOT_ANCHORED", severity: SEVERITY.ERROR, sport: S, eventId: id, detail: `failed: ${anc.failed.map((t) => t.term).join(", ")}`, fingerprint: `ANCHOR|${S}|${id}` });
      if (!anc.toleranceApproved) blockers.unshift({ code: "ANCHOR_TOLERANCE_UNAPPROVED", severity: SEVERITY.ERROR, sport: S, eventId: id, detail: anc.tolerance.basis, fingerprint: `ANCHORTOL|${S}|${id}` });
    }
  }
  // NFL: no public replay without a sim-v2 receipt of record that is anchored to the official forecast.
  if (S === "NFL" && !refusal && !(a.simAnchors ?? []).some((x) => x.sport === "NFL" && x.eventId === id)) {
    blockers.unshift({ code: "NO_SIM_RECEIPT_OF_RECORD", severity: SEVERITY.ERROR, sport: S, eventId: id, detail: "no sim-v2 receipt of record to anchor", fingerprint: `NOSIM|${S}|${id}` });
  }
  if (!known(a, S, id) && !refusal) blockers.unshift({ code: "NO_OFFICIAL_SNAPSHOT", severity: SEVERITY.ERROR, sport: S, eventId: id, detail: "event not audited", fingerprint: `MISSING|${S}|${id}` });
  return { sport: S, eventId: id, open: blockers.length === 0, blockers };
}

function known(a, S, id) {
  return a.snapshots.some((s) => s.sport === S && s.eventId === id);
}

/* ═══════════════════════════════════════ baseline ═══════════════════════════════════════ */

/** The pinned form of an audit: fingerprints + counts + the artifact hashes each one depends on. */
export function baselineOf(audit) {
  const used = [...new Set(audit.discrepancies.flatMap((d) => (d.sources ?? []).filter(Boolean)))].sort();
  const idx = new Map(used.map((p, i) => [p, i]));
  return {
    schema: "gtp.consistency.known-discrepancies@1",
    auditVersion: audit.version,
    note: "Pinned discrepancy set. A NEW fingerprint (or a higher count) whose data sources are unchanged fails the audit test; one whose data sources changed since this pin is reported as data drift until re-pinned (npx tsx scripts/consistency/audit-prediction-consistency.mjs --write-baseline). entries[].s index files[]; manifest = sha256 of each data file's bytes at the pin.",
    events: audit.events,
    files: used,
    manifest: Object.fromEntries(used.map((p) => [p, audit.manifest[p] ?? null])),
    entries: audit.discrepancies.map((d) => ({ f: d.fingerprint, n: d.count ?? 1, sev: d.severity, s: [...new Set((d.sources ?? []).filter(Boolean))].map((p) => idx.get(p)).sort((a, b) => a - b) })),
  };
}

/** Stable, diff-friendly text: one entry per line. */
export function serializeBaseline(b) {
  const { entries, ...head } = b;
  const top = JSON.stringify({ ...head, entries: "__ENTRIES__" }, null, 2);
  return `${top.replace('"__ENTRIES__"', `[\n${entries.map((e) => `    ${JSON.stringify(e)}`).join(",\n")}\n  ]`)}\n`;
}

/**
 * A fingerprint's CLASS: the fingerprint without its event and subject (code | sport | surface | family | field).
 * Every new slate mints new event ids (and new players), so a class — not a fingerprint — is what a baseline can
 * legitimately know about events it has never seen.
 */
export function fingerprintClass(fp) {
  const [code, sport, , surface, , family, field] = String(fp).split("|");
  return [code, sport, surface, family, field].join("|");
}
const eventOf = (fp) => String(fp).split("|")[2];

/**
 * Compare an audit with a baseline.
 *   · A discrepancy on an event the baseline has NEVER seen, whose class IS pinned → `drift` (a new slate showing a
 *     known, already-tracked inconsistency; it must not turn main red on every data commit).
 *   · A discrepancy whose CLASS is not pinned → `newStrict`, always — a new kind of inconsistency fails even when its
 *     data changed.
 *   · On an event the baseline already holds: a new fingerprint or a higher count fails (`newStrict` / `grown`) unless
 *     its data sources changed since the pin (then `drift`). Code paths never excuse.
 * @returns {{ newStrict: object[], grown: object[], drift: object[], resolved: object[] }}
 */
export function compareWithBaseline(audit, baseline) {
  const pinned = new Map(baseline.entries.map((e) => [e.f, { fingerprint: e.f, count: e.n }]));
  const pinnedClasses = new Set(baseline.entries.map((e) => fingerprintClass(e.f)));
  const pinnedEvents = new Set(baseline.entries.map((e) => eventOf(e.f)));
  const changed = (p) => !(p in baseline.manifest) ? true : baseline.manifest[p] !== audit.manifest[p];
  const isSourceFile = (p) => !/^(app\/public\/data|data)\//.test(p); // code paths: drift never excuses them
  const newStrict = []; const grown = []; const drift = [];
  const seen = new Set();
  for (const d of audit.discrepancies) {
    seen.add(d.fingerprint);
    const b = pinned.get(d.fingerprint);
    const dataChanged = (d.sources ?? []).filter(Boolean).some((p) => !isSourceFile(p) && changed(p));
    if (!b) {
      if (!pinnedClasses.has(fingerprintClass(d.fingerprint))) newStrict.push(d); // a new class: always fails
      else if (!pinnedEvents.has(eventOf(d.fingerprint))) drift.push({ ...d, driftReason: "NEW_EVENT_KNOWN_CLASS" });
      else (dataChanged ? drift : newStrict).push(d); // a known event: regression unless its data changed
      continue;
    }
    if ((d.count ?? 1) > b.count) (dataChanged ? drift : grown).push({ ...d, pinnedCount: b.count });
  }
  const resolved = baseline.entries.filter((e) => !seen.has(e.f));
  return { newStrict, grown, drift, resolved };
}
