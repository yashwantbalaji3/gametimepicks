/**
 * NS-2 · Sim V2 forward grader. Exact scores on hand-checkable inputs; missing is VOID, never zero; a tie is VOID for
 * the winner; the script grades only the receipt of record, once.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { crpsFromHistogram, gradeSimV2Receipt, quantileScore, summariseGrades } from "./grade.mjs";
import { receiptsOfRecord } from "../../../../../scripts/nfl/grade-nfl-sim-v2-shadow.mjs";

test("CRPS from an integer histogram: point mass = |k − y|; a fair coin over {0, 1} at y = 0 is 0.25", () => {
  assert.equal(crpsFromHistogram([{ value: 3, probability: 1 }], 7), 4);
  assert.equal(crpsFromHistogram([{ value: 3, probability: 1 }], 3), 0);
  assert.equal(crpsFromHistogram([{ value: 0, probability: 0.5 }, { value: 1, probability: 0.5 }], 0), 0.25);
  assert.equal(crpsFromHistogram([], 1), null);
});

test("quantile score is 0 when every quantile equals the outcome and grows with the miss", () => {
  const q = { p10: 5, p25: 5, p50: 5, p75: 5, p90: 5 };
  assert.equal(quantileScore(q, 5), 0);
  assert.ok(quantileScore(q, 9) > quantileScore(q, 6));
  assert.equal(quantileScore({ p10: 1 }, 2), null, "missing quantiles are not scored");
});

const q = (m) => ({ mean: m, p10: m - 2, p25: m - 1, p50: m, p75: m + 1, p90: m + 2 });
const receipt = {
  aggregate: {
    winProbability: { home: 0.6, away: 0.38, tie: 0.02 },
    margin: q(3), total: q(44), score: { home: q(23), away: q(20) },
    marginHistogram: [{ value: 3, probability: 1 }], totalHistogram: [{ value: 44, probability: 1 }],
  },
  playerStatDistributions: [
    { playerId: "wr", team: "H", anytimeTd: 0.4, stats: { targets: q(7), rec: q(5), recYds: q(60), recTd: q(0) } },
    { playerId: "rb", team: "H", anytimeTd: 0.5, stats: { rushAtt: q(15), rushYds: q(60), rushTd: q(0) } },
    { playerId: "gone", team: "A", anytimeTd: 0.3, stats: { rec: q(4) } },
  ],
};

test("game families: winner on P(home | decided), exact margin/total CRPS, coverage", () => {
  const rows = gradeSimV2Receipt(receipt, { ftHome: 27, ftAway: 20, players: [] });
  const win = rows.find((r) => r.family === "winner");
  assert.equal(win.state, "GRADED");
  assert.ok(Math.abs(win.forecast - 0.6 / 0.98) < 1e-4);
  assert.ok(Math.abs(win.logLoss - -Math.log(0.6 / 0.98)) < 1e-4);
  const margin = rows.find((r) => r.family === "margin");
  assert.equal(margin.crps, 4);
  assert.equal(margin.covered80, false);
  assert.equal(rows.find((r) => r.family === "total").covered80, false);
  const tie = gradeSimV2Receipt(receipt, { ftHome: 20, ftAway: 20, players: [] }).find((r) => r.family === "winner");
  assert.equal(tie.state, "VOID", "a tied final is VOID for the winner, not a loss");
  assert.ok(rows.every((r) => r.promotionState === "SHADOW"));
});

test("players: absent or key-missing is VOID (missing is not zero); anytime TD counts rush + rec TDs", () => {
  const rows = gradeSimV2Receipt(receipt, {
    ftHome: 27, ftAway: 20,
    players: [
      { playerId: "wr", targets: 8, rec: 6, recYds: 71, recTd: 1 },
      { playerId: "rb", rushAtt: 14, rushYds: 58 }, // no rushTd key
    ],
  });
  const get = (scope, family) => rows.find((r) => r.scope === scope && r.family === family);
  assert.equal(get("wr", "rec").state, "GRADED");
  assert.equal(get("wr", "rec").covered80, true);
  assert.equal(get("wr", "anytimeTd").actual, true);
  assert.equal(get("rb", "rushTd").state, "VOID");
  assert.match(get("rb", "rushTd").reason, /no rushTd/);
  assert.equal(get("rb", "anytimeTd").state, "VOID", "no TD line at all is not 'no TD'");
  assert.equal(get("gone", "rec").state, "VOID");
  assert.match(get("gone", "rec").reason, /absent/);
  // Control: the same player WITH a zero in the box is graded as zero.
  const ctl = gradeSimV2Receipt(receipt, { ftHome: 27, ftAway: 20, players: [{ playerId: "gone", rec: 0 }] });
  assert.equal(ctl.find((r) => r.scope === "gone" && r.family === "rec").state, "GRADED");
  const s = summariseGrades(rows);
  assert.equal(s.find((x) => x.family === "rushTd").void, 1);
  assert.equal(s.find((x) => x.family === "rushTd").graded, 0);
});

test("receipt of record: latest strictly before kickoff; anything at or after kickoff is ignored", () => {
  const e = (file, g) => ({ file, doc: { eventId: "9", eventStart: "2026-10-11T17:00Z", generatedAt: g } });
  const by = receiptsOfRecord([e("a", "2026-10-10T00:00:00Z"), e("b", "2026-10-11T16:00:00Z"), e("c", "2026-10-11T17:00:00Z"), e("d", "2026-10-11T18:00:00Z")]);
  assert.equal(by.get("9").file, "b");
});

test("script: grades the receipt of record once (write-once), leaves unfinished games pending, summary is stable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "simv2-grade-"));
  const sim = path.join(root, "data/internal/research/nfl/sim-v2");
  fs.mkdirSync(path.join(sim, "shadow/2026-10-10"), { recursive: true });
  fs.mkdirSync(path.join(root, "data/internal/research/nfl/player-events-v1"), { recursive: true });
  const r = {
    ...receipt, schemaVersion: "x", simulationReceiptId: "nfl-sim-v2:9:h", eventId: "9", eventStart: "2026-10-11T17:00Z",
    generatedAt: "2026-10-10T00:00:00Z", home: { abbr: "H" }, away: { abbr: "A" },
  };
  fs.writeFileSync(path.join(sim, "shadow/2026-10-10/9-h.json"), JSON.stringify(r));
  fs.writeFileSync(path.join(sim, "shadow/2026-10-10/10-h.json"), JSON.stringify({ ...r, eventId: "10", simulationReceiptId: "nfl-sim-v2:10:h" }));
  fs.writeFileSync(path.join(root, "data/internal/research/nfl/player-events-v1/2026.json"), JSON.stringify({
    generatedAt: "2026-10-12T00:00:00Z", quarantinedGames: [], games: [{ providerEventId: "9", home: "H", away: "A", ftHome: 27, ftAway: 20, players: [] }],
  }));
  const script = path.join(process.cwd(), "scripts/nfl/grade-nfl-sim-v2-shadow.mjs");
  const run = (now) => execFileSync("node", [script, "--now", now, "--repo-root", root], { encoding: "utf8" });
  const out1 = run("2026-10-12T01:00:00Z");
  assert.match(out1, /wrote 1 grade file\(s\); 1 finished game\(s\) still pending/);
  const g = JSON.parse(fs.readFileSync(path.join(sim, "grades/median-anchored/9.json"), "utf8"));
  // The fake schemaVersion fails the receipt contract → recorded as INVALID_RECEIPT with no metrics, not skipped.
  assert.equal(g.state, "INVALID_RECEIPT");
  assert.equal(g.rows.length, 0);
  const before = fs.readFileSync(path.join(sim, "grades-summary.json"), "utf8");
  const out2 = run("2026-10-12T02:00:00Z");
  assert.match(out2, /wrote 0 grade file\(s\)/);
  assert.match(out2, /summary unchanged/);
  assert.equal(fs.readFileSync(path.join(sim, "grades-summary.json"), "utf8"), before);
  fs.rmSync(root, { recursive: true, force: true });
});
