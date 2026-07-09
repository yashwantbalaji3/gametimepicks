/**
 * FULL-GAME SIMULATION HONESTY (2026-07-09) — no fake full-game sim; labels are honest.
 *
 * Pins: the MLB market snapshot is labelled market-implied (NOT a simulation) and flags a full-game
 * score simulation as "coming soon"; the internal readiness artifact never reaches "ready", never
 * labels win probability a "simulation", and stays non-public; soccer never claims a 10,000-run sim;
 * and money is untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateFullGameSimArtifact } from "./schema.ts";

const app = process.cwd();
const repo = path.join(app, "..");
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("1 · the MLB market snapshot is honest — market-implied, not a simulation, full-game coming soon", () => {
  const gc = read("src/components/game/mlb-game-center.tsx");
  assert.match(gc, /market-implied, not a simulation/i, "labelled market-implied, not a simulation");
  assert.match(gc, /full-game score simulation/i, "names the full-game score simulation");
  assert.match(gc, /coming soon/i, "flags it as coming soon");
  // It does not positively claim a full-game simulation exists.
  assert.doesNotMatch(gc, /\bruns? a full-game simulation\b|full-game simulation (?:ready|available|shows)/i);
});

test("2 · the internal readiness artifact is honest — never 'ready', never a 'simulation' label, not public", () => {
  const p = path.join(repo, "data/internal/mlb/full-game-sim-readiness/2026-07-09.json");
  if (!fs.existsSync(p)) return; // artifact optional in a fresh checkout
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(j.public, false);
  assert.equal(j.officialMoneyRecordAffected, false);
  assert.equal(j.activeProductCard, false);
  assert.equal(j.readinessSummary.ready, 0, "no game is a ready full-game simulation");
  for (const g of j.games) {
    assert.ok(["partial", "blocked"].includes(g.dataQuality.status), "status is partial/blocked, never ready");
    if (g.winProbability) assert.equal(g.winProbability.source, "market_implied", "win prob is market-implied, never simulation");
    assert.equal(g.runCount, undefined, "no run count — this is not a sampled simulation");
    assert.ok(!g.distributions, "no fabricated distributions");
    // Every emitted artifact passes the schema validator.
    assert.equal(validateFullGameSimArtifact(g).valid, true);
  }
});

test("3 · the readiness artifact is NOT web-served", () => {
  assert.ok(!fs.existsSync(path.join(app, "public/data/mlb/full-game-sim-readiness")), "not under app/public");
});

test("4 · soccer never claims a 10,000-run simulation", () => {
  for (const rel of ["src/components/game/wc-game-center.tsx", "src/lib/wc-game-center.ts"]) {
    const s = read(rel).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.doesNotMatch(s, /10,?000[- ]?run/i, `${rel} makes no run-count claim`);
  }
});

test("5 · money md5 unchanged — full-game-sim work is money-independent", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
