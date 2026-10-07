// Rebuilds oct5-day.json from committed artifacts (run from the repo root):
//   node app/src/lib/sports/nba/v1/__fixtures__/build-oct5-fixture.mjs
// Sources: data/internal/research/nba/experimental{,-v0.1}/forecasts/2026-10-05.json (frozen v0 and v0.1 receipts),
//          app/public/data/nba/results/finals-2026-27.json (write-once finals), data/internal/research/nba/experimental/boxscores/<id>.json
import fs from "node:fs";
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const day = read("data/internal/research/nba/experimental/forecasts/2026-10-05.json");
const dayV01 = read("data/internal/research/nba/experimental-v0.1/forecasts/2026-10-05.json");
const finals = read("app/public/data/nba/results/finals-2026-27.json");
const keepPlayer = (p) => ({ providerAthleteId: p.providerAthleteId, name: p.name, expectedMinutes: p.expectedMinutes, availability: p.availability,
  injuryStatus: p.injuryStatus ?? null, pts: p.pts ?? null, reb: p.reb ?? null, ast: p.ast ?? null, threePm: p.threePm ?? null });
const slim = (g) => ({
  providerEventId: g.providerEventId, seasonType: g.seasonType, population: g.population, dateUtc: g.dateUtc,
  home: { name: g.home.name, abbr: g.home.abbr, providerTeamId: g.home.providerTeamId },
  away: { name: g.away.name, abbr: g.away.abbr, providerTeamId: g.away.providerTeamId },
  forecast: { modelVersion: g.forecast.modelVersion, elo: { pHome: g.forecast.elo.pHome }, sim: { pHome: g.forecast.sim.pHome, home: g.forecast.sim.home, away: g.forecast.sim.away, margin: g.forecast.sim.margin, total: g.forecast.sim.total },
    players: { home: g.forecast.players.home.map(keepPlayer), away: g.forecast.players.away.map(keepPlayer) } },
  receipt: { schema: g.receipt.schema, family: g.receipt.family, modelVersion: g.receipt.modelVersion, generatedAt: g.receipt.generatedAt, tipUtc: g.receipt.tipUtc, payloadSha256: g.receipt.payloadSha256 },
});
const games = day.games.map(slim);
const gamesV01 = dayV01.games.map(slim);
const ids = new Set(games.map((g) => g.providerEventId));
const boxscores = {};
for (const id of ids) {
  const b = read(`data/internal/research/nba/experimental/boxscores/${id}.json`);
  boxscores[id] = { providerEventId: b.providerEventId, boxscoreAvailable: b.boxscoreAvailable,
    players: b.players.map((p) => ({ providerAthleteId: p.providerAthleteId, didNotPlay: p.didNotPlay, minutes: p.minutes, pts: p.pts, reb: p.reb, ast: p.ast, threePm: p.threePm })) };
}
const out = { source: { forecasts: "data/internal/research/nba/experimental/forecasts/2026-10-05.json", finalsUpdatedAt: finals.updatedAt },
  games, gamesV01, finals: { finals: finals.finals.filter((f) => ids.has(f.providerEventId)), conflicts: [] }, boxscores };
fs.writeFileSync("app/src/lib/sports/nba/v1/__fixtures__/oct5-day.json", JSON.stringify(out) + "\n");
console.log("games", games.length, "boxscores", Object.keys(boxscores).length, "finals", out.finals.finals.length);
