/** Private correctness candidate. V1 and its evaluation receipts remain immutable.
 * Opportunity-based, NOT play-by-play: completed-pass tokens pair a receiver with an actual
 * passer opportunity; typed TDs consume eligible catches/carries. Other players remain explicit.
 * Predictive acceptance is separate from these accounting identities. See CODEX_NFL_JOINT_V2_CONTRACT.
 */
import { mulberry32, snapScore } from "./game-sim.mjs";
import { fnv1a } from "../research/replay-runner.mjs";
import { gammaDraw, allocateOpportunities, summarize, NFL_GAMESIM_ID } from "./player-props-v1.mjs";

export const NFL_JOINT_SIM_ID = "nfl-joint-sim-v2";
export const NFL_JOINT_SIM_VERSION = 2;
export const OTHER = "__OTHER__";
const fields = ["passAtt", "completions", "passYds", "passTd", "carries", "rushYds", "rushTd", "targets", "receptions", "recYds", "recTd", "anyTd", "tdCount"];
const normal = rng => { const r = Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))); const a = 2 * Math.PI * rng(); return [r * Math.cos(a), r * Math.sin(a)]; };
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const chance = (a, n) => a.filter(v => v >= n).length / a.length;
const rounded = x => Number(x.toFixed(4));
const zeros = () => Object.fromEntries(fields.map(k => [k, 0]));
const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function drawBoundedPoisson(rng, lambda, max) {
  // Exact finite conditional distribution; no capped rejection-loop tail distortion.
  const weights = [1];
  for (let k = 1; k <= max; k++) weights.push(weights[k - 1] * lambda / k);
  let u = rng() * weights.reduce((s, v) => s + v, 0);
  for (let k = 0; k < weights.length; k++) { u -= weights[k]; if (u <= 0) return k; }
  return max;
}

function validate(a) {
  if (!a.event?.providerEventId || !a.artifactDate || !Number.isInteger(a.runs ?? 5000) || (a.runs ?? 5000) < 1) return "missing identity/date or invalid draw count";
  if (![a.event.home?.abbr, a.event.away?.abbr].includes(a.teamAbbr)) return "team not in event";
  if (!a.strengthState?.ratingFor || !Array.isArray(a.players)) return "missing strength state/roster";
  const f = a.fit;
  const required = [f?.gamesim?.marginSlope, f?.gamesim?.sigmaMargin, f?.gamesim?.sigmaTotal, f?.gamesim?.muTotal,
    f?.volume?.pass?.a0, f?.volume?.pass?.a1, f?.volume?.pass?.sigma,
    f?.volume?.rush?.a0, f?.volume?.rush?.a1, f?.volume?.rush?.sigma,
    f?.dispersion?.recShape, f?.dispersion?.rushShape, f?.league?.catchRate, f?.league?.ypr, f?.league?.ypc,
    a.bridge?.lambdaIntercept, a.bridge?.lambdaPerPoint];
  if (!required.every(Number.isFinite)) return "missing or nonfinite fitted parameter";
  if (f.dispersion.recShape <= 0 || f.dispersion.rushShape <= 0 || f.league.catchRate < 0 || f.league.catchRate > 1 || f.league.ypr < 0 || f.league.ypc < 0) return "invalid rate/dispersion";
  const targetDeflation = f.dispersion.targetShareDeflation ?? 1;
  if (!Number.isFinite(targetDeflation) || targetDeflation <= 0 || targetDeflation > 1) return "invalid target-share deflation";
  if ([f.gamesim.sigmaMargin, f.gamesim.sigmaTotal, f.volume.pass.sigma, f.volume.rush.sigma].some(x => x < 0)) return "negative dispersion";
  const ids = new Set();
  for (const p of a.players) {
    if (typeof p.playerId !== "string" || !p.playerId || p.playerId === OTHER || ids.has(p.playerId)) return "duplicate or invalid player identity";
    ids.add(p.playerId);
    for (const k of ["qbShare", "carryShare", "targetShare", "tdShare", "tdRushFrac", "catchRate"]) {
      if (p[k] != null && (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 1)) return `invalid ${k}`;
    }
    for (const k of ["ypr", "ypc"]) if (p[k] != null && (!Number.isFinite(p[k]) || p[k] < 0)) return `invalid ${k}`;
  }
  for (const k of ["qbShare", "carryShare", "targetShare", "tdShare"]) {
    if (a.players.reduce((s, p) => s + (p[k] ?? 0), 0) > 1 + 1e-6) return `${k} exceeds team mass`;
  }
  return null;
}

export function simulateJointGame(args) {
  const { event, teamAbbr, fit, bridge, strengthState, artifactDate, runs = 5000, diagnostics = false, lines = null } = args;
  const base = { engineId: NFL_JOINT_SIM_ID, version: 2, dataClass: "PRIVATE_RESEARCH", providerEventId: event?.providerEventId ?? null, teamAbbr };
  const reason = validate(args);
  if (reason) return { ...base, state: "REFUSED", reason };
  const players = [...args.players].sort((a, b) => a.playerId.localeCompare(b.playerId));
  const homeRating = strengthState.ratingFor(event.home.abbr), awayRating = strengthState.ratingFor(event.away.abbr);
  if (![homeRating, awayRating].every(Number.isFinite)) return { ...base, state: "REFUSED", reason: "nonfinite team strength" };
  const marginMean = fit.gamesim.marginSlope * (homeRating + 48 - awayRating);
  const teamRng = mulberry32(fnv1a(`${NFL_GAMESIM_ID}::${event.providerEventId}::${artifactDate}::REGULAR`));
  const rng = mulberry32(fnv1a(`${NFL_JOINT_SIM_ID}::${event.providerEventId}::${artifactDate}::${teamAbbr}`));
  const pools = Object.fromEntries(["qbShare", "carryShare", "targetShare"].map(k => [k, players.filter(p => (p[k] ?? 0) > 0)]));
  // Carry the already accepted marginal fit through the joint opportunity owner.
  // Freed target mass stays OTHER; never renormalize it back onto named receivers.
  pools.targetShare = pools.targetShare.map(p => ({ ...p, targetShare: p.targetShare * (fit.dispersion.targetShareDeflation ?? 1) }));
  const acc = Object.fromEntries([...players.map(p => p.playerId), OTHER].map(id => [id, Object.fromEntries(fields.map(k => [k, []]))]));
  const teamAcc = Object.fromEntries(["own", "opp", "offTd", "drawnOffTd", "unassignedOffTd", "conversionPoints", "otherPoints", "passAtt", "completions", "passYds", "rushAtt", "rushYds", "recTd", "rushTd"].map(k => [k, []]));
  const capacityShares = (pool, key, kappa) => {
    if (!(kappa > 0)) return pool.map(p => ({ playerId: p.playerId, share: p[key] }));
    const remaining = Math.max(0, 1 - pool.reduce((s, p) => s + p[key], 0));
    const draws = pool.map(p => ({ playerId: p.playerId, g: gammaDraw(rng, p[key] * kappa, 1) }));
    const other = remaining > 0 ? gammaDraw(rng, remaining * kappa, 1) : 0;
    const total = other + draws.reduce((s, p) => s + p.g, 0);
    return draws.map(p => ({ playerId: p.playerId, share: total > 0 ? p.g / total : 0 }));
  };
  const allocate = (count, key, kappa) => {
    const { allocated, other } = allocateOpportunities(rng, count, capacityShares(pools[key], key, kappa));
    allocated.set(OTHER, other);
    return allocated;
  };
  const mult = sigma => { if (!(sigma > 0)) return 1; const [z] = normal(rng); return Math.exp(sigma * z - sigma * sigma / 2); };
  const otherPlayer = { playerId: OTHER, catchRate: fit.league.catchRate, ypr: fit.league.ypr, ypc: fit.league.ypc,
    tdShare: Math.max(0, 1 - players.reduce((s, p) => s + (p.tdShare ?? 0), 0)), tdRushFrac: 0.4 };
  const allPlayers = [...players, otherPlayer];

  for (let i = 0; i < runs; i++) {
    const draw = Object.fromEntries(allPlayers.map(p => [p.playerId, zeros()]));
    const [zm, zt] = normal(teamRng);
    const margin = marginMean + fit.gamesim.sigmaMargin * zm;
    const total = Math.max(2, fit.gamesim.muTotal + fit.gamesim.sigmaTotal * zt);
    const sign = teamAbbr === event.home.abbr ? 1 : -1;
    const own = snapScore((total + sign * margin) / 2), opp = snapScore((total - sign * margin) / 2);
    const [zp, zr] = normal(rng);
    const passAtt = Math.max(8, Math.round(fit.volume.pass.a0 + fit.volume.pass.a1 * (own - opp) + fit.volume.pass.sigma * zp));
    const rushAtt = Math.max(6, Math.round(fit.volume.rush.a0 + fit.volume.rush.a1 * (own - opp) + fit.volume.rush.sigma * zr));
    const kap = fit.dispersion.allocKappa ?? {};
    const qbs = allocate(passAtt, "qbShare", kap.passAttempts);
    const targets = allocate(passAtt, "targetShare", kap.targets);
    const carries = allocate(rushAtt, "carryShare", kap.rushAttempts);
    const passerSlots = [];
    for (const [id, n] of qbs) { draw[id].passAtt = n; for (let j = 0; j < n; j++) passerSlots.push(id); }
    shuffle(passerSlots, rng);
    const catches = new Map(allPlayers.map(p => [p.playerId, []]));
    let attemptIndex = 0;
    for (const p of allPlayers) {
      const b = draw[p.playerId];
      b.targets = targets.get(p.playerId) ?? 0;
      const efficiency = mult(fit.dispersion.gameSigma?.player_reception_yds ?? 0);
      for (let j = 0; j < b.targets; j++) {
        const passer = passerSlots[attemptIndex++];
        if (rng() < (p.catchRate ?? fit.league.catchRate)) {
          const yards = Math.round(gammaDraw(rng, fit.dispersion.recShape, (p.ypr ?? fit.league.ypr) * efficiency / fit.dispersion.recShape));
          b.receptions++; b.recYds += yards;
          draw[passer].completions++; draw[passer].passYds += yards;
          catches.get(p.playerId).push({ passer, yards });
        }
      }
      b.carries = carries.get(p.playerId) ?? 0;
      b.rushYds = b.carries ? Math.round(gammaDraw(rng, fit.dispersion.rushShape * b.carries,
        (p.ypc ?? fit.league.ypc) * mult(fit.dispersion.gameSigma?.player_rush_yds ?? 0) / fit.dispersion.rushShape)) : 0;
    }

    const drawnOffTd = drawBoundedPoisson(rng, Math.max(0, bridge.lambdaIntercept + bridge.lambdaPerPoint * own), Math.floor(own / 6));
    let offTd = 0;
    for (let t = 0; t < drawnOffTd; t++) {
      const eligible = [];
      for (const p of allPlayers) {
        const b = draw[p.playerId], weight = p.tdShare ?? 0, rushFraction = p.tdRushFrac ?? 0.4;
        if (b.carries > b.rushTd && weight * rushFraction > 0) eligible.push({ id: p.playerId, type: "rush", weight: weight * rushFraction });
        if (catches.get(p.playerId).length && weight * (1 - rushFraction) > 0) eligible.push({ id: p.playerId, type: "rec", weight: weight * (1 - rushFraction) });
      }
      const mass = eligible.reduce((s, x) => s + x.weight, 0);
      if (!(mass > 0)) break; // no fabricated catch/carry; unmet demand retained in diagnostics
      let u = rng() * mass, selected = eligible[eligible.length - 1];
      for (const option of eligible) { u -= option.weight; if (u <= 0) { selected = option; break; } }
      const b = draw[selected.id];
      if (selected.type === "rush") b.rushTd++;
      else {
        const tokens = catches.get(selected.id);
        const index = Math.floor(rng() * tokens.length);
        const [token] = tokens.splice(index, 1);
        b.recTd++; draw[token.passer].passTd++;
      }
      offTd++;
    }
    let conversionPoints = 0, budget = own - 6 * offTd;
    for (let t = 0; t < offTd; t++) {
      if (budget >= 2 && rng() < 0.05) { if (rng() < 0.48) { conversionPoints += 2; budget -= 2; } }
      else if (budget >= 1 && rng() < 0.94) { conversionPoints++; budget--; }
    }
    const sum = k => allPlayers.reduce((s, p) => s + draw[p.playerId][k], 0);
    for (const p of allPlayers) {
      const b = draw[p.playerId]; b.tdCount = b.rushTd + b.recTd; b.anyTd = Number(b.tdCount > 0);
      if (b.completions > b.passAtt || b.receptions > b.targets || b.recTd > b.receptions || b.rushTd > b.carries || !fields.every(k => Number.isInteger(b[k]) && b[k] >= 0)) throw new Error(`joint-v2 invalid player draw ${i}:${p.playerId}`);
      for (const k of fields) acc[p.playerId][k].push(b[k]);
    }
    if (sum("passAtt") !== passAtt || sum("targets") !== passAtt || sum("carries") !== rushAtt || sum("passYds") !== sum("recYds") || sum("completions") !== sum("receptions") || sum("passTd") !== sum("recTd") || sum("tdCount") !== offTd) throw new Error(`joint-v2 accounting failure draw ${i}`);
    const totals = { own, opp, offTd, drawnOffTd, unassignedOffTd: drawnOffTd - offTd, conversionPoints, otherPoints: budget,
      passAtt, completions: sum("completions"), passYds: sum("passYds"), rushAtt, rushYds: sum("rushYds"), recTd: sum("recTd"), rushTd: sum("rushTd") };
    for (const [k, v] of Object.entries(totals)) teamAcc[k].push(v);
  }
  const output = players.map(p => {
    const b = acc[p.playerId], markets = {};
    const add = (market, field) => { const s = summarize(b[field]); const line = lines?.[p.playerId]?.[market]; markets[market] = { ...s, ...(Number.isFinite(line) ? { line, probOverLine: rounded(b[field].filter(v => v > line).length / runs) } : {}) }; };
    if ((p.qbShare ?? 0) > 0) { add("player_pass_yds", "passYds"); markets.player_pass_yds.convention = "GROSS; other passers retained separately"; markets.player_pass_tds = { ...summarize(b.passTd), probOver05: rounded(chance(b.passTd, 1)), probOver15: rounded(chance(b.passTd, 2)) }; }
    if ((p.carryShare ?? 0) > 0) add("player_rush_yds", "rushYds");
    if ((p.targetShare ?? 0) > 0) { add("player_receptions", "receptions"); add("player_reception_yds", "recYds"); }
    if ((p.tdShare ?? 0) > 0) { markets.anytime_td = { probability: rounded(chance(b.tdCount, 1)) }; markets.td_2plus = { probability: rounded(chance(b.tdCount, 2)), basis: "typed COUNT draws; no public promotion" }; }
    return { playerId: p.playerId, name: p.name ?? null, markets };
  });
  return { ...base, state: "SIMULATED", runs, players: output,
    ...(diagnostics ? { __draws: { acc, teamAcc } } : {}),
    team: { score: summarize(teamAcc.own), oppScore: summarize(teamAcc.opp), offensiveTd: summarize(teamAcc.offTd),
      otherScoringPoints: { mean: rounded(avg(teamAcc.otherPoints)), note: "UNSPECIFIED points, not a separately validated kicks/defense model" },
      unallocated: Object.fromEntries(fields.map(k => [`${k}Mean`, rounded(avg(acc[OTHER][k]))])), unassignedOffensiveTdMean: rounded(avg(teamAcc.unassignedOffTd)) },
    conventions: { architecture: "private opportunity-based candidate; NOT drive/play simulation", passing: "gross receiving yards and completions credited to discrete passer opportunities including OTHER", unsupported: "sacks, interceptions, negative yardage, scoring sequence and individual kicking/defense components not modeled; no public family promotion" } };
}
