/**
 * NBA experimental game simulation (NBA readiness track N3) — PURE, seeded, deterministic. No I/O.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * One game = team Elo (team-rating.mjs) + expected minutes and per-minute rates (minutes-model.mjs).
 * Each run draws, per available player, minutes ~ Normal(expectedMinutes, minutesSd) clipped to
 * [0, 48] and a per-minute rate ~ Normal(rate, rateSd) floored at 0; the player's stat is
 * minutes × rate; the team score is the sum of its players' points. 10,000 runs by default.
 *
 * DETERMINISM: mulberry32 seeded by fnv1a(providerEventId) — "fixed-per-game" — so the same game
 * re-simulated with the same inputs is byte-identical and a different seed gives a different
 * sample. Every consumed uniform is on the deterministic path (Box–Muller uses both draws).
 *
 * Both winner probabilities are reported side by side — Elo (analytic) and sim (sampled) — and
 * NEVER blended: they disagree by construction whenever the minutes/rates pool is thin, and that
 * disagreement is a diagnostic the grader records, not a number to hide.
 *
 * Every artifact records: modelVersion, inputAsOf, simulations, seed, seedPolicy, availability
 * assumptions (who was excluded and why) and minutes assumptions (raw pool sum, rescale factor,
 * default-sd substitutions, pool-fallback rates).
 */

export const NBA_SIM_MODEL_VERSION = "nba-preseason-experimental-v0";
export const SEED_POLICY = "fixed-per-game: hash(providerEventId)";
export const DEFAULT_SIMULATIONS = 10000;
export const TEAM_MINUTES = 240; // 48 × 5 — regulation only; overtime is not modelled in v0
export const MAX_PLAYER_MINUTES = 48;
export const MINUTES_RESCALE_BOUNDS = Object.freeze({ min: 0.5, max: 1.5 });
export const DEFAULT_MINUTES_SD_RATIO = 0.3; // when a player's window gives no sd (gamesUsed < 2)
const STAT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm"]);

/** 32-bit FNV-1a as 8 hex chars. */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** mulberry32 PRNG from an 8-hex-char seed (or unsigned 32-bit int). */
export function mulberry32(seed) {
  let a = (typeof seed === "number" ? seed : Number.parseInt(String(seed).slice(0, 8), 16)) >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedForGame(providerEventId) {
  return { seed: fnv1a32(String(providerEventId)), seedPolicy: SEED_POLICY };
}

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

/**
 * Turn a minutes-model result into a simulation roster: available players only, minutes rescaled
 * so the team sums to 240 (bounded), per-player sd/rates with explicit fallbacks. Pure.
 */
export function prepareRoster(minutesResult) {
  const rows = Array.isArray(minutesResult?.rows) ? minutesResult.rows : [];
  const out = rows.filter((r) => r.availability === "out").map((r) => ({ providerAthleteId: r.providerAthleteId, name: r.name, injuryStatus: r.injuryStatus }));
  const noMinutes = rows.filter((r) => r.availability !== "out" && r.expectedMinutes == null).map((r) => ({ providerAthleteId: r.providerAthleteId, name: r.name, basis: r.basis, dnpCount: r.dnpCount }));
  const pool = rows.filter((r) => r.availability !== "out" && Number.isFinite(r.expectedMinutes) && r.expectedMinutes > 0);

  const rawSum = pool.reduce((s, r) => s + r.expectedMinutes, 0);
  const rescale = rawSum > 0 ? clamp(TEAM_MINUTES / rawSum, MINUTES_RESCALE_BOUNDS.min, MINUTES_RESCALE_BOUNDS.max) : null;

  // Team-pool fallback rate: minutes-weighted mean over players who have rates.
  const poolRate = {};
  for (const k of STAT_KEYS) {
    const withRate = pool.filter((r) => r.rates && Number.isFinite(r.rates[k]));
    const w = withRate.reduce((s, r) => s + r.expectedMinutes, 0);
    poolRate[k] = w > 0 ? withRate.reduce((s, r) => s + r.rates[k] * r.expectedMinutes, 0) / w : null;
  }

  let defaultSdSubstitutions = 0;
  let poolRateSubstitutions = 0;
  const players = pool.map((r) => {
    const mu = Math.min(MAX_PLAYER_MINUTES, r.expectedMinutes * (rescale ?? 1));
    let sd;
    if (Number.isFinite(r.minutesSd)) sd = r.minutesSd * (rescale ?? 1);
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
      },
    },
  };
}

/**
 * Simulate one game.
 *
 * @param providerEventId  ESPN event id — also the seed source
 * @param home/away        { name, providerTeamId, rating: { rating, games, basis }, minutes: expectedMinutes() result }
 * @param eloWinProbability  P(home) from team-rating.winProbability (analytic; reported, not blended)
 */
export function simulateGame({ providerEventId, inputAsOf, neutralSite = false, home, away, eloWinProbability, simulations = DEFAULT_SIMULATIONS, seed = null }) {
  if (!providerEventId) throw new Error("simulateGame: providerEventId required");
  if (!Number.isInteger(simulations) || simulations < 1) throw new Error("simulateGame: simulations must be a positive integer");
  const seeded = seed != null ? { seed: String(seed), seedPolicy: "explicit" } : seedForGame(providerEventId);
  const rng = mulberry32(seeded.seed);

  const H = prepareRoster(home.minutes);
  const A = prepareRoster(away.minutes);
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
        for (const k of STAT_KEYS) {
          const base = p.rates[k];
          if (base == null) { playerStats[t][j][k][i] = 0; continue; }
          const rate = Math.max(0, base + (p.rateSd[k] ?? 0) * normal(rng));
          const v = m * rate;
          playerStats[t][j][k][i] = v;
          if (k === "pts") teamPts += v;
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
    minutes: quantiles(playerStats[t][j].minutes),
    ...Object.fromEntries(STAT_KEYS.map((k) => [k, quantiles(playerStats[t][j][k])])),
  }));

  const eloP = Number.isFinite(eloWinProbability) ? eloWinProbability : null;
  return {
    modelVersion: NBA_SIM_MODEL_VERSION,
    providerEventId: String(providerEventId),
    inputAsOf: inputAsOf ?? null,
    simulations,
    seed: seeded.seed,
    seedPolicy: seeded.seedPolicy,
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
