/**
 * Release D guards (Program 177): the protected console shows the NFL slate from the CANONICAL
 * artifacts, tells a missing artifact apart from an empty window, and never leaks internally.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const table = fs.readFileSync(path.join(APP, "src/app/ops/nfl-event-table.tsx"), "utf8");
const ops = fs.readFileSync(path.join(APP, "src/app/ops/page.tsx"), "utf8");
const index = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/index.json"), "utf8"));

test("the console CONSUMES canonical state and derives nothing of its own", () => {
  assert.match(table, /public\/data\/nfl\/index\.json/);
  assert.match(table, /public\/data\/admin\/nfl-lane\.json/);
  assert.match(table, /public\/data\/nfl\/product-eligibility\.json/);
  assert.match(table, /this console derives nothing of its own/);
  // no reclassification, no recomputed lifecycle, no independent clock comparison
  assert.doesNotMatch(table, /classifyTeamOutput|permitsProductLeg|Date\.now\(\)/,
    "an ops console that disagreed with the public site about the same slate is worse than no console");
});

test("A MISSING ARTIFACT AND AN EMPTY WINDOW ARE DIFFERENT ANSWERS", () => {
  assert.match(table, /absent artifact, not an empty slate/);
  assert.match(table, /a real empty window, not a missing artifact/);
  assert.match(table, /chain freshness and the credit ledger are unknown, not clean/);
  assert.match(table, /the daily paper-product evaluation did not run/);
});

test("every current event is listed with the fields an operator needs to act", () => {
  assert.ok(index.events.length > 0, "there is a slate to show");
  for (const h of ["Event", "Kickoff", "Lifecycle", "Lock", "State", "Sim", "Market", "Receipt"]) {
    assert.ok(table.includes(`"${h}"`), `the table must carry a ${h} column`);
  }
  // the gap markers are visually distinct, so a missing sim or price reads as a gap
  assert.match(table, /e\.projectedScore && e\.winProbability/);
  assert.match(table, /e\.hasMarket \? "priced" : "none"/);
  // contradictions are surfaced, not summarised away
  assert.match(table, /contradictions \{index\.contradictions\.length\}/);
});

test("INTERNAL ONLY — the console is guarded and pruned from the public export", () => {
  assert.match(ops, /guardInternalRoute\(\)/);
  assert.match(table, /INTERNAL/);
  const prune = fs.readFileSync(path.join(APP, "scripts/prune-internal-routes.mjs"), "utf8");
  assert.match(prune, /"ops"|'ops'/, "the pruner removes /ops from the export");
  // and the built export must not contain it
  const out = path.join(APP, "out", "ops");
  assert.ok(!fs.existsSync(out), "/ops must not exist in the public export");
});

test("the ops page renders the table exactly once, in its own card", () => {
  assert.match(ops, /import \{ NflEventTable \} from "\.\/nfl-event-table"/);
  assert.equal((ops.match(/<NflEventTable \/>/g) ?? []).length, 1);
  assert.match(ops, /<Card title="NFL · event control">/);
});
