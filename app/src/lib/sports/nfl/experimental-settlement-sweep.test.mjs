/**
 * Session 13 · NFL experimental settlement — ONE record folder per event, exactly once across dated files, and an
 * official-final fallback so a final that left the rolling results window still settles. Runs the REAL settler
 * against a scratch repo root (never the committed tree).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT = path.join(process.cwd(), "scripts/nfl/settle-nfl-experimental.mjs");

function receipt(id, kickoffUtc, generatedAt, pHome) {
  return {
    providerEventId: id, canonicalEventId: `nfl-${id}`, matchup: "AWY @ HOM", kickoffUtc, generatedAt, seasonType: 2, week: 9,
    model: { id: "nfl-regular-season-public-v1", version: 2, inputHash: `h-${generatedAt}` },
    forecastSummary: { winProbability: { home: pHome }, margin: { median: 3, p10: -10, p90: 16 }, total: { median: 44, p10: 30, p90: 58 }, projectedScore: { home: 24, away: 21 } },
    marketComparison: null,
  };
}

function scratch({ windowRows = [], official = {} }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-exp-settle-"));
  const w = (rel, doc) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), JSON.stringify(doc)); };
  // Evening game: kicks off 00:20Z on the 5th; the 22:00Z receipt sits in the 4th's folder, the later 00:10Z in the 5th's.
  w("data/internal/nfl/forecast-receipts/2031-10-04/700.json", receipt("700", "2031-10-05T00:20Z", "2031-10-04T22:00:00Z", 0.55));
  w("data/internal/nfl/forecast-receipts/2031-10-05/700.json", receipt("700", "2031-10-05T00:20Z", "2031-10-05T00:10:00Z", 0.6));
  // Afternoon game whose final never reached the rolling window.
  w("data/internal/nfl/forecast-receipts/2031-10-04/701.json", receipt("701", "2031-10-04T17:00Z", "2031-10-04T15:00:00Z", 0.4));
  // A game with no official final anywhere.
  w("data/internal/nfl/forecast-receipts/2031-10-04/702.json", receipt("702", "2031-10-04T17:00Z", "2031-10-04T15:00:00Z", 0.5));
  w("app/public/data/nfl/results/latest.json", { generatedAt: "2031-10-06T00:00:00Z", source: { id: "espn_scoreboard" }, rows: windowRows });
  for (const [id, doc] of Object.entries(official)) w(`data/internal/nfl/official-stats/${id}.json`, doc);
  return root;
}
const settle = (root, date, now = "2031-10-06T12:00:00Z") =>
  execFileSync("node", [SCRIPT, "--repo-root", root, "--now", now, "--date", date], { encoding: "utf8" });
const day = (root, date) => JSON.parse(fs.readFileSync(path.join(root, `data/internal/nfl/experimental-settlement/${date}.json`), "utf8"));

test("an evening game is graded once, in its record folder, against the latest pre-kickoff receipt", () => {
  const root = scratch({ windowRows: [{ providerEventId: "700", statusRaw: "STATUS_FINAL", ftHome: 27, ftAway: 20 }] });
  settle(root, "2031-10-04");
  settle(root, "2031-10-05");
  const a = day(root, "2031-10-04");
  const b = day(root, "2031-10-05");
  assert.equal(a.events.filter((e) => e.providerEventId === "700").length, 0, "the earlier folder never grades it");
  assert.ok(a.recordElsewhere.some((x) => x.canonicalEventId === "nfl-700" && x.recordFolder === "2031-10-05"));
  const g = b.events.find((e) => e.providerEventId === "700");
  assert.equal(g.lineage.forecastGeneratedAt, "2031-10-05T00:10:00Z", "graded against the forecast of record");
  assert.equal(g.grade.probabilistic.brier, Number(((0.6 - 1) ** 2).toFixed(6)));
  assert.ok(a.accounting.reconciles && b.accounting.reconciles);
  // re-running either date changes nothing — exactly once
  settle(root, "2031-10-04");
  settle(root, "2031-10-05");
  assert.equal(day(root, "2031-10-05").events.filter((e) => e.providerEventId === "700").length, 1);
});

test("a final outside the rolling window settles from the official box score; no official final stays pending", () => {
  const root = scratch({
    official: {
      701: { state: "FINAL", finalScore: { home: 10, away: 24 }, capturedAt: "2031-10-04T20:30:00Z", source: "ESPN official box score" },
      702: { state: "IN_PROGRESS", finalScore: { home: 7, away: 3 } },
    },
  });
  settle(root, "2031-10-04");
  const a = day(root, "2031-10-04");
  const e = a.events.find((x) => x.providerEventId === "701");
  assert.ok(e, "control: the official final settles the event");
  assert.equal(e.lineage.resultSource, "espn_official_box_score");
  assert.deepEqual([e.grade.actual.home, e.grade.actual.away], [10, 24]);
  assert.ok(a.pending.some((p) => p.canonicalEventId === "nfl-702" && p.state === "AWAITING_OFFICIAL_RESULT"), "a non-FINAL official doc is never a result");
  assert.ok(!a.events.some((x) => x.providerEventId === "702"));
});

test("the event window sweeps every dated file still awaiting an official result (and the probe catches its removal)", () => {
  const yml = fs.readFileSync(path.join(process.cwd(), "../.github/workflows/nfl-event-window.yml"), "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const ok = (y) => /for F in \.\.\/data\/internal\/nfl\/experimental-settlement\/20\?\?-\?\?-\?\?\.json/.test(y) && /grep -q '"AWAITING_OFFICIAL_RESULT"' "\$F"/.test(y) && /settle-nfl-experimental\.mjs --now "\$NOW" --date "\$\(basename "\$F" \.json\)"/.test(y);
  assert.ok(ok(yml), "control: the real workflow sweeps");
  const mutated = yml.replace(/grep -q '"AWAITING_OFFICIAL_RESULT"' "\$F"/, "false");
  assert.notEqual(mutated, yml);
  assert.equal(ok(mutated), false, "probe: a sweep that never fires is caught");
});
