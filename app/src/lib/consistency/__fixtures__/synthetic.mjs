/**
 * Synthetic, self-contained documents in the committed artifact shapes (NFL receipt + player board, NBA v1 game with
 * a real nba-forecast-receipt@1 stamp). Unit tests use these so they never depend on the live slate.
 */
import { stampReceipt } from "../../sports/nba/forecast-receipt.mjs";

export const NFL_ID = "999000001";
export const KICKOFF = "2026-11-01T18:00Z";

export function nflReceipt({ generatedAt = "2026-11-01T17:00:00Z", pHome = 0.62, inputHash = "aaaaaaaaaaaaaaaa", marginMedian = 3, totalMedian = 44 } = {}) {
  return {
    providerEventId: NFL_ID, canonicalEventId: `nfl-${NFL_ID}`, matchup: "AWY @ HOM",
    home: { abbr: "HOM" }, away: { abbr: "AWY" }, kickoffUtc: KICKOFF,
    model: { id: "nfl-regular-season-public-v1", version: 2, inputHash },
    generatedAt,
    evidence: { strengthCutoff: generatedAt },
    forecastSummary: {
      projectedScore: { home: 24, away: 20, convention: "scores-derived-from-total-and-margin-v1" },
      winProbability: { home: Number(pHome.toFixed(4)), away: Number((1 - pHome - 0.02).toFixed(4)), tieMass: 0.02, homeUnrounded: pHome },
      margin: { median: marginMedian, p10: -12, p90: 19 },
      total: { median: totalMedian, p10: 28, p90: 61 },
      distribution: { marginMean: 3.4, marginSigma: 13, totalMean: 44.2, totalSigma: 13.3, source: "nfl-gamesim-v1-joint-normal" },
    },
    sideDecision: { publishedSide: "HOME", rule: "MODEL_FAVORED_V1", frozenAt: generatedAt },
  };
}

export function nflBoard({ generatedAt = "2026-11-01T17:00:00Z", players = null } = {}) {
  return {
    schemaVersion: 1, artifact: "nfl-player-board", generatedAt, sourceGeneratedAt: generatedAt, providerEventId: NFL_ID,
    kickoffUtc: KICKOFF, seasonType: 2, week: 9,
    families: {
      player_pass_yds: { state: "ESTIMATE", model: "nfl-player-share-level-v1" },
      player_reception_yds: { state: "PUBLISHED" },
      player_receptions: { state: "PUBLISHED", model: "nfl-player-share-level-v1" },
      anytime_td: { state: "PUBLISHED", model: "nfl-anytime-td-opportunity-v1" },
    },
    players: players ?? [
      { playerId: "nfl-athlete-100", name: "Alex Same", team: "HOM", participation: "AVAILABLE_ROLE_UNCERTAIN", markets: { player_reception_yds: { mean: 52.1, p10: 12.4, p25: 28.2, median: 47.5, p75: 70.3, p90: 98.7 }, player_receptions: { mean: 4.4, p10: 1.6, p25: 2.9, median: 4.2, p75: 5.8, p90: 7.4 }, anytime_td: { probability: 0.31 } } },
      { playerId: "nfl-athlete-200", name: "Alex Same", team: "AWY", participation: "AVAILABLE_ROLE_UNCERTAIN", markets: { player_pass_yds: { mean: 231.4, p10: 150.2, p25: 190.8, median: 228.9, p75: 270.1, p90: 312.6 }, anytime_td: { probability: 0.12 } } },
      { playerId: null, name: "No Id Player", team: "HOM", participation: "AVAILABLE_ROLE_UNCERTAIN", markets: { player_receptions: { mean: 2, p10: 0, median: 2, p90: 4 } } },
    ],
  };
}

export const receiptsOf = (...rs) => rs.map((receipt, i) => ({ file: `data/internal/nfl/forecast-receipts/2026-11-01/${NFL_ID}-rev-${String(i).padStart(4, "0")}Z.json`, receipt }));

export const NBA_ID = "999100001";

export function nbaArtifact({ tamper = false, noReceipt = false } = {}) {
  const game = {
    providerEventId: NBA_ID, dateUtc: "2026-11-02T00:00Z",
    home: { name: "Home", abbr: "HOM" }, away: { name: "Away", abbr: "AWY" },
    forecast: {
      modelVersion: "nba-sim-v1-coherent", inputAsOf: "2026-11-01T12:00:00Z",
      sim: {
        pHome: 0.57, pAway: 0.43, tieMass: 0,
        home: { mean: 112.4, sd: 11.2, p10: 98, p25: 105, p50: 112, p75: 120, p90: 127 },
        away: { mean: 109.1, sd: 11.0, p10: 95, p25: 102, p50: 109, p75: 116, p90: 123 },
        margin: { mean: 3.3, sd: 14.1, p10: -15, p25: -6, p50: 3, p75: 12, p90: 21 },
        total: { mean: 221.5, sd: 17.6, p10: 199, p25: 210, p50: 221, p75: 233, p90: 244 },
        totalHistogram: [{ value: 220, probability: 0.4 }, { value: 221, probability: 0.2 }, { value: 222, probability: 0.4 }],
      },
      elo: { pHome: 0.6 },
      publishedSide: "HOME", sideRule: { id: "nba-winner-side@1", head: "elo" },
      players: {
        home: [{ providerAthleteId: "11", name: "Same Name", availability: "active", playRate: 0.97, conditioning: "x", expectedMinutes: 33, pts: { mean: 24.2, sd: 7.1, p10: 15, p25: 19, p50: 24, p75: 29, p90: 34 } }],
        away: [{ providerAthleteId: "22", name: "Same Name", availability: "active", playRate: 0.99, conditioning: "x", expectedMinutes: 30, reb: { mean: 8.1, sd: 3, p10: 4, p25: 6, p50: 8, p75: 10, p90: 12 } }],
      },
      representativeSamples: [],
    },
  };
  let g = noReceipt ? game : stampReceipt(game, { family: "v1", modelVersion: "nba-sim-v1-coherent", now: "2026-11-01T12:00:00Z", inputs: {} });
  if (tamper) g = { ...g, forecast: { ...g.forecast, sim: { ...g.forecast.sim, pHome: 0.99 } } };
  return { schemaVersion: 1, dataClass: "PRIVATE_RESEARCH", family: "v1", modelVersion: "nba-sim-v1-coherent", profileVersion: "nba-sim-v1-profile-1", games: [g] };
}
