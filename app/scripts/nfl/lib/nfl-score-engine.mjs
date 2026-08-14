/**
 * NFL FULL-GAME SCORE ENGINE — 10,000 complete football games per matchup.
 *
 * WHY THIS EXISTS. The public NFL report could not answer the first question anyone asks a
 * simulator: what is the score going to be. It showed a player-prop board and then said
 * "full-game score: not simulated". MLB answers that question from a true full-game Monte Carlo,
 * and NFL now answers it the same way, from the same kind of engine.
 *
 * WHY IT IS NOT A GAUSSIAN. An earlier attempt drew a margin and a total from normals and rendered
 * scores like 19-18 — a scoreline football does not produce. Football scores are lumpy: they are
 * sums of 7s and 3s. This engine therefore simulates SCORING EVENTS, so 17-13 and 24-20 fall out
 * naturally and key numbers (3, 7, 10, 14) get their real mass.
 *
 * ── WHAT IS MEASURED, AND WHAT IS FITTED ────────────────────────────────────────────────────────
 * MEASURED, from 146 preseason games in data/internal/research/nfl/corpus-v1.json:
 *     team points   19.27 ± 8.69      total 38.54 ± 10.87      margin (home) −0.01 ± 13.56
 * Note the home number: preseason home-field advantage is measurably ZERO (−0.01 points), which is
 * why this engine applies none.
 *
 * FITTED LATENT PARAMETERS (below). These are NOT measured drive data — we have no drive-level
 * corpus, and inventing one is the failure mode this file is written to avoid. `SCORING_CHANCES` is
 * a latent count of scoring opportunities chosen so the model reproduces the measured final-score
 * moments; it is deliberately NOT called a drive count, because it is not one.
 *
 * ── THE ONE STRUCTURAL FINDING ──────────────────────────────────────────────────────────────────
 * Two independent measured moments imply the same correlation between the two teams' scores:
 *     from the total  : ρ = (10.87² / 2) / 8.69² − 1 = −0.218
 *     from the margin : 1 − (13.56² / 2) / 8.69²     = −0.218
 * Agreeing to three decimals from different statistics is not a coincidence — preseason team scores
 * are genuinely negatively correlated (one side pulling away suppresses the other: clock, starters
 * out, conservative play). Independent-team models get this wrong in BOTH directions at once —
 * margins too narrow and totals too wide. P180 flagged the narrow-margin half of that as a real
 * defect. `GAME_FLOW_KAPPA` is a zero-sum flow term that reproduces it.
 *
 * VALIDATION (scripts/nfl/validate-nfl-score-engine.mjs, re-run in the suite):
 *   team 19.35 ± 8.70 · total ± 11.02 · margin ± 13.46 · 9 of the top 10 modal scores match
 *   total-variation distance to the empirical score distribution 0.163, against a NOISE FLOOR of
 *   0.258 (the distance the 146-game sample has to itself under resampling) — the model fits the
 *   measured distribution more closely than the sample fits itself.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────────
 * It is not a validated edge. Three separate NFL preseason team-strength models were REJECTED on
 * pre-declared bars (P178, P181, P183), so this engine carries NO team-strength rating and NO home
 * advantage. Both sides start from the identical measured league baseline, and the only asymmetry
 * comes from each team's own simulated participants. A near-even preseason win probability is the
 * honest answer, not a broken one — publishing a simulation is not claiming an advantage over the
 * market, exactly as the MLB report states of itself.
 */

/** Deterministic RNG — same inputs, same artifact, forever. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Box–Muller, for the game-flow factor only. */
function normal(rng) {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * Frozen constants. Fitted jointly to the four measured preseason moments above; see the header for
 * what is measured and what is latent. Changing any of these invalidates the recorded validation,
 * so the validator re-derives the moments from the corpus on every suite run rather than trusting
 * this comment.
 */
export const SCORING = Object.freeze({
  /** Latent scoring opportunities per team per game. NOT a measured drive count. */
  SCORING_CHANCES: 7,
  /** P(a scoring chance ends in a touchdown). */
  P_TD: 0.294,
  /** P(a scoring chance ends in a field goal). */
  P_FG: 0.234,
  /** Zero-sum game-flow factor reproducing the measured ρ = −0.218 between team scores. */
  GAME_FLOW_KAPPA: 0.2,
  /** Conversion after a touchdown — league rates, applied as measured. */
  P_XP_GOOD: 0.94,
  P_TWO_POINT_GOOD: 0.035,
  /** Safety rate per team-game. */
  P_SAFETY: 0.008,
  MODEL_VERSION: "nfl-full-game-v1-scoring-events",
});

/**
 * Simulate ONE team's points for ONE game.
 * `flowMult` is the zero-sum game-flow multiplier; `rosterMult` is the bounded roster-derived
 * modifier (see `rosterModifier`).
 */
function simulateTeamPoints(rng, flowMult, rosterMult) {
  const m = flowMult * rosterMult;
  const pTd = Math.max(0.01, Math.min(0.75, SCORING.P_TD * m));
  const pFg = Math.max(0.01, Math.min(0.75, SCORING.P_FG * m));
  let td = 0;
  let fg = 0;
  for (let i = 0; i < SCORING.SCORING_CHANCES; i += 1) {
    const u = rng();
    if (u < pTd) td += 1;
    else if (u < pTd + pFg) fg += 1;
  }
  let points = 6 * td + 3 * fg;
  for (let i = 0; i < td; i += 1) {
    const u = rng();
    if (u < SCORING.P_XP_GOOD) points += 1;
    else if (u < SCORING.P_XP_GOOD + SCORING.P_TWO_POINT_GOOD) points += 2;
  }
  if (rng() < SCORING.P_SAFETY) points += 2;
  return { points, touchdowns: td, fieldGoals: fg };
}

/**
 * Bounded roster-derived rate modifier. The ONLY source of asymmetry between the two teams.
 *
 * It is deliberately weak. Three preseason team-strength models were rejected, so this does not
 * attempt to rate teams; it only lets a team whose projected participants generate more simulated
 * offence score slightly more often. Shrunk by half and hard-clamped to ±12%, which at the measured
 * baseline moves a team by at most ~2.3 points — smaller than the ±8.69 game-to-game noise, so it
 * can never manufacture a confident-looking edge out of roster composition.
 */
export function rosterModifier(teamProjectedPoints, leagueBaseline) {
  if (!Number.isFinite(teamProjectedPoints) || !Number.isFinite(leagueBaseline) || leagueBaseline <= 0) {
    return { multiplier: 1, applied: false, reason: "no roster projection available — league baseline used" };
  }
  const raw = teamProjectedPoints / leagueBaseline;
  const shrunk = 1 + 0.5 * (raw - 1);
  const clamped = Math.max(0.88, Math.min(1.12, shrunk));
  return {
    multiplier: clamped,
    applied: true,
    raw,
    reason: clamped !== shrunk ? "roster signal clamped at the ±12% bound" : "roster-derived, shrunk 50%",
  };
}

/**
 * Run the full-game simulation for one matchup.
 * Returns every game-level output the report needs, all read off the SAME simulated games —
 * win probability, score distribution, margin, total, spread cover and overtime all come from one
 * universe, which is the property that makes the numbers mutually consistent.
 */
export function simulateFullGame({ gameId, awayTeam, homeTeam, runs = 10000, awayRosterMult = 1, homeRosterMult = 1 }) {
  const rng = mulberry32(fnv1a(`${SCORING.MODEL_VERSION}|${gameId}|${awayTeam}|${homeTeam}`));
  const away = [];
  const home = [];
  const margins = [];
  const totals = [];
  const scorePairs = new Map();
  let awayWins = 0;
  let homeWins = 0;
  let regulationTies = 0;
  let awayTd = 0;
  let homeTd = 0;
  let awayFg = 0;
  let homeFg = 0;

  for (let i = 0; i < runs; i += 1) {
    const z = normal(rng);
    const a = simulateTeamPoints(rng, 1 + SCORING.GAME_FLOW_KAPPA * z, awayRosterMult);
    const h = simulateTeamPoints(rng, 1 - SCORING.GAME_FLOW_KAPPA * z, homeRosterMult);
    let ap = a.points;
    let hp = h.points;
    awayTd += a.touchdowns; homeTd += h.touchdowns;
    awayFg += a.fieldGoals; homeFg += h.fieldGoals;

    if (ap === hp) {
      regulationTies += 1;
      // Preseason overtime: one 10-minute period, and a tie is a legal final result. Resolve the
      // tied games the way the rules do rather than forcing a winner.
      const r = rng();
      if (r < 0.42) hp += 3;
      else if (r < 0.84) ap += 3;
      // remaining ~16% stand as a tie
    }
    away.push(ap);
    home.push(hp);
    margins.push(hp - ap);
    totals.push(ap + hp);
    if (hp > ap) homeWins += 1;
    else if (ap > hp) awayWins += 1;
    const key = `${ap}-${hp}`;
    scorePairs.set(key, (scorePairs.get(key) ?? 0) + 1);
  }

  const summary = (arr) => {
    const s = [...arr].sort((x, y) => x - y);
    const at = (q) => s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))];
    return {
      mean: round1(arr.reduce((t, v) => t + v, 0) / arr.length),
      median: at(0.5),
      p10: at(0.1),
      p90: at(0.9),
    };
  };
  const bins = (arr) => {
    const counts = new Map();
    for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([value, count]) => ({ value, label: String(value), count, probability: count / arr.length }));
  };

  const finalScores = [...scorePairs.entries()]
    .map(([k, count]) => {
      const [a, h] = k.split("-").map(Number);
      return { away: a, home: h, probability: count / runs };
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 6);

  const coverAt = (line) => ({
    line,
    homeCover: margins.filter((m) => m > line).length / runs,
    awayCover: margins.filter((m) => -m > line).length / runs,
  });

  const teamTotalAt = (arr, line) => ({
    line,
    over: arr.filter((v) => v > line).length / runs,
    under: arr.filter((v) => v < line).length / runs,
  });

  const KEY_NUMBERS = [3, 7, 10, 14];
  const ties = margins.filter((m) => m === 0).length;

  return {
    runCount: runs,
    winProbability: { away: awayWins / runs, home: homeWins / runs, tie: ties / runs },
    teamScore: { away: summary(away), home: summary(home) },
    totalScore: { ...summary(totals), distribution: bins(totals) },
    scoreDifferential: { ...summary(margins), distribution: bins(margins) },
    spread: [1.5, 2.5, 3.5, 6.5, 7.5, 10.5].map(coverAt),
    teamTotals: {
      away: [17.5, 20.5, 23.5].map((l) => teamTotalAt(away, l)),
      home: [17.5, 20.5, 23.5].map((l) => teamTotalAt(home, l)),
    },
    finalScores,
    /** Share of simulated games decided by exactly a key number — football's real margin clustering. */
    keyNumbers: {
      numbers: KEY_NUMBERS,
      share: margins.filter((m) => KEY_NUMBERS.includes(Math.abs(m))).length / runs,
      byNumber: KEY_NUMBERS.map((n) => ({
        number: n,
        probability: margins.filter((m) => Math.abs(m) === n).length / runs,
      })),
    },
    overtimeProbability: regulationTies / runs,
    tieProbability: ties / runs,
    scoringRates: {
      awayTouchdowns: round1(awayTd / runs),
      homeTouchdowns: round1(homeTd / runs),
      awayFieldGoals: round1(awayFg / runs),
      homeFieldGoals: round1(homeFg / runs),
    },
  };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * Factual sentences generated ONLY from the simulated fields above — no adjectives the numbers do
 * not support, and never a recommendation.
 */
export function buildGameStory(sim, awayCode, homeCode) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  const top = sim.finalScores[0];
  const out = [];
  const leader = sim.winProbability.home >= sim.winProbability.away ? homeCode : awayCode;
  const lead = Math.max(sim.winProbability.home, sim.winProbability.away);
  out.push(`${leader} wins ${pct(lead)} of simulations.`);
  if (top) {
    out.push(`Most common final score: ${awayCode} ${top.away} – ${homeCode} ${top.home} (${Math.round(top.probability * sim.runCount)} / ${sim.runCount.toLocaleString()} simulations).`);
  }
  out.push(`Median simulated total is ${sim.totalScore.median} points, with the middle 80% between ${sim.totalScore.p10} and ${sim.totalScore.p90}.`);
  out.push(`${pct(sim.keyNumbers.share)} of simulations are decided by exactly 3, 7, 10 or 14 points — football's margins cluster on those numbers.`);
  if (lead < 0.56) {
    out.push(`This is close to a coin flip, which is the expected shape of a preseason game: no team-strength rating is applied because none has passed validation.`);
  }
  return out;
}
