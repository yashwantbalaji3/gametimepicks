/* NBA line board: the committed lane's frozen medians beside synthetic adapter-shaped price records (no real prices). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildNbaLineBoard, NBA_LINE_DISPLAY } from "./line-board.mjs";

const lane = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-27.json"), "utf8"));
const g = lane.games[0];
const p = g.players.home[0];
const rec = (o = {}) => ({
  schema: "gtp.nba.prop-price@1", eventId: String(g.providerEventId), providerAthleteId: String(p.providerAthleteId), family: "pts",
  providerMarketKey: "player_points", line: 20.5, book: "draftkings", overAmerican: -110, underAmerican: -110,
  capturedAt: new Date(Date.parse(g.tipUtc) - 2 * 3600_000).toISOString(), ...o,
});
const asOf = new Date(Date.parse(g.tipUtc) - 3600_000).toISOString();

test("one row per published player × seven families; the projection is the lane's median, untouched", () => {
  const b = buildNbaLineBoard({ lane, priceRecords: [rec()], asOf });
  const players = lane.games.reduce((n, x) => n + x.players.away.length + x.players.home.length, 0);
  assert.equal(b.rows.length, players * 7);
  const row = b.rows.find((r) => r.athleteId === String(p.providerAthleteId) && r.family === "pts");
  assert.equal(row.median, p.medians.pts);
  assert.equal(row.line, 20.5);
  assert.equal(row.difference, Math.round((p.medians.pts - 20.5) * 10) / 10);
  assert.equal(b.coverage.compared, 1, "only the player with a line is compared");
  assert.equal(b.coverage.unavailableByReason.NO_LINE, b.rows.length - 1, "everyone else says no line — not a zero, not a guess");
});

test("records for another slate's event never reach a comparison; the newest pre-tip book wins", () => {
  const b = buildNbaLineBoard({ lane, priceRecords: [rec({ eventId: "999" }), rec({ book: "fanduel", line: 21.5, capturedAt: new Date(Date.parse(g.tipUtc) - 3600_000).toISOString() })], asOf });
  const row = b.rows.find((r) => r.athleteId === String(p.providerAthleteId) && r.family === "pts");
  assert.deepEqual([row.book, row.line, row.booksOffering], ["fanduel", 21.5, 1]);
});

test("display: site authorized by the founder 2026-10-29 (provider terms recorded); the social surface stays private", () => {
  assert.deepEqual([NBA_LINE_DISPLAY.public, NBA_LINE_DISPLAY.social, NBA_LINE_DISPLAY.socialPrices], [true, false, false]);
  assert.equal(buildNbaLineBoard({ lane, priceRecords: [], asOf }).display, NBA_LINE_DISPLAY);
});
