/**
 * NBA v0.7 CANDIDATE player simulation. PURE, deterministic, seeded, no I/O.
 * NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * The v0.3 per-draw model and draw order: minutes ~ N(mean, sd) clipped [0, 48], each per-minute rate ~ N(rate, rateSd)
 * floored at 0, stat = minutes × rate, home side first. Same seed for the same event, so a player given the same prepared
 * line draws the same numbers. Player lines only: team scores stay withheld.
 */
import { DEFAULT_SIMULATIONS, MAX_PLAYER_MINUTES, mulberry32, seedForGame } from "./game-sim.mjs";
import { prepareRosterV07, CANDIDATE_STATUS, MINUTES_MODEL_V07_VERSION } from "./minutes-model-v07.mjs";

const STAT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm"]);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => (x == null ? null : Number(x.toFixed(2)));
function normal(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function quantiles(arr) {
  const s = Float64Array.from(arr).sort();
  const n = s.length;
  if (!n) return { p10: null, p50: null, p90: null };
  const at = (q) => s[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
  return { p10: r2(at(0.1)), p50: r2(at(0.5)), p90: r2(at(0.9)) };
}

/** @param prepared { home, away } from prepareRosterV07, or pools via simulatePlayersV07 */
export function simulatePreparedV07({ providerEventId, home, away, simulations = DEFAULT_SIMULATIONS, seed = null }) {
  if (!providerEventId) throw new Error("simulatePreparedV07: providerEventId required");
  if (!Number.isInteger(simulations) || simulations < 1) throw new Error("simulatePreparedV07: simulations must be a positive integer");
  const seeded = seed != null ? { seed: String(seed) } : seedForGame(providerEventId);
  const rng = mulberry32(seeded.seed);
  const sides = [home, away];
  const draws = sides.map((s) => s.players.map(() => ({ minutes: new Float64Array(simulations), ...Object.fromEntries(STAT_KEYS.map((k) => [k, new Float64Array(simulations)])) })));
  for (let i = 0; i < simulations; i += 1) {
    for (let t = 0; t < 2; t += 1) {
      const ps = sides[t].players;
      for (let j = 0; j < ps.length; j += 1) {
        const p = ps[j];
        const m = clamp(p.expectedMinutes + p.minutesSd * normal(rng), 0, MAX_PLAYER_MINUTES);
        draws[t][j].minutes[i] = m;
        for (const k of STAT_KEYS) {
          const base = p.rates[k];
          if (base == null) { draws[t][j][k][i] = 0; continue; }
          const rate = Math.max(0, base + (p.rateSd[k] ?? 0) * normal(rng));
          draws[t][j][k][i] = m * rate;
        }
      }
    }
  }
  const out = (t) => sides[t].players.map((p, j) => ({
    providerAthleteId: p.providerAthleteId, name: p.name, expectedMinutes: p.expectedMinutes, playRate: p.playRate, ratesBasis: p.ratesBasis,
    minutes: quantiles(draws[t][j].minutes),
    ...Object.fromEntries(STAT_KEYS.map((k) => [k, quantiles(draws[t][j][k])])),
  }));
  return { ...CANDIDATE_STATUS, modelVersion: MINUTES_MODEL_V07_VERSION, providerEventId: String(providerEventId), simulations, seed: seeded.seed, teamScores: "WITHHELD", players: { home: out(0), away: out(1) } };
}

export function simulatePlayersV07({ providerEventId, homePool, awayPool, simulations, seed }) {
  return simulatePreparedV07({ providerEventId, home: prepareRosterV07(homePool), away: prepareRosterV07(awayPool), simulations, seed });
}
