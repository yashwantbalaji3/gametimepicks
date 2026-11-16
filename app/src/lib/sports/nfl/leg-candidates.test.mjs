/**
 * NFL leg candidates: only games after the build instant, only through the canonical line rule, only official projections.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/leg-candidates.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { legCandidates, upcomingBoards } from "./leg-candidates.mjs";
import { screenLegs } from "./leg-screen.mjs";
import { nflEvidenceLines } from "./evidence-line.mjs";
import { isEligibleProvider } from "../odds/eligible-operators.mjs";

const g = (i, rec) => ({ eventId: `p${i}`, week: 10 - i, date: "2026-10-01", team: "T", opponent: "O", homeAway: "H", state: "STAT_LINE", stats: { rec } });
const log = [6, 6, 7, 5, 6].map((r, i) => g(i, r));
/* the board's offer slot says 9.5 at FanDuel; the game's open rows say 4.5 at DraftKings — the rows win, always */
const board = (id, kickoffUtc, famState = "PUBLISHED") => ({
  providerEventId: id, kickoffUtc, families: { player_receptions: { state: famState } },
  players: [{ playerId: `nfl-athlete-${id}`, name: `P${id}`, team: `T${id}`, eligibility: { state: "ELIGIBLE" },
    markets: { player_receptions: { median: 5, market: { sportsbook: "fanduel", line: 9.5, overOdds: 300, underOdds: -400, capturedAt: "2026-11-15T12:00:00Z" } } } }],
});
const rowsFor = (id) => [{ canonicalEventId: `nfl-${id}`, playerId: `nfl-athlete-${id}`, market: "player_receptions", book: "draftkings", line: 4.5, overPrice: -150, underPrice: 120, capturedAt: "2026-11-15T12:00:00Z" }];
const PLAYED = board("101", "2026-11-15T18:00:00Z"), NEXT = board("102", "2026-11-17T01:15:00Z");
const evidenceByEvent = { 101: { "nfl-athlete-101": log }, 102: { "nfl-athlete-102": log } };
const official = (id) => ({ [`nfl-athlete-${id}`]: { player_receptions: { value: 5, estimate: null } } });
const projectionsByEvent = { 101: official("101"), 102: official("102") };
const linesAt = (boards, asOf) => Object.fromEntries(boards.map((b) => [b.providerEventId, nflEvidenceLines({ board: b, rows: rowsFor(b.providerEventId), asOf })]));
const FAM = { player_receptions: { eligibleForOfficialProducts: true, gtpProbability: false } };
const passedAt = (now, extra = {}) => screenLegs(legCandidates({ boards: [PLAYED, NEXT], evidenceByEvent, now, linesByEvent: linesAt([PLAYED, NEXT], now), projectionsByEvent, ...extra }), { families: FAM, isEligibleBook: isEligibleProvider });

test("only games after the build instant supply candidates — a played game never supplies a leg", () => {
  const now = "2026-11-16T08:00:00Z";
  assert.deepEqual(upcomingBoards([PLAYED, NEXT], now).map((b) => b.providerEventId), ["102"]);
  const legs = passedAt("2026-11-15T13:00:00Z").passed;
  assert.ok(legs.some((l) => l.eventId === "101"), "before its kickoff the game does supply a leg (non-vacuous)");
  const c = legCandidates({ boards: [PLAYED, NEXT], evidenceByEvent, now, linesByEvent: linesAt([PLAYED, NEXT], now), projectionsByEvent });
  assert.ok(c.length > 0);
  assert.deepEqual([...new Set(c.map((l) => l.eventId))], ["102"], "no candidate from the played game");
  assert.deepEqual(passedAt(now).reasons, { LINE_NOT_COMPARED: 2 }, "102's line is 20 h old at this instant: the section calls it stale, so no leg");
});

test("kickoff equal to the build instant, or no instant at all, supplies nothing (fail closed)", () => {
  assert.equal(upcomingBoards([PLAYED], "2026-11-15T18:00:00Z").length, 0);
  assert.equal(legCandidates({ boards: [PLAYED, NEXT], evidenceByEvent, linesByEvent: linesAt([PLAYED, NEXT], "2026-11-15T13:00:00Z"), projectionsByEvent }).length, 0);
});

test("the line, price, book and capture come from the open rows, never the board slot", () => {
  const r = passedAt("2026-11-15T13:00:00Z");
  const l = r.passed.find((x) => x.eventId === "101" && x.side === "over");
  assert.deepEqual([l.line.line, l.line.lineText, l.line.price, l.line.sportsbook, l.line.label, l.line.captured], [4.5, "4.5", -150, "draftkings", "DraftKings", "Nov 15, 7:00 AM ET"]);
  const under = legCandidates({ boards: [PLAYED], evidenceByEvent, now: "2026-11-15T13:00:00Z", linesByEvent: linesAt([PLAYED], "2026-11-15T13:00:00Z"), projectionsByEvent }).find((c) => c.side === "under");
  assert.equal(under.line.price, 120, "the under side takes the row's own under price");
  assert.doesNotMatch(JSON.stringify(r.passed), /9\.5|fanduel|300|-400/i, "nothing of the board slot");
});

test("closed rule (no lines for a game) ⇒ no candidate and no refusal for it", () => {
  const now = "2026-11-15T13:00:00Z";
  const c = legCandidates({ boards: [PLAYED, NEXT], evidenceByEvent, now, linesByEvent: { 101: null }, projectionsByEvent });
  assert.equal(c.length, 0);
  const r = screenLegs(c, { families: FAM, isEligibleBook: isEligibleProvider });
  assert.deepEqual([r.passed.length, r.reasons], [0, {}]);
  assert.equal(legCandidates({ boards: [PLAYED, NEXT], evidenceByEvent, now, projectionsByEvent }).length, 0, "default: closed");
});

test("official projection only: an ESTIMATE family, an estimate row or no page row ⇒ PROJECTION_NOT_OFFICIAL", () => {
  const now = "2026-11-15T13:00:00Z";
  const est = board("101", "2026-11-15T18:00:00Z", "ESTIMATE");
  const cases = [
    legCandidates({ boards: [est], evidenceByEvent, now, linesByEvent: { 101: nflEvidenceLines({ board: { ...est, families: { player_receptions: { state: "PUBLISHED" } } }, rows: rowsFor("101"), asOf: now }) }, projectionsByEvent }),
    legCandidates({ boards: [PLAYED], evidenceByEvent, now, linesByEvent: linesAt([PLAYED], now), projectionsByEvent: { 101: { "nfl-athlete-101": { player_receptions: { value: 5, estimate: "Estimate: not an official projection" } } } } }),
    legCandidates({ boards: [PLAYED], evidenceByEvent, now, linesByEvent: linesAt([PLAYED], now), projectionsByEvent: {} }),
  ];
  for (const c of cases) assert.deepEqual(screenLegs(c, { families: FAM, isEligibleBook: isEligibleProvider }).reasons, { PROJECTION_NOT_OFFICIAL: 2 });
});
