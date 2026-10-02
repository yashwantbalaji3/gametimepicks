/**
 * Session 5 — /results/nfl reports the newest GRADED week. On 2026-10-02 00:32Z the event window opened
 * Week 4 (0 final of 16) and the page headlined "Week 4: — of our predictions came true · 0 of 0 checks".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { isGradedWeek, readNflWeekReports } from "./week-report-data.ts";

const row = (key, checks, gamesFinal) => ({ key, label: key, generatedAt: "2026-10-02T00:32:41Z", gamesFinal, gamesPending: 16 - gamesFinal, overall: { checks, hits: 0, rate: checks ? 0 : null } });

test("an opened week with nothing final is not a report; a partly-final week is", () => {
  assert.equal(isGradedWeek(row("2-04", 0, 0)), false);
  assert.equal(isGradedWeek(row("2-04", 31, 1)), true, "Thursday's game final ⇒ Week 4 reports its one graded game");
  assert.equal(isGradedWeek(null), false);
});

test("LIVE: the loader returns the newest graded week, and 'earlier' never repeats it", () => {
  const idx = path.join(process.cwd(), "public/data/nfl/reconciliation/index.json");
  if (!fs.existsSync(idx)) return;
  const index = JSON.parse(fs.readFileSync(idx, "utf8"));
  const { latest, earlier } = readNflWeekReports();
  const graded = index.weeks.filter(isGradedWeek);
  if (!graded.length) return assert.equal(latest, null);
  assert.ok(latest.summary.overall.checks > 0, "the headline week graded something");
  assert.equal(latest.period.label, graded.at(-1).label);
  assert.ok(!earlier.some((w) => w.key === graded.at(-1).key));
  if (!isGradedWeek(index.weeks.at(-1))) console.log(`newest index entry ${index.weeks.at(-1).label} is ungraded — reporting ${latest.period.label}`);
});
