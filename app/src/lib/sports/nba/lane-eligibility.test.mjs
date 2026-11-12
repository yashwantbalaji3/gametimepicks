/**
 * Site eligibility (lane-eligibility.mjs): the /nba/projections board and its Top Boards apply player-eligibility.mjs,
 * the social cards' module, on the committed 2026-11-11 lane. Switch off or no file ⇒ nothing changes; a file hides
 * exactly the cells and rows the module excludes, never a number; a malformed file fails closed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { eligibilityInputs, eligibleLaneView, siteEligibilityEnabled, ELIGIBILITY_BASIS, PLAYER_ELIGIBILITY_SCHEMA, SITE_ELIGIBILITY_ENV } from "./lane-eligibility.mjs";
import { exclusionReasons } from "./player-eligibility.mjs";
import { boardRows } from "./projection-board-ops.mjs";
import { gateLaneTopBoards } from "./lane-top-boards.mjs";
import { PROJECTION_BOARD_STATS } from "./experimental-public-lane.mjs";

const DATE = "2026-11-11";
const lane = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public", `${DATE}.json`), "utf8"));
const allIds = lane.games.flatMap((g) => [...g.players.away, ...g.players.home].map((r) => String(r.providerAthleteId)));
const NEMBHARD = "4395712", OUBRE = "3133603", SIAKAM = "3149673";
/** Every lane player assessed and clear, except: Nembhard R1 Out (whole row), Oubre a hidden REB cell, Siakam a model-review PTS withhold. */
const doc = {
  schema: PLAYER_ELIGIBILITY_SCHEMA, sport: "nba", date: DATE,
  players: Object.fromEntries(allIds.map((id) => [id, { guard: [], status: null, hideAll: false, rowHide: [], hideCells: [] }])),
  withheld: [`${SIAKAM}.pts`],
};
doc.players[NEMBHARD] = { guard: ["R1"], status: "Out", hideAll: true, rowHide: [], hideCells: [] };
doc.players[OUBRE] = { guard: [], status: null, hideAll: false, rowHide: [], hideCells: ["reb"] };
const rowOf = (snap, id) => snap.games.flatMap((g) => [...g.players.away, ...g.players.home]).find((r) => String(r.providerAthleteId) === id);

test("the switch is OFF by default; only the exact value 1 turns it on", () => {
  assert.equal(siteEligibilityEnabled({}), false);
  assert.equal(siteEligibilityEnabled({ [SITE_ELIGIBILITY_ENV]: "true" }), false);
  assert.equal(siteEligibilityEnabled({ [SITE_ELIGIBILITY_ENV]: "1" }), true);
});

test("no file → MODEL_REVIEW_ONLY, and the view is identical to the lane (before = after)", () => {
  const view = eligibleLaneView(lane, eligibilityInputs(null, DATE));
  assert.equal(view.basis, ELIGIBILITY_BASIS.MODEL_REVIEW_ONLY);
  assert.deepEqual(view.snapshot, lane);
  assert.deepEqual(boardRows(view.snapshot, PROJECTION_BOARD_STATS), boardRows(lane, PROJECTION_BOARD_STATS));
  assert.deepEqual(view.audit, []);
});

test("a file hides exactly what player-eligibility.mjs excludes: whole row, one cell, a combo through its component; numbers unchanged", () => {
  const before = JSON.stringify(lane);
  const view = eligibleLaneView(lane, eligibilityInputs(doc, DATE));
  assert.equal(JSON.stringify(lane), before, "the lane itself is never mutated");
  assert.equal(view.basis, ELIGIBILITY_BASIS.FILE);
  assert.equal(rowOf(view.snapshot, NEMBHARD), undefined, "R1 Out: off the board");
  const o = rowOf(view.snapshot, OUBRE), o0 = rowOf(lane, OUBRE);
  assert.equal(o.medians.reb, ""); assert.equal(o.comboMedians.pra, ""); assert.equal(o.comboMedians.ptsReb, "");
  assert.equal(o.medians.pts, o0.medians.pts); assert.equal(o.comboMedians.ptsAst, o0.comboMedians.ptsAst);
  const s = rowOf(view.snapshot, SIAKAM);
  assert.equal(s.medians.pts, ""); assert.equal(s.medians.reb, rowOf(lane, SIAKAM).medians.reb);
  for (const [id, stat] of [[NEMBHARD, "pts"], [OUBRE, "reb"], [SIAKAM, "pts"]]) assert.ok(exclusionReasons(id, stat, { elig: doc.players, withheld: new Set(doc.withheld) }).length, "the module's own reasons");
  assert.deepEqual(view.audit.map((a) => a.playerId).sort(), [NEMBHARD, OUBRE, SIAKAM].sort());
  const shown = boardRows(view.snapshot, PROJECTION_BOARD_STATS).length, all = boardRows(lane, PROJECTION_BOARD_STATS).length;
  assert.equal(shown, all - 1);
});

test("an unassessed player is excluded (UNKNOWN_NOT_ASSESSED), and a foreign or malformed file fails closed", () => {
  const partial = { ...doc, players: { ...doc.players } }; delete partial.players[SIAKAM];
  assert.equal(rowOf(eligibleLaneView(lane, eligibilityInputs(partial, DATE)).snapshot, SIAKAM), undefined);
  for (const bad of [{ ...doc, date: "2026-11-10" }, { ...doc, schema: "x" }, { schema: "unreadable" }]) {
    const v = eligibleLaneView(lane, eligibilityInputs(bad, DATE));
    assert.equal(v.basis, ELIGIBILITY_BASIS.MALFORMED);
    assert.equal(boardRows(v.snapshot, PROJECTION_BOARD_STATS).length, 0);
  }
});

test("Top Boards rank over the same view the table shows: provenance still reads the lane, cross-page stays consistent", () => {
  const view = eligibleLaneView(lane, eligibilityInputs(doc, DATE)).snapshot;
  const nowIso = "2026-11-11T12:00:00Z";
  const gate = gateLaneTopBoards(lane, { dated: lane, nowIso, enabled: true, view });
  assert.equal(gate.state, "PUBLISHED", JSON.stringify(gate.problems ?? []));
  const ranked = gate.doc.boards.flatMap((b) => b.rows.map((r) => [b.key, r.providerAthleteId]));
  assert.ok(!ranked.some(([, id]) => id === NEMBHARD));
  assert.ok(!ranked.some(([k, id]) => id === OUBRE && ["reb", "pra", "ptsReb"].includes(k)));
  assert.ok(!ranked.some(([k, id]) => id === SIAKAM && ["pts", "pra", "ptsReb", "ptsAst"].includes(k)));
  const off = gateLaneTopBoards(lane, { dated: lane, nowIso, enabled: true });
  assert.deepEqual(gateLaneTopBoards(lane, { dated: lane, nowIso, enabled: true, view: lane }), off, "view = lane is the switch-off result");
});

test("GAME PAGE · the official snapshot rows follow the same view: ineligible player dropped, ineligible cell null, other numbers the snapshot's own", async () => {
  const { eligibleOfficial } = await import("./lane-eligibility.mjs");
  const g = lane.games.find((x) => [...x.players.home, ...x.players.away].some((r) => String(r.providerAthleteId) === OUBRE));
  const official = { eventId: g.providerEventId, players: ["away", "home"].flatMap((side) => g.players[side].map((p) => ({ playerId: p.providerAthleteId, team: side, displayName: p.name, medians: p.medians, expectedMinutes: p.expectedMinutes }))) };
  const view = eligibleLaneView(lane, eligibilityInputs(doc, DATE)).snapshot.games.find((x) => x.providerEventId === g.providerEventId);
  const out = eligibleOfficial(official, view);
  const byId = (id) => out.players.find((p) => String(p.playerId) === id);
  assert.equal(byId(NEMBHARD), undefined, "R1 Out: off the game page");
  assert.equal(byId(OUBRE).medians.reb, "");
  assert.equal(byId(OUBRE).medians.pts, official.players.find((p) => String(p.playerId) === OUBRE).medians.pts);
  assert.equal(out.players.length, official.players.length - 1);
  assert.equal(eligibleOfficial(official, null), official, "switch off (no view) → the snapshot unchanged, same object");
  const none = eligibleLaneView(lane, eligibilityInputs(null, DATE)).snapshot.games.find((x) => x.providerEventId === g.providerEventId);
  assert.deepEqual(eligibleOfficial(official, none), official, "no file → identical rows");
});

test("CUSTOMER COPY · a hidden cell renders EMPTY on the board and on the game page — no dash, no placeholder text", async () => {
  const React = (await import("react")).default; globalThis.React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: NbaOfficialPredictions } = await import("../../../components/nba/official-predictions.tsx");
  const { eligibleOfficial } = await import("./lane-eligibility.mjs");
  const g = lane.games.find((x) => [...x.players.home, ...x.players.away].some((r) => String(r.providerAthleteId) === OUBRE));
  const official = { snapshotId: "t", eventId: g.providerEventId, favouredSide: null, models: { game: null, players: [g.receipt.modelVersion] }, frozenAt: g.frozenAt, lockAt: g.tipUtc, withheld: {}, players: ["away", "home"].flatMap((side) => g.players[side].map((p) => ({ playerId: p.providerAthleteId, team: side, displayName: p.name, medians: p.medians, expectedMinutes: p.expectedMinutes }))) };
  const view = eligibleLaneView(lane, eligibilityInputs(doc, DATE)).snapshot.games.find((x) => x.providerEventId === g.providerEventId);
  const html = renderToStaticMarkup(React.createElement(NbaOfficialPredictions, { official: eligibleOfficial(official, view), teams: { away: g.away, home: g.home }, lane: view, finalNote: null, resultsHref: "/results/nba/", eloCtx: { enabled: false, disclosure: "" } }));
  const row = html.split("<tr").find((r) => r.includes("Kelly Oubre"));
  const cells = [...row.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
  assert.ok(cells.includes(""), "the hidden REB cell is empty");
  assert.doesNotMatch(html, /model review|under review|withheld from display|not assessed|R1|READINESS/i, "no reason or placeholder reaches the page");
  const { boardRows } = await import("./projection-board-ops.mjs");
  const brow = boardRows(eligibleLaneView(lane, eligibilityInputs(doc, DATE)).snapshot, PROJECTION_BOARD_STATS).find((r) => r.id.endsWith(`:${OUBRE}`));
  assert.equal(brow.v[PROJECTION_BOARD_STATS.findIndex(([k]) => k === "reb")], "", "the board carries the empty cell verbatim (its fmt prints it empty)");
});
