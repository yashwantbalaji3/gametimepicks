/**
 * SYNTHETIC FIXTURES for the NBA Top Board tests — every player, game and box score here is invented.
 * Event ids start with "fx-" so they can never collide with a committed box score.
 */
import { stampReceipt } from "../forecast-receipt.mjs";

export const FIXTURE_NOTE = "SYNTHETIC FIXTURE — not real NBA data";

const dist = (p50, spread = 0.4) => ({ mean: p50 + 0.1, sd: p50 * spread / 1.28, p10: Math.max(0, +(p50 * (1 - spread)).toFixed(2)), p50, p90: +(p50 * (1 + spread)).toFixed(2) });

/** One fully eligible simulated player row. */
export function player(id, { pts = 20, reb = 6, ast = 4, threePm = 2, ...over } = {}) {
  return {
    providerAthleteId: String(id), name: `Fixture Player ${id}`,
    expectedMinutes: 30, minutesSd: 4, starterRate: 1, basis: "trailing10", gamesUsed: 8,
    availability: "active", injuryStatus: null, ratesBasis: "player-window",
    rates: { pts: 0.6, reb: 0.2, ast: 0.13, threePm: 0.06 },
    minutes: { mean: 30, sd: 4, p10: 25, p50: 30, p90: 35 },
    pts: dist(pts), reb: dist(reb), ast: dist(ast), threePm: dist(threePm, 0.8),
    ...over,
  };
}

/** One forecast game with a valid receipt. */
export function game(id, { tip = "2026-11-01T23:30Z", home = [], away = [], generatedAt = "2026-11-01T15:00:00Z", family = "v0.1", pool = null, modelVersion = "nba-preseason-experimental-v0.1" } = {}) {
  const g = {
    providerEventId: String(id), label: "NBA REGULAR SEASON — SHADOW", seasonType: 2, population: "regular", dateUtc: tip, etDate: "2026-11-01",
    home: { name: "Fixture Home", abbr: "BOS", providerTeamId: "2", ...(pool?.home ? { pool: pool.home } : {}) },
    away: { name: "Fixture Away", abbr: "NY", providerTeamId: "18", ...(pool?.away ? { pool: pool.away } : {}) },
    forecast: { modelVersion: "nba-sim-fixture", inputAsOf: generatedAt, players: { home, away } },
  };
  return stampReceipt(g, { family, modelVersion, now: generatedAt, inputs: { fixture: FIXTURE_NOTE } });
}

export function artifact(games, { date = "2026-11-01", generatedAt = "2026-11-01T15:00:00Z", family = "v0.1" } = {}) {
  return { schemaVersion: 1, artifact: "nba-experimental-forecasts", fixture: FIXTURE_NOTE, family, modelVersion: "nba-preseason-experimental-v0.1", generatedAt, inputAsOf: generatedAt, date, games };
}

export const SHA = "a".repeat(64);

/** A final box score (boxscore-parse.mjs shape). players: [{ id, minutes, pts, reb, ast, threePm, didNotPlay?, dnpReason? }] */
export function boxscore(eventId, players, { status = "STATUS_FINAL", available = true } = {}) {
  return {
    schemaVersion: 1, fixture: FIXTURE_NOTE, providerEventId: String(eventId), status, boxscoreAvailable: available,
    players: players.map((p) => ({
      providerAthleteId: String(p.id), name: `Fixture Player ${p.id}`, providerTeamId: p.team ?? "2",
      didNotPlay: !!p.didNotPlay, dnpReason: p.dnpReason ?? null,
      minutes: p.didNotPlay ? null : (p.minutes ?? 30),
      pts: p.didNotPlay ? null : (p.pts ?? 0), reb: p.didNotPlay ? null : (p.reb ?? 0), ast: p.didNotPlay ? null : (p.ast ?? 0), threePm: p.didNotPlay ? null : (p.threePm ?? 0),
    })),
  };
}
