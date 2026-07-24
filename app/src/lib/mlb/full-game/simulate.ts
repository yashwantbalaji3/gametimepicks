/**
 * FULL-GAME AGGREGATION (Sprint 008 · Phase 2.3 + Phase 4). Runs N COMPLETE games through the engine and
 * derives every consumer output FROM THE SIMULATED GAMES: win probability, per-team + total run
 * distributions, run differential, run-line cover probabilities (from simulated margins — never the market),
 * team totals, most-frequent final scores, extra-innings rate, and simulated box-score aggregates. A
 * deterministic seeded stream per game guarantees the artifact reproduces for the same board.
 */

import { SeededRng, stableHash } from "../../game-simulations/rng";
import { simulateGame, type GameResult } from "./engine";
import type {
  DistributionSummary,
  FinalScore,
  FullGameSimGame,
  GameInput,
  RunLineProb,
  SimBatterLine,
  SimBin,
  SimPitcherLine,
  TeamTotalProb,
} from "./types";

export interface SimulateOptions {
  runCount: number;
  modelVersion: string;
  simulationVersion: number;
  generatedAt: string;
}

const pctl = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
};

const summarize = (values: number[]): DistributionSummary => {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  return {
    mean: Math.round(mean * 100) / 100,
    median: pctl(sorted, 0.5),
    p10: pctl(sorted, 0.1),
    p90: pctl(sorted, 0.9),
  };
};

/** Integer-valued histogram with a top "cap+" bin, probabilities summing to 1. */
const binInteger = (values: number[], cap: number, allowNegative = false): SimBin[] => {
  const n = values.length || 1;
  const lo = allowNegative ? -cap : 0;
  const counts = new Map<number, number>();
  let capHi = 0;
  let capLo = 0;
  for (const v0 of values) {
    const v = Math.round(v0);
    if (v > cap) { capHi += 1; continue; }
    if (v < lo) { capLo += 1; continue; }
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const bins: SimBin[] = [];
  if (allowNegative && capLo > 0) bins.push({ value: lo - 1, label: `≤${lo - 1}`, count: capLo, probability: capLo / n });
  for (let v = lo; v <= cap; v += 1) {
    const c = counts.get(v) ?? 0;
    bins.push({ value: v, label: String(v), count: c, probability: c / n });
  }
  if (capHi > 0) bins.push({ value: cap + 1, label: `${cap + 1}+`, count: capHi, probability: capHi / n });
  return bins;
};

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Build the 2–4 sentence factual game story from computed fields only (no market, no adjectives of hype). */
function buildGameStory(g: {
  away: string;
  home: string;
  winHome: number;
  runsAway: DistributionSummary;
  runsHome: DistributionSummary;
  total: DistributionSummary;
  extras: number;
  runCount: number;
}): string[] {
  const favTeam = g.winHome >= 0.5 ? g.home : g.away;
  const favProb = Math.round((g.winHome >= 0.5 ? g.winHome : 1 - g.winHome) * 100);
  const story: string[] = [];
  // The tier words describe how DECIDED this simulation is — never how it compares to a sportsbook.
  // "edge"/"value" are banned public-copy terms (see public-beta-safety.test.mjs); "lean" is the house term.
  story.push(
    `Across ${g.runCount.toLocaleString()} simulated games, ${favTeam} won ${favProb}% of the time — ${
      favProb >= 60 ? "a clear lean in the simulation" : favProb >= 54 ? "a modest lean" : "essentially a coin flip"
    }.`,
  );
  story.push(
    `The simulation's median final was ${g.away} ${g.runsAway.median} — ${g.home} ${g.runsHome.median}, with a median of ${g.total.median} total runs (10th–90th percentile ${g.total.p10}–${g.total.p90}).`,
  );
  if (g.extras >= 0.1) story.push(`About ${Math.round(g.extras * 100)}% of simulated games went to extra innings.`);
  return story;
}

/** Simulate one game N complete times and aggregate into the public full-game artifact object. */
export function simulateFullGame(input: GameInput, opts: SimulateOptions): FullGameSimGame {
  const base = {
    gamePk: input.gamePk,
    date: input.date,
    slug: input.slug,
    awayTeam: input.awayTeam,
    homeTeam: input.homeTeam,
    awayTeamName: input.awayTeamName,
    homeTeamName: input.homeTeamName,
    venue: input.venue,
    firstPitch: input.firstPitch,
    completeness: input.completeness,
    market: input.market,
  };

  if (input.completeness.level === "unavailable") {
    const game: FullGameSimGame = {
      ...base,
      status: "unavailable",
      runCount: 0,
      winProbability: null,
      runs: null,
      totalRuns: null,
      runDifferential: null,
      runLine: [],
      teamTotals: null,
      finalScores: [],
      extraInningsProbability: null,
      players: null,
      gameStory: [`Not enough pregame lineup data to simulate this game (${input.completeness.notes.join(" ")}).`],
      artifactHash: "",
    };
    game.artifactHash = stableHash({ ...game, artifactHash: undefined });
    return game;
  }

  const n = Math.max(1, Math.floor(opts.runCount));
  const rng = new SeededRng(`${input.date}|mlb-fullgame|${input.gamePk}|${opts.modelVersion}|${opts.simulationVersion}`);

  const awayRuns = new Array<number>(n);
  const homeRuns = new Array<number>(n);
  const totalRuns = new Array<number>(n);
  const runDiff = new Array<number>(n);
  let homeWins = 0;
  let extraGames = 0;
  const scoreCounts = new Map<string, number>();

  // Per-player running sums (means reported).
  const nAway = input.awayLineup.length;
  const nHome = input.homeLineup.length;
  const zeros = (k: number) => new Array<number>(k).fill(0);
  const sums = {
    awayBat: input.awayLineup.map(() => ({ pa: 0, hits: 0, tb: 0, hr: 0, r: 0, rbi: 0, bb: 0, k: 0 })),
    homeBat: input.homeLineup.map(() => ({ pa: 0, hits: 0, tb: 0, hr: 0, r: 0, rbi: 0, bb: 0, k: 0 })),
    awayPit: { bf: 0, k: 0, h: 0, r: 0, outs: 0 },
    homePit: { bf: 0, k: 0, h: 0, r: 0, outs: 0 },
  };
  void zeros;

  const addBat = (acc: (typeof sums.awayBat)[number], l: GameResult["awayBatters"][number]) => {
    acc.pa += l.pa; acc.hits += l.hits; acc.tb += l.totalBases; acc.hr += l.homeRuns;
    acc.r += l.runs; acc.rbi += l.rbi; acc.bb += l.walks; acc.k += l.strikeouts;
  };
  const addPit = (acc: typeof sums.awayPit, l: GameResult["awayStarter"]) => {
    acc.bf += l.battersFaced; acc.k += l.strikeouts; acc.h += l.hitsAllowed; acc.r += l.runsAllowed; acc.outs += l.outsRecorded;
  };

  for (let i = 0; i < n; i += 1) {
    const r = simulateGame(input, rng);
    awayRuns[i] = r.awayRuns;
    homeRuns[i] = r.homeRuns;
    totalRuns[i] = r.awayRuns + r.homeRuns;
    runDiff[i] = r.homeRuns - r.awayRuns;
    if (r.homeRuns > r.awayRuns) homeWins += 1;
    if (r.extra) extraGames += 1;
    const key = `${r.awayRuns}-${r.homeRuns}`;
    scoreCounts.set(key, (scoreCounts.get(key) ?? 0) + 1);
    for (let b = 0; b < nAway; b += 1) addBat(sums.awayBat[b], r.awayBatters[b]);
    for (let b = 0; b < nHome; b += 1) addBat(sums.homeBat[b], r.homeBatters[b]);
    addPit(sums.awayPit, r.awayStarter);
    addPit(sums.homePit, r.homeStarter);
  }

  const winHome = round3(homeWins / n);
  const runsAway = summarize(awayRuns);
  const runsHome = summarize(homeRuns);
  const total = summarize(totalRuns);
  const diff = summarize(runDiff);

  // Run line from simulated margins (home − away). Home covers -1.5 when it wins by ≥ 2.
  const runLineAt = (line: number): RunLineProb => {
    let hc = 0;
    let ac = 0;
    for (let i = 0; i < n; i += 1) {
      if (runDiff[i] > line) hc += 1;
      if (-runDiff[i] > line) ac += 1;
    }
    return { line, homeCover: round3(hc / n), awayCover: round3(ac / n) };
  };

  // Team totals at a couple of integer thresholds around each team's mean.
  const teamTotalAt = (arr: number[], line: number): TeamTotalProb => {
    let over = 0;
    for (const v of arr) if (v > line) over += 1;
    return { line, over: round3(over / n), under: round3(1 - over / n) };
  };
  const teamLines = (mean: number): number[] => {
    const c = Math.round(mean);
    return [c - 0.5, c + 0.5].filter((x) => x > 0);
  };

  const finalScores: FinalScore[] = [...scoreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, c]) => {
      const [a, h] = k.split("-").map(Number);
      return { away: a, home: h, probability: round3(c / n) };
    });

  const batLine = (input_: GameInput["awayLineup"], acc: (typeof sums.awayBat)): SimBatterLine[] =>
    input_.map((b, i) => ({
      playerId: b.playerId,
      name: b.name,
      team: b.team,
      battingOrder: i + 1,
      plateAppearances: round3(acc[i].pa / n),
      hits: round3(acc[i].hits / n),
      totalBases: round3(acc[i].tb / n),
      homeRuns: round3(acc[i].hr / n),
      runs: round3(acc[i].r / n),
      rbi: round3(acc[i].rbi / n),
      walks: round3(acc[i].bb / n),
      strikeouts: round3(acc[i].k / n),
    }));

  const pitLine = (starter: GameInput["awayStarter"], acc: typeof sums.awayPit): SimPitcherLine[] =>
    starter
      ? [{
          playerId: starter.playerId,
          name: starter.name,
          team: starter.team,
          role: "starter" as const,
          battersFaced: round3(acc.bf / n),
          strikeouts: round3(acc.k / n),
          hitsAllowed: round3(acc.h / n),
          runsAllowed: round3(acc.r / n),
          outsRecorded: round3(acc.outs / n),
        }]
      : [];

  const extras = round3(extraGames / n);

  const game: FullGameSimGame = {
    ...base,
    status: input.completeness.level === "ready" ? "ready" : "degraded",
    runCount: n,
    winProbability: { away: round3(1 - winHome), home: winHome },
    runs: { away: runsAway, home: runsHome },
    totalRuns: { ...total, distribution: binInteger(totalRuns, 20) },
    runDifferential: { ...diff, distribution: binInteger(runDiff, 12, true) },
    runLine: [runLineAt(1.5), runLineAt(2.5)],
    teamTotals: {
      away: teamLines(runsAway.mean).map((l) => teamTotalAt(awayRuns, l)),
      home: teamLines(runsHome.mean).map((l) => teamTotalAt(homeRuns, l)),
    },
    finalScores,
    extraInningsProbability: extras,
    players: {
      batters: [...batLine(input.awayLineup, sums.awayBat), ...batLine(input.homeLineup, sums.homeBat)],
      pitchers: [...pitLine(input.awayStarter, sums.awayPit), ...pitLine(input.homeStarter, sums.homePit)],
    },
    gameStory: buildGameStory({
      away: input.awayTeam,
      home: input.homeTeam,
      winHome,
      runsAway,
      runsHome,
      total,
      extras,
      runCount: n, // the SAME count the artifact reports (clamped), never the raw option
    }),
    artifactHash: "",
  };
  game.artifactHash = stableHash({ ...game, artifactHash: undefined });
  return game;
}
