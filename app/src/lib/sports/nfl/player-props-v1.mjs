/**
 * NFL player-prop distribution heads (Program 171 · Release B). PRIVATE RESEARCH.
 *
 * ARCHITECTURE — opportunity × efficiency, conditioned on the joint team simulation:
 *   team score draw (game-sim's exact stream) → game-script volumes (pass/rush attempts as
 *   fitted linear functions of the simulated margin) → MULTINOMIAL allocation of opportunities
 *   across role-share players + OTHER (sequential conditional binomials, so player totals
 *   reconcile to team totals PER ITERATION by construction, never by post-hoc scaling) →
 *   per-opportunity efficiency (binomial completion/catch, Gamma yardage whose shape scales
 *   with opportunity count — non-negative and heavy-tailed, zero-inflated through the chain:
 *   zero opportunities is zero yards, typed by construction).
 *
 * MARKET INDEPENDENCE IS STRUCTURAL: no odds, price, market, or bookmaker parameter exists in
 * this module. A test reads the source and refuses any such identifier (the model-v1 pattern).
 *
 * DETERMINISM: two streams — the team-score stream reuses game-sim's exact seed derivation so
 * player heads see the SAME simulated games the team artifact reports; the player stream is
 * seeded separately (engine id + event + artifactDate) so adding player markets can never
 * perturb committed team scores. Rejection samplers consume a variable but deterministic
 * number of draws from their stream.
 *
 * FIT PARAMETERS come only from the committed evaluation receipt (loadPlayerPropsFit) — the
 * engine refuses to sample without one, the td-engine's "never by vibes" rule.
 */
import { fnv1a } from "../research/replay-runner.mjs";
import { mulberry32, snapScore, PRESEASON_VARIANT } from "./game-sim.mjs";

export const NFL_PLAYER_PROPS_VERSION = 1;
export const NFL_PLAYER_PROPS_ID = "nfl-player-props-v1-opportunity-efficiency";
export const NFL_GAMESIM_ID = "nfl-gamesim-v1-joint-normal"; // pinned: the team stream this engine must replay

export const PROP_MARKETS = Object.freeze(["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"]);

/** Box–Muller pair; both draws consumed — BYTE-EXACT copy of game-sim's normalPair (1e-12 clamp)
 * so the replayed team stream reproduces committed team scores bit-for-bit. */
function normalPair(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

/** Exact small-n binomial by inversion counting (n ≤ a few hundred here). */
export function binomialDraw(rng, n, p) {
  if (!(n > 0) || !(p > 0)) return 0;
  if (p >= 1) return n;
  let k = 0;
  for (let i = 0; i < n; i += 1) if (rng() < p) k += 1;
  return k;
}

/** Marsaglia–Tsang Gamma(shape, scale) — shape > 0; deterministic given the stream. */
export function gammaDraw(rng, shape, scale) {
  if (!(shape > 0) || !(scale > 0)) return 0;
  if (shape < 1) {
    const u = Math.max(rng(), Number.EPSILON);
    return gammaDraw(rng, shape + 1, scale) * u ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const [z] = normalPair(rng);
    const v = (1 + c * z) ** 3;
    if (v <= 0) continue;
    const u = Math.max(rng(), Number.EPSILON);
    if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v * scale;
  }
}

/**
 * Multinomial opportunity allocation: sequential conditional binomials over players sorted by
 * share desc (playerId tiebreak). Σ allocated ≤ total ALWAYS; the remainder is OTHER's.
 */
export function allocateOpportunities(rng, total, players) {
  const out = new Map();
  let remainingN = total;
  let remainingShare = 1;
  for (const p of players) {
    if (remainingN <= 0 || remainingShare <= 1e-12) { out.set(p.playerId, 0); continue; }
    const cond = Math.min(1, Math.max(0, p.share / remainingShare));
    const k = binomialDraw(rng, remainingN, cond);
    out.set(p.playerId, k);
    remainingN -= k;
    remainingShare -= p.share;
  }
  return { allocated: out, other: remainingN };
}

/** Quantiles from a sorted copy of samples (type-7 style nearest-rank interpolation). */
export function summarize(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  const q = (p) => {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  const mean = s.reduce((a, b) => a + b, 0) / n;
  return {
    mean: Number(mean.toFixed(3)),
    p10: Number(q(0.10).toFixed(2)),
    p25: Number(q(0.25).toFixed(2)),
    median: Number(q(0.50).toFixed(2)),
    p75: Number(q(0.75).toFixed(2)),
    p90: Number(q(0.90).toFixed(2)),
    probOver: (line) => samples.reduce((a, v) => a + (v > line ? 1 : 0), 0) / n,
    samples: n,
  };
}

/**
 * Decayed shrunk per-opportunity rate: (Σ w·successes + m·leagueRate) / (Σ w·trials + m).
 * Observations chronological, newest last: [{success, trials, season}].
 */
export function shrunkRate({ observations, predictSeason, halfLifeGames, boundaryDecay, priorTrials, leagueRate }) {
  let s = 0;
  let t = 0;
  const n = observations.length;
  for (let i = 0; i < n; i += 1) {
    const w = (halfLifeGames === Infinity ? 1 : 0.5 ** ((n - 1 - i) / halfLifeGames)) * boundaryDecay ** Math.max(0, predictSeason - observations[i].season);
    s += w * observations[i].success;
    t += w * observations[i].trials;
  }
  return { rate: (s + priorTrials * leagueRate) / (t + priorTrials), effTrials: t };
}

/**
 * Simulate one team's player-prop distributions for one event, conditioned on the exact
 * game-sim score stream. Refuses without a committed fit.
 *
 * `lines` (optional) = { [playerId]: { [market]: number } } — offered lines to read
 * P(over)/P(under) off the sampled distribution. Lines are a READ-OUT ONLY: they are applied
 * after sampling completes and can never influence a draw (the price-independence pin test
 * proves byte-identical distributions with and without them).
 */
export function simulatePlayerProps({ event, teamAbbr, fit, strengthState, roleRates, artifactDate, runs = 10_000, lines = null }) {
  const base = { version: NFL_PLAYER_PROPS_VERSION, engineId: NFL_PLAYER_PROPS_ID, providerEventId: event?.providerEventId ?? null, teamAbbr };
  if (!fit?.receipt || !fit?.volume || !fit?.dispersion || !fit?.league) return { ...base, state: "REFUSED", reason: "no committed player-props fit receipt — parameters are fit evidence, never constants chosen by taste" };
  if (!event?.providerEventId || !artifactDate) return { ...base, state: "ABSTAIN", reason: "an unseedable simulation is a nondeterminism defect" };
  const home = event?.home?.abbr;
  const away = event?.away?.abbr;
  if (teamAbbr !== home && teamAbbr !== away) return { ...base, state: "REFUSED", reason: `teamAbbr ${teamAbbr} belongs to neither side of ${event?.providerEventId}` };
  if (!roleRates?.players?.length) return { ...base, state: "ABSTAIN", reason: "no role-share players supplied — allocation needs Release A evidence" };

  const isPre = (event.seasonType ?? 0) === 1;
  const variant = isPre ? "PRESEASON_CONSERVATIVE" : "REGULAR";
  const shrink = isPre ? PRESEASON_VARIANT.marginShrink : 1;
  const widen = isPre ? PRESEASON_VARIANT.sigmaWiden : 1;
  const d = (strengthState.ratingFor(home) + 48) - strengthState.ratingFor(away);
  const marginMean = fit.gamesim.marginSlope * d * shrink;
  const sigmaMargin = fit.gamesim.sigmaMargin * widen;
  const sigmaTotal = fit.gamesim.sigmaTotal * widen;

  // Stream 1: the exact game-sim stream (identical seed derivation → identical team scores).
  const teamRng = mulberry32(fnv1a(`${NFL_GAMESIM_ID}::${event.providerEventId}::${artifactDate}::${variant}`));
  // Stream 2: player heads — separate so props can never perturb committed team scores.
  const playerRng = mulberry32(fnv1a(`${NFL_PLAYER_PROPS_ID}::${event.providerEventId}::${artifactDate}::${variant}`));

  const sorted = [...roleRates.players].sort((a, b) => b.share - a.share || (a.playerId < b.playerId ? -1 : 1));
  const passers = sorted.filter((p) => p.families.has("passAttempts"));
  const rushers = sorted.filter((p) => p.families.has("rushAttempts"));
  const receivers = sorted.filter((p) => p.families.has("targets"));

  // Dirichlet-multinomial role volatility: per-iteration effective shares drawn around the
  // estimates with committed concentration κ (small κ = volatile roles = honest wide counts).
  // Every player draws every iteration so stream consumption never depends on realized values.
  const effShares = (players, shareKey, kappa) => {
    if (!(kappa > 0)) return players.map((p) => ({ playerId: p.playerId, share: p[shareKey] ?? 0 }));
    const listed = players.reduce((s, p) => s + (p[shareKey] ?? 0), 0);
    const draws = players.map((p) => ({ playerId: p.playerId, g: gammaDraw(playerRng, Math.max(1e-3, (p[shareKey] ?? 0) * kappa), 1) }));
    const other = gammaDraw(playerRng, Math.max(1e-3, Math.max(0, 1 - listed) * kappa), 1);
    const tot = draws.reduce((s, x) => s + x.g, 0) + other;
    return draws.map((x) => ({ playerId: x.playerId, share: tot > 0 ? x.g / tot : 0 }));
  };
  // Per-game efficiency factor: lognormal, mean-1, committed σ per yardage market. Drawn every
  // iteration per player (fixed consumption); applied only when opportunities landed.
  const effMult = (sigma) => {
    const [z] = normalPair(playerRng);
    return sigma > 0 ? Math.exp(sigma * z - (sigma * sigma) / 2) : 1;
  };
  const kap = fit.dispersion.allocKappa ?? {};
  const gs = fit.dispersion.gameSigma ?? {};
  const acc = new Map(); // playerId → {passYds:[], rushYds:[], recYds:[], receptions:[]}
  const bucket = (id) => { if (!acc.has(id)) acc.set(id, { passYds: [], rushYds: [], recYds: [], receptions: [] }); return acc.get(id); };
  const recon = { iterations: runs, passOverflow: 0, rushOverflow: 0, receptionsOverTargets: 0 };
  let ownScoreSum = 0;
  let oppScoreSum = 0;

  for (let i = 0; i < runs; i += 1) {
    const [z1, z2] = normalPair(teamRng);
    const margin = marginMean + sigmaMargin * z1;
    const total = Math.max(2, fit.gamesim.muTotal + sigmaTotal * z2);
    const own = snapScore((teamAbbr === home ? total + margin : total - margin) / 2);
    const opp = snapScore((teamAbbr === home ? total - margin : total + margin) / 2);
    const ownMargin = own - opp;
    ownScoreSum += own;
    oppScoreSum += opp;

    const [zv1, zv2] = normalPair(playerRng);
    const passAtt = Math.max(8, Math.round(fit.volume.pass.a0 + fit.volume.pass.a1 * ownMargin + fit.volume.pass.sigma * zv1));
    const rushAtt = Math.max(6, Math.round(fit.volume.rush.a0 + fit.volume.rush.a1 * ownMargin + fit.volume.rush.sigma * zv2));

    const qbAlloc = allocateOpportunities(playerRng, passAtt, effShares(passers, "qbShare", kap.passAttempts));
    const carryAlloc = allocateOpportunities(playerRng, rushAtt, effShares(rushers, "carryShare", kap.rushAttempts));
    const targetAlloc = allocateOpportunities(playerRng, passAtt, effShares(receivers, "targetShare", kap.targets));
    let passSum = 0; let rushSum = 0;

    for (const p of passers) {
      const att = qbAlloc.allocated.get(p.playerId) ?? 0;
      passSum += att;
      const m = effMult(gs.player_pass_yds ?? 0);
      const cmp = binomialDraw(playerRng, att, p.compRate);
      const yds = cmp > 0 ? gammaDraw(playerRng, fit.dispersion.passShape * cmp, (p.ypcmp * m) / fit.dispersion.passShape) : 0;
      bucket(p.playerId).passYds.push(yds);
    }
    for (const p of rushers) {
      const car = carryAlloc.allocated.get(p.playerId) ?? 0;
      rushSum += car;
      const m = effMult(gs.player_rush_yds ?? 0);
      const yds = car > 0 ? gammaDraw(playerRng, fit.dispersion.rushShape * car, (p.ypc * m) / fit.dispersion.rushShape) : 0;
      bucket(p.playerId).rushYds.push(yds);
    }
    for (const p of receivers) {
      const tgt = targetAlloc.allocated.get(p.playerId) ?? 0;
      const m = effMult(gs.player_reception_yds ?? 0);
      const rec = binomialDraw(playerRng, tgt, p.catchRate);
      if (rec > tgt) recon.receptionsOverTargets += 1;
      const yds = rec > 0 ? gammaDraw(playerRng, fit.dispersion.recShape * rec, (p.ypr * m) / fit.dispersion.recShape) : 0;
      const b = bucket(p.playerId);
      b.receptions.push(rec);
      b.recYds.push(yds);
    }
    if (passSum > passAtt) recon.passOverflow += 1;
    if (rushSum > rushAtt) recon.rushOverflow += 1;
  }

  const players = sorted.map((p) => {
    const b = acc.get(p.playerId) ?? { passYds: [], rushYds: [], recYds: [], receptions: [] };
    const samplesByMarket = {};
    if (p.families.has("passAttempts") && b.passYds.length) samplesByMarket.player_pass_yds = b.passYds;
    if (p.families.has("rushAttempts") && b.rushYds.length) samplesByMarket.player_rush_yds = b.rushYds;
    if (p.families.has("targets") && b.recYds.length) {
      samplesByMarket.player_reception_yds = b.recYds;
      samplesByMarket.player_receptions = b.receptions;
    }
    const markets = {};
    for (const [m, samples] of Object.entries(samplesByMarket)) {
      const dist = summarize(samples);
      const line = lines?.[p.playerId]?.[m];
      if (typeof line === "number") {
        dist.line = line;
        dist.probOverLine = Number(dist.probOver(line).toFixed(4));
        dist.probUnderLine = Number((samples.reduce((a, v) => a + (v < line ? 1 : 0), 0) / samples.length).toFixed(4));
      }
      delete dist.probOver; // the closure never serializes
      markets[m] = dist;
    }
    return { playerId: p.playerId, name: p.name ?? null, shareBasis: p.shareBasis ?? null, markets };
  });

  return {
    ...base,
    state: "SIMULATED",
    variant,
    evidenceTier: isPre ? "REDUCED_PRESEASON" : "REGULAR_SEASON_FIT",
    seedBasis: `${NFL_PLAYER_PROPS_ID}::${event.providerEventId}::${artifactDate}::${variant}`,
    teamScoreCheck: {
      ownMean: Number((ownScoreSum / runs).toFixed(4)),
      oppMean: Number((oppScoreSum / runs).toFixed(4)),
      note: "replayed game-sim stream — must equal the committed team artifact's score means bit-for-bit (compatibility pin)",
    },
    reconciliation: { ...recon, note: "multinomial allocation makes overflow impossible by construction; counters prove it stayed zero" },
    players,
    publicActivation: "OFF",
  };
}

/** Load the committed fit receipt (evaluate-nfl-player-props writes it); null keeps refusal intact. */
export function loadPlayerPropsFit({ fs, path, cwd }) {
  try {
    const p = path.join(cwd, "..", "data/internal/research/nfl/reports/player-props-v1-evaluation.json");
    const r = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!r?.fit?.volume || !r?.fit?.dispersion || !r?.fit?.league || !r?.fit?.gamesim) return null;
    return { ...r.fit, receipt: `${r.artifact}@${r.generatedAt}`, promotion: r.promotion ?? null };
  } catch { return null; }
}
