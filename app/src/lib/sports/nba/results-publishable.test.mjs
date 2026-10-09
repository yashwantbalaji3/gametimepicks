/** COST-001 Stage A · an NBA capture commits (and builds) only when it changes something a reader can see. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { publishableKey, samePublishable } from "./results-publishable.mjs";

const row = (o = {}) => ({ providerEventId: "1", shortName: "BOS @ NY", dateUtc: "2026-10-09T23:30Z", statusRaw: "STATUS_SCHEDULED", seasonType: 1, neutralSite: false,
  home: { abbr: "NY", name: "Knicks", providerTeamId: "18" }, away: { abbr: "BOS", name: "Celtics", providerTeamId: "2" }, ftHome: 0, ftAway: 0, capturedAt: "2026-10-09T23:00Z", ...o });
const cap = (rows, o = {}) => ({ schemaVersion: 1, sport: "nba", generatedAt: "t1", sourceAsOf: "t1", windowDays: 9, state: "RESULTS", rows, ...o });

test("in-progress transitions, live scores and capture stamps do not publish", () => {
  const before = cap([row()]);
  for (const s of ["STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_END_PERIOD"]) {
    assert.ok(samePublishable(before, cap([row({ statusRaw: s, ftHome: 56, ftAway: 51, capturedAt: "t2" })], { generatedAt: "t2", sourceAsOf: "t2" })), s);
  }
});

test("a final, a corrected final, a postponement, a schedule change and the window state DO publish", () => {
  const live = cap([row({ statusRaw: "STATUS_IN_PROGRESS", ftHome: 80, ftAway: 70 })]);
  const fin = cap([row({ statusRaw: "STATUS_FINAL", ftHome: 101, ftAway: 99 })]);
  assert.ok(!samePublishable(live, fin), "a game going final publishes");
  assert.ok(!samePublishable(fin, cap([row({ statusRaw: "STATUS_FINAL", ftHome: 102, ftAway: 99 })])), "a corrected final publishes");
  assert.ok(!samePublishable(cap([row()]), cap([row({ statusRaw: "STATUS_POSTPONED" })])), "a postponement publishes");
  assert.ok(!samePublishable(cap([row()]), cap([row({ dateUtc: "2026-10-10T00:00Z" })])), "a moved game publishes");
  assert.ok(!samePublishable(cap([row()]), cap([row(), row({ providerEventId: "2" })])), "a new game publishes");
  assert.ok(!samePublishable(cap([row()]), cap([row()], { state: "NO_RESULTS_YET" })), "the window state publishes");
});

test("row order does not matter, and an unreadable side never counts as 'same' (fails toward committing)", () => {
  const a = cap([row(), row({ providerEventId: "2" })]), b = cap([row({ providerEventId: "2" }), row()]);
  assert.equal(publishableKey(a), publishableKey(b));
  assert.equal(samePublishable(null, a), false);
  assert.equal(samePublishable(a, null), false);
});

test("🔴 every reader of the file uses final rows only — the premise this rule rests on", () => {
  const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.match(read("src/lib/sports/nba/current-results.mjs"), /filter\(\(r\) => \/\^STATUS_FINAL\/\.test\(r\.statusRaw/);
  assert.match(read("scripts/nba/grade-nba-experimental-forecasts.mjs"), /STATUS_FINAL/);
  const wf = read("../.github/workflows/nba-results-refresh.yml");
  assert.match(wf, /node app\/scripts\/nba\/results-publishable\.mjs "\$RESULTS\/latest\.json"/, "the workflow asks this rule");
});
