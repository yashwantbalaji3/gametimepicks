/**
 * The interactive MLB board receives a projected lean (lib/mlb/board-lean-view.ts), not the raw board row.
 * Rendering equality on the built pages is checked by the build comparison; these tests pin the parts a build
 * cannot see:
 *   - over every committed board, filtering and sorting the projected leans gives exactly the same rows in the
 *     same order as the raw leans, for every market × confidence × sort and every team on the slate;
 *   - the two value trims are exact (last 10 recent points; reason only as the bullet fallback);
 *   - the client tree is typed against the view, and the board body hands it the view.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BOARD_LEAN_VIEW_FIELDS, toBoardLeanView } from "./board-lean-view.ts";
import { applyMlbFilters } from "../../components/mlb/mlb-filter-console.tsx";

const APP = process.cwd();
const DIR = path.join(APP, "public/data/mlb/boards");
const boards = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")))
  .filter((b) => Array.isArray(b.leans) && b.leans.length > 0);

test("POSITIVE CONTROL: real boards with leans are on disk", () => {
  assert.ok(boards.length >= 30, `only ${boards.length} boards with leans — the equivalence below would prove little`);
});

test("filter + sort over projected leans == over raw leans, for every state, on every committed board", () => {
  const markets = ["all", ...new Set(boards.flatMap((b) => b.leans.map((l) => l.marketKey)))];
  const confidences = ["all", "High", "Medium", "Low", "insufficient_data"];
  const sorts = ["featured", "edge", "gap", "tipoff"];
  let checks = 0;
  for (const b of boards) {
    const views = b.leans.map(toBoardLeanView);
    const teams = ["all", ...new Set(b.leans.map((l) => l.playerTeamAbbr))];
    for (const market of markets) for (const confidence of confidences) for (const sort of sorts) for (const team of (market === "all" && confidence === "all" ? teams : ["all"])) {
      const state = { market, confidence, team, sort, density: "detailed" };
      const a = applyMlbFilters(b.leans, state).map((l) => l.id);
      const v = applyMlbFilters(views, state).map((l) => l.id);
      assert.deepEqual(v, a, `${b.date} ${JSON.stringify(state)}`);
      checks++;
    }
  }
  assert.ok(checks > 1000, `only ${checks} comparisons`);
});

test("the projection keeps only listed fields, and its two trims are exact", () => {
  for (const b of boards) for (const l of b.leans) {
    const v = toBoardLeanView(l);
    for (const k of Object.keys(v)) assert.ok(BOARD_LEAN_VIEW_FIELDS.includes(k), `${k} leaked into the client payload`);
    for (const k of BOARD_LEAN_VIEW_FIELDS) if (k !== "recentSeries" && k !== "reason") assert.deepEqual(v[k], l[k], `${b.date} ${l.id} ${k}`);
    if (Array.isArray(l.recentSeries)) {
      assert.deepEqual(v.recentSeries, l.recentSeries.slice(-10));
      assert.equal(Math.min(v.recentSeries.length, 10), Math.min(l.recentSeries.length, 10), "the sparkline's aria count is unchanged");
    }
    const bullets = l.reasonBullets && l.reasonBullets.length > 0;
    assert.equal(v.reason, bullets ? "" : l.reason, "reason survives exactly when the row would fall back to it");
  }
});

test("the client tree is typed against the view, and the board body passes the view", () => {
  const src = (p) => fs.readFileSync(path.join(APP, p), "utf8");
  for (const p of ["src/components/mlb/mlb-board-client.tsx", "src/components/mlb/mlb-game-section.tsx"]) {
    assert.doesNotMatch(src(p), /\bMlbBoardLean\b(?!View)/, `${p} must not accept raw leans`);
  }
  assert.match(src("src/components/mlb/mlb-lean-row.tsx"), /lean: MlbBoardLeanView;/);
  assert.match(src("src/components/mlb/mlb-board-body.tsx"), /<MlbBoardClient\s+leans=\{leans\.map\(toBoardLeanView\)\}/);
});
