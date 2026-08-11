/**
 * NBA current-results adapter guards (Program 162 · Release A).
 *
 * Every charter corruption case: tie, missing scores, duplicate consumption, missing lineage,
 * seasonType mismatch, non-final rows counted (never silently dropped), stale source, and the
 * honest empty state. One malformed row never throws the batch. The real-disk test derives its
 * clock from the artifact's own stamps (the frozen-NOW lesson) and is state-conditional so it
 * stays honest both off-season and after the first October final.
 *
 * Run: npx tsx --test src/lib/sports/nba/current-results.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadCurrentNbaResults } from "./current-results.mjs";

const T0 = "2026-10-05T12:00:00Z"; // fixture clock base — synthetic rows only, never a real receipt
const NOW = "2026-10-05T13:00:00Z";
const ART = (rows) => ({ schemaVersion: 1, sport: "nba", generatedAt: T0, sourceAsOf: T0, rows });
const SCHED = new Map([
  ["evt1", { providerEventId: "evt1", seasonType: 1, neutralSite: true, home: { abbr: "TOR" }, away: { abbr: "MIA" } }],
  ["evt2", { providerEventId: "evt2", seasonType: 2, neutralSite: false, home: { abbr: "BOS" }, away: { abbr: "NYK" } }],
]);
const run = (rows, over = {}) => loadCurrentNbaResults({ nowIso: NOW, artifact: ART(rows), scheduleIndex: SCHED, ...over });

test("states: NOT_CONFIGURED without an artifact; NO_RESULTS_YET fresh; SOURCE_STALE beyond the window", () => {
  assert.equal(loadCurrentNbaResults({ nowIso: NOW, artifact: null }).state, "NOT_CONFIGURED");
  assert.equal(run([]).state, "NO_RESULTS_YET");
  assert.equal(run([{ providerEventId: "evt1", statusRaw: "STATUS_SCHEDULED" }]).state, "NO_RESULTS_YET", "scheduled rows alone are not results");
  const stale = loadCurrentNbaResults({ nowIso: "2026-10-08T13:00:00Z", artifact: ART([]), scheduleIndex: SCHED });
  assert.equal(stale.state, "SOURCE_STALE");
});

test("a clean final joins once with seasonType + neutralSite preserved and the contract exercised", () => {
  const out = run([{ providerEventId: "evt1", statusRaw: "STATUS_FINAL", seasonType: 1, ftHome: 120, ftAway: 110 }]);
  assert.equal(out.state, "RESULTS");
  assert.equal(out.results.length, 1);
  const row = out.results[0];
  assert.deepEqual(
    { id: row.providerEventId, st: row.seasonType, neutral: row.neutralSite, home: row.home, away: row.away, check: row.contractCheck },
    { id: "evt1", st: 1, neutral: true, home: "TOR", away: "MIA", check: "WIN" },
  );
  assert.deepEqual(out.reconciliation, { sourceRows: 1, nonFinal: 0, completedRows: 1, joined: 1, quarantined: 0, exact: true });
});

test("NBA physics: a tied final QUARANTINES — nothing settles from a source defect", () => {
  const out = run([{ providerEventId: "evt1", statusRaw: "STATUS_FINAL", seasonType: 1, ftHome: 100, ftAway: 100 }]);
  assert.equal(out.results.length, 0);
  assert.equal(out.quarantined.length, 1);
  assert.match(out.quarantined[0].reason, /cannot end tied/);
});

test("quarantines: missing scores, missing lineage, duplicate consumption, seasonType mismatch — batch never throws", () => {
  const out = run([
    { providerEventId: "evt1", statusRaw: "STATUS_FINAL", seasonType: 1, ftHome: null, ftAway: 99 },
    { providerEventId: "ghost", statusRaw: "STATUS_FINAL", ftHome: 101, ftAway: 99 },
    { providerEventId: "evt2", statusRaw: "STATUS_FINAL", seasonType: 2, ftHome: 105, ftAway: 99 },
    { providerEventId: "evt2", statusRaw: "STATUS_FINAL", seasonType: 2, ftHome: 105, ftAway: 99 },
    { providerEventId: "evt2", statusRaw: "STATUS_SCHEDULED" },
  ]);
  assert.equal(out.results.length, 1, "only the clean evt2 final joins");
  assert.equal(out.quarantined.length, 3);
  assert.match(out.quarantined.find((q) => q.providerEventId === "evt1").reason, /without integer points/);
  assert.match(out.quarantined.find((q) => q.providerEventId === "ghost").reason, /without schedule lineage/);
  assert.match(out.quarantined.filter((q) => q.providerEventId === "evt2")[0].reason, /exactly once/);
  assert.deepEqual(out.reconciliation, { sourceRows: 5, nonFinal: 1, completedRows: 4, joined: 1, quarantined: 3, exact: true });
});

test("seasonType disagreement quarantines — preseason never blends into regular season", () => {
  const out = run([{ providerEventId: "evt2", statusRaw: "STATUS_FINAL", seasonType: 1, ftHome: 105, ftAway: 99 }]);
  assert.equal(out.results.length, 0);
  assert.match(out.quarantined[0].reason, /seasonType disagrees/);
});

test("REAL DISK · the committed artifact yields an honest closed-set state with exact arithmetic", () => {
  const p = path.join(process.cwd(), "public", "data", "nba", "results", "latest.json");
  const artifact = JSON.parse(fs.readFileSync(p, "utf8"));
  // Clock derives from the artifact's own stamps — a frozen literal would rot with the cadence.
  const nowIso = new Date(Date.parse(artifact.sourceAsOf) + 3_600_000).toISOString();
  const out = loadCurrentNbaResults({ nowIso });
  assert.ok(["NO_RESULTS_YET", "RESULTS"].includes(out.state), `off-season honesty or real finals — got ${out.state}`);
  if (out.state === "RESULTS") {
    assert.equal(out.reconciliation.exact, true, "population arithmetic must reconcile exactly");
    for (const q of out.quarantined) assert.ok(q.reason && q.providerEventId, "every quarantine names its event and reason");
  } else {
    assert.equal(out.results.length, 0, "an empty state never carries rows");
  }
});
