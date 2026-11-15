/**
 * Anytime-TD price reader + preflight — constructed files only, zero network.
 * Run: npx tsx --test src/lib/sports/nfl/atd-prices.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { atdPriceFor, atdPreflight, topAtdCandidates, formatPreflightTable } from "./atd-prices.mjs";

const NOW = "2026-11-15T18:30:00Z";
const EV = "401873063";
const FILE = {
  events: [
    {
      canonicalEventId: `nfl-${EV}`, providerEventId: EV, kickoffUtc: "2026-11-15T21:25Z", state: "OFFERED", capturedAt: "2026-11-15T18:00:00Z",
      unresolvedIdentities: [{ name: "Ghost Player", families: ["anytime_td"] }],
      rows: [
        { canonicalEventId: `nfl-${EV}`, playerId: "nfl-athlete-1", name: "Fresh Back", book: "draftkings", price: -150, capturedAt: "2026-11-15T18:00:00Z", sourceAsOf: "2026-11-15T17:59:00Z" },
        { canonicalEventId: `nfl-${EV}`, playerId: "nfl-athlete-2", name: "Old Receiver", book: "fanduel", price: 140, capturedAt: "2026-11-15T08:00:00Z", sourceAsOf: "2026-11-15T07:59:00Z" },
        { canonicalEventId: `nfl-${EV}`, playerId: "nfl-athlete-3", name: "Out Tight End", book: "draftkings", price: 300, capturedAt: "2026-11-15T18:00:00Z", sourceAsOf: "2026-11-15T17:59:00Z" },
      ],
    },
    { canonicalEventId: "nfl-401873064", providerEventId: "401873064", kickoffUtc: "2026-11-16T01:20Z", state: "NOT_OFFERED", capturedAt: "2026-11-15T18:00:00Z", rows: [] },
    { canonicalEventId: "nfl-401873054", providerEventId: "401873054", kickoffUtc: "2026-11-15T18:00Z", state: "OFFERED", capturedAt: "2026-11-15T15:00:00Z", rows: [{ playerId: "nfl-athlete-9", book: "draftkings", price: 200, capturedAt: "2026-11-15T15:00:00Z" }] },
  ],
};
const player = (id, name, prob, elig = "ELIGIBLE", participation = "ACTIVE_PROJECTED") => ({ playerId: id, name, team: "DAL", participation, markets: { anytime_td: { probability: prob, pricingState: "NOT_PROBED" } }, eligibility: { state: elig, reasons: elig === "ELIGIBLE" ? [] : ["OUT"] } });
const BOARD = {
  providerEventId: EV, matchup: "SF @ DAL", kickoffUtc: "2026-11-15T21:25Z",
  players: [
    player("nfl-athlete-1", "Fresh Back", 0.61),
    player("nfl-athlete-2", "Old Receiver", 0.44),
    player("nfl-athlete-3", "Out Tight End", 0.52, "INELIGIBLE", "INACTIVE"),
    player("nfl-athlete-4", "Ghost Player", 0.2),
    player("nfl-athlete-5", "Unpriced Fullback", 0.1),
  ],
};

test("PRICED: a fresh row returns its own book, price and capturedAt", () => {
  const r = atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW });
  assert.deepEqual([r.state, r.price, r.book, r.capturedAt], ["PRICED", -150, "draftkings", "2026-11-15T18:00:00Z"]);
  assert.equal(atdPriceFor({ file: FILE, eventId: `nfl-${EV}`, playerId: "nfl-athlete-1", nowIso: NOW }).state, "PRICED");
});
test("STALE: capturedAt older than maxAgeHours", () => {
  const r = atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-2", nowIso: NOW, maxAgeHours: 6 });
  assert.equal(r.state, "STALE");
  assert.equal(r.book, "fanduel", "a stale row still names its book so the reader sees what is stale");
  assert.equal(atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-2", nowIso: NOW, maxAgeHours: 12 }).state, "PRICED");
});
test("NO_CAPTURE / NOT_OFFERED / IDENTITY_UNRESOLVED / STARTED", () => {
  assert.equal(atdPriceFor({ file: FILE, eventId: "401873099", playerId: "x", nowIso: NOW }).state, "NO_CAPTURE");
  assert.equal(atdPriceFor({ file: null, eventId: EV, playerId: "x", nowIso: NOW }).state, "NO_CAPTURE");
  assert.equal(atdPriceFor({ file: FILE, eventId: "401873064", playerId: "x", nowIso: NOW }).state, "NOT_OFFERED");
  assert.equal(atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-5", nowIso: NOW, playerName: "Unpriced Fullback" }).state, "NOT_OFFERED");
  assert.equal(atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-4", nowIso: NOW, playerName: "Ghost Player" }).state, "IDENTITY_UNRESOLVED");
  const s = atdPriceFor({ file: FILE, eventId: "401873054", playerId: "nfl-athlete-9", nowIso: NOW });
  assert.equal(s.state, "STARTED");
  assert.equal(s.price, null, "no pregame price is returned after kickoff");
});
test("a price is never borrowed across events or players", () => {
  assert.equal(atdPriceFor({ file: FILE, eventId: "401873064", playerId: "nfl-athlete-1", nowIso: NOW }).price, null);
  assert.equal(atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-9", nowIso: NOW }).price, null);
});
test("preflight: model probability untouched, unavailable player reported, missing price visible before any graphic", () => {
  const ids = topAtdCandidates(BOARD, 3);
  assert.deepEqual(ids, ["nfl-athlete-1", "nfl-athlete-3", "nfl-athlete-2"], "ranked by model probability, OUT players included so they are seen");
  const pf = atdPreflight({ file: FILE, board: BOARD, eventId: EV, candidates: ids, nowIso: NOW });
  const by = Object.fromEntries(pf.rows.map((r) => [r.playerId, r]));
  assert.equal(by["nfl-athlete-1"].ready, true);
  assert.equal(by["nfl-athlete-1"].modelProbability, 0.61);
  assert.equal(by["nfl-athlete-3"].available, false);
  assert.equal(by["nfl-athlete-3"].ready, false);
  assert.ok(by["nfl-athlete-3"].blockers.some((b) => /UNAVAILABLE\(INELIGIBLE\/INACTIVE\)/.test(b)));
  assert.equal(by["nfl-athlete-3"].price.state, "PRICED", "a priced but unavailable player is still blocked");
  assert.deepEqual(by["nfl-athlete-2"].blockers, ["PRICE_STALE"]);
  assert.equal(pf.allReady, false);
  assert.deepEqual(pf.missingPrice, ["nfl-athlete-2"]);
  assert.equal(BOARD.players[0].markets.anytime_td.probability, 0.61, "board is not mutated");
  const table = formatPreflightTable(pf);
  assert.match(table, /Out Tight End .* NO \(UNAVAILABLE/);
  assert.match(table, /NOT READY: 2 of 3/);
});
test("preflight: no price file at all → every candidate NO_CAPTURE and blocked", () => {
  const pf = atdPreflight({ file: null, board: BOARD, eventId: EV, candidates: ["nfl-athlete-1"], nowIso: NOW });
  assert.equal(pf.rows[0].price.state, "NO_CAPTURE");
  assert.equal(pf.allReady, false);
});

// ---------------------------------------------------------------- fail-closed clock / kickoff (review of PR #1359)
const evWith = (over) => ({ events: [{ ...FILE.events[0], ...over }] });
test("UNVERIFIABLE: an unparseable clock never yields PRICED", () => {
  for (const nowIso of ["not-a-time", "", null, undefined]) {
    assert.equal(atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-1", nowIso }).state, "UNVERIFIABLE", String(nowIso));
  }
  assert.equal(atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW, maxAgeHours: NaN }).state, "UNVERIFIABLE");
});
test("UNVERIFIABLE: no parseable kickoff anywhere; the board's kickoff rescues a file without one", () => {
  const f = evWith({ kickoffUtc: null });
  assert.equal(atdPriceFor({ file: f, eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW }).state, "UNVERIFIABLE");
  assert.equal(atdPriceFor({ file: f, eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW, kickoffUtc: "garbage" }).state, "UNVERIFIABLE");
  assert.equal(atdPriceFor({ file: f, eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW, kickoffUtc: "2026-11-15T21:25Z" }).state, "PRICED");
});
test("STARTED uses the EARLIER of the file's and the board's kickoff (a moved-up game)", () => {
  const r = atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW, kickoffUtc: "2026-11-15T18:15:00Z" });
  assert.equal(r.state, "STARTED");
  assert.equal(r.price, null);
  assert.equal(atdPriceFor({ file: FILE, eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW, kickoffUtc: "2026-11-16T03:00:00Z" }).state, "PRICED");
});
test("UNVERIFIABLE: capturedAt later than now, unparseable, or at/after kickoff", () => {
  const row = (capturedAt) => evWith({ rows: [{ ...FILE.events[0].rows[0], capturedAt }] });
  assert.equal(atdPriceFor({ file: row("2026-11-15T19:00:00Z"), eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW }).state, "UNVERIFIABLE");
  assert.equal(atdPriceFor({ file: row("nope"), eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW }).state, "UNVERIFIABLE");
  const late = row("2026-11-15T18:20:00Z");
  assert.equal(atdPriceFor({ file: late, eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW, kickoffUtc: "2026-11-15T18:20:00Z" }).state, "STARTED");
  assert.equal(atdPriceFor({ file: late, eventId: EV, playerId: "nfl-athlete-1", nowIso: "2026-11-15T18:19:00Z", kickoffUtc: "2026-11-15T18:19:30Z" }).state, "UNVERIFIABLE");
});
test("IDENTITY_DEGRADED event: kept prior rows still price; a player without a row is IDENTITY_UNRESOLVED, never NOT_OFFERED", () => {
  const f = evWith({ state: "IDENTITY_DEGRADED", unresolvedIdentities: [] });
  assert.equal(atdPriceFor({ file: f, eventId: EV, playerId: "nfl-athlete-1", nowIso: NOW }).state, "PRICED");
  assert.equal(atdPriceFor({ file: f, eventId: EV, playerId: "nfl-athlete-5", nowIso: NOW, playerName: "Unpriced Fullback" }).state, "IDENTITY_UNRESOLVED");
});
test("preflight passes the board's kickoff, so a board-earlier kickoff blocks as STARTED", () => {
  const pf = atdPreflight({ file: FILE, board: { ...BOARD, kickoffUtc: "2026-11-15T18:00:00Z" }, eventId: EV, candidates: ["nfl-athlete-1"], nowIso: NOW });
  assert.equal(pf.rows[0].price.state, "STARTED");
  assert.equal(pf.rows[0].ready, false);
  const bad = atdPreflight({ file: FILE, board: BOARD, eventId: EV, candidates: ["nfl-athlete-1"], nowIso: "bogus" });
  assert.equal(bad.rows[0].price.state, "UNVERIFIABLE");
  assert.equal(bad.allReady, false);
});
