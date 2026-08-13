/**
 * NFL joint team-score simulation (Program 169 · Release C). PRIVATE.
 *
 * A JOINT home/away score distribution — never two independent point estimates — built on the
 * replay-validated v1 heads (P167-E): margin ~ Normal(a·d, σ_m), total ~ Normal(μ_t, σ_t), with
 * scores derived jointly as home=(T+M)/2, away=(T−M)/2 so margin/total covariance is preserved by
 * construction (their independence from each other is the v1 assumption, stated on the card).
 *
 * DETERMINISM: mulberry32 PRNG seeded from fnv1a(modelId :: canonicalEventId :: artifactDate).
 * Same inputs → identical bytes for every user; there is no per-user reroll surface.
 *
 * SCORING SUPPORT: integer, non-negative, with the impossible 1-point team score snapped to 0.
 * Football key-number clustering (3/7) is NOT modeled — a documented limitation, not a hidden one.
 *
 * VARIANTS (the preseason gate the charter demands):
 *   REGULAR                 the v1 fit as evaluated (train 23-24, held-out 2025)
 *   PRESEASON_CONSERVATIVE  margin signal SHRUNK toward zero (starter/role uncertainty destroys
 *                           most of the regular-season Elo edge) and both σ widened. The shrink
 *                           factor is fit on 2023-24 preseason and tested on 2025 preseason by
 *                           evaluate-nfl-gamesim-v1.mjs — never chosen by taste. Outputs carry
 *                           evidenceTier: REDUCED_PRESEASON and remain RESEARCH_ONLY/private.
 *
 * CONVERGENCE is measured, not assumed: the run reports the split-half win-probability gap and
 * the binomial SE at n; callers may demand tighter n but may not silently trust an unmeasured one.
 */
import { fnv1a } from "../research/replay-runner.mjs";
import { ELO_PARAMS } from "./strength-state.mjs";

export const NFL_GAMESIM_VERSION = 1;
export const NFL_GAMESIM_ID = "nfl-gamesim-v1-joint-normal";

/**
 * Preseason variant parameters — the margin shrink is FIT on 2023-24 preseason (grid search,
 * evaluate-nfl-gamesim-v1.mjs; committed receipt), never taste. The 2025 preseason test shows
 * even the shrunk signal sits at ~coin (logLoss 0.6995 vs 0.6931, n=45): preseason win skill is
 * ≈ZERO and is stated as such — the variant's value is honest score-interval WIDTH, not picks.
 */
export const PRESEASON_VARIANT = Object.freeze({ marginShrink: 0.2, sigmaWiden: 1.25, evidenceTier: "REDUCED_PRESEASON" });

export function mulberry32(seedHex) {
  let a = Number.parseInt(String(seedHex).slice(0, 8), 16) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const normalPair = (rng) => {
  // Box–Muller; both draws used — determinism counts every consumed uniform.
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
};

/** Snap a continuous team score to the legal integer support (≥0, never exactly 1). */
export const snapScore = (x) => {
  const s = Math.max(0, Math.round(x));
  return s === 1 ? 0 : s;
};

/**
 * Run the joint simulation for one event.
 * @param {object} p
 * @param {object} p.fit             fitNflV1 output (frozen heads)
 * @param {object} p.strengthState   strengthStateAt output (cutoff-versioned)
 * @param {object} p.event           { providerEventId, home, away, seasonType, dateUtc }
 * @param {string} p.artifactDate    the artifact's date stamp (part of the seed — daily artifacts differ, intraday reruns don't)
 * @param {number} [p.runs]
 * @param {object|null} [p.lines]    optional { spread (home line, e.g. -3.5), total } for cover/over probabilities
 */
export function simulateNflGame({ fit, strengthState, event, artifactDate, runs = 10_000, lines = null }) {
  const home = typeof event?.home === "string" ? event.home : event?.home?.abbr ?? event?.home?.name;
  const away = typeof event?.away === "string" ? event.away : event?.away?.abbr ?? event?.away?.name;
  if (!home || !away) return { state: "ABSTAIN", reason: "participants unresolved — identity is never guessed" };
  if (!event?.providerEventId || !artifactDate) return { state: "ABSTAIN", reason: "event id and artifactDate are mandatory seed components — an unseedable simulation is a nondeterminism defect" };

  const seasonType = event?.seasonType ?? null;
  const preseason = seasonType === 1;
  const variant = preseason ? "PRESEASON_CONSERVATIVE" : "REGULAR";

  const d = strengthState.ratingFor(home) + ELO_PARAMS.HOME_ADVANTAGE - strengthState.ratingFor(away);
  const shrink = preseason ? PRESEASON_VARIANT.marginShrink : 1;
  const widen = preseason ? PRESEASON_VARIANT.sigmaWiden : 1;
  const marginMean = fit.params.marginSlope * d * shrink;
  const sigmaM = fit.params.sigmaMargin * widen;
  const sigmaT = fit.params.sigmaTotal * widen;

  const seed = fnv1a(`${NFL_GAMESIM_ID}::${event.providerEventId}::${artifactDate}::${variant}`);
  const rng = mulberry32(seed);

  let homeWins = 0, ties = 0, halfAWins = 0;
  let coverHome = 0, coverPush = 0, overHits = 0, overPush = 0;
  const homeScores = [];
  const awayScores = [];
  const bandCounts = new Map();
  for (let i = 0; i < runs; i++) {
    const [z1, z2] = normalPair(rng);
    const margin = marginMean + sigmaM * z1;
    const total = Math.max(2, fit.params.muTotal + sigmaT * z2);
    const h = snapScore((total + margin) / 2);
    const a = snapScore((total - margin) / 2);
    homeScores.push(h);
    awayScores.push(a);
    if (h > a) { homeWins += 1; if (i < runs / 2) halfAWins += 1; }
    else if (h === a) ties += 1;
    if (lines?.spread != null) {
      const adj = h + lines.spread - a; // home line: h + spread vs a
      if (adj > 0) coverHome += 1; else if (adj === 0) coverPush += 1;
    }
    if (lines?.total != null) {
      const t = h + a;
      if (t > lines.total) overHits += 1; else if (t === lines.total) overPush += 1;
    }
    const band = `${Math.floor(h / 7) * 7}-${Math.floor(a / 7) * 7}`;
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
  }

  const sorted = (xs) => [...xs].sort((x, y) => x - y);
  const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const quantiles = (xs) => { const s = sorted(xs); return { p10: q(s, 0.1), p25: q(s, 0.25), p50: q(s, 0.5), p75: q(s, 0.75), p90: q(s, 0.9) }; };
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

  // WIN HEAD RULE: the reported win probability comes from the REPLAY-VALIDATED head — the Elo
  // logistic (P167-E: held-out logLoss 0.6478), preseason-shrunk under the variant — never from
  // the margin-draw frequency. A linear-Gaussian margin cannot reproduce a logistic, so the two
  // heads DISAGREE by construction; the score-implied rate ships as a visible diagnostic instead
  // of silently replacing the validated model (found by this release's own evaluation).
  const pTie = ties / runs;
  const analyticHome = 1 / (1 + 10 ** (-(d * shrink) / 400));
  const pHome = analyticHome * (1 - pTie);
  const scoreImpliedHome = homeWins / runs;
  const halfGap = Math.abs(halfAWins / (runs / 2) - (homeWins - halfAWins) / (runs / 2));
  const se = Math.sqrt((scoreImpliedHome * (1 - scoreImpliedHome)) / runs);

  const bands = [...bandCounts.entries()].map(([k, n]) => ({ band: k, p: Number((n / runs).toFixed(4)) })).sort((x, y) => y.p - x.p).slice(0, 5);

  return {
    state: "SIMULATED",
    simId: NFL_GAMESIM_ID,
    version: NFL_GAMESIM_VERSION,
    variant,
    evidenceTier: preseason ? PRESEASON_VARIANT.evidenceTier : "REGULAR_SEASON_FIT",
    deterministicSeed: seed,
    runs,
    matchup: `${away} @ ${home}`,
    features: { eloDiffEffective: Number(d.toFixed(2)), marginMean: Number(marginMean.toFixed(2)), sigmaMargin: Number(sigmaM.toFixed(2)), muTotal: fit.params.muTotal, sigmaTotal: Number(sigmaT.toFixed(2)), strengthCutoffIso: strengthState.cutoffIso },
    winProbability: { home: Number(pHome.toFixed(4)), away: Number((1 - pHome - pTie).toFixed(4)), tie: Number(pTie.toFixed(4)), head: "elo-logistic (replay-validated); tie mass from the score simulation" },
    scoreImpliedWinDiagnostic: { home: Number(scoreImpliedHome.toFixed(4)), headAgreementGap: Number(Math.abs(scoreImpliedHome - pHome).toFixed(4)), note: "margin-probit vs elo-logistic divergence — visible by design, never silently substituted" },
    convergence: { splitHalfGap: Number(halfGap.toFixed(4)), binomialSE: Number(se.toFixed(4)), note: "split halves of the same deterministic stream; SE at n — demand more runs if either exceeds your tolerance" },
    scores: {
      home: { mean: Number(mean(homeScores).toFixed(2)), quantiles: quantiles(homeScores) },
      away: { mean: Number(mean(awayScores).toFixed(2)), quantiles: quantiles(awayScores) },
      topBands: bands,
      support: "integer, non-negative, 1 snapped to 0 — key-number clustering (3/7) NOT modeled (documented limitation)",
    },
    ...(lines?.spread != null ? { spreadCover: { line: lines.spread, home: Number((coverHome / runs).toFixed(4)), push: Number((coverPush / runs).toFixed(4)) } } : {}),
    ...(lines?.total != null ? { totalOver: { line: lines.total, over: Number((overHits / runs).toFixed(4)), push: Number((overPush / runs).toFixed(4)) } } : {}),
    publicActivation: "OFF",
  };
}
