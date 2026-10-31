import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { captureProblems, isApproved, priceRefreshProblems, quoteChanges } from "./price-refresh.mjs";
import { refreshPrice } from "../../../scripts/social/price-refresh.mjs";

const OVER = { state: "OVER", colour: "green", side: "OVER", reason: null, line: 210.5, price: -110 };
const content = () => ({
  week: 8, window: "early", winner: { eventId: "1", winner: "DET" }, game: { eventId: "1", winPct: "56.8%" }, estimate: true, gaps: [], quoteAge: { quotes: 2 },
  market: { side: "DET", book: "draftkings", price: -150, quotedAt: "2026-11-01T14:00:00Z" },
  tdCandidates: [{ playerId: "a", name: "A", pct: "40%", value: 0.4, yesPrice: 120, book: "draftkings", quotedAt: "2026-11-01T14:00:00Z" }],
  propRows: [{ playerId: "a", market: "player_pass_yds", projection: "230 est.", line: 210.5, overPrice: -110, underPrice: -110, book: "draftkings", quotedAt: "2026-11-01T14:00:00Z", comparison: OVER }],
});
const cells = () => ({ "a.name": "A", "a.player_pass_yds.proj": "230 est.", "a.player_pass_yds.line": "210.5", "a.player_pass_yds.vs": "▲ OVER -110" });
const pkg = () => ({ dedupeId: "d", contentSha256: "s", contentType: "NFL_GAME_POST", designVersion: "2.5", caption: "Lions", content: content(), snapshotRefs: [{ ref: "app/x", sha256: "1" }, { ref: "gtp-private/odds/nfl/a", sha256: "2" }], images: [{ scale: 1 }, { scale: 2 }], commandCenter: { captions: [{ text: "Lions" }], claims: [{ key: "week", display: "8" }, ...Object.entries(cells()).map(([key, display]) => ({ key, display }))] } });
const post = (edit = () => {}) => {
  const p = { designVersion: "2.5", caption: "Lions", ccCaption: "Lions", extraClaims: [{ key: "week", display: "8" }], content: content(), snapshotRefs: [{ ref: "app/x", sha256: "1" }, { ref: "gtp-private/odds/nfl/b", sha256: "3" }], cards: [{ cells: cells() }] };
  p.content.propRows[0] = { ...p.content.propRows[0], line: 212.5, overPrice: -115, comparison: { ...OVER, line: 212.5, price: -115 } };
  p.cards[0].cells["a.player_pass_yds.vs"] = "▲ OVER -115";
  p.cards[0].cells["a.player_pass_yds.line"] = "212.5";
  edit(p);
  return p;
};

test("quote fields may move", () => {
  assert.deepEqual(priceRefreshProblems(pkg(), post()), []);
  assert.deepEqual(quoteChanges(pkg(), post()).map((c) => c.field), ["a.player_pass_yds.line", "a.player_pass_yds.vs"]);
});

test("every non-quote change refuses", () => {
  const cases = [
    ["WINNER_CHANGED", (p) => { p.content.winner.winner = "MIN"; }],
    ["PLAYERS_CHANGED", (p) => { p.content.propRows[0].playerId = "z"; }],
    ["PLAYERS_CHANGED", (p) => { p.content.tdCandidates[0].playerId = "z"; }],
    ["FORECAST_VALUES_CHANGED", (p) => { p.content.propRows[0].projection = "231 est."; }],
    ["FORECAST_VALUES_CHANGED", (p) => { p.content.game.winPct = "57.0%"; }],
    ["COMPARISON_DIRECTION_CHANGED", (p) => { p.content.propRows[0].comparison = { ...OVER, state: "UNDER", colour: "red", side: "UNDER" }; }],
    ["COMPARISON_DIRECTION_CHANGED", (p) => { p.content.propRows[0].comparison = { ...OVER, state: "NEUTRAL", colour: "neutral", side: null, reason: "INVALID_ODDS" }; }],
    ["CAPTION_CHANGED", (p) => { p.caption = "Vikings"; }],
    ["LAYOUT_CHANGED", (p) => { p.cards.push({ cells: {} }); }],
    ["LAYOUT_CHANGED", (p) => { p.designVersion = "3"; }],
    ["LAYOUT_CHANGED: cell a.name", (p) => { p.cards[0].cells["a.name"] = "B"; }],
    ["SOURCES_CHANGED", (p) => { p.snapshotRefs[0].sha256 = "9"; }],
  ];
  for (const [code, edit] of cases) assert.ok(priceRefreshProblems(pkg(), post(edit)).includes(code), code);
  assert.deepEqual(priceRefreshProblems({ ...pkg(), contentType: "RESULTS_RECAP" }, post()), ["UNSUPPORTED_TYPE: RESULTS_RECAP"]);
});

test("the approval names the exact content; the capture must be newer", () => {
  assert.equal(isApproved(pkg(), { approved: [{ dedupeId: "d", contentSha256: "s" }] }), true);
  assert.equal(isApproved(pkg(), { approved: [{ dedupeId: "d", contentSha256: "old" }] }), false);
  assert.equal(isApproved(pkg(), null), false);
  const asOf = "2026-11-01T16:00:00Z";
  assert.deepEqual(captureProblems(pkg(), { capturedAt: "2026-11-01T15:00:00Z", asOf }), []);
  assert.deepEqual(captureProblems(pkg(), { capturedAt: "2026-11-01T14:00:00Z", asOf }), ["CAPTURE_NOT_NEWER"]);
  assert.deepEqual(captureProblems(pkg(), { capturedAt: "2026-11-01T17:00:00Z", asOf }), ["CAPTURE_AFTER_AS_OF"]);
});

test("every attempt is audited; a refused one writes no package", async () => {
  const audit = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "refresh-")), "a.jsonl");
  const base = { pkg: pkg(), ledger: { approved: [{ dedupeId: "d", contentSha256: "s" }] }, capture: { ref: "gtp-private/odds/nfl/b", sha256: "3", capturedAt: "2026-11-01T15:00:00Z" }, asOf: "2026-11-01T16:00:00Z", outRoot: "x", audit };
  let wrote = 0;
  const write = async () => { wrote += 1; return [{ file: "f", pkg: { contentSha256: "new" } }]; };
  assert.equal((await refreshPrice({ ...base, rebuild: () => post(), write })).status, "REFRESHED");
  assert.equal(wrote, 1);
  assert.equal((await refreshPrice({ ...base, rebuild: () => post((p) => { p.caption = "x"; }), write })).status, "REFUSED");
  assert.equal((await refreshPrice({ ...base, ledger: null, rebuild: () => post(), write })).status, "REFUSED");
  assert.equal((await refreshPrice({ ...base, rebuild: () => null, write })).status, "REFUSED");
  assert.equal(wrote, 1);
  const rows = fs.readFileSync(audit, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(rows.map((r) => r.status), ["REFRESHED", "REFUSED", "REFUSED", "REFUSED"]);
  assert.equal(rows[0].needsApproval, true);
  assert.deepEqual(rows[2].problems, ["NOT_APPROVED"]);
});

const QT = "2026-10-30T19:42:56Z";
const nbaContent = () => ({ eventId: "9", imageOrder: ["9-ml", "9"], captionPlayers: { players: [{ playerId: "1", pts: 23.3 }] }, availabilityCaveats: [], winner: { eventId: "9", winner: "DEN", side: "DEN", awayEstimate: 0.53, homeEstimate: 0.47, book: "draftkings", price: -180, quotedAt: QT }, lines: { quotedAt: "Oct 30, 12:00 PM ET", comparedRows: 63 } });
const nbaCells = () => ({ "market.price": "DEN -180", "1.pts": "▼ 23.3", "1.pts.line": "U 25.5 · -118" });
const nbaPkg = () => ({ contentType: "NBA_GAME_POST", sport: "nba", variant: "9", designVersion: "3", caption: "c", anomalyCheck: "PASS", anomalies: [], content: nbaContent(), snapshotRefs: [{ ref: "app/l", sha256: "1" }, { ref: "gtp-private/odds/nba/a", sha256: "2" }], images: [{ scale: 1 }], commandCenter: { captions: [{ text: "c" }], claims: Object.entries(nbaCells()).map(([key, display]) => ({ key, display })) } });
const nbaPost = (edit = () => {}) => { const p = { designVersion: "3", caption: "c", ccCaption: "c", anomalyCheck: "PASS", anomalies: [], content: nbaContent(), snapshotRefs: [{ ref: "app/l", sha256: "1" }, { ref: "gtp-private/odds/nba/b", sha256: "3" }], cards: [{ cells: nbaCells() }] }; p.content.winner.price = -190; p.content.winner.quotedAt = "2026-10-30T22:00:00Z"; p.cards[0].cells["market.price"] = "DEN -190"; p.cards[0].cells["1.pts.line"] = "U 26.5 · -120"; edit(p); return p; };

test("NBA game post: only quotes may move, fail-closed on the rest", () => {
  assert.deepEqual(priceRefreshProblems(nbaPkg(), nbaPost()), []);
  const cases = [
    ["WINNER_CHANGED", (p) => { p.content.winner.winner = "PHX"; }],
    ["FORECAST_VALUES_CHANGED", (p) => { p.content.winner.awayEstimate = 0.6; }],
    ["PLAYERS_CHANGED", (p) => { p.content.captionPlayers.players[0].playerId = "2"; }],
    ["CONTENT_CHANGED", (p) => { p.content.lines.comparedRows = 60; }],
    ["ANOMALIES_CHANGED", (p) => { p.anomalyCheck = "REVIEW"; }],
    ["COMPARISON_DIRECTION_CHANGED", (p) => { p.cards[0].cells["1.pts.line"] = "O 22.5 · -110"; }],
    ["LAYOUT_CHANGED: cell 1.pts", (p) => { p.cards[0].cells["1.pts"] = "▲ 23.3"; }],
    ["CAPTION_CHANGED", (p) => { p.caption = "x"; }],
    ["SOURCES_CHANGED", (p) => { p.snapshotRefs[0].sha256 = "9"; }],
  ];
  for (const [code, edit] of cases) assert.ok(priceRefreshProblems(nbaPkg(), nbaPost(edit)).includes(code), code);
  assert.deepEqual(captureProblems(nbaPkg(), { capturedAt: "2026-10-30T19:00:00Z", asOf: "2026-10-30T23:00:00Z" }), ["CAPTURE_NOT_NEWER"]);
});

test("NBA Tonight refreshes the ml variant only; the carousel keeps each line's direction", () => {
  const g = (price, winner = "DEN") => ({ eventId: "9", winner, side: winner, awayEstimate: 0.5, homeEstimate: 0.5, book: "draftkings", price, quotedAt: QT });
  const t = (x) => ({ contentType: "NBA_TONIGHT", variant: "ml", designVersion: "2", caption: "c", content: { games: [x] }, snapshotRefs: [], images: [{ scale: 1 }], commandCenter: { captions: [{ text: "c" }], claims: [] } });
  const tp = (x) => ({ designVersion: "2", caption: "c", content: { games: [x] }, snapshotRefs: [], cards: [{ cells: {} }] });
  assert.deepEqual(priceRefreshProblems(t(g(-180)), tp(g(-190))), []);
  assert.ok(priceRefreshProblems(t(g(-180)), tp(g(-190, "PHX"))).includes("WINNER_CHANGED"));
  assert.deepEqual(priceRefreshProblems({ ...t(g(-180)), variant: null }, tp(g(-180))), ["UNSUPPORTED_TYPE: NBA_TONIGHT:plain"]);
  const part = (cls, text) => ({ board: "pts", rows: [{ rank: 1, name: "A", value: 20, line: { cls, glyph: "x", text } }] });
  const c = { ...t(g(-180)), contentType: "NBA_TOP5_CAROUSEL", variant: null, content: { parts: [part("over", "O 18.5 -110")] } };
  assert.deepEqual(priceRefreshProblems(c, { ...tp(g(-180)), content: { parts: [part("over", "O 19.5 -115")] } }), []);
  assert.ok(priceRefreshProblems(c, { ...tp(g(-180)), content: { parts: [part("under", "U 21.5 -115")] } }).includes("CONTENT_CHANGED"));
});
