/**
 * NBA forecast guard — THE ACCESSOR and every surface that reads it (forecast-guard-accessor.mjs).
 *   1. Historical reproducibility: every committed lane dated before the cut-over comes back as the SAME object, and the
 *      settled game page, the /nba/projections board and the Top Boards render byte-for-byte as from the raw file.
 *   2. Fail closed: on or after the cut-over, no (or a mismatched) guard document means no number on any row.
 *   3. Per surface, on the 2026-11-02 slate replayed as if it were after the cut-over: hub/game tables, the projections
 *      board wire format, Top Boards, the Theater official card, Level A and the daily-candidate legs.
 * Run (from app/): npx tsx --test src/lib/sports/nba/forecast-guard-accessor.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyForecastGuard, guardApplies, rowWithheld, cellWithheld, favouredUnderReview, FORECAST_GUARD } from "./forecast-guard-accessor.mjs";
import { buildForecastGuard, UNDER_REVIEW_TEXT, UNDER_REVIEW_SHORT } from "./forecast-guard.mjs";
import { guardLane, withGuardDigest } from "./forecast-guard-files.mjs";
import { readBoxscoreDocs } from "./forecast-guard-build.mjs";
import { PROJECTION_BOARD_STATS } from "./experimental-public-lane.mjs";
import { boardRows, packBoard, unpackBoard, UNDER_REVIEW_LABEL } from "./projection-board-ops.mjs";
import { buildLaneTopBoards } from "./lane-top-boards.mjs";
import { officialPanelFromLane } from "../../simulation-theater/nba/possession/payload.mjs";
import { compareWithOfficial } from "../../simulation-theater/nba/possession/box.mjs";
import { expiredSimulationMap } from "../../../components/nba/expired-simulation.mjs";

globalThis.React = React;
const { default: SettledSimulation } = await import("../../../components/nba/settled-simulation.tsx");
const { default: NbaOfficialPredictions } = await import("../../../components/nba/official-predictions.tsx");
const { loadLaneForDate, committedLaneDates } = await import("../../../components/nba/experimental-lane.tsx");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const LANE_DIR = path.join(APP, "public/data/nba/experimental-public");
const readLane = (d) => JSON.parse(fs.readFileSync(path.join(LANE_DIR, `${d}.json`), "utf8"));
const PAST = fs.readdirSync(LANE_DIR).map((f) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1]).filter((d) => d && d < FORECAST_GUARD.cutover).sort();
const BOX = readBoxscoreDocs(REPO).docs;
const NOW = "2026-11-02T12:00:00Z"; // before every 11-02 tip, so the Top Boards rank the whole slate

const allRows = (lane) => lane.games.flatMap((g) => [...g.players.away, ...g.players.home]);
const settledHtml = (date, game) => renderToStaticMarkup(React.createElement(SettledSimulation, { view: { id: game.providerEventId, date, game, record: null } }));

// ── 1. HISTORICAL REPRODUCIBILITY ────────────────────────────────────────────────────────────────────────────────────
test("the cut-over is after every slate published before the guard existed", () => {
  assert.ok(PAST.length >= 10, "the committed past lanes are all checked below");
  assert.ok(PAST.includes("2026-11-02"));
  assert.ok(FORECAST_GUARD.cutover > "2026-11-02");
});

test("before the cut-over the accessor returns the SAME lane object, whatever guard document it is given", () => {
  for (const d of PAST) {
    const raw = readLane(d);
    assert.equal(applyForecastGuard(raw, null), raw, d);
    assert.equal(applyForecastGuard(raw, { schema: "nba-forecast-guard@1", date: d, asOf: raw.generatedAt, games: [] }), raw, d);
    assert.equal(guardLane(APP, raw), raw, d);
  }
});

test("byte-compare: every past slate's loader output, settled game pages, projections board and Top Boards are unchanged", () => {
  assert.deepEqual(committedLaneDates().filter((d) => d < FORECAST_GUARD.cutover), PAST);
  for (const d of PAST) {
    const raw = readLane(d);
    const loaded = loadLaneForDate(d);
    assert.equal(JSON.stringify(loaded), JSON.stringify(raw), `${d} loader`);
    for (const g of raw.games) {
      const lg = loaded.games.find((x) => x.providerEventId === g.providerEventId);
      assert.equal(settledHtml(d, lg), settledHtml(d, g), `${d} ${g.providerEventId} settled page`);
    }
    assert.equal(JSON.stringify(packBoard(boardRows(loaded, PROJECTION_BOARD_STATS))), JSON.stringify(packBoard(boardRows(raw, PROJECTION_BOARD_STATS))), `${d} board`);
    const nowIso = `${d}T12:00:00Z`;
    assert.equal(JSON.stringify(buildLaneTopBoards(loaded, { nowIso })), JSON.stringify(buildLaneTopBoards(raw, { nowIso })), `${d} Top Boards`);
  }
});

test("the lane files themselves are never written by the guard", () => {
  const before = PAST.map((d) => fs.readFileSync(path.join(LANE_DIR, `${d}.json`), "utf8"));
  for (const d of PAST) applyForecastGuard(readLane(d), null, { cutover: "2000-01-01" });
  assert.deepEqual(PAST.map((d) => fs.readFileSync(path.join(LANE_DIR, `${d}.json`), "utf8")), before);
});

// ── 2. FAIL CLOSED ──────────────────────────────────────────────────────────────────────────────────────────────────
const AFTER = { cutover: "2026-11-02" }; // replay 11-02 as a guarded slate
const LANE = readLane("2026-11-02");
const DOC = buildForecastGuard({ lane: LANE, boxscores: BOX });
const GUARDED = applyForecastGuard(LANE, DOC, AFTER);

const assertNoNumber = (r, at) => {
  assert.equal(r.expectedMinutes, null, at);
  for (const v of [...Object.values(r.medians), ...Object.values(r.comboMedians ?? {})]) assert.equal(v, null, `${at}: a withheld figure is null — never a number, never 0`);
};

test("fail closed: no guard document → every row withheld (GUARD_MISSING), every figure null, never 0", () => {
  const g = applyForecastGuard(LANE, null, AFTER);
  assert.equal(g.guard.state, "MISSING");
  for (const r of allRows(g)) { assert.ok(rowWithheld(r)); assert.deepEqual(r.guard.rules, ["GUARD_MISSING"]); assertNoNumber(r, r.name); }
  for (const game of g.games) assert.ok(favouredUnderReview(game), "the favoured side is unchecked, so under review");
});

test("fail closed: a guard document of another date, another lane build, another schema, or another receipt is not used", () => {
  const bad = [
    { ...DOC, date: "2026-11-01" },
    { ...DOC, asOf: "2026-11-02T07:00:00Z" },
    { ...DOC, schema: "nba-forecast-guard@0" },
  ];
  for (const d of bad) for (const r of allRows(applyForecastGuard(LANE, d, AFTER))) assert.ok(rowWithheld(r));
  const otherReceipt = { ...DOC, games: DOC.games.map((x) => ({ ...x, receiptPayloadSha256: "0".repeat(64) })) };
  for (const r of allRows(applyForecastGuard(LANE, otherReceipt, AFTER))) assert.ok(rowWithheld(r));
  const silent = { ...DOC, games: DOC.games.map((x) => ({ ...x, players: {} })) };
  for (const r of allRows(applyForecastGuard(LANE, silent, AFTER))) assert.deepEqual(r.guard.rules, ["GUARD_MISSING"], "a row the document is silent on is never a silent pass");
});

test("the switch: off returns the lane untouched even after the cut-over", () => {
  assert.equal(applyForecastGuard(LANE, null, { ...AFTER, enabled: false }), LANE);
  assert.equal(guardApplies("2026-11-02", { cutover: "2026-11-05" }), false);
  assert.equal(guardApplies("2026-11-05", { cutover: "2026-11-05" }), true);
});

// ── 3. THE GUARDED SLATE ────────────────────────────────────────────────────────────────────────────────────────────
test("hide-only: a shown figure is always the lane's own; withheld rows lose every figure; pass cells are untouched", () => {
  const raw = new Map(allRows(LANE).map((r) => [r.providerAthleteId, r]));
  let whole = 0, cells = 0;
  for (const r of allRows(GUARDED)) {
    const o = raw.get(r.providerAthleteId);
    if (rowWithheld(r)) { whole += 1; assertNoNumber(r, r.name); assert.equal(r.guard.text, UNDER_REVIEW_TEXT); continue; }
    if (r.guard) cells += 1;
    assert.equal(r.expectedMinutes, o.expectedMinutes);
    for (const [k, v] of Object.entries(r.medians)) assert.ok(v === null ? cellWithheld(r, k) : v === o.medians[k], `${r.name} ${k}`);
    for (const [k, v] of Object.entries(r.comboMedians)) assert.ok(v === null ? r.guard?.cells?.length > 0 : v === o.comboMedians[k], `${r.name} ${k}`);
  }
  assert.equal(whole, 123, "115 blocked + 8 review on 2026-11-02");
  assert.equal(cells, 57);
  const cody = allRows(GUARDED).find((r) => r.name === "Cody Williams");
  assert.ok(rowWithheld(cody) && cody.guard.rules.includes("R3"));
});

test("game page and settled page: a withheld row prints the label and no digit; others print the lane's numbers", () => {
  const game = GUARDED.games.find((g) => [...g.players.away, ...g.players.home].some((r) => r.name === "Cody Williams"));
  const html = settledHtml("2026-11-02", game);
  const tr = html.match(/<tr>(?:(?!<\/tr>).)*Cody Williams(?:(?!<\/tr>).)*<\/tr>/)?.[0];
  assert.ok(tr, "his row is listed by name");
  assert.ok(tr.includes(UNDER_REVIEW_TEXT));
  assert.doesNotMatch(tr.replace(/<[^>]+>/g, ""), /\d/, "no number on a withheld row (not even 0)");
});

test("projections board: withheld rows travel with null figures and the guard marker; the client shows the label", () => {
  const rows = boardRows(GUARDED, PROJECTION_BOARD_STATS);
  const packed = packBoard(rows);
  assert.ok(Array.isArray(packed.g));
  const un = unpackBoard(packed);
  const cody = un.find((r) => r.name === "Cody Williams");
  assert.equal(cody.ur, true);
  assert.equal(cody.min, null);
  assert.ok(cody.v.every((v) => v === null));
  const cell = un.find((r) => r.uc?.length);
  assert.ok(cell && cell.uc.every((i) => cell.v[i] === null));
  assert.equal(un.filter((r) => r.ur).length, 123);
  assert.deepEqual({ ...UNDER_REVIEW_LABEL }, { text: UNDER_REVIEW_TEXT, short: UNDER_REVIEW_SHORT }, "the island's copy of the words");
  // a slate with no guard marker keeps the old wire format exactly
  assert.equal(packBoard(boardRows(LANE, PROJECTION_BOARD_STATS)).g, undefined);
});

test("Top Boards: a projection under model review is never ranked, and a withheld cell never ranks", () => {
  const doc = buildLaneTopBoards(GUARDED, { nowIso: NOW });
  const held = new Set(allRows(GUARDED).filter(rowWithheld).map((r) => r.providerAthleteId));
  for (const b of doc.boards) for (const r of b.rows) {
    assert.ok(!held.has(r.providerAthleteId), `${b.key}: ${r.name}`);
    const lr = allRows(GUARDED).find((x) => x.providerAthleteId === r.providerAthleteId);
    assert.ok(!cellWithheld(lr, b.key), `${b.key}: ${r.name} has a withheld cell`);
  }
  assert.ok(doc.excluded.some((x) => x.reason === "UNDER_MODEL_REVIEW"));
});

test("Theater official card: simulated values never fill a withheld official cell", () => {
  const g = GUARDED.games[0];
  const lr = [...g.players.home.map((p) => ({ p, team: "home" })), ...g.players.away.map((p) => ({ p, team: "away" }))];
  // the artifact's embedded panel carries its own (simulated) medians for every player
  const panel = { snapshotId: "s", eventId: g.providerEventId, favouredSide: "HOME", models: { game: null, players: [] }, frozenAt: null, lockAt: null, withheld: {},
    players: lr.map(({ p, team }) => ({ playerId: p.providerAthleteId, team, displayName: p.name, participation: null, medians: { pts: 99, reb: 99, ast: 99, threePm: 99 }, expectedMinutes: 99 })) };
  const out = officialPanelFromLane(panel, g);
  for (const p of out.players) {
    const l = lr.find((x) => x.p.providerAthleteId === p.playerId).p;
    if (rowWithheld(l)) { assert.equal(p.guard.state, l.guard.state); assert.equal(p.expectedMinutes, null); assert.ok(Object.values(p.medians).every((v) => v === null)); }
    assert.ok(!Object.values(p.medians).includes(99) && p.expectedMinutes !== 99, "the artifact's simulated number never prints");
  }
  const held = out.players.find((p) => p.guard && p.guard.state !== "pass");
  assert.ok(held, "this game has a withheld row");
  // the run-vs-official comparison: the run's own number is labelled as the run; the official side stays withheld
  const cmp = compareWithOfficial({ home: [], away: [] }, out).find((c) => c.playerId === held.playerId);
  assert.equal(cmp.underReview, true);
  assert.ok(cmp.families.every((f) => f.official === null && f.diff === null));
  const html = renderToStaticMarkup(React.createElement(NbaOfficialPredictions, { official: out, teams: { home: { abbr: g.home.abbr, name: g.home.name }, away: { abbr: g.away.abbr, name: g.away.name } }, lane: g, finalNote: null, resultsHref: "/results/nba/", eloCtx: { enabled: false, disclosure: "" } }));
  assert.ok(html.includes(UNDER_REVIEW_TEXT));
});

// Level A / daily candidates read through guardLane with the real cut-over: a temp app holding a lane dated on it.
function tempApp({ withGuard, digest = true }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fguard-"));
  const date = FORECAST_GUARD.cutover;
  const lane = { ...LANE, date, games: LANE.games.map((g) => ({ ...g, etDate: date })) };
  const dir = path.join(root, "app/public/data/nba/experimental-public");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${date}.json`), JSON.stringify(lane));
  if (withGuard) {
    const gd = path.join(root, "app/public/data", FORECAST_GUARD.dir);
    fs.mkdirSync(gd, { recursive: true });
    fs.writeFileSync(path.join(gd, `${date}.json`), JSON.stringify(digest ? withGuardDigest({ ...DOC, date }) : { ...DOC, date }));
  }
  return { root, date, lane };
}

test("Level A (Bank Builder / Moonshot / Parlay Lab inputs): withheld projections are not listed; a flagged favourite is refused", async () => {
  const { nbaSelections } = await import("../../products/level-a/sources.mjs");
  const elo = { enabled: false, disclosure: "" };
  const none = tempApp({ withGuard: false });
  const a = nbaSelections({ repoRoot: none.root, date: none.date, eloCtx: elo });
  assert.equal(a.projections.length, 0, "fail closed: no guard file, no player projection");
  assert.ok(a.selections.every((s) => s.participantStatuses.length > 0), "and every favoured side is unchecked");
  const unverified = tempApp({ withGuard: true, digest: false });
  assert.equal(nbaSelections({ repoRoot: unverified.root, date: unverified.date, eloCtx: elo }).projections.length, 0, "fail closed: a guard file without a valid digest is not used");
  const ok = tempApp({ withGuard: true });
  const b = nbaSelections({ repoRoot: ok.root, date: ok.date, eloCtx: elo });
  // Level A lists the points median only: withheld rows and rows whose points cell is withheld are absent
  assert.equal(b.projections.length, allRows(GUARDED).filter((r) => typeof r.medians.pts === "number").length);
  assert.ok(b.projections.length < 296 - 123);
  assert.ok(!b.projections.some((p) => p.name === "Cody Williams"));
  assert.equal(b.selections.filter((s) => s.participantStatuses.length).length, 8);
  const { levelASuggestions } = await import("../../products/level-a/suggestions.mjs");
  const flagged = b.selections.find((s) => s.participantStatuses.length && s.selection);
  const ans = levelASuggestions({ selections: [flagged], now: "2026-11-05T12:00:00Z", productDay: ok.date });
  assert.ok(ans.refused.some((r) => r.reasons.includes("UNAVAILABLE")), "Level A's own UNAVAILABLE refusal");
});

test("daily candidates: the lane read is guarded (a flagged favourite carries the review)", async () => {
  const { nbaInputs } = await import("../../products/daily-candidates/load.mjs");
  const ok = tempApp({ withGuard: true });
  const { legs } = nbaInputs({ appRoot: path.join(ok.root, "app"), productDay: ok.date, env: {} });
  const winners = legs.filter((l) => l.family === "winner");
  assert.ok(winners.length > 0);
  assert.equal(winners.filter((l) => l.guard?.state === "review").length, 8);
});

test("the root not-found payload (rides on every page) is unchanged by the guard: ids, dates and matchups only", () => {
  assert.deepEqual(expiredSimulationMap([{ date: "2026-11-02", games: GUARDED.games }]), expiredSimulationMap([{ date: "2026-11-02", games: LANE.games }]));
});
