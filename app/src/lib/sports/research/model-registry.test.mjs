/**
 * Model-registry guards (Program 157 · Release A).
 *
 * The registry is a DERIVED INDEX — equivalence with the source artifacts is its whole identity,
 * so the core guard here is literal: every echoed number must equal its source, byte for byte.
 *
 * Run: npx tsx --test src/lib/sports/research/model-registry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.cwd();
const RESEARCH = path.resolve(APP, "..", "data", "internal", "research");
const read = (...p) => JSON.parse(fs.readFileSync(path.join(RESEARCH, ...p), "utf8"));
const registry = read("model-registry-v1.json");

test("four entries, one per sport, typed taxonomies, no cross-sport ranking anywhere", () => {
  assert.equal(registry.dataClass, "PRIVATE_RESEARCH");
  assert.deepEqual(registry.entries.map((e) => e.sport), ["nfl", "nba", "epl", "ufc"]);
  const tax = new Set(registry.entries.map((e) => e.outcomeTaxonomy));
  assert.equal(tax.size, 3, "binary (×2 sports), three-way, abstaining — semantics never flattened");
  assert.match(registry.comparabilityNote, /cross-sport performance comparison is meaningless and deliberately absent/);
  const txt = JSON.stringify(registry);
  assert.ok(!/rank|leaderboard|best sport/i.test(txt), "no ranking vocabulary may exist in the registry");
});

test("EQUIVALENCE · every echoed metric equals its committed source exactly", () => {
  const nfl = read("nfl", "reports", "baseline-evaluation-v1.json");
  const nba = read("nba", "reports", "baseline-evaluation-v1.json");
  const epl = read("epl", "reports", "baseline-evaluation-v1.json");
  const ufc = read("ufc", "reports", "baseline-evaluation-v1.json");
  const e = Object.fromEntries(registry.entries.map((x) => [x.sport, x]));
  assert.deepEqual(e.nfl.metrics.primary, nfl.winner.elo.overall);
  assert.deepEqual(e.nfl.metrics.score, nfl.score);
  assert.deepEqual(e.nba.metrics.primary, nba.winner.elo.overall);
  assert.deepEqual(e.epl.metrics.primary, epl.models.elo.overall);
  assert.deepEqual(e.epl.metrics.comparators.uniform, epl.models.uniform.overall);
  assert.deepEqual(e.ufc.metrics.primary, ufc.metrics.elo);
  assert.deepEqual(e.ufc.metrics.abstention, ufc.abstention, "UFC 25.6% coverage survives verbatim");
  // And the model-card agreement holds where cards exist.
  assert.equal(e.nba.metrics.primary.logLoss, read("nba", "model-card-v1.json").metrics.elo.logLoss);
  assert.equal(e.ufc.metrics.primary.logLoss, read("ufc", "model-card-v1.json").metrics.elo.logLoss);
});

test("missing model cards render INCOMPLETE — never synthesized", () => {
  const e = Object.fromEntries(registry.entries.map((x) => [x.sport, x]));
  for (const sport of ["nfl", "epl"]) {
    assert.equal(e[sport].artifactRefs.modelCard, null);
    assert.match(e[sport].objective, /INCOMPLETE/);
    assert.match(e[sport].featureCutoff, /INCOMPLETE/);
    assert.match(e[sport].limitations.join(" "), /INCOMPLETE/);
  }
  for (const sport of ["nba", "ufc"]) assert.ok(e[sport].artifactRefs.modelCard, `${sport} has a real card`);
});

test("activation is OFF everywhere; every entry is evaluation-eligible HISTORICAL_REPLAY evidence with rights", () => {
  for (const e of registry.entries) {
    assert.match(e.publicActivation, /^OFF/, `${e.sport}: nothing may be on`);
    assert.equal(e.replayMode, "HISTORICAL_REPLAY");
    assert.equal(e.evaluationEligible, true);
    assert.ok(e.sourceRights && e.sourceRights.length > 10, `${e.sport}: rights recorded`);
    assert.ok(e.replayDeterministicId, `${e.sport}: the replay's deterministic id is the evidence pointer`);
  }
});

test("DETERMINISM · rebuilding with the same --now reproduces the registry byte-for-byte", () => {
  const file = path.join(RESEARCH, "model-registry-v1.json");
  const before = fs.readFileSync(file);
  execFileSync("node", [path.join(APP, "scripts", "research", "build-model-registry.mjs"), "--now", registry.generatedAt], { cwd: APP });
  assert.ok(before.equals(fs.readFileSync(file)));
});

test("PUBLIC EXCLUSION · no registry or model-card content exists under public data", () => {
  const offenders = [];
  const walk = (d) => {
    for (const x of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, x.name);
      if (x.isDirectory()) { walk(p); continue; }
      if (!x.name.endsWith(".json")) continue;
      if (/"artifact":\s*"model-registry"|"artifact":\s*"(nba|ufc|nfl|epl)-model-card"/.test(fs.readFileSync(p, "utf8"))) offenders.push(p);
    }
  };
  walk(path.join(APP, "public", "data"));
  assert.deepEqual(offenders, []);
});
