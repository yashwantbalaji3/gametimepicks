// The shared player-eligibility rule (founder 2026-11-11): one function for the site lane and the social cards.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { exclusionReasons, selectEligible, boardEligible, teamCardPlayers, lineCell, linesMap, propRecordsFromCapture, SUPPRESSED } from "./player-eligibility.mjs";

const ok = { guard: [], status: null, hideAll: false, rowHide: [], hideCells: [] };
const elig = (n, over = {}) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(100 + i), { ...ok, ...over[String(100 + i)] }]));
const order = (n) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, providerAthleteId: String(100 + i), name: `P${i + 1}`, value: 30 - i }));

test("exclusion reasons: model review, guard with status, readiness row and cell, unknown; none = eligible", () => {
  const e = elig(4, { 100: { guard: ["R1"], status: "Out", hideAll: true }, 101: { rowHide: ["R_GAP"], hideAll: true }, 102: { hideCells: ["reb"] } });
  assert.deepEqual(exclusionReasons("100", "pts", { elig: e }), ["R1:Out"]);
  assert.deepEqual(exclusionReasons("101", "pts", { elig: e }), ["READINESS:R_GAP"]);
  assert.deepEqual(exclusionReasons("102", "reb", { elig: e }), ["READINESS_CELL:reb"]);
  assert.deepEqual(exclusionReasons("102", "pts", { elig: e }), []);
  assert.deepEqual(exclusionReasons("103", "ast", { elig: e, withheld: new Set(["103.ast"]) }), ["MODEL_REVIEW_WITHHELD"]);
  assert.deepEqual(exclusionReasons("999", "pts", { elig: e }), ["UNKNOWN_NOT_ASSESSED"]);
  assert.deepEqual(exclusionReasons("999", "pts", {}), [], "no eligibility file: only the model-review withhold applies");
});

test("board: two excluded in the top 5 refill from ranks 6 and 7, official ranks kept; 4 eligible suppresses with the count", () => {
  const b = boardEligible(order(9), { stat: "pts", elig: elig(9, { 101: { guard: ["R3"], hideAll: true }, 103: { hideCells: ["pts"] } }) });
  assert.equal(b.state, "SHOWN");
  assert.deepEqual(b.rows.map((r) => r.rank), [1, 3, 5, 6, 7]);
  const s = boardEligible(order(6), { stat: "pts", elig: elig(6, { 100: { guard: ["R2"], hideAll: true }, 104: { rowHide: ["B_GAP"], hideAll: true } }) });
  assert.deepEqual([s.state, s.eligible, s.needed, s.rows.length], [SUPPRESSED, 4, 5, 0]);
});

test("per-game card: official order by projected minutes, partial players keep their valid stats, refilled, smaller when fewer qualify", () => {
  const team = [
    { id: "100", name: "A", mins: 20 }, { id: "101", name: "B", mins: 36 }, { id: "102", name: "C", mins: 33 }, { id: "103", name: "D", mins: 30 },
    { id: "104", name: "E", mins: 28 }, { id: "105", name: "F", mins: 25 }, { id: "106", name: "G", mins: 24 }, { id: "107", name: "H", mins: 12 },
  ];
  const e = elig(8, { 101: { guard: ["R1"], status: "Day-To-Day", hideAll: true }, 104: { hideCells: ["reb"] } });
  const t = teamCardPlayers(team, { elig: e });
  assert.deepEqual(t.rows.map((r) => r.id), ["102", "103", "104", "105", "106", "100"], "B (R1) is refilled; E keeps PTS and AST");
  assert.deepEqual(t.rows.find((r) => r.id === "104").ok, ["pts", "ast"]);
  assert.deepEqual(t.audit.filter((a) => !a.eligible).map((a) => [a.playerId, a.reasons]), [["101", ["R1:Day-To-Day"]]]);
  const all3 = elig(3, { 101: { hideCells: ["pts", "reb", "ast"] } });
  assert.deepEqual(teamCardPlayers(team.slice(0, 3), { elig: all3 }).rows.map((r) => r.id), ["102", "100"], "no valid stat: left off; two rows, no placeholder");
  assert.deepEqual(teamCardPlayers(team, { elig: e, withheld: new Set(["102.reb"]) }).rows[0].ok, ["pts", "ast"]);
});

test("line cell: exact player, stat, line and side; above = OVER with its price (green), below = UNDER (red), equal = neutral, else nothing", () => {
  const lines = linesMap([
    { playerId: "100", market: "pts", line: 24.5, side: "OVER", american: "-110" }, { playerId: "100", market: "pts", line: 24.5, side: "UNDER", american: "−115" },
    { playerId: "101", market: "reb", line: 8.5, side: "OVER", american: "+105" },
    { playerId: "102", market: "ast", line: 5.5, side: "OVER", american: "-120" }, { playerId: "102", market: "ast", line: 6.5, side: "UNDER", american: "-110" },
  ]);
  assert.deepEqual(lineCell(lines, "100", "pts", 26.1), { cls: "over", glyph: "▲", text: "O 24.5 -110", line: 24.5, side: "OVER", american: "-110" });
  assert.deepEqual(lineCell(lines, "100", "pts", 22), { cls: "under", glyph: "▼", text: "U 24.5 -115", line: 24.5, side: "UNDER", american: "-115" });
  assert.equal(lineCell(lines, "100", "pts", 24.5).text, "Line 24.5");
  assert.equal(lineCell(lines, "100", "reb", 9), null, "another stat");
  assert.equal(lineCell(lines, "101", "reb", 7), null, "the UNDER side was not captured: nothing shown");
  assert.equal(lineCell(lines, "102", "ast", 7), null, "the two sides quote different lines: nothing shown");
  assert.equal(lineCell(linesMap([{ playerId: "100", market: "pts", line: 20, side: "OVER", american: "EVEN" }]), "100", "pts", 22), null);
  for (const v of [lineCell(lines, "100", "pts", 26.1), lineCell(lines, "100", "pts", 22)]) assert.ok(!/edge|EV|value|DraftKings|FanDuel|\d{1,2}:\d{2}/i.test(v.text));
});

// ── odds-ready path against a FIXTURE capture (PD 2026-11-11: the real capture is not running; no real prices) ──────
const FIXTURE_FETCHED = "2026-10-30T22:30:00Z";
const out = (name, desc, point, price) => ({ name, description: desc, point, price });
const FIXTURE = { fetchedAt: FIXTURE_FETCHED, fixture: true, events: [{ id: "cap-1", bookmakers: [
  { key: "bookA", markets: [
    { key: "player_points", last_update: "2026-10-30T22:20:00Z", outcomes: [out("Over", "Brandon Miller", 18.5, -110), out("Under", "Brandon Miller", 18.5, -110), out("Over", "Moussa Diabaté", 5.5, 105), out("Under", "Moussa Diabaté", 5.5, -125), out("Over", "Nobody Here", 9.5, -110), out("Under", "Nobody Here", 9.5, -110)] },
    { key: "player_rebounds", last_update: "2026-10-30T22:20:00Z", outcomes: [out("Over", "Naz Reid", 8.5, -115), out("Under", "Naz Reid", 8.5, -105), out("Over", "Brandon Miller", 4.5, 120)] },
  ] },
  { key: "bookB", markets: [{ key: "player_rebounds", last_update: "2026-10-30T22:25:00Z", outcomes: [out("Over", "Brandon Miller", 4.5, 130), out("Under", "Brandon Miller", 3.5, -150)] }] },
] }] };

test("FIXTURE capture → records: exact player, one Over + one Under on one point, priced; anything else is dropped with a reason", () => {
  const lane = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-30.json"), "utf8"));
  const g = lane.games[0];
  const games = { "cap-1": { tipUtc: g.tipUtc, players: [...g.players.away, ...g.players.home].map((p) => ({ id: p.providerAthleteId, name: p.name })) } };
  const r = propRecordsFromCapture(FIXTURE, { games, books: ["bookA", "bookB"] });
  const k = (x) => `${x.playerId}:${x.market}:${x.side}:${x.line}:${x.american}`;
  assert.deepEqual(r.records.map(k).sort(), ["4396971:reb:OVER:8.5:-115", "4396971:reb:UNDER:8.5:-105", "4433249:pts:OVER:5.5:+105", "4433249:pts:UNDER:5.5:-125", "4433287:pts:OVER:18.5:-110", "4433287:pts:UNDER:18.5:-110"].sort());
  assert.deepEqual(r.dropped.map((d) => [d.name, d.market, d.reason]).sort(), [["Brandon Miller", "reb", "NO_COMPLETE_PAIR"], ["Nobody Here", "pts", "NO_LANE_PLAYER"]].sort());
  assert.ok(r.provenance.quotes.every((q) => q.book && q.quotedAt), "book and quote time are kept, in provenance only");
  // a quote after the fetch, or a fetch after tip, is not used
  assert.equal(propRecordsFromCapture({ ...FIXTURE, fetchedAt: "2026-10-30T22:10:00Z" }, { games, books: ["bookA"] }).records.length, 0);
});
