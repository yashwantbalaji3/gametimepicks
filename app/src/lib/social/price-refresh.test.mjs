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
  assert.deepEqual(priceRefreshProblems({ ...pkg(), contentType: "NBA_GAME_POST" }, post()), ["UNSUPPORTED_TYPE: NBA_GAME_POST"]);
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
