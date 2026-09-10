/** Private two-team readout. An illustrative scorecard is one draw, never rounded marginals. */
import { simulateJointGame, OTHER, NFL_JOINT_SIM_ID } from "./joint-game-sim-v3.mjs";
import { summarize } from "./player-props-v1.mjs";

export function simulateJointMatchup({ playersByTeam, diagnostics = false, ...args }) {
  const base = { engineId: NFL_JOINT_SIM_ID, dataClass: "PRIVATE_RESEARCH", providerEventId: args.event?.providerEventId };
  const home = args.event?.home?.abbr, away = args.event?.away?.abbr;
  if (!home || !away || home === away || !Array.isArray(playersByTeam?.[home]) || !Array.isArray(playersByTeam?.[away])) return { ...base, state: "REFUSED", reason: "two distinct teams and both rosters required" };
  const sides = Object.fromEntries([home, away].map(teamAbbr => [teamAbbr, simulateJointGame({ ...args, teamAbbr, players: playersByTeam[teamAbbr], diagnostics: true })]));
  for (const [team, sim] of Object.entries(sides)) if (sim.state !== "SIMULATED") return { ...base, state: "REFUSED", reason: `${team}: ${sim.reason}` };
  const runs = sides[home].runs;
  const hd = sides[home].__draws, ad = sides[away].__draws;
  const totals = [], margins = [];
  let homeWins = 0, awayWins = 0, ties = 0;
  for (let i = 0; i < runs; i++) {
    const h = hd.teamAcc.own[i], a = ad.teamAcc.own[i];
    if (h !== ad.teamAcc.opp[i] || a !== hd.teamAcc.opp[i]) throw new Error(`team score streams diverge at ${i}`);
    totals.push(h + a); margins.push(h - a);
    if (h > a) homeWins++; else if (a > h) awayWins++; else ties++;
  }
  const total = summarize(totals), margin = summarize(margins);
  // Choose a central realized score pair, then keep EVERY statistic at that same draw index.
  // Not a modal box score or separate point forecast; player rows can be atypical within it.
  let index = 0, distance = Infinity;
  for (let i = 0; i < runs; i++) {
    const d = Math.abs(totals[i] - total.median) + Math.abs(margins[i] - margin.median);
    if (d < distance) { distance = d; index = i; }
  }
  const example = {};
  for (const [abbr, sim] of Object.entries(sides)) {
    const names = new Map(playersByTeam[abbr].map(p => [p.playerId, p.name ?? p.playerId]));
    example[abbr] = {
      team: Object.fromEntries(Object.entries(sim.__draws.teamAcc).map(([key, values]) => [key, values[index]])),
      players: Object.entries(sim.__draws.acc).map(([playerId, values]) => ({ playerId, name: playerId === OTHER ? "Other / unallocated players" : names.get(playerId), ...Object.fromEntries(Object.entries(values).map(([key, xs]) => [key, xs[index]])) })),
    };
  }
  const publicSides = Object.fromEntries(Object.entries(sides).map(([team, sim]) => {
    const { __draws, ...summary } = sim;
    return [team, diagnostics ? sim : summary];
  }));
  return { ...base, state: "SIMULATED", runs, home, away,
    outcome: { homeWin: homeWins / runs, awayWin: awayWins / runs, tie: ties / runs, total, homeMargin: margin },
    illustrativeScorecard: { kind: "SINGLE_SIMULATED_DRAW_NOT_POINT_FORECAST", drawIndex: index, teams: example,
      limitation: "Partial offensive scorecard; unspecified scoring points retained; not a validated play-by-play simulation or public recommendation" },
    sides: publicSides };
}
