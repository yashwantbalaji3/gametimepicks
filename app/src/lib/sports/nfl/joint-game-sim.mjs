/**
 * NFL JOINT GAME SIMULATION v1 (P249) — nfl-joint-sim-v1. PRIVATE RESEARCH until evaluated.
 *
 * ARCHITECTURE CHOICE, stated: this EXTENDS the committed opportunity-based generator into a
 * per-draw-coherent joint model. It is NOT a drive/play simulator — no play-by-play corpus is
 * committed here, and final-score tables cannot validate invented drive mechanics — and it
 * never claims to be one. What is genuinely shared, per draw i:
 *   (margin_i, total_i)  one game-environment draw from the committed heads (the exact
 *                        game-sim RNG stream, so team artifacts replay identically)
 *   volumes_i            pass/rush attempts from the drawn game script (margin-driven — the
 *                        committed volume OLS; totals do not model pace, proven in
 *                        gamesim-coupling.test and unchanged here)
 *   allocations_i        Dirichlet-multinomial opportunity splits with EXPLICIT other-player
 *                        buckets (remainders are never discarded)
 *   outcomes_i           catches/yards/TDs generated from those opportunities
 *
 * PER-DRAW COHERENCE THE MARGINAL ENGINE LACKED:
 *   · QB gross passing yards := Σ teammate receiving yards + the other-receivers bucket —
 *     one draw, no second independent Gamma (GROSS convention, stated: sacks are a net-yards
 *     concept and are NOT modeled; the artifact says "gross").
 *   · completions := Σ receptions (+ other-bucket catches); receptions ≤ targets structurally.
 *   · offensive TDs are drawn per iteration from the committed points→λ bridge conditioned on
 *     the DRAWN team score (truncated Poisson, TD count ≤ floor(score/6)), allocated to
 *     scorers by the TD engine's flattened shares WITH an explicit other-scorers mass, typed
 *     rush/receiving by each player's own historical mix; every receiving TD credits a
 *     passing TD to a passer — passing TDs ≡ team receiving TDs by construction and are
 *     NEVER counted as the QB scoring.
 *   · team points decompose per draw: 6·TD + modeled conversions (XP/2pt rates from the
 *     bridge era) + a NON-NEGATIVE other-scoring bucket (FGs, defensive scores, safeties —
 *     carried explicitly, never forced into offensive TDs).
 *
 * P(2+ TD) comes from the COUNT draws (never a transform of anytime probability). First/last
 * scorer stays unavailable: no ordering mechanism exists in this architecture.
 */
import { mulberry32, snapScore } from "./game-sim.mjs";
import { fnv1a } from "../research/replay-runner.mjs";
import { binomialDraw, gammaDraw, allocateOpportunities, summarize, NFL_GAMESIM_ID } from "./player-props-v1.mjs";

export const NFL_JOINT_SIM_ID = "nfl-joint-sim-v1";
export const NFL_JOINT_SIM_VERSION = 1;

/** Conversion behavior after a TD (bridge-era league rates; documented approximation). */
const XP_RATE = 0.94;
const TWO_PT_ATTEMPT_RATE = 0.05;
const TWO_PT_SUCCESS_RATE = 0.48;

function normalPair(rng) {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

function truncPoisson(rng, lambda, maxK) {
  if (!(lambda > 0) || maxK <= 0) return 0;
  // inversion with cap; renormalization by rejection (cap binds rarely at real scores)
  for (let tries = 0; tries < 50; tries += 1) {
    let k = 0;
    let p = Math.exp(-lambda);
    let c = p;
    const u = rng();
    while (u > c && k < 30) { k += 1; p *= lambda / k; c += p; }
    if (k <= maxK) return k;
  }
  return maxK;
}

/**
 * One team-side joint simulation. Inputs mirror simulatePlayerProps plus TD share evidence.
 * @param {object} args
 * @param {object} args.fit          committed props fit (volume, dispersion, league, gamesim)
 * @param {object} args.bridge       { lambdaIntercept, lambdaPerPoint } — committed scoring bridge
 * @param {Array}  args.players      role players: { playerId, name, qbShare, carryShare, targetShare,
 *                                   compRate, ypcmp, catchRate, ypr, ypc, tdShare, tdRushFrac }
 * @param {object} args.event        { providerEventId, home:{abbr}, away:{abbr}, seasonType }
 */
export function simulateJointGame({ event, teamAbbr, fit, bridge, strengthState, players, artifactDate, runs = 5000, diagnostics = false, lines = null }) {
  const base = { engineId: NFL_JOINT_SIM_ID, version: NFL_JOINT_SIM_VERSION, providerEventId: event?.providerEventId ?? null, teamAbbr };
  if (!fit?.volume || !fit?.dispersion || !fit?.league || !fit?.gamesim) return { ...base, state: "REFUSED", reason: "no committed fit receipt" };
  if (!bridge || !Number.isFinite(bridge.lambdaIntercept) || !Number.isFinite(bridge.lambdaPerPoint)) return { ...base, state: "REFUSED", reason: "no committed scoring bridge" };
  if (!event?.providerEventId || !artifactDate) return { ...base, state: "ABSTAIN", reason: "unseedable" };
  const home = event.home?.abbr;
  const away = event.away?.abbr;
  if (teamAbbr !== home && teamAbbr !== away) return { ...base, state: "REFUSED", reason: "team not in event" };

  const d = strengthState.ratingFor(home) + 48 - strengthState.ratingFor(away);
  const marginMean = fit.gamesim.marginSlope * d;
  const sigmaMargin = fit.gamesim.sigmaMargin;
  const sigmaTotal = fit.gamesim.sigmaTotal;

  // Team stream replays the committed game-sim seed EXACTLY; player stream separate.
  const teamRng = mulberry32(fnv1a(`${NFL_GAMESIM_ID}::${event.providerEventId}::${artifactDate}::REGULAR`));
  const playerRng = mulberry32(fnv1a(`${NFL_JOINT_SIM_ID}::${event.providerEventId}::${artifactDate}::${teamAbbr}`));

  const passers = players.filter((p) => (p.qbShare ?? 0) > 0);
  const rushers = players.filter((p) => (p.carryShare ?? 0) > 0);
  const receivers = players.filter((p) => (p.targetShare ?? 0) > 0);
  const scorers = players.filter((p) => (p.tdShare ?? 0) > 0);
  const scorerShareSum = scorers.reduce((s, p) => s + p.tdShare, 0);

  const acc = new Map();
  const bucket = (id) => { if (!acc.has(id)) acc.set(id, { passYds: [], passTd: [], rushYds: [], recYds: [], receptions: [], anyTd: [], tdCount: [] }); return acc.get(id); };
  const teamAcc = { own: [], opp: [], offTd: [], otherPoints: [], unallocTargets: [], unallocRecYds: [], unallocTd: 0 };
  const violations = [];
  const kap = fit.dispersion.allocKappa ?? {};
  const gs = fit.dispersion.gameSigma ?? {};
  const effShares = (pool, key, kappa) => {
    if (!(kappa > 0)) return pool.map((p) => ({ playerId: p.playerId, share: p[key] ?? 0 }));
    const draws = pool.map((p) => ({ playerId: p.playerId, g: gammaDraw(playerRng, Math.max(1e-3, (p[key] ?? 0) * kappa), 1) }));
    const listed = pool.reduce((s, p) => s + (p[key] ?? 0), 0);
    const other = gammaDraw(playerRng, Math.max(1e-3, Math.max(0, 1 - listed) * kappa), 1);
    const tot = draws.reduce((s, x) => s + x.g, 0) + other;
    return draws.map((x) => ({ playerId: x.playerId, share: tot > 0 ? x.g / tot : 0 }));
  };
  const effMult = (sigma) => {
    const [z] = normalPair(playerRng);
    return sigma > 0 ? Math.exp(sigma * z - (sigma * sigma) / 2) : 1;
  };

  for (let i = 0; i < runs; i += 1) {
    const [z1, z2] = normalPair(teamRng);
    const margin = marginMean + sigmaMargin * z1;
    const total = Math.max(2, fit.gamesim.muTotal + sigmaTotal * z2);
    const own = snapScore((teamAbbr === home ? total + margin : total - margin) / 2);
    const opp = snapScore((teamAbbr === home ? total - margin : total + margin) / 2);
    const ownMargin = own - opp;
    teamAcc.own.push(own); teamAcc.opp.push(opp);

    const [zv1, zv2] = normalPair(playerRng);
    const passAtt = Math.max(8, Math.round(fit.volume.pass.a0 + fit.volume.pass.a1 * ownMargin + fit.volume.pass.sigma * zv1));
    const rushAtt = Math.max(6, Math.round(fit.volume.rush.a0 + fit.volume.rush.a1 * ownMargin + fit.volume.rush.sigma * zv2));

    const qbAlloc = allocateOpportunities(playerRng, passAtt, effShares(passers, "qbShare", kap.passAttempts));
    const carryAlloc = allocateOpportunities(playerRng, rushAtt, effShares(rushers, "carryShare", kap.rushAttempts));
    const targetAlloc = allocateOpportunities(playerRng, passAtt, effShares(receivers, "targetShare", kap.targets));

    // ── receiving generates the passing game (ONE draw for both sides of the ball) ────────────
    let teamRecYds = 0;
    let teamCatches = 0;
    let targetSum = 0;
    for (const p of receivers) {
      const tgt = targetAlloc.allocated.get(p.playerId) ?? 0;
      targetSum += tgt;
      const m = effMult(gs.player_reception_yds ?? 0);
      const rec = binomialDraw(playerRng, tgt, p.catchRate);
      const yds = rec > 0 ? gammaDraw(playerRng, fit.dispersion.recShape * rec, (p.ypr * m) / fit.dispersion.recShape) : 0;
      if (rec > tgt) violations.push(`draw ${i}: receptions>targets for ${p.playerId}`);
      const b = bucket(p.playerId);
      b.receptions.push(rec); b.recYds.push(yds);
      teamRecYds += yds; teamCatches += rec;
    }
    const otherTargets = targetAlloc.other;
    const otherCatches = binomialDraw(playerRng, otherTargets, fit.league.catchRate);
    const otherRecYds = otherCatches > 0 ? gammaDraw(playerRng, fit.dispersion.recShape * otherCatches, fit.league.ypr / fit.dispersion.recShape) : 0;
    teamRecYds += otherRecYds; teamCatches += otherCatches;
    teamAcc.unallocTargets.push(otherTargets); teamAcc.unallocRecYds.push(otherRecYds);
    if (targetSum + otherTargets !== passAtt) violations.push(`draw ${i}: target allocation does not reconcile`);

    // passers share the ONE team passing outcome proportionally to allocated attempts
    let qbAttSum = 0;
    for (const p of passers) qbAttSum += qbAlloc.allocated.get(p.playerId) ?? 0;
    for (const p of passers) {
      const att = qbAlloc.allocated.get(p.playerId) ?? 0;
      const frac = qbAttSum > 0 ? att / qbAttSum : 0;
      bucket(p.playerId).passYds.push(teamRecYds * frac);
    }

    // ── rushing ──────────────────────────────────────────────────────────────────────────────
    for (const p of rushers) {
      const car = carryAlloc.allocated.get(p.playerId) ?? 0;
      const m = effMult(gs.player_rush_yds ?? 0);
      const yds = car > 0 ? gammaDraw(playerRng, fit.dispersion.rushShape * car, (p.ypc * m) / fit.dispersion.rushShape) : 0;
      bucket(p.playerId).rushYds.push(yds);
    }

    // ── touchdowns from the DRAWN score, allocated, typed, reconciled ────────────────────────
    const lambda = Math.max(0, bridge.lambdaIntercept + bridge.lambdaPerPoint * own);
    const maxTd = Math.floor(own / 6);
    const offTd = truncPoisson(playerRng, lambda, maxTd);
    teamAcc.offTd.push(offTd);
    const perPlayerTd = new Map();
    let recTdTotal = 0;
    for (let t = 0; t < offTd; t += 1) {
      const u = rng01(playerRng) * Math.max(scorerShareSum, 1);
      let cum = 0; let chosen = null;
      for (const p of scorers) { cum += p.tdShare; if (u <= cum) { chosen = p; break; } }
      if (!chosen) { teamAcc.unallocTd += 1; continue; } // other-scorers mass — explicit, never redistributed
      perPlayerTd.set(chosen.playerId, (perPlayerTd.get(chosen.playerId) ?? 0) + 1);
      const isRush = rng01(playerRng) < (chosen.tdRushFrac ?? 0.4);
      if (!isRush) recTdTotal += 1;
    }
    for (const p of scorers) {
      const k = perPlayerTd.get(p.playerId) ?? 0;
      const b = bucket(p.playerId);
      b.anyTd.push(k >= 1 ? 1 : 0);
      b.tdCount.push(k);
    }
    // every receiving TD is a passing TD for a passer — reconciliation by construction
    for (const p of passers) {
      const att = qbAlloc.allocated.get(p.playerId) ?? 0;
      const frac = qbAttSum > 0 ? att / qbAttSum : 0;
      bucket(p.playerId).passTd.push(recTdTotal * frac);
    }

    // ── score decomposition: TDs + conversions + a NON-NEGATIVE other bucket ─────────────────
    let convPts = 0;
    let budget = own - 6 * offTd;
    for (let t = 0; t < offTd; t += 1) {
      if (budget >= 2 && rng01(playerRng) < TWO_PT_ATTEMPT_RATE) { if (rng01(playerRng) < TWO_PT_SUCCESS_RATE) { convPts += 2; budget -= 2; } }
      else if (budget >= 1 && rng01(playerRng) < XP_RATE) { convPts += 1; budget -= 1; }
    }
    const otherPoints = own - 6 * offTd - convPts;
    if (otherPoints < 0) violations.push(`draw ${i}: negative other-scoring bucket`);
    teamAcc.otherPoints.push(otherPoints);
  }

  if (violations.length) return { ...base, state: "REFUSED", reason: `invariant violations: ${violations.slice(0, 3).join("; ")}` };

  const players_out = players.map((p) => {
    const b = acc.get(p.playerId);
    if (!b) return null;
    const out = { playerId: p.playerId, name: p.name ?? null, markets: {} };
    const withLine = (mkt, summary, samples) => {
      const line = lines?.[p.playerId]?.[mkt];
      if (typeof line !== "number") return summary;
      return { ...summary, line, probOverLine: Number((samples.filter((v) => v > line).length / samples.length).toFixed(4)) };
    };
    if (b.passYds.length) out.markets.player_pass_yds = { ...withLine("player_pass_yds", summarize(b.passYds), b.passYds), convention: "GROSS (= team receiving yards share); sacks not modeled" };
    if (b.passTd.length) out.markets.player_pass_tds = { mean: avg(b.passTd), probOver05: share(b.passTd, (v) => v > 0.5), probOver15: share(b.passTd, (v) => v > 1.5) };
    if (b.rushYds.length) out.markets.player_rush_yds = withLine("player_rush_yds", summarize(b.rushYds), b.rushYds);
    if (b.receptions.length) out.markets.player_receptions = withLine("player_receptions", summarize(b.receptions), b.receptions);
    if (b.recYds.length) out.markets.player_reception_yds = withLine("player_reception_yds", summarize(b.recYds), b.recYds);
    if (b.anyTd.length) {
      out.markets.anytime_td = { probability: avg(b.anyTd) };
      out.markets.td_2plus = { probability: share(b.tdCount, (v) => v >= 2), basis: "COUNT draws from the joint simulation — never a transform of anytime probability" };
    }
    return out;
  }).filter(Boolean);

  return {
    ...base,
    state: "SIMULATED",
    runs,
    ...(diagnostics ? { __draws: { acc: Object.fromEntries([...acc.entries()]), teamAcc } } : {}),
    team: {
      score: summarize(teamAcc.own),
      oppScore: summarize(teamAcc.opp),
      offensiveTd: { mean: avg(teamAcc.offTd), dist: countDist(teamAcc.offTd) },
      otherScoringPoints: { mean: avg(teamAcc.otherPoints), note: "FGs, defensive scores, safeties and failed conversions — carried explicitly, never forced into offensive TDs" },
      unallocated: { targetsMean: avg(teamAcc.unallocTargets), recYdsMean: avg(teamAcc.unallocRecYds), tdCount: teamAcc.unallocTd },
    },
    players: players_out,
    conventions: {
      passing: "gross = team receiving yards, split across passers by allocated attempts; passing TDs = team receiving TDs by construction (never the QB scoring)",
      firstLastScorer: "UNAVAILABLE — no ordering mechanism in this architecture",
    },
  };
}

const avg = (a) => (a.length ? Number((a.reduce((s, v) => s + v, 0) / a.length).toFixed(4)) : null);
const share = (a, f) => (a.length ? Number((a.filter(f).length / a.length).toFixed(4)) : null);
function countDist(a) {
  const m = new Map();
  for (const v of a) m.set(v, (m.get(v) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort((x, y) => x[0] - y[0]).map(([k, v]) => [k, Number((v / a.length).toFixed(4))]));
}
function rng01(rng) { return rng(); }
