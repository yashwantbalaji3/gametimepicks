/**
 * PASSING + RUSHING YARDS RESTORED AS LABELLED ESTIMATES (founder P0 2026-10-30) — cross-surface equality on PINNED data.
 *
 * The per-game boards mark player_pass_yds / player_rush_yds ESTIMATE (each failed a calibration bar). The written policy
 * (family-publication.mjs ESTIMATE DISPLAY POLICY) is public display with the failed bar and caveat, never as a pick. This
 * proves, on the pinned pre-TNF week-8 snapshot (__fixtures__/week8-pre-tnf: 14 per-game boards + the three forecasts of
 * record this test reads), that for passing and rushing yards:
 *
 *   1. board == Top board == game page view == player page / My GameTime == graphics export == official snapshot, to the
 *      same exact number and the same printed digits (forecast-view formatValue), under the same one label;
 *   2. the Full Week scope keeps TNF CAR @ GB from its frozen pre-kickoff board, byte-equal, rows marked completed;
 *   3. the upcoming (pregame) scope excludes every started game;
 *   4. no ESTIMATE value ever carries a price, line, side or direction, and none is promoted to PUBLISHED.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nfl/pass-rush-estimates.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildTopBoards } from "./top-boards.mjs";
import { gameView, gameTabs, topBoardTabs, formatValue, MARKET_KEY, COMPLETED_ROW_LABEL } from "./forecast-view.mjs";
import { officialSnapshotFor } from "./forecast-view-load.mjs";
import { estimateLabel } from "./family-publication.mjs";
import { playerOf } from "../../consistency/official-snapshot.mjs";
import { buildNflGraphicsExport, graphicsExportViolations, MODEL_STATUS } from "../../social/graphics-export.mjs";

const APP = process.cwd();
const PIN = path.join(APP, "src/lib/sports/nfl/__fixtures__/week8-pre-tnf");
const boardPath = (id) => path.join(PIN, "player-board", `${id}.json`);
const BOARD_IDS = fs.readdirSync(path.join(PIN, "player-board")).filter((f) => /^\d+\.json$/.test(f)).map((f) => f.replace(/\.json$/, "")).sort();
const BYTES_BEFORE = new Map(BOARD_IDS.map((id) => [id, fs.readFileSync(boardPath(id))]));
const boards = BOARD_IDS.map((id) => JSON.parse(BYTES_BEFORE.get(id).toString("utf8")));
const boardOf = (id) => boards.find((b) => String(b.providerEventId) === id);
const FORECASTS = JSON.parse(fs.readFileSync(path.join(PIN, "forecasts-week8.json"), "utf8")).forecasts;

const TNF = "401873023"; // CAR @ GB, kickoff 2026-10-30T00:15Z
const GAMES = ["401873026", "401873036"]; // BAL @ BUF (Sun), CHI @ SEA (Mon)
const BEFORE_TNF = "2026-10-29T23:00:00Z";
const AFTER_TNF = "2026-10-30T13:00:00Z";
const FAMS = [["player_pass_yds", "passingYards"], ["player_rush_yds", "rushingYards"]];
const LABEL = "Estimate · calibration standard not yet met";

const viewFor = (id) => {
  const forecast = FORECASTS.find((f) => String(f.providerEventId) === id);
  const board = boardOf(id);
  const { snapshot, refusal } = officialSnapshotFor(forecast, board);
  assert.ok(snapshot, `${id}: official snapshot refused (${refusal})`);
  return { view: gameView({ forecast, board, official: snapshot }), snapshot };
};
const VIEWS = Object.fromEntries([TNF, ...GAMES].map((id) => [id, viewFor(id)]));

test("fixture: the pinned boards mark passing and rushing ESTIMATE on every game, with the policy's calibration reasons", () => {
  assert.equal(boards.length, 14);
  for (const b of boards) for (const [mk] of FAMS) {
    assert.equal(b.families[mk].state, "ESTIMATE", `${b.matchup} ${mk}`);
    assert.equal(estimateLabel(b.families[mk].reason), LABEL);
  }
  assert.ok(boards.every((b) => Date.parse(b.generatedAt) < Date.parse("2026-10-30T00:15:00Z")), "every pinned board precedes TNF kickoff");
});

test("cross-surface: board == Top board == game page == player page == export == snapshot, same digits, one label (≥2 week-8 games)", async () => {
  const { nflPlayerMarkets } = await import("../../my/read-model.ts");
  const top = buildTopBoards({ weekBoards: boards, now: BEFORE_TNF, slotFor: () => ({ pricingState: "NOT_PROBED" }) });
  const exp = buildNflGraphicsExport({ seasonType: 2, week: 8, asOf: BEFORE_TNF, boards, views: Object.values(VIEWS).map((v) => v.view) });
  assert.deepEqual(graphicsExportViolations(exp), []);
  let compared = 0;
  for (const id of GAMES) {
    const board = boardOf(id);
    const { view, snapshot } = VIEWS[id];
    const tabs = gameTabs(view);
    for (const [mk, vk] of FAMS) {
      const players = board.players.filter((p) => Number.isFinite(p.markets?.[mk]?.median));
      assert.ok(players.length >= 1, `${board.matchup} ${mk}: the board projects someone`);
      for (const p of players) {
        const exact = p.markets[mk].median;
        const digits = formatValue("yards", exact);
        // official snapshot
        const sf = playerOf(snapshot, p.playerId).families[mk];
        assert.equal(sf.state, "ESTIMATE");
        assert.equal(sf.median, exact, `${p.name} ${mk}: snapshot`);
        // game page view (the all-players table and the tabs read the same entry)
        const ve = view.players.find((x) => x.playerId === p.playerId)?.families?.[vk];
        assert.ok(ve, `${p.name} ${mk}: on the game page`);
        assert.equal(ve.value, exact);
        assert.equal(ve.familyState, "ESTIMATE");
        assert.equal(ve.estimateLabel, LABEL);
        assert.equal(ve.market, null, "no price beside an estimate");
        assert.ok(tabs.lists[vk].some((r) => r.player.playerId === p.playerId && r.entry.value === exact));
        // player page / My GameTime
        const pm = nflPlayerMarkets(board, p, { includeEstimates: true }).find((m) => m.key === mk);
        assert.equal(pm.display.value, digits, `${p.name} ${mk}: player page digits`);
        assert.equal(pm.estimate, LABEL);
        assert.equal(nflPlayerMarkets(board, p).find((m) => m.key === mk), undefined, "Ask / Compare default stays PUBLISHED-only");
        compared += 1;
      }
      assert.equal(tabs.families.find((f) => f.key === vk).estimate, LABEL, `${board.matchup} ${mk}: game page label`);
      assert.equal(tabs.families.find((f) => f.key === vk).withheld, null);
    }
  }
  // Top board rows from these games == the board, and the export row == the Top board row
  for (const [mk, vk] of FAMS) {
    const tb = top.weekly.boards.find((b) => b.family === mk);
    assert.equal(tb.state, "ESTIMATE");
    assert.equal(tb.estimate.label, LABEL);
    const hubTabs = topBoardTabs(top.weekly);
    assert.equal(hubTabs.families.find((f) => f.key === vk).estimate, LABEL, "hub label == game page label");
    const eb = exp.boards.find((b) => b.market === mk);
    assert.equal(eb.modelStatus, MODEL_STATUS.OFFICIAL_ESTIMATE);
    assert.equal(eb.label, LABEL);
    assert.equal(eb.rowIds.length, tb.rows.length);
    for (const r of tb.rows) {
      const raw = boardOf(String(r.providerEventId)).players.find((p) => p.playerId === r.playerId).markets[mk].median;
      assert.equal(r.value, raw, `${r.name}: Top board == board`);
      const er = exp.rows.find((x) => x.identity.playerId === r.playerId && x.identity.market === mk);
      assert.equal(er.model.value, r.value);
      assert.equal(er.model.display, formatValue("yards", r.value), "export digits == site digits");
      assert.equal(er.model.label, LABEL);
      if (VIEWS[String(r.providerEventId)]) {
        assert.equal(er.checks.gamePageValue, "EQUAL");
        assert.equal(er.graphicEligibility.eligible, true, `${er.rowId}: ${er.graphicEligibility.reasons}`);
        compared += 1;
      } else {
        assert.ok(er.graphicEligibility.reasons.includes("NO_GAME_PAGE_VIEW"), "no view in this fixture → not eligible, never guessed");
      }
    }
  }
  assert.ok(compared >= 10, `compared ${compared}`);
});

test("full week: TNF stays in from its frozen pre-kickoff board (byte-equal, rows completed); the pregame view excludes it", () => {
  const doc = buildTopBoards({ weekBoards: boards, now: AFTER_TNF, slotFor: () => ({ pricingState: "NOT_PROBED" }) });
  // upcoming / pregame view: no started game
  assert.ok(!doc.weekly.scope.events.includes(TNF));
  assert.equal(doc.weekly.scope.eventsDroppedAfterKickoff, 1);
  for (const sc of [doc.weekly, ...doc.daily]) for (const b of sc.boards) for (const r of b.rows ?? []) {
    assert.notEqual(String(r.providerEventId), TNF, `${b.id}: pregame view ranks a started game`);
    assert.equal(r.completed, undefined);
  }
  // full week: every game, TNF marked completed
  assert.equal(doc.fullWeek.scope.kind, "FULL_WEEK_WITH_COMPLETED");
  assert.equal(doc.fullWeek.scope.eventsIncluded, 14);
  assert.deepEqual(doc.fullWeek.scope.completedEvents, [TNF]);
  const tnfBoard = boardOf(TNF);
  let tnfRows = 0;
  for (const b of doc.fullWeek.boards) for (const r of b.rows ?? []) {
    if (String(r.providerEventId) !== TNF) { assert.equal(r.completed, undefined); continue; }
    assert.equal(r.completed, true);
    const frozen = tnfBoard.players.find((p) => p.playerId === r.playerId).markets[b.family];
    assert.equal(r.value, frozen[b.method], `${r.name} ${b.family}: the frozen pre-kickoff value, exact`);
    tnfRows += 1;
  }
  // TNF ranks in the full-week board for the families it leads (its rushing/passing rows are real board rows)
  const fullRush = doc.fullWeek.boards.find((b) => b.family === "player_rush_yds");
  const tnfRush = tnfBoard.players.filter((p) => ["AVAILABLE_ROLE_UNCERTAIN", "ACTIVE_PROJECTED"].includes(p.participation) && Number.isFinite(p.markets.player_rush_yds?.median)).map((p) => p.markets.player_rush_yds.median);
  if (Math.max(...tnfRush) >= fullRush.rows.at(-1).value) assert.ok(tnfRows >= 1, "a TNF player who ranks is kept");
  // the hub/week page label a completed row as such
  const tabs = topBoardTabs(doc.fullWeek);
  for (const list of Object.values(tabs.lists)) for (const r of list) assert.equal(r.player.availabilityLabel, String(r.player.providerEventId) === TNF ? COMPLETED_ROW_LABEL : null);
  // nothing was regenerated or rewritten: the frozen record is byte-identical after every build above
  for (const id of BOARD_IDS) assert.ok(fs.readFileSync(boardPath(id)).equals(BYTES_BEFORE.get(id)), `${id}: board bytes changed`);
  assert.deepEqual(tnfBoard, JSON.parse(BYTES_BEFORE.get(TNF).toString("utf8")), "the parsed frozen record was not mutated");
});

test("no direction on an ESTIMATE family: no price, line or side on any surface; never promoted", async () => {
  const { presentTopBoard } = await import("../../prediction-presentation/nfl.ts");
  const doc = buildTopBoards({ weekBoards: boards, now: BEFORE_TNF, slotFor: () => ({ market: { sportsbook: "draftkings", line: 1.5, overOdds: -110, underOdds: -110, capturedAt: BEFORE_TNF } }) });
  const artifact = { generatedAt: BEFORE_TNF, model: null, topBoards: doc };
  for (const sc of [doc.weekly, ...doc.daily, doc.fullWeek]) for (const b of sc.boards) {
    if (!["player_pass_yds", "player_rush_yds"].includes(b.family)) continue;
    assert.equal(b.state, "ESTIMATE", "never PUBLISHED");
    for (const r of b.rows) for (const k of Object.keys(r)) assert.doesNotMatch(k, /market|price|odds|line|side|over|under|direction|edge|lean|pricingState/i, `${b.id} ${r.name}: ${k}`);
    for (const p of presentTopBoard(artifact, b)) {
      assert.equal(p.model.status, "ESTIMATE");
      assert.notEqual(p.market?.kind, "PRICED", `${p.predictionId}: a price beside an estimate`);
      assert.ok(!JSON.stringify(p.market ?? {}).includes("-110"), `${p.predictionId}: no captured price`);
    }
  }
  const exp = buildNflGraphicsExport({ seasonType: 2, week: 8, asOf: BEFORE_TNF, boards, views: Object.values(VIEWS).map((v) => v.view) });
  for (const r of exp.rows.filter((x) => x.model.status === MODEL_STATUS.OFFICIAL_ESTIMATE)) {
    assert.equal(r.marketEligibility.directionQualified, false);
    assert.ok(["WITHHELD", "NOT_APPLICABLE"].includes(r.market.direction.state));
  }
  for (const { view } of Object.values(VIEWS)) for (const p of view.players) for (const [, vk] of FAMS) if (p.families[vk]) assert.equal(p.families[vk].market, null);
  // a PUBLISHED family keeps its price slot (only estimates lose it)
  assert.ok(doc.weekly.boards.find((b) => b.family === "player_reception_yds").rows.every((r) => r.market));
  assert.equal(MARKET_KEY.passingYards, "player_pass_yds");
});
