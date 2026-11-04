import assert from "node:assert/strict";
import { test } from "node:test";

import { MODEL_GAME_POST, modelCaptionPlayers, modelGamePostCaption, modelGamePostSchedule } from "./nba-game-post-model.mjs";

test("schedule: tip - 60, coinciding tips staggered 2 min with the last at tip - 60, all at least 55 min before tip", () => {
  const s = modelGamePostSchedule([
    { eventId: "a", tipUtc: "2026-11-05T00:00Z" }, { eventId: "b", tipUtc: "2026-11-05T00:00Z" },
    { eventId: "c", tipUtc: "2026-11-05T00:30Z" }, { eventId: "d", tipUtc: "2026-11-05T00:30Z" }, { eventId: "e", tipUtc: "2026-11-05T00:30Z" },
    { eventId: "f", tipUtc: "2026-11-05T01:30Z" },
  ]);
  assert.deepEqual(Object.fromEntries(s), { a: "2026-11-04T22:58:00Z", b: "2026-11-04T23:00:00Z", c: "2026-11-04T23:26:00Z", d: "2026-11-04T23:28:00Z", e: "2026-11-04T23:30:00Z", f: "2026-11-05T00:30:00Z" });
  assert.equal(MODEL_GAME_POST.minLeadMin, 55);
});

const pkg = (claims, anomalies = []) => ({ anomalies, commandCenter: { claims: claims.flatMap(([id, name, pts, reb, ast]) => [[`${id}.name`, name], [`${id}.pts`, pts], [`${id}.reb`, reb], [`${id}.ast`, ast]].filter(([, v]) => v !== undefined).map(([key, display]) => ({ key, display, evidenceRef: "lane" }))) } });

test("caption players: only fully printed, unflagged rows, ranked by printed points", () => {
  const p = pkg([["1", "A", "30.1", "5.0", "4.0"], ["2", "B", "28.0", "3.0", "-"], ["3", "C", "25.0", "6.0", "2.0"], ["4", "D", undefined, "9.0", "1.0"], ["5", "E", "20.0", "2.0", "2.0"]], [{ playerId: "3", market: "reb", verdict: "INCORRECT_MINUTES" }]);
  assert.deepEqual(modelCaptionPlayers(p).map((x) => x.name), ["A", "E"]);
});

test("caption: every number is a printed cell; fewer than two clean players never pulls a flagged one", () => {
  const one = modelCaptionPlayers(pkg([["1", "A", "30.1", "5.0", "4.0"], ["2", "B", "28.0", "3.0", "2.0"]], [{ playerId: "2", market: "pts", verdict: "X" }]));
  const c = modelGamePostCaption({ awayName: "X Y", homeName: "Z W", winnerNickname: "W", players: one });
  assert.match(c, /One player to watch:\n🔥 A: 30\.1 PTS \| 5\.0 REB \| 4\.0 AST/);
  assert.doesNotMatch(c, /B:|%|[—–]/);
  assert.doesNotMatch(modelGamePostCaption({ awayName: "X", homeName: "Z", winnerNickname: "W", players: [] }), /to watch/);
});

test("forecast cells: printed unflagged PASS, withheld or review rows REVIEW, a printed flagged number BLOCKED", async () => {
  const { modelForecastCells } = await import("./nba-game-post-model.mjs");
  const p = pkg([["1", "A", "30.1", "5.0", "-"], ["2", "B", undefined, "3.0", "2.0"]], [{ playerId: "1", market: "ast", verdict: "X" }, { playerId: "2", market: "reb", verdict: "X" }]);
  const c = modelForecastCells(["1", "2", { id: "3", review: true }], p);
  assert.deepEqual(c.map((x) => `${x.cellId}:${x.state}`), ["1.pts:PASS", "1.reb:PASS", "1.ast:REVIEW", "2.pts:REVIEW", "2.reb:BLOCKED", "2.ast:PASS", "3.pts:REVIEW", "3.reb:REVIEW", "3.ast:REVIEW"]);
});
