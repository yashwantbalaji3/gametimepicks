#!/usr/bin/env node
/**
 * NFL WORLD MODEL V2 — EXPERIMENTAL SIMULATION ARTIFACTS (one per unstarted game).
 *
 *   node app/scripts/nfl/build-nfl-world-model-v2.mjs --now <ISO> [--packet <inputs json>] [--runs 10000] [--only <eventId>]
 *        [--data-root <dir>]   (read forecasts / rosters / injuries / participation from a snapshot of the repo tree)
 *
 * For every game in the input packet (data/internal/nfl/world-model-v2/inputs/, newest by default) that has NOT
 * kicked off at --now, runs the coherent game-world simulator (app/src/lib/sports/nfl/world-model-v2/engine.mjs)
 * on the published margin and total heads of the forecast of record and writes:
 *   app/public/data/nfl/world-model-v2/<eventId>.json       the latest simulation of the game (what the page reads)
 *   data/internal/nfl/world-model-v2/runs/<eventId>-<ts>.json  the same artifact, write-once (history; never replaced)
 *   app/public/data/nfl/world-model-v2/index.json            the games with an artifact
 * A started game is never simulated or replaced: its last pregame artifact stays as it was.
 *
 * Availability at build time: a pool member simulates iff he is on the current active roster and is not Out / IR /
 * suspended (injuries feed) nor excluded by the game's participation artifact. Questionable and Doubtful players are
 * simulated (they may play) and are labelled; the Top boards leave them out.
 *
 * EXPERIMENTAL. The forecast of record stays the published game forecast; this artifact says so and states where the
 * two disagree. Anytime-TD and passing-TD marginals from these worlds failed or lack a development check and are not
 * published (only individual sampled worlds show who scored in them).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { WORLD_MODEL_V2_ENGINE, prepareSide, simulateGame, distribution, LADDERS, representativeWorldIndices } from "../../src/lib/sports/nfl/world-model-v2/engine.mjs";
import { WORLD_MODEL_V2, STATUS, UNSUPPORTED, LIMITATIONS } from "../../src/lib/sports/nfl/world-model-v2/artifact.mjs";
import { isBlockingStatus } from "../../src/lib/sports/injuries/contract.mjs";
import { indexDepthCharts, depthChartAsOf } from "../../src/lib/sports/nfl/depth-chart.mjs";
import { pickNewestCapture } from "../../src/lib/sports/nfl/qb-starter-shadow.mjs";
import { QB_CHART_MAX_AGE_MS } from "../../src/lib/sports/nfl/board-roster-integrity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
const NOW = argOf("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse("--now <ISO> required");
if (Date.parse(NOW) > Date.now() + 60_000) refuse("--now is in the future; simulations use the real clock");
const RUNS = Number(argOf("--runs", "10000"));
const ONLY = argOf("--only");
const FORCE = process.argv.includes("--force");
const DATA = path.resolve(argOf("--data-root", ROOT));
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const inputsDir = path.join(ROOT, "data/internal/nfl/world-model-v2/inputs");
const packetPath = argOf("--packet") ? path.resolve(argOf("--packet")) : path.join(inputsDir, fs.readdirSync(inputsDir).filter((f) => /^\d{4}-week\d{2}-\d{8}T\d{4}Z\.json$/.test(f)).sort().at(-1));
const packetBuf = fs.readFileSync(packetPath);
const packet = JSON.parse(packetBuf);
const packetSha = sha256(packetBuf);
/* A game's simulation depends on the shared parameters and scoring tables and on ITS two teams' pools and volume — not
   on the rest of the packet. Keying on the game's own slice means a new packet that changes other teams only (a
   Thursday final folding into the history) re-simulates nobody else. */
const sharedSha = sha256(JSON.stringify({ params: packet.params, tables: packet.tables, season: packet.season }));
const gameSliceSha = (ev) => sha256(JSON.stringify({ shared: sharedSha, ev, away: packet.teams[ev.away], home: packet.teams[ev.home] }));

const forecasts = readJson(path.join(DATA, "app/public/data/nfl/forecasts/latest.json"));
const rosters = readJson(path.join(DATA, "app/public/data/nfl/rosters/latest.json"));
const injuries = readJson(path.join(DATA, "data/internal/research/injuries/nfl/latest.json"));
const published = new Map((forecasts.forecasts ?? []).map((f) => [f.providerEventId, f]));
const rosterOf = new Map(rosters.teams.map((t) => [t.teamAbbr, new Map(t.players.filter((p) => p.status?.type === "active").map((p) => [String(p.id), p]))]));
const injuryOf = new Map((injuries.entries ?? []).filter((e) => e?.athleteId).map((e) => [String(e.athleteId), e]));

/* QUARTERBACK: the depth chart decides who throws. The highest-ranked quarterback who is simulated (not Out) holds the
   passing share; every other passer's historical share is vacated. Without it, an active backup kept the share he
   earned in his own starts and split attempts with the starter (Week 5 build: Burrow 0.65 / Flacco 0.33). Same chart
   reader and staleness bound as the published forecast's QB1 disclosure. No readable chart: every passer below the
   board's starter share floor is withheld from the player list (team volume is still simulated). */
const qbIndex = (() => {
  const dir = path.join(DATA, "data/internal/research/nfl/depth-charts");
  const caps = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.endsWith(".json")).map((file) => ({ file, doc: readJson(path.join(dir, file)) })).filter((c) => c.doc?.snapshots?.length);
  const picked = pickNewestCapture(caps);
  return picked ? { index: indexDepthCharts(picked.doc), file: picked.file } : null;
})();
const PASSER_FLOOR = 0.75;
const OUT_DIR = path.join(ROOT, "app/public/data/nfl/world-model-v2");
const RUNS_DIR = path.join(ROOT, "data/internal/nfl/world-model-v2/runs");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(RUNS_DIR, { recursive: true });
const r2 = (x) => Number(x.toFixed(2));
const r4 = (x) => Number(x.toFixed(4));
const SIGMA_80 = 2 * 1.2815515655446004;

/**
 * Shares of the worlds in fixed-width bins between `lo` and `hi`; the first and last bins also hold everything below
 * / above (labelled as tails). Counted, never smoothed: the chart is the simulation, not a picture of it.
 */
function histogram(arr, lo, hi, width) {
  const n = Math.round((hi - lo) / width);
  const counts = new Array(n).fill(0);
  for (let i = 0; i < arr.length; i += 1) counts[Math.min(n - 1, Math.max(0, Math.floor((arr[i] - lo) / width)))] += 1;
  return { from: lo, width, bins: n, tails: true, shares: counts.map((c) => r4(c / arr.length)) };
}
/** The most frequent exact final scores across the worlds (each a real simulated final, counted). */
function commonScores(game, k) {
  const m = new Map();
  for (let r = 0; r < game.home.length; r += 1) { const key = `${game.away[r]}-${game.home[r]}`; m.set(key, (m.get(key) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k).map(([key, c]) => { const [away, home] = key.split("-").map(Number); return { away, home, share: r4(c / game.home.length) }; });
}

/** Availability of one pool member at build time. */
function availabilityOf(p, teamAbbr, excluded) {
  if (!p.espnId) return { state: "UNMAPPED_ID", simulated: false };
  const roster = rosterOf.get(teamAbbr);
  if (!roster?.has(p.espnId)) return { state: "NOT_ON_ACTIVE_ROSTER", simulated: false };
  const inj = injuryOf.get(p.espnId);
  if (excluded.has(p.espnId)) return { state: "OUT", simulated: false, status: excluded.get(p.espnId) };
  if (inj && isBlockingStatus(inj.status)) return { state: "OUT", simulated: false, status: inj.status };
  if (inj && /^questionable$/i.test(inj.status)) return { state: "QUESTIONABLE", simulated: true, status: inj.status };
  if (inj && /^doubtful$/i.test(inj.status)) return { state: "DOUBTFUL", simulated: true, status: inj.status };
  return { state: "ACTIVE", simulated: true };
}

const index = fs.existsSync(path.join(OUT_DIR, "index.json")) ? readJson(path.join(OUT_DIR, "index.json")) : { games: [] };
const kept = new Map(index.games.map((g) => [g.providerEventId, g]));
const written = []; const skipped = []; const unchanged = [];
for (const ev of packet.games) {
  if (ONLY && ev.providerEventId !== ONLY) continue;
  if (Date.parse(ev.kickoffUtc) <= Date.parse(NOW)) { skipped.push(`${ev.matchup}: kicked off — last pregame artifact kept`); continue; }
  const pub = published.get(ev.providerEventId);
  const fs0 = pub?.forecastSummary;
  if (!fs0?.margin || !fs0?.total || !fs0?.winProbability) { skipped.push(`${ev.matchup}: no published forecast with margin and total heads`); continue; }
  const partPath = path.join(DATA, `data/internal/nfl/participation/${ev.kickoffUtc.slice(0, 10)}/${ev.providerEventId}.json`);
  const part = fs.existsSync(partPath) ? readJson(partPath) : null;
  const excluded = new Map((part?.excludedIneligible ?? []).map((x) => [String(x.playerId).replace(/^nfl-athlete-/, ""), x.status]));
  const heads = { mMean: fs0.margin.median, mSigma: (fs0.margin.p90 - fs0.margin.p10) / SIGMA_80, tMean: fs0.total.median, tSigma: (fs0.total.p90 - fs0.total.p10) / SIGMA_80 };
  const avail = new Map();
  const quarterbacks = {};
  const sides = [ev.away, ev.home].map((abbr, si) => {
    const t = packet.teams[abbr];
    for (const p of t.pool) avail.set(p.playerId, { ...availabilityOf(p, abbr, excluded), team: abbr });
    const chart = qbIndex ? depthChartAsOf(qbIndex.index, abbr, NOW, QB_CHART_MAX_AGE_MS) : null;
    const simulatedIds = new Set(t.pool.filter((p) => avail.get(p.playerId).simulated).map((p) => p.espnId));
    const passer = chart?.state === "RESOLVED" ? (chart.order ?? []).find((q) => simulatedIds.has(String(q.playerId))) ?? null : null;
    quarterbacks[abbr] = { chartState: chart?.state ?? "NO_CHART", snapshotAt: chart?.snapshotAt ?? null, chartQb1: chart?.starter?.name ?? null, passer: passer ? { playerId: `nfl-athlete-${passer.playerId}`, name: passer.name } : null, rule: passer ? "depth-chart order, first quarterback not ruled out" : `no usable chart: passers below ${PASSER_FLOOR} of attempts withheld` };
    return prepareSide({
      pool: t.pool, isActive: (p) => avail.get(p.playerId).simulated,
      isActiveFor: (p, fam) => fam !== "passAttempts" || !passer || p.espnId === String(passer.playerId),
      volumeBase: ev.volumeBase[abbr], marginTeam: si === 1 ? heads.mMean : -heads.mMean, teamTdForm: t.teamTdForm, params: packet.params,
    });
  });
  const statusKey = `${[...avail.entries()].filter(([, a]) => a.simulated).map(([id, a]) => `${id}:${a.state}`).sort().join(",")}|qb:${Object.values(quarterbacks).map((q) => q.passer?.playerId ?? "none").join(",")}`;
  /* FRESHNESS: the simulation is a function of these inputs and nothing else. A refresh that leaves them unchanged (a
     new forecast inputHash from an unrelated feed, the same heads, the same availability) keeps the existing run: no
     new version, no new file, no build. */
  const headsKey = Object.values(heads).map((v) => r4(v)).join(",");
  const inputsKey = sha256(`${WORLD_MODEL_V2.version}|${WORLD_MODEL_V2_ENGINE}|${RUNS}|${gameSliceSha(ev)}|${headsKey}|${statusKey}`).slice(0, 16);
  const existingPath = path.join(OUT_DIR, `${ev.providerEventId}.json`);
  const existing = fs.existsSync(existingPath) ? readJson(existingPath) : null;
  /* A run made under the earlier whole-packet key (2.1.0, before the per-game key) with the SAME packet, heads and
     availability is the same simulation — never re-run it just because the key's formula changed. */
  const legacyKey = sha256(`${WORLD_MODEL_V2.version}|${WORLD_MODEL_V2_ENGINE}|${RUNS}|${packetSha}|${headsKey}|${statusKey}`).slice(0, 16);
  const sameAsLegacy = !existing?.run?.inputs?.gameInputsSha256 && existing?.run?.inputs?.packetSha256 === packetSha && existing?.run?.inputsKey === legacyKey;
  if (!FORCE && (existing?.run?.inputsKey === inputsKey || sameAsLegacy)) { unchanged.push(`${ev.matchup}: inputs unchanged since ${existing.run.generatedAt}`); continue; }
  const seed = `${ev.providerEventId}|${inputsKey}`;
  const sim = simulateGame({ sides, heads, params: packet.params, tables: packet.tables, runs: RUNS, seed });
  const { game } = sim;
  let hw = 0; let aw = 0; let tie = 0;
  for (let r = 0; r < RUNS; r += 1) { if (game.home[r] > game.away[r]) hw += 1; else if (game.home[r] < game.away[r]) aw += 1; else tie += 1; }
  const margin = new Float32Array(RUNS); const total = new Float32Array(RUNS);
  for (let r = 0; r < RUNS; r += 1) { margin[r] = game.home[r] - game.away[r]; total[r] = game.home[r] + game.away[r]; }
  const mean = (a) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i]; return r2(s / a.length); };
  const teamOut = (si) => {
    const o = sim.team[si];
    return {
      points: distribution(si === 1 ? game.home : game.away),
      scoring: { offensiveTd: mean(o.offTd), rushingTd: mean(o.rushTd), receivingTd: mean(o.recTd), nonOffensiveTd: mean(o.nonOffTd), extraPoints: mean(o.xp), twoPointConversions: mean(o.two), fieldGoals: mean(o.fg), safeties: mean(o.saf) },
      volume: { passAttempts: distribution(o.passAtt), completions: distribution(o.completions), passingYards: distribution(o.passYds), carries: distribution(o.carries), rushingYards: distribution(o.rushYds) },
    };
  };
  const players = [];
  sides.forEach((sd, si) => sd.members.forEach((m, i) => {
    const w = sim.team[si].players[i];
    const a = avail.get(m.playerId);
    const ros = rosterOf.get(si === 1 ? ev.home : ev.away)?.get(m.espnId);
    const fam = {};
    if (mean(w.targets) >= 0.75) {
      fam.targets = distribution(w.targets);
      fam.receptions = distribution(w.rec, LADDERS.receptions);
      fam.receivingYards = distribution(w.recYds, LADDERS.receivingYards);
    }
    if (mean(w.carries) >= 1.5) { fam.carries = distribution(w.carries); fam.rushingYards = distribution(w.rushYds, LADDERS.rushingYards); }
    const qb = quarterbacks[si === 1 ? ev.home : ev.away];
    if (mean(w.passAtt) >= 8 && (qb.passer || sd.shares.passAttempts[i] >= PASSER_FLOOR)) { fam.passAttempts = distribution(w.passAtt); fam.completions = distribution(w.completions); fam.passingYards = distribution(w.passYds, LADDERS.passingYards); }
    if (!Object.keys(fam).length) return;
    players.push({ playerId: `nfl-athlete-${m.espnId}`, name: ros?.fullName ?? m.name, position: ros?.position?.abbreviation ?? null, team: si === 1 ? ev.home : ev.away, availability: a.state, injuryStatus: a.status ?? null, allocatedShares: Object.fromEntries(Object.entries(sd.shares).map(([f, s]) => [f, r4(s[i])])), families: fam });
  }));
  const reps = representativeWorldIndices(game, [0.1, 0.3, 0.5, 0.7, 0.9]);
  const sampledWorlds = reps.map(({ quantile, index: r }) => {
    const teamBox = (si) => {
      const o = sim.team[si]; const sd = sides[si];
      const lines = sd.members.map((m, i) => {
        const w = o.players[i];
        const line = { targets: w.targets[r], receptions: w.rec[r], receivingYards: Math.round(w.recYds[r]), carries: w.carries[r], rushingYards: Math.round(w.rushYds[r]), passAttempts: w.passAtt[r], completions: w.completions[r], passingYards: Math.round(w.passYds[r]), rushingTd: w.rushTd[r], receivingTd: w.recTd[r], passingTd: w.passTd[r] };
        const ros = rosterOf.get(si === 1 ? ev.home : ev.away)?.get(m.espnId);
        return { playerId: `nfl-athlete-${m.espnId}`, name: ros?.fullName ?? m.name, position: ros?.position?.abbreviation ?? null, line };
      }).filter((x) => x.line.targets + x.line.carries + x.line.passAttempts > 0);
      return {
        points: si === 1 ? game.home[r] : game.away[r], regulationPoints: si === 1 ? game.regHome[r] : game.regAway[r],
        scoring: { offensiveTd: o.offTd[r], rushingTd: o.rushTd[r], receivingTd: o.recTd[r], nonOffensiveTd: o.nonOffTd[r], extraPoints: o.xp[r], twoPointConversions: o.two[r], fieldGoals: o.fg[r], safeties: o.saf[r] },
        volume: { passAttempts: o.passAtt[r], completions: o.completions[r], passingYards: Math.round(o.passYds[r]), carries: o.carries[r], rushingYards: Math.round(o.rushYds[r]) },
        unattributed: { note: "plays by players outside the named active set (OTHER) are in the team totals, not in a player line" },
        players: lines,
      };
    };
    const h = game.home[r]; const a = game.away[r];
    return { worldIndex: r, marginQuantile: quantile, overtime: game.ot[r] === 1, winner: h > a ? ev.home : a > h ? ev.away : "TIE", away: teamBox(0), home: teamBox(1) };
  });
  const wp = fs0.winProbability;
  const projected = { home: distribution(game.home).median, away: distribution(game.away).median };
  const body = {
    schemaVersion: 2, artifact: "nfl-world-model-v2-simulation", dataClass: "PUBLIC_EXPERIMENTAL",
    identity: { providerEventId: ev.providerEventId, matchup: ev.matchup, away: ev.away, home: ev.home, kickoffUtc: ev.kickoffUtc, season: packet.season, week: packet.week },
    model: { ...WORLD_MODEL_V2, engine: WORLD_MODEL_V2_ENGINE },
    status: STATUS,
    run: {
      generatedAt: NOW, runs: RUNS, seed, inputsKey, supersedes: existing && Date.parse(existing.identity?.kickoffUtc) === Date.parse(ev.kickoffUtc) ? existing.simulationId ?? null : null,
      inputs: { packet: path.relative(ROOT, packetPath), packetSha256: packetSha, gameInputsSha256: gameSliceSha(ev), packetExportedAt: packet.exportedAt, forecastModel: pub.model?.id ?? null, forecastInputHash: pub.model?.inputHash ?? null, forecastGeneratedAt: pub.generatedAt ?? null, injuriesAsOf: injuries.generatedAt ?? null, depthChart: qbIndex?.file ?? null, rostersGeneratedAt: rosters.generatedAt ?? null, participationAsOf: part?.injuriesAsOf ?? null, heads: Object.fromEntries(Object.entries(heads).map(([k, v]) => [k, r4(v)])) },
    },
    forecastOfRecord: {
      modelVersion: pub.model?.id ?? null, winProbability: { home: wp.home, away: wp.away, tie: wp.tieMass ?? null }, projectedScore: fs0.projectedScore ? { home: fs0.projectedScore.home, away: fs0.projectedScore.away } : null,
      marginMedianHome: fs0.margin.median, totalMedian: fs0.total.median,
      note: "The published forecast stays the forecast of record. Its win chance comes from a separate rating (the margin-of-victory Elo win head); these worlds draw scores from its margin and total heads, so the two win chances can differ.",
    },
    game: {
      winProbability: { home: r4(hw / RUNS), away: r4(aw / RUNS), tie: r4(tie / RUNS), basis: "share of the simulated games each side won, overtime included" },
      overtime: { levelAfterRegulation: r4(sim.diag.levelAfterRegulation / RUNS), levelAfterOvertime: r4(sim.diag.levelAfterOvertime / RUNS), homeWinsOvertime: r4(sim.pHomeOt) },
      projectedScore: { ...projected, basis: "median points of each team across the simulated games (each median on its own; not one simulated game)" },
      margin: distribution(margin), total: distribution(total),
      histograms: { margin: histogram(margin, -30, 30, 3), total: histogram(total, 20, 80, 5) },
      commonFinalScores: commonScores(game, 8),
      away: teamOut(0), home: teamOut(1),
      disagreement: { winProbabilityHome: { worlds: r4(hw / RUNS), forecastOfRecord: wp.home, difference: r4(hw / RUNS - wp.home) }, marginMedianHome: { worlds: distribution(margin).median, forecastOfRecord: fs0.margin.median }, totalMedian: { worlds: distribution(total).median, forecastOfRecord: fs0.total.median } },
    },
    players,
    quarterbacks,
    availability: [...avail.entries()].filter(([, a]) => a.state === "OUT" || a.state === "QUESTIONABLE" || a.state === "DOUBTFUL").map(([id, a]) => { const p = packet.teams[a.team].pool.find((x) => x.playerId === id); return { playerId: `nfl-athlete-${p.espnId}`, name: rosterOf.get(a.team)?.get(p.espnId)?.fullName ?? p.name, team: a.team, state: a.state, status: a.status ?? null, simulated: a.simulated }; }),
    sampledWorlds,
    unsupported: UNSUPPORTED,
    limitations: LIMITATIONS,
    diagnostics: { ...sim.diag, invariantViolations: 0, playersSimulated: { [ev.away]: sides[0].members.length, [ev.home]: sides[1].members.length } },
  };
  body.simulationId = inputsKey;
  body.contentSha256 = sha256(JSON.stringify(body));
  const text = `${JSON.stringify(body)}\n`;
  const runFile = path.join(RUNS_DIR, `${ev.providerEventId}-${NOW.replace(/[-:]/g, "").slice(0, 13)}Z.json`);
  if (fs.existsSync(runFile)) refuse(`${path.relative(ROOT, runFile)} exists — simulation runs are never overwritten`);
  fs.writeFileSync(runFile, text, { flag: "wx" });
  fs.writeFileSync(path.join(OUT_DIR, `${ev.providerEventId}.json`), text);
  kept.set(ev.providerEventId, { providerEventId: ev.providerEventId, matchup: ev.matchup, kickoffUtc: ev.kickoffUtc, simulationId: body.simulationId, generatedAt: NOW, runs: RUNS, file: `${ev.providerEventId}.json` });
  written.push(`${ev.matchup}: home ${body.game.winProbability.home} (record ${wp.home}) · ${projected.away}-${projected.home} · ${players.length} players · ${sim.diag.teamWorldsChecked} team-worlds checked`);
}
const games = [...kept.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.providerEventId.localeCompare(b.providerEventId));
/* Written only when its content changes: a run that simulated nothing must not produce a diff (and so no data commit
   and no build) just because the timestamp moved. */
if (written.length || JSON.stringify(index.games) !== JSON.stringify(games) || index.version !== WORLD_MODEL_V2.version) {
  fs.writeFileSync(path.join(OUT_DIR, "index.json"), `${JSON.stringify({ schemaVersion: 1, artifact: "nfl-world-model-v2-index", generatedAt: NOW, model: WORLD_MODEL_V2.id, version: WORLD_MODEL_V2.version, games }, null, 1)}\n`);
}
for (const w of written) console.log(`  ${w}`);
for (const s of skipped) console.log(`  skipped ${s}`);
for (const s of unchanged) console.log(`  unchanged ${s}`);
console.log(`world model v2: ${written.length} simulated, ${unchanged.length} unchanged, ${skipped.length} skipped · packet ${path.basename(packetPath)} ${packetSha.slice(0, 12)}`);
