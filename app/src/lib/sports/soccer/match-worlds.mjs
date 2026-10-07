/**
 * Soccer coherent match worlds (SW-1) — SHADOW ONLY. Pure: no I/O, no clock, no network.
 *
 * WHAT A WORLD IS. One world is one complete, internally consistent final score (home goals, away goals) drawn
 * from a match's calibrated exact-score matrix — the same normalised grid the model already publishes from
 * (dixon-coles.mjs scoreMatrix; EPL v2 is the ρ = 0 case of the same grid). N worlds (10,000 by default) are a
 * joint empirical distribution: every market read off one world agrees with every other market read off it.
 *
 * WHAT THE WORLDS ARE FOR, AND WHAT THEY ARE NOT FOR (architecture audit Part II, II.0 #3).
 *   · The score matrix is EXACT. 1X2, double chance, totals ladder, team totals, BTTS, clean sheets, margin and
 *     exact score are sums of matrix cells. So is any AND of them ("home win and over 2.5" is a set of cells).
 *     Sampling them adds Monte Carlo noise (≈ ±0.5 pp at 10,000 runs) for no gain. Every scoreline-defined
 *     probability here is therefore PUBLISHED FROM THE MATRIX (basis ANALYTIC_MODEL), and the sampled value
 *     travels beside it only as a convergence check on the sampler.
 *   · The worlds exist as the shared substrate for outcomes the matrix alone cannot express: goals allocated to
 *     players inside each world (SW-3) and same-game parlays that mix a player leg with a team leg (P-2). Those
 *     need the scoreline and the allocation to come from the same world. Until SW-3 exists every leg is
 *     scoreline-defined, so nothing here is ever published from sampling.
 *   · More worlds never repair the model. A biased λ sampled 10,000 times is a precisely estimated bias.
 *
 * DETERMINISM. Worlds are drawn by inverse CDF over the grid's cells (row-major, x = home goals) with mulberry32
 * seeded from an FNV-1a hash of the world-set identity (event id, model id, λ, ρ, runs). The same forecast always
 * yields the same worlds, byte for byte, and `worldSetId` names that set so a later receipt can cite it.
 *
 * CONVERGENCE (Yash §4). Monte Carlo standard error of a share is √(p(1−p)/N). A check passes when every
 * sampled share sits within Z_MAX standard errors of its exact value. Separately, the standard error is compared
 * with a tolerance (0.5 pp for a single leg, 0.3 pp for a joint) and `requiredRuns` says how many worlds that
 * tolerance would need — reported, never silently applied, because no worlds-based number is published yet.
 */
import { mulberry32 } from "./dixon-coles-shadow-record.mjs";

export const MATCH_WORLDS_VERSION = "soccer-match-worlds-v1";
export const MATCH_WORLDS_DEFAULTS = Object.freeze({
  runs: 10_000,
  zMax: 4, // |sampled − exact| ≤ 4·SE; a correct sampler fails one share in ~16,000 by chance
  toleranceSingle: 0.005, // 0.5 pp MC standard error for a single leg (audit II.C)
  toleranceJoint: 0.003, // 0.3 pp for a joint leg
  massTolerance: 1e-9, // the grid must already be normalised
});

/** FNV-1a 32-bit over a string — a stable seed from the world-set identity. */
export function fnv1a32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Refuses a grid that is not a normalised, non-negative square matrix — a caller's bug is not a forecast. */
export function assertGrid(grid, { massTolerance = MATCH_WORLDS_DEFAULTS.massTolerance } = {}) {
  if (!Array.isArray(grid) || !grid.length) throw new Error("match-worlds: grid must be a non-empty matrix");
  const n = grid.length;
  let mass = 0;
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== n) throw new Error("match-worlds: grid must be square (0..maxGoals per side)");
    for (const p of row) {
      if (!(Number.isFinite(p) && p >= 0)) throw new Error("match-worlds: every cell must be a finite probability ≥ 0");
      mass += p;
    }
  }
  if (Math.abs(mass - 1) > massTolerance) throw new Error(`match-worlds: grid mass ${mass} is not 1 — refuse rather than renormalise a caller's grid`);
  return n - 1;
}

/** The identity a world set is named and seeded by. Changing any field is a different world set. */
export function worldSetIdentity({ eventId, modelId, lambdas, rho = 0, runs }) {
  if (!eventId || !modelId) throw new Error("match-worlds: eventId and modelId are required to name a world set");
  return `${MATCH_WORLDS_VERSION}|${modelId}|${eventId}|${lambdas?.home}|${lambdas?.away}|${rho}|${runs}`;
}

/**
 * Draw `runs` worlds from an exact-score grid. Returns typed arrays of home and away goals, one entry per world.
 * `seed` is required: an unseeded world set cannot be cited or reproduced.
 */
export function sampleWorlds(grid, { runs = MATCH_WORLDS_DEFAULTS.runs, seed } = {}) {
  const maxGoals = assertGrid(grid);
  if (!(Number.isInteger(runs) && runs > 0)) throw new Error("match-worlds: runs must be a positive integer");
  if (!Number.isInteger(seed)) throw new Error("match-worlds: an integer seed is required");
  const side = maxGoals + 1;
  const cdf = new Float64Array(side * side);
  let c = 0;
  for (let x = 0; x <= maxGoals; x++) for (let y = 0; y <= maxGoals; y++) { c += grid[x][y]; cdf[x * side + y] = c; }
  const last = cdf.length - 1;
  const rnd = mulberry32(seed);
  const home = new Uint8Array(runs), away = new Uint8Array(runs);
  for (let i = 0; i < runs; i++) {
    const u = rnd() * c; // scale by the realised sum so float residue never strands a draw past the last cell
    let lo = 0, hi = last;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] > u) hi = mid; else lo = mid + 1; }
    home[i] = Math.floor(lo / side);
    away[i] = lo % side;
  }
  return { home, away, runs, maxGoals };
}

/**
 * Scoreline-defined legs. Each is a pure predicate of (home goals, away goals), so its probability — and any AND
 * of them — is an exact cell sum. Vocabulary is closed on purpose: an unknown leg is refused, never guessed.
 *   { market: "result", side: "home"|"draw"|"away" }
 *   { market: "doubleChance", side: "homeOrDraw"|"drawOrAway"|"homeOrAway" }
 *   { market: "total", side: "over"|"under", line }            line must be a half-goal (x.5)
 *   { market: "teamTotal", team: "home"|"away", side: "over"|"under", line }
 *   { market: "btts", side: "yes"|"no" }
 *   { market: "cleanSheet", team: "home"|"away" }
 *   { market: "margin", side: "home"|"away", atLeast }         winning margin ≥ atLeast (integer ≥ 1)
 *   { market: "exactScore", home, away }
 */
export function legPredicate(leg) {
  const halfLine = (l) => Number.isFinite(l) && Math.abs(l - Math.floor(l) - 0.5) < 1e-9 && l > 0;
  switch (leg?.market) {
    case "result":
      if (leg.side === "home") return (x, y) => x > y;
      if (leg.side === "draw") return (x, y) => x === y;
      if (leg.side === "away") return (x, y) => x < y;
      break;
    case "doubleChance":
      if (leg.side === "homeOrDraw") return (x, y) => x >= y;
      if (leg.side === "drawOrAway") return (x, y) => x <= y;
      if (leg.side === "homeOrAway") return (x, y) => x !== y;
      break;
    case "total":
      if (!halfLine(leg.line)) break;
      if (leg.side === "over") return (x, y) => x + y > leg.line;
      if (leg.side === "under") return (x, y) => x + y < leg.line;
      break;
    case "teamTotal": {
      if (!halfLine(leg.line) || !["home", "away"].includes(leg.team)) break;
      const g = leg.team === "home" ? (x) => x : (_x, y) => y;
      if (leg.side === "over") return (x, y) => g(x, y) > leg.line;
      if (leg.side === "under") return (x, y) => g(x, y) < leg.line;
      break;
    }
    case "btts":
      if (leg.side === "yes") return (x, y) => x > 0 && y > 0;
      if (leg.side === "no") return (x, y) => x === 0 || y === 0;
      break;
    case "cleanSheet":
      if (leg.team === "home") return (_x, y) => y === 0;
      if (leg.team === "away") return (x) => x === 0;
      break;
    case "margin":
      if (!(Number.isInteger(leg.atLeast) && leg.atLeast >= 1)) break;
      if (leg.side === "home") return (x, y) => x - y >= leg.atLeast;
      if (leg.side === "away") return (x, y) => y - x >= leg.atLeast;
      break;
    case "exactScore":
      if (Number.isInteger(leg.home) && Number.isInteger(leg.away) && leg.home >= 0 && leg.away >= 0) return (x, y) => x === leg.home && y === leg.away;
      break;
    default:
      break;
  }
  throw new Error(`match-worlds: unsupported leg ${JSON.stringify(leg)}`);
}

export const legLabel = (leg) => [leg.market, leg.team, leg.side, leg.line, leg.atLeast, leg.home != null && leg.market === "exactScore" ? `${leg.home}-${leg.away}` : null].filter((v) => v != null).join(":");

const andOf = (legs) => {
  if (!Array.isArray(legs) || !legs.length) throw new Error("match-worlds: at least one leg is required");
  const preds = legs.map(legPredicate);
  return (x, y) => preds.every((p) => p(x, y));
};

/** Exact probability of an AND of legs: the sum of the grid cells where every leg holds. */
export function exactProbability(grid, legs) {
  const maxGoals = assertGrid(grid);
  const pred = andOf(legs);
  let p = 0;
  for (let x = 0; x <= maxGoals; x++) for (let y = 0; y <= maxGoals; y++) if (pred(x, y)) p += grid[x][y];
  return Math.min(1, p);
}

/** Share of worlds where every leg holds (a count, so same-game joints come from the same worlds). */
export function sampledProbability(worlds, legs) {
  const pred = andOf(legs);
  let hits = 0;
  for (let i = 0; i < worlds.runs; i++) if (pred(worlds.home[i], worlds.away[i])) hits += 1;
  return { hits, runs: worlds.runs, p: hits / worlds.runs };
}

/** MC standard error of a share, and the runs a tolerance would need at that p. */
export const mcStandardError = (p, runs) => Math.sqrt(Math.max(p * (1 - p), 0) / runs);
export const runsForTolerance = (p, tolerance) => Math.ceil(Math.max(p * (1 - p), 0) / (tolerance * tolerance));

/**
 * One query, both ways. `probability` is ALWAYS the exact value (basis ANALYTIC_MODEL): every leg here is
 * scoreline-defined. The sampled share is attached as the convergence check, with its z-score against exact.
 */
export function queryJoint({ grid, worlds, legs, options = {} }) {
  const o = { ...MATCH_WORLDS_DEFAULTS, ...options };
  const exact = exactProbability(grid, legs);
  const s = sampledProbability(worlds, legs);
  const se = mcStandardError(exact, s.runs);
  const diff = s.p - exact;
  const z = se > 0 ? diff / se : (diff === 0 ? 0 : Infinity);
  const tolerance = legs.length > 1 ? o.toleranceJoint : o.toleranceSingle;
  return {
    legs: legs.map(legLabel),
    probability: exact,
    basis: "ANALYTIC_MODEL",
    sampled: { p: s.p, hits: s.hits, runs: s.runs },
    convergence: {
      diff,
      mcStdError: se,
      z,
      withinNoise: Math.abs(z) <= o.zMax,
      tolerance,
      withinTolerance: se <= tolerance,
      requiredRuns: runsForTolerance(exact, tolerance),
    },
  };
}

/** The standard single-leg markets every match is checked on, plus a few same-game joints. */
export const STANDARD_SINGLE_LEGS = Object.freeze([
  { market: "result", side: "home" }, { market: "result", side: "draw" }, { market: "result", side: "away" },
  { market: "doubleChance", side: "homeOrDraw" }, { market: "doubleChance", side: "drawOrAway" }, { market: "doubleChance", side: "homeOrAway" },
  ...[0.5, 1.5, 2.5, 3.5, 4.5].map((line) => ({ market: "total", side: "over", line })),
  { market: "teamTotal", team: "home", side: "over", line: 0.5 }, { market: "teamTotal", team: "home", side: "over", line: 1.5 },
  { market: "teamTotal", team: "away", side: "over", line: 0.5 }, { market: "teamTotal", team: "away", side: "over", line: 1.5 },
  { market: "btts", side: "yes" },
  { market: "cleanSheet", team: "home" }, { market: "cleanSheet", team: "away" },
  { market: "margin", side: "home", atLeast: 2 }, { market: "margin", side: "away", atLeast: 2 },
  { market: "exactScore", home: 1, away: 1 }, { market: "exactScore", home: 0, away: 0 },
].map(Object.freeze));

export const STANDARD_JOINTS = Object.freeze([
  [{ market: "result", side: "home" }, { market: "total", side: "over", line: 2.5 }],
  [{ market: "result", side: "away" }, { market: "total", side: "over", line: 2.5 }],
  [{ market: "result", side: "draw" }, { market: "total", side: "under", line: 2.5 }],
  [{ market: "btts", side: "yes" }, { market: "total", side: "over", line: 2.5 }],
  [{ market: "result", side: "home" }, { market: "btts", side: "yes" }],
  [{ market: "doubleChance", side: "homeOrDraw" }, { market: "total", side: "under", line: 3.5 }],
].map((legs) => Object.freeze(legs.map(Object.freeze))));

/**
 * Build one match's world set and its convergence report. `grid` is the forecast's normalised exact-score
 * matrix; λ and ρ identify it. The report keeps no per-world arrays — the world set is reproducible from
 * `worldSetId` inputs — but `worlds` is returned for in-process consumers (SW-3, P-2).
 */
export function buildMatchWorlds({ eventId, modelId, lambdas, rho = 0, grid, runs = MATCH_WORLDS_DEFAULTS.runs, options = {} }) {
  const identity = worldSetIdentity({ eventId, modelId, lambdas, rho, runs });
  const seed = fnv1a32(identity);
  const worlds = sampleWorlds(grid, { runs, seed });
  const singles = STANDARD_SINGLE_LEGS.map((leg) => queryJoint({ grid, worlds, legs: [leg], options }));
  const joints = STANDARD_JOINTS.map((legs) => queryJoint({ grid, worlds, legs, options }));
  const all = [...singles, ...joints];
  const maxAbsZ = Math.max(...all.map((q) => Math.abs(q.convergence.z)));
  const maxAbsDiff = Math.max(...all.map((q) => Math.abs(q.convergence.diff)));
  let meanHome = 0, meanAway = 0;
  for (let i = 0; i < runs; i++) { meanHome += worlds.home[i]; meanAway += worlds.away[i]; }
  return {
    worldSetId: `${MATCH_WORLDS_VERSION}:${seed.toString(16).padStart(8, "0")}`,
    identity,
    seed,
    runs,
    worlds,
    summary: {
      sampledMeanGoals: { home: meanHome / runs, away: meanAway / runs },
      singles,
      joints,
      convergence: {
        checks: all.length,
        maxAbsDiff,
        maxAbsZ,
        withinNoise: all.every((q) => q.convergence.withinNoise),
        singlesWithinTolerance: singles.every((q) => q.convergence.withinTolerance),
        jointsWithinTolerance: joints.every((q) => q.convergence.withinTolerance),
        maxRequiredRunsJoint: Math.max(...joints.map((q) => q.convergence.requiredRuns)),
      },
    },
  };
}
