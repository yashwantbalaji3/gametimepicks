/**
 * MLB PREGAME PITCHER-WORKLOAD — guards (2026-07-22).
 *
 * Pins the additive pitcher_workload family: rest days + recent workload derived STRICTLY from starts earlier
 * than the slate date (leakage-safe), and its wiring into the ResearchObservation assembler. NO modeling.
 *
 * Run: npx tsx --test src/lib/mlb-pregame-pitcher-workload-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { aggregateWorkload } from "../../scripts/capture-mlb-pregame-pitcher-workload.mjs";
import { buildObservation } from "../../scripts/build-mlb-research-observations.mjs";

const app = process.cwd();
const repo = path.dirname(app);
const WL = path.join(repo, "data/internal/mlb/pregame-archive/pregame-features/pitcher-workload");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const splits = [
  { date: "2026-07-01", stat: { gamesStarted: 1, inningsPitched: "6.0", strikeOuts: 8, baseOnBalls: 1, earnedRuns: 2, homeRuns: 1, battersFaced: 24 } },
  { date: "2026-07-07", stat: { gamesStarted: 1, inningsPitched: "5.1", strikeOuts: 6, baseOnBalls: 2, earnedRuns: 3, homeRuns: 0, battersFaced: 22 } },
  { date: "2026-07-17", stat: { gamesStarted: 1, inningsPitched: "7.0", strikeOuts: 9, baseOnBalls: 0, earnedRuns: 1, homeRuns: 0, battersFaced: 26 } },
  { date: "2026-07-22", stat: { gamesStarted: 1, inningsPitched: "6.0", strikeOuts: 7, baseOnBalls: 1, earnedRuns: 4, homeRuns: 2, battersFaced: 25 } }, // SAME slate day — MUST be excluded
  { date: "2026-07-27", stat: { gamesStarted: 1, inningsPitched: "5.0", strikeOuts: 5, baseOnBalls: 3, earnedRuns: 2, homeRuns: 1, battersFaced: 21 } }, // LATER — MUST be excluded
];

test("1 · aggregateWorkload uses ONLY starts strictly earlier than the slate (no same-day/later leakage)", () => {
  const w = aggregateWorkload(splits, "2026-07-22", "2026");
  assert.equal(w.hasHistory, true);
  assert.equal(w.seasonStarts, 3, "only the 3 starts before 2026-07-22 count (same-day + later excluded)");
  assert.equal(w.lastStartDate, "2026-07-17");
  assert.equal(w.restDays, 5, "22 − 17 = 5 days rest");
  assert.equal(w.last5.starts, 3);
  assert.equal(w.seasonToDate.k, 8 + 6 + 9, "strikeouts summed from earlier starts only");
});

test("2 · a pitcher with no prior starts ⇒ no history (never fabricated)", () => {
  const w = aggregateWorkload([{ date: "2026-07-25", stat: { gamesStarted: 1, inningsPitched: "5.0" } }], "2026-07-22", "2026");
  assert.equal(w.hasHistory, false);
  assert.equal(w.restDays, null);
  assert.equal(w.seasonStarts, 0);
});

test("3 · buildObservation includes pitcher_workload ONLY when the record is researchEligible", () => {
  const join = { gamePk: 1, freezeHash: "h", createdAt: "t", eventStartTime: "2026-07-22T23:00:00Z", sourceSnapshotIds: [], officialSource: { endpoint: "statsapi" }, gameFinalStatus: { isFinal: true, detailedState: "Final" }, teamOutcome: { homeTeam: "H", awayTeam: "A", homeRuns: 5, awayRuns: 3 } };
  const row = { market: "pitcher_strikeouts", gamePk: 1, playerId: 11, player: "P", selection: "Over", line: 6.5, researchEligible: true, noVigProbability: 0.5, capturedAt: "2026-07-22T20:00:00Z", actual: 7, settlementStatus: "win", countsAsSettledEligible: true };
  const pf = { feats: { pitcher_status: {} }, eligibleFamilies: ["pitcher_status"] };
  const wl = { researchEligible: true, pitchers: { home: { id: 11, restDays: 5 }, away: { id: 22, restDays: 4 } } };
  const withWl = buildObservation("2026-07-22", join, {}, row, pf, wl);
  assert.ok(withWl.pregame_features.pitcher_workload, "workload attached");
  assert.equal(withWl.model_inputs_available.hasPitcherWorkload, true);
  assert.ok(withWl.model_inputs_available.eligibleFamilies.includes("pitcher_workload"));
  // ineligible workload ⇒ NOT attached; flagged as a missing family
  const ineligible = buildObservation("2026-07-22", join, {}, row, pf, { researchEligible: false, pitchers: {} });
  assert.equal(ineligible.pregame_features.pitcher_workload, undefined);
  assert.equal(ineligible.model_inputs_available.hasPitcherWorkload, false);
  assert.ok(ineligible.model_inputs_available.missingFamilies.includes("pitcher_workload"));
});

test("4 · on-disk workload records are leakage-safe (eligible ⇒ captured pregame + starts strictly earlier)", () => {
  if (!fs.existsSync(WL)) { console.log("  (skip — no workload records in this checkout)"); return; }
  let n = 0;
  for (const d of fs.readdirSync(WL).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
    for (const wf of fs.readdirSync(path.join(WL, d)).filter((x) => x.endsWith(".json"))) {
      const w = readJson(path.join(WL, d, wf));
      n++;
      assert.equal(w.public, false);
      if (w.researchEligible === true) {
        assert.ok(w.capturedAt < w.eventStartTime, `captured pregame: ${wf}`);
        for (const side of ["home", "away"]) {
          const p = w.pitchers?.[side];
          if (p?.lastStartDate) assert.ok(p.lastStartDate < d, `${side} last start strictly earlier than slate: ${wf}`);
        }
      }
    }
  }
  console.log(`  (checked ${n} workload records)`);
});

test("5 · workload artifacts are internal only; money md5 unchanged", () => {
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => String(p).includes("pitcher-workload") || String(p).includes("pregame-features"));
    assert.equal(hit.length, 0, "no workload artifacts under out/");
  }
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
