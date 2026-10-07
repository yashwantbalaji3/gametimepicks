/**
 * SimulationReceiptV2 — the sport-neutral receipt contract (Session 13 · C2), NFL adapter. Pure.
 *
 * A receipt summarises N coherent simulated games. It stores distributions, quantiles, histograms and a handful of
 * deterministic REPRESENTATIVE runs (re-simulated by index from the same seed, so each is one real run of the batch).
 * A representative run is labelled REPRESENTATIVE SIMULATED GAME — never "the prediction".
 *
 * Every aggregate below is computed from the SAME runs: quarter and half numbers, player quantiles, anytime / 2+ /
 * first-TD probabilities are counts over runs, never separately modelled.
 */
import { NFL_SIM_V2_ENGINE, NFL_SIM_V2_VERSION, N_PERIODS, N_PSTAT, N_TSTAT, PSTAT, TEAM_STAT, runRng, simulateGame, tiltedTable } from "./engine.mjs";
import { fnv1a64 } from "../../../forecast-ledger/identity.mjs";

export const SIMULATION_RECEIPT_SCHEMA = "simulation-receipt@2";
export const RUN_SCHEMA_VERSION = "nfl-drive-run@1";
export const REPRESENTATIVE_LABEL = "REPRESENTATIVE SIMULATED GAME";
export const COHERENCE_CHECKS = Object.freeze([
  "points = scoring events", "quarters sum to the final", "team score = run score", "completions ≤ attempts",
  "interceptions ≤ incompletions", "Σ targets = attempts", "Σ receptions = completions", "Σ receiving yards = passing yards = Σ passer yards",
  "Σ receiving TDs = passing TDs = Σ passer TDs", "Σ carries = team carries", "Σ rushing yards / TDs = team", "receptions ≤ targets",
  "receiving TDs ≤ receptions", "no negative counts", "OT only from a regulation tie", "tie only after OT", "first TD scorer scored in that run",
]);

const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(2)));
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));

/** Quantiles by sorting (type-7-free: the order statistic at ⌊p·(n−1)⌋, stable and reproducible). */
export function quant(values) {
  const a = Float64Array.from(values).sort();
  const n = a.length;
  if (!n) return null;
  const at = (p) => a[Math.floor(p * (n - 1))];
  let s = 0;
  for (const v of a) s += v;
  return { mean: r2(s / n), p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) };
}
function histogram(values) {
  const h = new Map();
  for (const v of values) h.set(v, (h.get(v) ?? 0) + 1);
  return [...h.entries()].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count, probability: r4(count / values.length) }));
}

/**
 * Role shares (role-shares-v1 team block) → engine player inputs. `excluded` = player ids the availability owner
 * blocks: they receive NO opportunity; their share is redistributed pro rata to the available NAMED players of the
 * same family (OTHER keeps only its own residual). A non-starting QB keeps no passing or carries (one starter).
 */
export function playersFromRoleShares(teamBlock, excluded = new Set(), { starterQb = null } = {}) {
  if (!teamBlock) return { players: [] };
  const fam = (k) => (teamBlock[k]?.players ?? []);
  const rates = new Map((teamBlock.rates?.players ?? []).map((r) => [r.playerId, r]));
  const ids = new Map();
  const add = (p) => { if (!ids.has(p.playerId)) ids.set(p.playerId, { playerId: p.playerId, name: p.name ?? null, position: p.position ?? null }); };
  for (const k of ["passAttempts", "targets", "rushAttempts"]) fam(k).forEach(add);
  const shares = (k) => {
    const all = fam(k);
    const keep = all.filter((p) => !excluded.has(p.playerId));
    const blocked = all.filter((p) => excluded.has(p.playerId)).reduce((a, p) => a + p.share, 0);
    const kept = keep.reduce((a, p) => a + p.share, 0);
    const scale = kept > 0 ? (kept + blocked) / kept : 1;
    return new Map(keep.map((p) => [p.playerId, p.share * scale]));
  };
  const pass = shares("passAttempts");
  const tgt = shares("targets");
  const car = shares("rushAttempts");
  /* ONE STARTING QUARTERBACK PER GAME. Role shares spread passing across every QB who threw this season; inside one
     game that would have two starters splitting attempts on every run. The starter is the passer the availability-
     gated board names (the published one-passer rule), else the largest passing share; every other QB's passing and
     carries move to the starter. */
  const qbs = [...pass.keys()].filter((id) => (ids.get(id)?.position ?? "QB") === "QB");
  const starter = starterQb && pass.has(starterQb) ? starterQb : qbs.sort((a, b) => pass.get(b) - pass.get(a) || (a < b ? -1 : 1))[0] ?? null;
  if (starter) {
    for (const id of qbs) {
      if (id === starter) continue;
      pass.set(starter, (pass.get(starter) ?? 0) + (pass.get(id) ?? 0));
      pass.delete(id);
      if (car.has(id)) { car.set(starter, (car.get(starter) ?? 0) + car.get(id)); car.delete(id); }
    }
  }
  const players = [...ids.values()].filter((p) => !excluded.has(p.playerId)).map((p) => {
    const rt = rates.get(p.playerId) ?? {};
    return {
      ...p,
      passShare: pass.get(p.playerId) ?? 0,
      targetShare: tgt.get(p.playerId) ?? 0,
      carryShare: car.get(p.playerId) ?? 0,
      catchRate: rt.catchRate ?? null,
      ypr: rt.ypr ?? null,
      ypc: rt.ypc ?? null,
    };
  }).sort((a, b) => (a.playerId < b.playerId ? -1 : 1));
  return { players };
}

function teamDistributions(batch, side) {
  const out = {};
  for (const [k, idx] of Object.entries(TEAM_STAT)) {
    if (k === "pts") continue;
    const v = new Float64Array(batch.runs);
    for (let i = 0; i < batch.runs; i++) v[i] = batch.team[(i * 2 + side) * N_TSTAT + idx];
    out[k] = quant(v);
  }
  return out;
}

function playerDistributions(batch, side, prep, teamAbbr) {
  const rows = [];
  const n = prep.n;
  for (let slot = 0; slot <= n; slot++) {
    const stats = {};
    let active = false;
    for (const [k, s] of Object.entries(PSTAT)) {
      const v = new Float64Array(batch.runs);
      let any = 0;
      for (let i = 0; i < batch.runs; i++) { v[i] = batch.players[side][(i * (n + 1) + slot) * N_PSTAT + s]; any += v[i] !== 0 ? 1 : 0; }
      if (any) { stats[k] = quant(v); active = true; }
    }
    if (!active) continue;
    let atd = 0;
    let two = 0;
    for (let i = 0; i < batch.runs; i++) {
      const base = (i * (n + 1) + slot) * N_PSTAT;
      const tds = batch.players[side][base + PSTAT.rushTd] + batch.players[side][base + PSTAT.recTd];
      if (tds >= 1) atd++;
      if (tds >= 2) two++;
    }
    const meta = slot < n ? prep.slots[slot] : { playerId: "OTHER", name: "Other / unallocated", position: null };
    rows.push({ ...meta, team: teamAbbr, anytimeTd: r4(atd / batch.runs), twoPlusTd: r4(two / batch.runs), stats });
  }
  return rows;
}

/** Pick deterministic representative run indices from the batch. */
export function representativeIndices(batch, homeFavoured) {
  const n = batch.runs;
  const margin = new Float64Array(n);
  const total = new Float64Array(n);
  for (let i = 0; i < n; i++) { margin[i] = batch.scores[2 * i] - batch.scores[2 * i + 1]; total[i] = batch.scores[2 * i] + batch.scores[2 * i + 1]; }
  const qm = quant(margin);
  const qt = quant(total);
  const nearest = (pred, tm, mm) => {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (!pred(i)) continue;
      const d = Math.abs(total[i] - tm) + Math.abs(margin[i] - mm);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const picks = [
    ["MEDIAN_LIKE", nearest(() => true, qt.p50, qm.p50)],
    ["HIGH_SCORING", nearest(() => true, qt.p90, qm.p50)],
    ["LOW_SCORING", nearest(() => true, qt.p10, qm.p50)],
    ["UPSET", nearest((i) => (homeFavoured ? margin[i] < 0 : margin[i] > 0), qt.p50, homeFavoured ? -Math.abs(qm.p50) : Math.abs(qm.p50))],
  ];
  let otIdx = -1;
  for (let i = 0; i < n; i++) if (batch.ot[i]) { otIdx = i; break; }
  picks.push(["OVERTIME", otIdx]);
  return picks.filter(([, i]) => i >= 0);
}

/**
 * Build the receipt. `generatedAt` is the only clock and is excluded from `artifactHash`.
 */
/*
 * NS-1: `anchoring` (optional) records how the tilts were solved against the validated heads, and `idPrefix` keeps
 * head-anchored receipts in their own id namespace. Both absent (the existing median-anchored producer) → the
 * receipt is byte-identical to before.
 */
export function buildNflSimulationReceipt({ event, compiled, paramsRef, anchors, calibration, prep, batch, baseSeed, inputHash, generatedAt, inputs, postseason = false, anchoring = null, idPrefix = "nfl-sim-v2" }) {
  const n = batch.runs;
  let hw = 0;
  let aw = 0;
  let ties = 0;
  let ots = 0;
  const home = new Float64Array(n);
  const away = new Float64Array(n);
  const margin = new Float64Array(n);
  const total = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h = batch.scores[2 * i];
    const a = batch.scores[2 * i + 1];
    home[i] = h; away[i] = a; margin[i] = h - a; total[i] = h + a;
    if (h > a) hw++; else if (a > h) aw++; else ties++;
    ots += batch.ot[i];
  }
  const periodRow = (label, idxs) => {
    const ph = new Float64Array(n);
    const pa = new Float64Array(n);
    let w = 0;
    let l = 0;
    for (let i = 0; i < n; i++) {
      for (const p of idxs) { ph[i] += batch.periods[(i * 2) * N_PERIODS + p]; pa[i] += batch.periods[(i * 2 + 1) * N_PERIODS + p]; }
      if (ph[i] > pa[i]) w++; else if (pa[i] > ph[i]) l++;
    }
    return { period: label, home: quant(ph), away: quant(pa), total: quant(ph.map((v, i) => v + pa[i])), homeWins: r4(w / n), awayWins: r4(l / n), level: r4((n - w - l) / n) };
  };
  // First TD scorer distribution, from the first TD event of each run.
  const ft = new Map();
  let teamFirst = [0, 0];
  let noTd = 0;
  for (let i = 0; i < n; i++) {
    const side = batch.firstTd[3 * i];
    if (side < 0) { noTd++; continue; }
    teamFirst[side]++;
    const slot = batch.firstTd[3 * i + 1];
    const k = `${side}|${slot}`;
    ft.set(k, (ft.get(k) ?? 0) + 1);
  }
  const slotMeta = (side, slot) => (prep && slot >= 0 && slot < prep[side].n ? prep[side].slots[slot] : { playerId: "OTHER", name: "Other / unallocated", position: null });
  const firstTdScorer = [...ft.entries()].map(([k, c]) => {
    const [side, slot] = k.split("|").map(Number);
    return { ...slotMeta(side, slot), team: side === 0 ? event.home.abbr : event.away.abbr, probability: r4(c / n) };
  }).sort((a, b) => b.probability - a.probability || (a.playerId < b.playerId ? -1 : 1));

  const teamTd = (side) => {
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = batch.team[(i * 2 + side) * N_TSTAT + TEAM_STAT.passTd] + batch.team[(i * 2 + side) * N_TSTAT + TEAM_STAT.rushTd];
    return histogram(v);
  };

  // Representative runs: re-simulated by index → one real run of the batch, with its drive path.
  const tables = [tiltedTable(compiled, calibration.thetas[0]), tiltedTable(compiled, calibration.thetas[1])];
  const scratch = {
    team: [new Float64Array(N_TSTAT), new Float64Array(N_TSTAT)],
    period: [new Float64Array(N_PERIODS), new Float64Array(N_PERIODS)],
    players: prep ? [new Float64Array((prep[0].n + 1) * N_PSTAT), new Float64Array((prep[1].n + 1) * N_PSTAT)] : null,
  };
  const representativeRuns = representativeIndices(batch, hw >= aw).map(([kind, idx]) => {
    const events = [];
    const run = simulateGame({ compiled, tables, players: prep, rng: runRng(baseSeed, idx), postseason, out: scratch, events });
    return {
      label: REPRESENTATIVE_LABEL,
      kind,
      runIndex: idx,
      final: { home: run.score[0], away: run.score[1], overtime: run.ot },
      quarters: { home: [...scratch.period[0]], away: [...scratch.period[1]] },
      drives: events,
      note: "One real run of this batch, chosen by rule and re-simulated from its seed. It is an illustration of a possible game, not the forecast.",
    };
  });

  const body = {
    schemaVersion: SIMULATION_RECEIPT_SCHEMA,
    simulationReceiptId: `${idPrefix}:${event.eventId}:${inputHash}`,
    sport: "NFL",
    eventId: event.eventId,
    eventStart: event.kickoffUtc,
    home: event.home,
    away: event.away,
    simulationEngine: NFL_SIM_V2_ENGINE,
    simulationEngineVersion: NFL_SIM_V2_VERSION,
    promotionState: "SHADOW",
    modelVersion: anchors.modelVersion,
    inputSnapshotIds: inputs,
    availabilitySnapshotId: inputs.availability ?? null,
    marketReceiptId: null,
    marketUse: "NOT_AN_INPUT — no betting-market number is read by this engine",
    seedStrategy: "per-run mulberry32 seeded by splitmix(baseSeed, runIndex); baseSeed = fnv1a64(engine|eventId|inputHash)",
    baseSeed,
    runCount: n,
    runSchemaVersion: RUN_SCHEMA_VERSION,
    params: paramsRef,
    calibration: { anchors: { home: anchors.home, away: anchors.away, source: anchors.source }, thetas: calibration.thetas.map(r4), calibratedMean: calibration.achieved.map(r2) },
    ...(anchoring ? { anchoring } : {}),
    aggregate: {
      winProbability: { home: r4(hw / n), away: r4(aw / n), tie: r4(ties / n) },
      overtimeProbability: r4(ots / n),
      score: { home: quant(home), away: quant(away) },
      margin: quant(margin),
      total: quant(total),
      marginHistogram: histogram(margin),
      totalHistogram: histogram(total),
    },
    periodAggregates: [
      periodRow("Q1", [0]), periodRow("Q2", [1]), periodRow("Q3", [2]), periodRow("Q4", [3]),
      periodRow("H1", [0, 1]), periodRow("H2", [2, 3]),
    ],
    teamStatDistributions: { home: teamDistributions(batch, 0), away: teamDistributions(batch, 1) },
    playerStatDistributions: prep ? [...playerDistributions(batch, 0, prep[0], event.home.abbr), ...playerDistributions(batch, 1, prep[1], event.away.abbr)] : [],
    scoringEventDistributions: {
      firstTdScorer,
      teamFirstTd: { home: r4(teamFirst[0] / n), away: r4(teamFirst[1] / n), none: r4(noTd / n) },
      teamTdCount: { home: teamTd(0), away: teamTd(1) },
    },
    representativeRuns,
    validation: { coherenceChecks: COHERENCE_CHECKS, sampleCount: n, failedRuns: batch.failedRuns, failureCodes: batch.failureCodes },
  };
  return { ...body, generatedAt, artifactHash: fnv1a64(JSON.stringify(body)) };
}

/**
 * Receipt-level contract checks (E1 / F-rules). Returns problems; empty = valid.
 *   - SHADOW until promoted by the founder/model gate; market never an input
 *   - every aggregate is over runCount runs; probabilities sum to 1
 *   - zero incoherent runs
 *   - every representative run is labelled as such, names a real run index, and is not the aggregate
 */
export function validateSimulationReceipt(r) {
  const p = [];
  if (r?.schemaVersion !== SIMULATION_RECEIPT_SCHEMA) p.push("schemaVersion");
  if (!["SHADOW", "EXPERIMENTAL", "PUBLIC"].includes(r?.promotionState)) p.push("promotionState");
  if (r?.promotionState === "PUBLIC") p.push("PUBLIC promotion is a founder/model gate — no receipt may claim it on its own");
  if (r?.marketReceiptId != null || !/^NOT_AN_INPUT/.test(String(r?.marketUse ?? ""))) p.push("market must not be an input");
  if (!(r?.runCount > 0) || r?.validation?.sampleCount !== r?.runCount) p.push("sampleCount ≠ runCount");
  if (r?.validation?.failedRuns !== 0) p.push(`incoherent runs: ${r?.validation?.failedRuns}`);
  const w = r?.aggregate?.winProbability ?? {};
  if (Math.abs((w.home ?? 0) + (w.away ?? 0) + (w.tie ?? 0) - 1) > 1e-3) p.push("win probabilities do not sum to 1");
  for (const rep of r?.representativeRuns ?? []) {
    if (rep.label !== REPRESENTATIVE_LABEL) p.push(`representative ${rep.kind} not labelled ${REPRESENTATIVE_LABEL}`);
    if (!(Number.isInteger(rep.runIndex) && rep.runIndex >= 0 && rep.runIndex < r.runCount)) p.push(`representative ${rep.kind} names no real run`);
  }
  for (const pl of r?.playerStatDistributions ?? []) {
    if (pl.anytimeTd != null && pl.twoPlusTd != null && pl.twoPlusTd > pl.anytimeTd) p.push(`${pl.playerId}: P(2+ TD) > P(anytime TD)`);
  }
  return p;
}
