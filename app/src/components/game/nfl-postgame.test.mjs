/**
 * Gap 5 (2026-10-23) · the settled NFL game page's box score lines up the grading pipeline's own records, unchanged.
 *
 * For every game the week reconciliation graded FINAL, the read model must carry: the official final score; each graded
 * player forecast exactly as the reconciliation publishes it (median, 80% range, outcome); the official actual the
 * reconciliation graded against; and "no line" (null, rendered "—") wherever the reconciliation voided a forecast because
 * the player had no line. A game with no FINAL official file renders no box score.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadNflPostgame, STAT_COLUMNS } from "./nfl-postgame-data.ts";

const APP = process.cwd();
const RECON = path.join(APP, "public", "data", "nfl", "reconciliation");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const games = () => {
  const idx = readJson(path.join(RECON, "index.json"));
  return idx.weeks.flatMap((w) => readJson(path.join(RECON, `${w.key}.json`)).games.map((g) => ({ ...g, weekLabel: w.label })));
};

test("every graded FINAL game: final score, forecasts and actuals are the reconciliation's own", () => {
  const finals = games().filter((g) => g.state === "FINAL");
  assert.ok(finals.length > 10, "a vacuous run would prove nothing");
  let checkedCells = 0, checkedVoids = 0, built = 0;
  for (const g of finals) {
    const box = loadNflPostgame(g.providerEventId, { away: g.away, home: g.home });
    if (!box) continue; // no official file committed for this game: the page renders no box (asserted below)
    built += 1;
    assert.equal(box.away.final, g.final.away, `${g.matchup} away final`);
    assert.equal(box.home.final, g.final.home, `${g.matchup} home final`);
    for (const r of g.players) {
      const col = STAT_COLUMNS.find((c) => c.prop === r.prop);
      if (!col) continue;
      const team = r.team === g.away.abbr ? box.away : box.home;
      const row = team.players.find((p) => p.name === r.name);
      assert.ok(row, `${g.matchup}: ${r.name} (${r.prop}) is graded but missing from the box score`);
      const f = row.forecast[col.key];
      assert.deepEqual(f, { median: r.median, low: r.low, high: r.high, outcome: r.outcome }, `${g.matchup}: ${r.name} ${r.prop} forecast`);
      if (r.outcome === "VOID") { assert.equal(row.line, null, `${r.name}: a voided forecast reads "—", never 0`); checkedVoids += 1; }
      else { assert.equal(row.line?.[col.key], r.actual, `${g.matchup}: ${r.name} ${r.prop} actual`); checkedCells += 1; }
    }
  }
  assert.ok(built > 10 && checkedCells > 200, `checked ${built} games / ${checkedCells} cells`);
  assert.ok(checkedVoids > 0, "at least one DNP is exercised");
});

test("no FINAL official file ⇒ no box score; a non-numeric id is refused", () => {
  assert.equal(loadNflPostgame("../../etc", { away: { abbr: "A", name: "A" }, home: { abbr: "B", name: "B" } }), null);
  assert.equal(loadNflPostgame("999999999", { away: { abbr: "A", name: "A" }, home: { abbr: "B", name: "B" } }), null);
});
