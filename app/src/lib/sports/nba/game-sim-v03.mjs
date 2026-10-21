/**
 * NBA v0.3 CANDIDATE engine: the v0 engine (game-sim.mjs) with conditional minutes, rotation-aware normalisation
 * and participation. PURE, deterministic, seeded, no I/O.
 * NBA REGULAR SEASON — CANDIDATE SHADOW (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * WHY A SEPARATE FILE. game-sim.mjs is the frozen v0 engine (preregistration §1), pinned byte-for-byte by
 * game-sim-v1.test.mjs. v0.3 does not edit it. This module reuses its seed, PRNG, constants and per-draw model
 * (minutes ~ N(mean, sd) clipped [0, 48]; each per-minute rate ~ N(rate, rateSd) floored at 0; stat = minutes × rate;
 * the same draw order). It changes only the three things the v0.3 minutes layer needs:
 *
 *   1. CONDITIONAL MINUTES. A player's minutes are his minutes WHEN HE PLAYS, which is what a line and the grader
 *      compare against. v0's prepareRoster instead multiplies every pool player by 240 / Σ minutes. Summed over a
 *      13–16-man roster, those per-appearance minutes ran 197–384 on 2026-10-20/21, so one factor (0.62–1.22)
 *      took a median 5.2–5.5 minutes from every projected starter.
 *   2. NORMALISATION IN EXPECTATION. The team's minutes sum to 240 over who plays: Σ playRate·minutes = 240.
 *      - An over-full pool is water-filled on minutes^power, so the excess comes mostly from the short-minutes
 *        players, as real rotations do, rather than one equal share off every starter. `power` is the v1 engine's
 *        frozen MINUTES_POWER (1.25, fitted on 2023-24 only at preregistration look 4); no new constant.
 *      - A pool at or under 240 keeps v0's uniform bounded factor, applied to the play-rate-weighted sum.
 *   3. PARTICIPATION. A player's points count toward the team total with probability playRate, drawn from a
 *      SEPARATE stream (seed + "|participation"). The base stream is consumed exactly as v0 consumes it, so the
 *      player distributions are the ones v0's loop gives for the same prepared roster.
 *
 * The team score is still a sum of independent player simulations that ignores the opponent (as in v0); it is not a
 * v0.3 output anyone may publish (§13 withholds team scores).
 */
import { seedForGame, mulberry32, fnv1a32, DEFAULT_SIMULATIONS, TEAM_MINUTES, MAX_PLAYER_MINUTES, MINUTES_RESCALE_BOUNDS, DEFAULT_MINUTES_SD_RATIO, COMBO_KEYS } from "./game-sim.mjs";

export const NBA_SIM_V03_MODEL_VERSION = "nba-sim-v0.3-conditional-minutes";
export const PLAY_RATE_WATER_FILL = "play-rate-water-fill";
const STAT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm"]);

// The same small helpers as game-sim.mjs (not exported there; copied unchanged so the draws are the same).
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => (x == null ? null : Number(x.toFixed(2)));
const r4 = (x) => (x == null ? null : Number(x.toFixed(4)));
function normal(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function quantiles(arr) {
  const s = Float64Array.from(arr).sort();
  const n = s.length;
  if (!n) return { mean: null, sd: null, p10: null, p50: null, p90: null };
  const at = (q) => s[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
  const m = s.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : null;
  return { mean: r2(m), sd: r2(sd), p10: r2(at(0.1)), p50: r2(at(0.5)), p90: r2(at(0.9)) };
}
function comboDraws(stats, parts, n) {
  const out = new Float64Array(n);
  for (const k of parts) { const a = stats[k]; for (let i = 0; i < n; i += 1) out[i] += a[i]; }
  return out;
}

/**
 * Weighted water-filling: find f with Σ w_i · min(cap, f · raw_i) = target (raw_i > 0, w_i in (0, 1]). Pure.
 * Returns the per-player minutes min(cap, f · raw_i), the factor f and the number of players capped.
 */
export function weightedWaterFill(raw, weights, target, cap) {
  const n = raw.length;
  const capped = new Set();
  for (let iter = 0; iter <= n; iter += 1) {
    let free = 0, cappedMass = 0;
    for (let i = 0; i < n; i += 1) { if (capped.has(i)) cappedMass += weights[i] * cap; else if (raw[i] > 0) free += weights[i] * raw[i]; }
    const f = free > 0 ? (target - cappedMass) / free : 0;
    let changed = false;
    for (let i = 0; i < n; i += 1) if (!capped.has(i) && raw[i] > 0 && f * raw[i] > cap) { capped.add(i); changed = true; }
    if (!changed) return { minutes: raw.map((x, i) => (capped.has(i) ? cap : x > 0 ? f * x : 0)), factor: f, capped: capped.size };
  }
  throw new Error("weightedWaterFill: did not converge");
}

/**
 * v0.3 roster preparation: v0's prepareRoster (same exclusions, same pool-rate and default-sd fallbacks, same keys)
 * with the normalisation above. `minutesResult.normalisation` = { rule: PLAY_RATE_WATER_FILL, power } is REQUIRED:
 * this module never silently runs v0's uniform rule.
 */
export function prepareRosterV03(minutesResult) {
  const norm = minutesResult?.normalisation;
  if (norm?.rule !== PLAY_RATE_WATER_FILL || !Number.isFinite(norm?.power)) throw new Error("prepareRosterV03: minutesResult.normalisation { rule: play-rate-water-fill, power } is required");
  const rows = Array.isArray(minutesResult?.rows) ? minutesResult.rows : [];
  const out = rows.filter((r) => r.availability === "out").map((r) => ({ providerAthleteId: r.providerAthleteId, name: r.name, injuryStatus: r.injuryStatus }));
  const noMinutes = rows.filter((r) => r.availability !== "out" && r.expectedMinutes == null).map((r) => ({ providerAthleteId: r.providerAthleteId, name: r.name, basis: r.basis, dnpCount: r.dnpCount }));
  const pool = rows.filter((r) => r.availability !== "out" && Number.isFinite(r.expectedMinutes) && r.expectedMinutes > 0);

  const playRateOf = (r) => (Number.isFinite(r.playRate) && r.playRate > 0 ? Math.min(1, r.playRate) : 1);
  const rawSum = pool.reduce((s, r) => s + r.expectedMinutes, 0);
  const weightedSum = pool.reduce((s, r) => s + r.expectedMinutes * playRateOf(r), 0);
  const overFull = weightedSum > TEAM_MINUTES;
  const rescale = overFull ? null : weightedSum > 0 ? clamp(TEAM_MINUTES / weightedSum, MINUTES_RESCALE_BOUNDS.min, MINUTES_RESCALE_BOUNDS.max) : null;
  const filled = overFull ? weightedWaterFill(pool.map((r) => r.expectedMinutes ** norm.power), pool.map(playRateOf), TEAM_MINUTES, MAX_PLAYER_MINUTES) : null;

  const poolRate = {};
  for (const k of STAT_KEYS) {
    const withRate = pool.filter((r) => r.rates && Number.isFinite(r.rates[k]));
    const w = withRate.reduce((s, r) => s + r.expectedMinutes, 0);
    poolRate[k] = w > 0 ? withRate.reduce((s, r) => s + r.rates[k] * r.expectedMinutes, 0) / w : null;
  }

  let defaultSdSubstitutions = 0;
  let poolRateSubstitutions = 0;
  const players = pool.map((r, i) => {
    const ratio = filled ? filled.minutes[i] / r.expectedMinutes : (rescale ?? 1);
    const mu = Math.min(MAX_PLAYER_MINUTES, filled ? filled.minutes[i] : r.expectedMinutes * ratio);
    let sd;
    if (Number.isFinite(r.minutesSd)) sd = r.minutesSd * ratio;
    else { sd = mu * DEFAULT_MINUTES_SD_RATIO; defaultSdSubstitutions += 1; }
    const hasOwnRates = r.rates && STAT_KEYS.every((k) => Number.isFinite(r.rates[k]));
    if (!hasOwnRates) poolRateSubstitutions += 1;
    const rates = {}; const rateSd = {};
    for (const k of STAT_KEYS) {
      const own = r.rates && Number.isFinite(r.rates[k]);
      rates[k] = own ? r.rates[k] : poolRate[k];
      rateSd[k] = own && Number.isFinite(r.rateSd?.[k]) ? r.rateSd[k] : (rates[k] != null ? rates[k] * 0.5 : null);
    }
    return {
      providerAthleteId: r.providerAthleteId, name: r.name,
      expectedMinutes: r4(mu), minutesSd: r4(sd), starterRate: r.starterRate, basis: r.basis, gamesUsed: r.gamesUsed,
      availability: r.availability, injuryStatus: r.injuryStatus ?? null,
      ratesBasis: hasOwnRates ? "player-window" : "team-pool-fallback",
      rates: Object.fromEntries(STAT_KEYS.map((k) => [k, r4(rates[k])])),
      rateSd: Object.fromEntries(STAT_KEYS.map((k) => [k, r4(rateSd[k])])),
      playRate: r4(playRateOf(r)),
      roleMinutes: r4(r.expectedMinutes),
    };
  });

  return {
    players,
    assumptions: {
      availability: {
        source: minutesResult?.injuriesProvided ? "injuries-feed" : "none (all unknown)",
        rule: "status contains 'Out' → excluded; Day-To-Day and unlisted → simulated at full expected minutes",
        excludedOut: out,
        excludedNoMinutes: noMinutes,
        poolSize: players.length,
      },
      minutes: {
        model: minutesResult?.modelVersion ?? null,
        population: minutesResult?.population ?? null,
        seasonUsed: minutesResult?.seasonUsed ?? null,
        window: { from: minutesResult?.windowFromDateUtc ?? null, to: minutesResult?.windowToDateUtc ?? null, teamGames: minutesResult?.teamGamesInWindow ?? 0 },
        rawPoolMinutes: r2(rawSum),
        rescaleFactor: r4(rescale),
        rescaleBounds: { ...MINUTES_RESCALE_BOUNDS },
        targetTeamMinutes: TEAM_MINUTES,
        scaledPoolMinutes: r2(players.reduce((s, p) => s + p.expectedMinutes, 0)),
        defaultSdSubstitutions,
        poolRateSubstitutions,
        poolRate: Object.fromEntries(STAT_KEYS.map((k) => [k, r4(poolRate[k])])),
        normalisation: { rule: PLAY_RATE_WATER_FILL, power: norm.power, applied: overFull ? "water-fill (over-full pool)" : "uniform bounded (pool at or under 240)", waterFillFactor: filled ? r4(filled.factor) : null, cappedPlayers: filled ? filled.capped : 0 },
        playRateWeightedPoolMinutes: r2(weightedSum),
        expectedTeamMinutes: r2(players.reduce((s, p) => s + p.expectedMinutes * p.playRate, 0)),
        participationRule: "a player's points count toward the team total with probability playRate (own RNG stream); player distributions are conditional on playing",
      },
    },
  };
}

/** Simulate one game with v0.3 sides (same signature and output shape as game-sim.mjs simulateGame). */
export function simulateGameV03({ providerEventId, inputAsOf, neutralSite = false, home, away, eloWinProbability, simulations = DEFAULT_SIMULATIONS, seed = null }) {
  if (!providerEventId) throw new Error("simulateGameV03: providerEventId required");
  if (!Number.isInteger(simulations) || simulations < 1) throw new Error("simulateGameV03: simulations must be a positive integer");
  const seeded = seed != null ? { seed: String(seed), seedPolicy: "explicit" } : seedForGame(providerEventId);
  const rng = mulberry32(seeded.seed);
  const prng = mulberry32(fnv1a32(`${seeded.seed}|participation`));

  const H = prepareRosterV03(home.minutes);
  const A = prepareRosterV03(away.minutes);
  const sides = [H, A];
  const scores = [new Float64Array(simulations), new Float64Array(simulations)];
  const playerStats = sides.map((s) => s.players.map(() => ({ minutes: new Float64Array(simulations), ...Object.fromEntries(STAT_KEYS.map((k) => [k, new Float64Array(simulations)])) })));

  for (let i = 0; i < simulations; i += 1) {
    for (let t = 0; t < 2; t += 1) {
      let teamPts = 0;
      const ps = sides[t].players;
      for (let j = 0; j < ps.length; j += 1) {
        const p = ps[j];
        const m = clamp(p.expectedMinutes + p.minutesSd * normal(rng), 0, MAX_PLAYER_MINUTES);
        playerStats[t][j].minutes[i] = m;
        const plays = prng() < p.playRate;
        for (const k of STAT_KEYS) {
          const base = p.rates[k];
          if (base == null) { playerStats[t][j][k][i] = 0; continue; }
          const rate = Math.max(0, base + (p.rateSd[k] ?? 0) * normal(rng));
          const v = m * rate;
          playerStats[t][j][k][i] = v;
          if (k === "pts" && plays) teamPts += v;
        }
      }
      scores[t][i] = Math.round(teamPts);
    }
  }

  let homeWins = 0, ties = 0;
  const margin = new Float64Array(simulations);
  const total = new Float64Array(simulations);
  for (let i = 0; i < simulations; i += 1) {
    if (scores[0][i] > scores[1][i]) homeWins += 1; else if (scores[0][i] === scores[1][i]) ties += 1;
    margin[i] = scores[0][i] - scores[1][i];
    total[i] = scores[0][i] + scores[1][i];
  }

  const playerOut = (t) => sides[t].players.map((p, j) => ({
    providerAthleteId: p.providerAthleteId, name: p.name,
    expectedMinutes: p.expectedMinutes, minutesSd: p.minutesSd, starterRate: p.starterRate, basis: p.basis, gamesUsed: p.gamesUsed,
    availability: p.availability, injuryStatus: p.injuryStatus, ratesBasis: p.ratesBasis, rates: p.rates,
    playRate: p.playRate, roleMinutes: p.roleMinutes,
    minutes: quantiles(playerStats[t][j].minutes),
    ...Object.fromEntries(STAT_KEYS.map((k) => [k, quantiles(playerStats[t][j][k])])),
    ...Object.fromEntries(Object.entries(COMBO_KEYS).map(([k, parts]) => [k, quantiles(comboDraws(playerStats[t][j], parts, simulations))])),
  }));

  const eloP = Number.isFinite(eloWinProbability) ? eloWinProbability : null;
  return {
    modelVersion: NBA_SIM_V03_MODEL_VERSION,
    providerEventId: String(providerEventId),
    inputAsOf: inputAsOf ?? null,
    simulations,
    seed: seeded.seed,
    seedPolicy: `${seeded.seedPolicy}; participation stream mulberry32(fnv1a32(seed + '|participation'))`,
    neutralSite: neutralSite === true,
    elo: {
      home: home.rating ?? null, away: away.rating ?? null,
      pHome: r4(eloP), pAway: eloP == null ? null : r4(1 - eloP),
    },
    sim: {
      pHome: r4((homeWins + 0.5 * ties) / simulations),
      pAway: r4((simulations - homeWins - 0.5 * ties) / simulations),
      tieMass: r4(ties / simulations),
      tieRule: "regulation ties split 0.5/0.5 (overtime not modelled in v0)",
      home: quantiles(scores[0]), away: quantiles(scores[1]), margin: quantiles(margin), total: quantiles(total),
    },
    eloVsSimGap: eloP == null ? null : r4(((homeWins + 0.5 * ties) / simulations) - eloP),
    players: { home: playerOut(0), away: playerOut(1) },
    assumptions: {
      availability: { home: H.assumptions.availability, away: A.assumptions.availability },
      minutes: { home: H.assumptions.minutes, away: A.assumptions.minutes },
    },
  };
}
