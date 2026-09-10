import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve(process.cwd(), "..");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

test("registered v2 Week 1 cohort and source remain immutable during v3 research", () => {
  const dir = path.join(root, "data/internal/research/nfl/joint-v2-forward");
  const registration = JSON.parse(fs.readFileSync(path.join(dir, "2026-week1-registration.json")));
  assert.equal(registration.cohort.length, 16);
  for (const item of registration.cohort) assert.equal(hash(fs.readFileSync(path.join(dir, item.capture))), item.sha256);
  for (const [file, expected] of Object.entries(registration.sourceHashes)) assert.equal(hash(fs.readFileSync(path.join(process.cwd(), file))), expected);
});

test("v3 Week 1 captures retain participation decisions and coherent realized scorecards", () => {
  const dir = path.join(root, "data/internal/research/nfl/joint-v3-forward");
  const docs = fs.readdirSync(dir).filter(n => n.endsWith(".json")).map(n => JSON.parse(fs.readFileSync(path.join(dir, n)))).filter(d => d.artifact === "nfl-joint-v3-forward-shadow");
  assert.equal(new Set(docs.map(d => d.inputs.event.providerEventId)).size, 16);
  let excluded = 0, uncertain = 0;
  for (const d of docs) {
    assert.equal(d.dataClass, "PRIVATE_RESEARCH");
    assert.equal(d.simulation.engineId, "nfl-joint-sim-v3");
    assert.ok(Date.parse(d.generatedAt) < Date.parse(d.kickoffUtc));
    assert.equal(hash(JSON.stringify(d.inputs)), d.inputHash);
    for (const [team, notes] of Object.entries(d.inputNotes)) {
      for (const decision of notes.participation.decisions) {
        excluded += Number(decision.excluded); uncertain += Number(decision.uncertain);
        if (decision.excluded) {
          const p = d.inputs.playersByTeam[team].find(p => p.playerId === decision.playerId);
          for (const k of ["qbShare", "targetShare", "carryShare", "tdShare"]) assert.equal(p[k], 0);
        }
      }
      if (notes.chart.state === "PARTICIPATION_UNCERTAIN") assert.equal(notes.conditioningApplied, false);
      const example = d.simulation.illustrativeScorecard.teams[team];
      const sum = key => example.players.reduce((s, p) => s + p[key], 0);
      assert.equal(sum("passYds"), sum("recYds"));
      assert.equal(sum("passTd"), sum("recTd"));
      assert.equal(sum("rushTd") + sum("recTd"), example.team.offTd);
      assert.equal(6 * example.team.offTd + example.team.conversionPoints + example.team.otherPoints, example.team.own);
    }
  }
  assert.ok(excluded > 0, "current captures exercise excluded roles");
  assert.ok(uncertain > 0, "current captures retain unresolved uncertainty");
});
