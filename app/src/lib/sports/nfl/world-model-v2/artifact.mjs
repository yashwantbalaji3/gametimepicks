/**
 * NFL WORLD MODEL V2 — artifact identity, evidence status and the Top boards derived from the per-game artifacts.
 *
 * The boards are computed from the same per-game simulation artifacts the game pages render (never from the
 * published player board), so a player's board number IS his game-page number. Exclusions: games that have kicked
 * off, players not ACTIVE (Questionable, Doubtful, Out), families a player does not have. A board shows fewer than
 * ten rows rather than fill with weaker entries.
 */

export const WORLD_MODEL_V2 = Object.freeze({
  id: "nfl-world-model-v2",
  version: "2.0.0-experimental",
  label: "World Model V2 (experimental)",
  components: Object.freeze({
    score: "published margin and total heads of nfl-regular-season-public-v1 (normal draws, snapped)",
    overtime: "10-minute-OT outcome record 2017–2025; winner by the margin head",
    scoring: "nfl-game-worlds-v1 TD|points table + exact historical scoring compositions",
    opportunity: "nfl-opportunity-allocation-v1 (allocV1) shares, reallocation and volume",
    worlds: "nfl-allocation-worlds-v1 Dirichlet-multinomial allocation, binomial catches, gamma yards",
  }),
});

/** Evidence ladder — each rung is a separate claim; none implies the next. */
export const STATUS = Object.freeze({
  label: "EXPERIMENTAL",
  developmentTested: Object.freeze({ value: true, scope: "player receptions, receiving / rushing / passing yards from game worlds: development look PROCEED_TO_FORWARD_SHADOW (2022–2025)" }),
  prospectivelyCaptured: Object.freeze({ value: true, scope: "Week 5 2026 candidates frozen before kickoff (private captures 2026-10-08T18:21Z, T18:27Z)" }),
  forwardEvaluated: Object.freeze({ value: false, scope: "no graded forward sample yet" }),
  productEligible: Object.freeze({ value: false, scope: "needs forward evaluation against the preregistered bars" }),
  productionPromoted: Object.freeze({ value: false, scope: "the published game forecast remains the forecast of record" }),
});

export const UNSUPPORTED = Object.freeze([
  Object.freeze({ family: "anytime_td", reason: "Touchdown scorer probabilities from these worlds failed their evaluation (log loss 0.5138 vs 0.5109 for the red-zone model; calibration error 0.034). Diagnosis: a scorer must touch the ball in the same world, which double-counts opportunity and moves touchdowns from part-time to every-down players. Not published as probabilities; see the game page's touchdown board." }),
  Object.freeze({ family: "passing_td", reason: "Passing touchdowns are credited to the passer in every world, but no evaluation of passing-touchdown distributions exists. Not published as probabilities." }),
  Object.freeze({ family: "interceptions, sacks, kicking and defensive player stats", reason: "Not simulated." }),
]);

export const LIMITATIONS = Object.freeze([
  "Scores come from the published margin and total heads; they do not see injuries or who plays quarterback.",
  "The win chance here is counted from these simulated games and can differ from the published win chance, which comes from a separate rating.",
  "Overtime outcomes are drawn from the 2017–2025 record, not simulated play by play.",
  "Player volume does not yet adjust to an opposing defense beyond the team-level volume fit.",
  "Red-zone history ends with 2025; 2026 games add no red-zone evidence.",
  "Plays by players outside the named active set are counted in team totals only.",
]);

export const BOARD_FAMILIES = Object.freeze([
  Object.freeze({ key: "passingYards", title: "Passing yards" }),
  Object.freeze({ key: "rushingYards", title: "Rushing yards" }),
  Object.freeze({ key: "receivingYards", title: "Receiving yards" }),
  Object.freeze({ key: "receptions", title: "Receptions" }),
]);

/**
 * @param {object[]} artifacts per-game World Model V2 artifacts
 * @param {{now: string, size?: number}} o
 * @returns {{boards: Record<string, object[]>, games: number, excluded: object[]}}
 */
export function topBoards(artifacts, { now, size = 10 }) {
  const live = artifacts.filter((a) => Date.parse(a.identity.kickoffUtc) > Date.parse(now));
  const excluded = [];
  const boards = {};
  for (const { key } of BOARD_FAMILIES) {
    const rows = [];
    for (const a of live) {
      for (const p of a.players) {
        const d = p.families[key];
        if (!d) continue;
        if (p.availability !== "ACTIVE") { if (key === BOARD_FAMILIES[0].key || !excluded.some((x) => x.playerId === p.playerId)) excluded.push({ playerId: p.playerId, name: p.name, team: p.team, availability: p.availability }); continue; }
        rows.push({ playerId: p.playerId, name: p.name, position: p.position, team: p.team, matchup: a.identity.matchup, providerEventId: a.identity.providerEventId, simulationId: a.simulationId, mean: d.mean, median: d.median, p10: d.p10, p90: d.p90 });
      }
    }
    rows.sort((x, y) => y.mean - x.mean || y.median - x.median || x.name.localeCompare(y.name));
    boards[key] = rows.slice(0, size).map((r, i) => ({ rank: i + 1, ...r }));
  }
  const seen = new Set();
  return { boards, games: live.length, excluded: excluded.filter((x) => (seen.has(x.playerId) ? false : seen.add(x.playerId))) };
}
