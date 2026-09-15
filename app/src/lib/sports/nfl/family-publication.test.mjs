/**
 * NFL family publication truth (P330) — public labels come from the boards of the current period, never from a
 * stale evaluation sentence or a played week's frozen boards.
 * Run: npx tsx --test src/lib/sports/nfl/family-publication.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { constituentBoards, derivePlayerFamilyPublication, familyPublication } from "./family-publication.mjs";

const evaluated = [
  { key: "player_pass_yds", label: "Passing yards", state: "ESTIMATE_BELOW_BAR", headline: "old", detail: "old", nextGate: "x" },
  { key: "player_rush_yds", label: "Rushing yards", state: "ESTIMATE_NEAR_BAR", headline: "old", detail: "old", nextGate: "x" },
  { key: "player_reception_yds", label: "Receiving yards", state: "MODEL_READY", headline: "old", detail: "old", nextGate: "x" },
  { key: "player_receptions", label: "Receptions", state: "MODEL_READY", headline: "old", detail: "old", nextGate: "x" },
];
const board = (week, over = {}) => ({ seasonType: 2, week, players: [], families: {
  player_pass_yds: { label: "Passing yards", state: "ESTIMATE", reason: "SECOND_LOOK_REJECTED — failed bar: threshold calibration", caveat: "read the range", model: "nfl-player-share-level-v1" },
  player_rush_yds: { label: "Rushing yards", state: "PUBLISHED", basis: "Share-level model: cleared every bar", model: "nfl-player-share-level-v1" },
  player_reception_yds: { label: "Receiving yards", state: "PUBLISHED", basis: "Share-level model: cleared every bar", model: "nfl-player-share-level-v1" },
  player_receptions: { label: "Receptions", state: "PUBLISHED", basis: "Share-level model: cleared every bar", model: "nfl-player-share-level-v1" },
  ...over,
} });

test("index family labels agree with the period's boards: published families read PUBLISHED with their model; the estimate stays an estimate", () => {
  const rows = derivePlayerFamilyPublication({ boards: [board(2), board(2), board(2)], period: { seasonType: 2, week: 2 }, families: evaluated });
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by.player_receptions.state, "PUBLISHED");
  assert.equal(by.player_receptions.modelId, "nfl-player-share-level-v1");
  assert.match(by.player_receptions.headline, /published this week by nfl-player-share-level-v1/);
  assert.equal(by.player_rush_yds.state, "PUBLISHED");
  assert.equal(by.player_pass_yds.state, "ESTIMATE_BELOW_BAR");
  assert.match(by.player_pass_yds.detail, /SECOND_LOOK_REJECTED/);
  assert.equal(by.player_pass_yds.publication.boards, 3);
});

test("a played week's frozen boards never contaminate the current period; with no constituents the evaluation copy stands", () => {
  const lastWeek = board(1, { player_rush_yds: { state: "ESTIMATE", reason: "old bar", model: "props-v1" } });
  assert.deepEqual(constituentBoards([lastWeek], { seasonType: 2, week: 2 }), []);
  const rows = derivePlayerFamilyPublication({ boards: [lastWeek, board(2)], period: { seasonType: 2, week: 2 }, families: evaluated });
  assert.equal(rows.find((r) => r.key === "player_rush_yds").state, "PUBLISHED", "week 1's estimate does not drag week 2 down");
  const none = derivePlayerFamilyPublication({ boards: [lastWeek], period: { seasonType: 2, week: 2 }, families: evaluated });
  assert.equal(none.find((r) => r.key === "player_rush_yds").state, "ESTIMATE_NEAR_BAR");
  assert.equal(none[0].source, "evaluation");
  assert.deepEqual(derivePlayerFamilyPublication({ boards: [board(2)], period: null, families: evaluated }).map((r) => r.source), ["evaluation", "evaluation", "evaluation", "evaluation"]);
});

test("a fallback board (family withheld or absent) yields fallback copy, never PUBLISHED; mixed slates say mixed", () => {
  const withheld = board(2, { player_receptions: { state: "WITHHELD", reason: "roster gate failed closed" } });
  const r = familyPublication("player_receptions", evaluated[3], [withheld, withheld]);
  assert.equal(r.state, "RESEARCH_ONLY");
  assert.match(r.detail, /roster gate failed closed/);
  const mixed = familyPublication("player_receptions", evaluated[3], [board(2), withheld]);
  assert.equal(mixed.state, "MIXED");
  assert.match(mixed.detail, /1 published, 1 withheld/);
  const absent = familyPublication("player_receptions", evaluated[3], [board(2, { player_receptions: undefined })]);
  assert.notEqual(absent.state, "PUBLISHED");
});

test("passing yards cannot inherit another family's status: each key is derived from its own board entry", () => {
  const rows = derivePlayerFamilyPublication({ boards: [board(2)], period: { seasonType: 2, week: 2 }, families: evaluated });
  const pass = rows.find((r) => r.key === "player_pass_yds");
  assert.equal(pass.state, "ESTIMATE_BELOW_BAR");
  assert.ok(!/published/i.test(pass.headline));
  const twoModels = familyPublication("player_receptions", evaluated[3], [board(2), board(2, { player_receptions: { state: "PUBLISHED", basis: "b", model: "other-model" } })]);
  assert.equal(twoModels.state, "MIXED", "two different models across the slate is not one published family");
});

test("LIVE · the committed status agrees with the committed boards for the window it describes", () => {
  const APP = process.cwd();
  const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8")); } catch { return null; } };
  const status = read("public/data/nfl/model-status.json");
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!status?.playerFamilies || !fs.existsSync(dir) || !status.window) return;
  const boards = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => read(`public/data/nfl/player-board/${f}`));
  const expected = derivePlayerFamilyPublication({ boards, period: status.window, families: status.playerFamilies.map((f) => ({ ...f })) });
  for (const e of expected) {
    const got = status.playerFamilies.find((f) => f.key === e.key);
    assert.ok(got, `${e.key} present in the status`);
    if (e.source === "boards") assert.equal(got.state, e.state, `${e.key}: status says ${got.state}, the period's boards say ${e.state}`);
  }
});
