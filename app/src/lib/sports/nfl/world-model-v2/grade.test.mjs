/**
 * World Model V2 grading guards: the frozen pregame run is the one graded (never a later or post-kickoff run),
 * pending / no-line rows are never losses, metrics stay per family, and the run identity travels with every grade.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { pregameRuns, gradeRun, summarize } from "./grade.mjs";

const run = (generatedAt, median = 50, version = "2.1.0") => ({
  identity: { providerEventId: "e1", kickoffUtc: "2026-10-11T17:00Z", matchup: "A @ B" },
  model: { version }, simulationId: `sim-${generatedAt}`, run: { generatedAt },
  players: [
    { playerId: "nfl-athlete-1", name: "Rec", team: "A", availability: "ACTIVE", families: { receivingYards: { median, mean: median + 5, p10: 10, p25: 30, p75: 70, p90: 100, atLeast: { 25: 0.8, 50: 0.5, 100: 0.1 } }, receptions: { median: 4, mean: 4.2, p10: 1, p25: 3, p75: 5, p90: 7, atLeast: { 3: 0.7 } } } },
    { playerId: "nfl-athlete-2", name: "Absent", team: "A", availability: "QUESTIONABLE", families: { rushingYards: { median: 40, mean: 42, p10: 10, p25: 25, p75: 55, p90: 80 } } },
  ],
});

test("the graded forecast is the LAST run before kickoff — never a later one", () => {
  const runs = [run("2026-10-10T12:00:00Z", 40), run("2026-10-11T16:30:00Z", 55), run("2026-10-11T17:05:00Z", 99, "9.9.9")];
  const p = pregameRuns(runs).get("e1");
  assert.equal(p.run.generatedAt, "2026-10-11T16:30:00Z");
  assert.equal(p.players[0].families.receivingYards.median, 55);
});

test("states: PENDING before the final, GRADED with a box-score line, NO_LINE without one — none of them a loss", () => {
  const r = run("2026-10-11T16:30:00Z");
  assert.ok(gradeRun(r, null).every((x) => x.state === "PENDING"));
  const final = { ftHome: 24, ftAway: 17, players: [{ playerId: "nfl-athlete-1", rec: 6, recYds: 62 }] };
  const rows = gradeRun(r, final);
  const rec = rows.find((x) => x.family === "receivingYards");
  assert.equal(rec.state, "GRADED");
  assert.equal(rec.actual, 62);
  assert.equal(rec.absError, 12);
  assert.equal(rec.in80, true);
  assert.equal(rec.simulationId, "sim-2026-10-11T16:30:00Z", "the run identity travels with the grade");
  assert.ok(Math.abs(rec.ladderBrier - ((0.8 - 1) ** 2 + (0.5 - 1) ** 2 + (0.1 - 0) ** 2) / 3) < 1e-12);
  assert.equal(rows.find((x) => x.playerId === "nfl-athlete-2").state, "NO_LINE");
  const s = summarize(rows);
  assert.equal(s.rushingYards.graded, 0);
  assert.equal(s.rushingYards.noLine, 1, "no line is counted, not graded");
  assert.equal(s.receivingYards.graded, 1);
});

test("a category the player has no entry in counts zero only when he has a box-score line", () => {
  const r = run("2026-10-11T16:30:00Z");
  const rows = gradeRun(r, { ftHome: 1, ftAway: 0, players: [{ playerId: "nfl-athlete-1", rushYds: 3 }] });
  const rec = rows.find((x) => x.family === "receivingYards" && x.playerId === "nfl-athlete-1");
  assert.equal(rec.state, "GRADED");
  assert.equal(rec.actual, 0);
});

test("summaries are per family; there is no combined accuracy figure", () => {
  const s = summarize(gradeRun(run("2026-10-11T16:30:00Z"), { ftHome: 1, ftAway: 0, players: [{ playerId: "nfl-athlete-1", rec: 2, recYds: 5 }] }));
  assert.deepEqual(Object.keys(s).sort(), ["passingYards", "receivingYards", "receptions", "rushingYards"]);
  assert.ok(!("overall" in s));
});
