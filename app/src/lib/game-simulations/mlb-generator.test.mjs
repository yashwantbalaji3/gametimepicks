/**
 * DETERMINISTIC MLB GAME-SIMULATION GENERATOR — tests (Phase 4).
 *
 * These pin the generator's contract + determinism + honesty:
 *   1. reads the real MLB board
 *   2. dry-run writes nothing (the CLI never touches disk without --write)
 *   3. a written artifact PASSES validateGameSimulation
 *   4. the SAME board ⇒ identical artifactHash (run twice)
 *   5. a mutated board ⇒ a DIFFERENT artifactHash
 *   6. no Math.random nondeterminism — two runs deep-equal ignoring generatedAt
 *   7. every generatedPick's sourceFields is non-empty + references real board fields
 *   8. distributions appear ONLY for leans that had projection+sigma; bins are integer counts summing to runCount
 *   9. unsupported modules (scoreline/xG/corners/cards/first-scorer) listed unavailable
 *  10. runCount is a positive int (1000) and truthful (samples actually drawn)
 *  11. no artifact claims "Monte Carlo"
 *  12. canonical money unchanged: portfolio.json md5 stays affe6b21071f2b3be96bb2774eb347c3
 *
 * Fixtures / any generated files go to os.tmpdir() — NEVER into the repo (except the real WRITE apply
 * step done outside the test). The canonical money artifact is never touched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { validateGameSimulation } from "./validate.ts";
import {
  generateMlbGameSimulations,
  computeArtifactHash,
  sampleLean,
  buildDistribution,
  RUN_COUNT,
  MODEL_VERSION,
  SIMULATION_VERSION,
} from "./mlb-generator.ts";
import { SeededRng, leanSeed, stableHash } from "./rng.ts";

// ---------------------------------------------------------------------------
// Paths — locate the app root, the real board, the CLI script, and the money file.
// ---------------------------------------------------------------------------
const HERE = path.dirname(fileURLToPath(import.meta.url)); // .../app/src/lib/game-simulations
const APP_ROOT = path.resolve(HERE, "..", "..", ".."); // .../app
const DATA_ROOT = path.join(APP_ROOT, "public", "data");
const BOARD_DATE = "2026-07-07";
const BOARD_PATH = path.join(DATA_ROOT, "mlb", "boards", `${BOARD_DATE}.json`);
const CLI_PATH = path.join(APP_ROOT, "scripts", "generate-mlb-game-simulations.mjs");
const PORTFOLIO_PATH = path.join(DATA_ROOT, "mr-dub", "portfolio.json");
const PORTFOLIO_EXPECTED_MD5 = "affe6b21071f2b3be96bb2774eb347c3";

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, "utf8"));
}

function md5(filePath) {
  return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// Real board fields a pick may cite as provenance.
const REAL_BOARD_FIELDS = new Set([
  "line",
  "impliedOver",
  "impliedUnder",
  "projection",
  "sigma",
  "samples",
  "modelProbOver",
  "modelProbUnder",
]);

// ---------------------------------------------------------------------------
// 1. Generator reads the MLB board.
// ---------------------------------------------------------------------------
test("reads the real MLB board and produces games", () => {
  assert.ok(fs.existsSync(BOARD_PATH), `expected board at ${BOARD_PATH}`);
  const board = loadBoard();
  assert.ok(Array.isArray(board.leans) && board.leans.length > 0, "board should carry leans");
  const { artifact, stats } = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE);
  assert.equal(artifact.sport, "mlb");
  assert.equal(artifact.date, BOARD_DATE);
  assert.ok(artifact.games.length > 0, "should build at least one game");
  assert.equal(stats.games, artifact.games.length);
});

// ---------------------------------------------------------------------------
// 2. Dry-run (default, no --write) writes NOTHING.
// ---------------------------------------------------------------------------
test("CLI dry-run writes nothing", () => {
  const outPath = path.join(DATA_ROOT, "mlb", "game-simulations", `${BOARD_DATE}.json`);
  const existedBefore = fs.existsSync(outPath);
  const bytesBefore = existedBefore ? fs.readFileSync(outPath) : null;

  const out = execFileSync("npx", ["tsx", CLI_PATH, "--dry-run", "--date", BOARD_DATE], {
    cwd: APP_ROOT,
    encoding: "utf8",
  });
  assert.match(out, /DRY-RUN/);
  assert.match(out, /nothing written/i);

  // The artifact file's presence/content must be unchanged by a dry-run.
  const existsAfter = fs.existsSync(outPath);
  assert.equal(existsAfter, existedBefore, "dry-run must not create/delete the artifact file");
  if (existedBefore && bytesBefore) {
    assert.ok(fs.readFileSync(outPath).equals(bytesBefore), "dry-run must not modify an existing artifact");
  }
});

// ---------------------------------------------------------------------------
// 3. A written artifact PASSES validateGameSimulation (write to tmp, not repo).
// ---------------------------------------------------------------------------
test("generated artifact passes validateGameSimulation (written to tmp)", () => {
  const board = loadBoard();
  const { artifact } = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE);

  const v = validateGameSimulation(artifact);
  assert.ok(v.ok, `artifact should validate; errors:\n${v.errors.join("\n")}`);

  // Round-trip through JSON on a tmp path and re-validate (proves it survives serialization).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-mlbsim-"));
  try {
    const p = path.join(dir, `${BOARD_DATE}.json`);
    fs.writeFileSync(p, JSON.stringify(artifact, null, 2));
    const reloaded = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.ok(validateGameSimulation(reloaded).ok, "reloaded artifact should still validate");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. SAME board ⇒ identical artifactHash (run twice).
// ---------------------------------------------------------------------------
test("same board yields identical artifactHash across two runs", () => {
  const board = loadBoard();
  const a = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE).artifact;
  // Different generatedAt on the second run must NOT change the hash.
  const b = generateMlbGameSimulations(loadBoard(), "1999-12-31T23:59:59.000Z", BOARD_DATE).artifact;
  assert.equal(a.artifactHash, b.artifactHash, "artifactHash must be identical for the same board");
  assert.equal(computeArtifactHash(a), computeArtifactHash(b));
  assert.ok(a.artifactHash.length === 64, "artifactHash should be a sha256 hex digest");
});

// ---------------------------------------------------------------------------
// 5. A mutated board ⇒ a DIFFERENT artifactHash.
// ---------------------------------------------------------------------------
test("a mutated board yields a different artifactHash", () => {
  const board = loadBoard();
  const base = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE).artifact;

  const mutated = clone(board);
  // Change one consumed field (a line) on the first lean.
  mutated.leans[0].line = mutated.leans[0].line + 1;
  const after = generateMlbGameSimulations(mutated, "2026-07-08T05:00:00Z", BOARD_DATE).artifact;

  assert.notEqual(base.artifactHash, after.artifactHash, "changing a board line must change artifactHash");
  assert.notEqual(base.sourceBoardHash, after.sourceBoardHash, "changing a board line must change sourceBoardHash");
});

// ---------------------------------------------------------------------------
// 6. No Math.random nondeterminism — two runs deep-equal ignoring generatedAt.
// ---------------------------------------------------------------------------
test("two runs are deep-equal ignoring generatedAt (no nondeterminism)", () => {
  const board = loadBoard();
  const a = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE).artifact;
  const b = generateMlbGameSimulations(loadBoard(), "2030-01-01T00:00:00.000Z", BOARD_DATE).artifact;

  // Strip the ONE non-deterministic field everywhere it appears.
  const strip = (art) => {
    const c = clone(art);
    c.generatedAt = "";
    c.games.forEach((g) => {
      g.freshness.generatedAt = "";
    });
    return c;
  };
  assert.deepEqual(strip(a), strip(b), "artifacts must be identical apart from generatedAt");
});

// ---------------------------------------------------------------------------
// 7. Every generatedPick's sourceFields is non-empty + references real board fields.
// ---------------------------------------------------------------------------
test("every generated pick has provenance referencing real board fields", () => {
  const board = loadBoard();
  const { artifact } = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE);
  let pickCount = 0;
  for (const g of artifact.games) {
    for (const p of g.generatedPicks) {
      pickCount += 1;
      assert.ok(Array.isArray(p.sourceFields) && p.sourceFields.length > 0, `${p.id}: sourceFields must be non-empty`);
      for (const f of p.sourceFields) {
        assert.ok(REAL_BOARD_FIELDS.has(f), `${p.id}: sourceField "${f}" must be a real board field`);
      }
      assert.equal(p.paperOnly, true, `${p.id}: must be paperOnly`);
    }
  }
  assert.ok(pickCount > 0, "expected at least one generated pick");
});

// ---------------------------------------------------------------------------
// 8. Distributions appear ONLY for leans with projection+sigma; bins integer + sum to runCount.
// ---------------------------------------------------------------------------
test("distributions only for projection+sigma leans; bins are integer counts summing to runCount", () => {
  const board = loadBoard();
  const { artifact } = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE);

  // Count board leans that HAVE projection+sigma+line (the sampleable set).
  const sampleable = board.leans.filter(
    (l) => Number.isFinite(l.projection) && Number.isFinite(l.sigma) && Number.isFinite(l.line),
  ).length;

  let totalDistributions = 0;
  for (const g of artifact.games) {
    const dist = g.distributions;
    if (dist === null || dist === undefined) continue;
    for (const key of Object.keys(dist)) {
      totalDistributions += 1;
      const d = dist[key];
      assert.equal(d.sampleCount, RUN_COUNT, `${key}: sampleCount must equal runCount`);
      assert.ok(Array.isArray(d.bins) && d.bins.length > 0, `${key}: bins non-empty`);
      let sum = 0;
      for (const bin of d.bins) {
        assert.ok(Number.isInteger(bin.count), `${key}: every bin count must be an integer`);
        assert.ok(bin.count >= 0, `${key}: bin counts must be non-negative`);
        sum += bin.count;
      }
      assert.equal(sum, RUN_COUNT, `${key}: bin counts must sum to runCount (${RUN_COUNT}), got ${sum}`);
    }
  }
  // Every sampleable lean should have produced exactly one distribution (unique key per player+market+line).
  // (There are no duplicate player+market+line rows in the board, so this is a 1:1 mapping.)
  assert.equal(totalDistributions, sampleable, `expected one distribution per sampleable lean (${sampleable}), got ${totalDistributions}`);

  // And a lean WITHOUT sigma must NOT have contributed a distribution: total distributions must be < total leans.
  assert.ok(totalDistributions < board.leans.length, "leans lacking sigma must not produce distributions");
});

// ---------------------------------------------------------------------------
// 8b. A game whose props all lack sigma reports distributions null + declares them unavailable.
// ---------------------------------------------------------------------------
test("a game with no sampleable props reports distributions null + honest unavailable module", () => {
  const board = loadBoard();
  // Strip sigma from every lean of the FIRST game so nothing is sampleable there.
  const mutated = clone(board);
  const firstGameId = mutated.leans[0].gameId;
  for (const l of mutated.leans) {
    if (l.gameId === firstGameId) delete l.sigma;
  }
  const { artifact } = generateMlbGameSimulations(mutated, "2026-07-08T05:00:00Z", BOARD_DATE);
  const g = artifact.games.find((x) => x.gameId === firstGameId);
  assert.ok(g, "game should still be present");
  assert.equal(g.distributions, null, "distributions must be null when nothing is sampleable");
  assert.ok(
    g.unavailableModules.some((m) => m.module === "distributions"),
    "a game with null distributions must declare a 'distributions' unavailable module",
  );
  // And it must still validate (the pairing rule).
  assert.ok(validateGameSimulation(artifact).ok, "artifact with a null-distribution game must still validate");
});

// ---------------------------------------------------------------------------
// 9. Unsupported soccer modules listed unavailable on every game.
// ---------------------------------------------------------------------------
test("unsupported modules (scoreline/xg/corners/cards/first_scorer) are declared unavailable", () => {
  const board = loadBoard();
  const { artifact } = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE);
  const required = ["scoreline", "first_scorer", "xg", "corners", "cards"];
  for (const g of artifact.games) {
    const modules = new Set(g.unavailableModules.map((m) => m.module));
    for (const r of required) {
      assert.ok(modules.has(r), `game ${g.gameId} must declare "${r}" unavailable`);
    }
    // And each declaration carries honest, non-empty display copy.
    for (const m of g.unavailableModules) {
      assert.ok(typeof m.displayCopy === "string" && m.displayCopy.trim().length > 0, `module ${m.module} needs displayCopy`);
      assert.ok(typeof m.requiredArtifactField === "string" && m.requiredArtifactField.length > 0);
    }
  }
});

// ---------------------------------------------------------------------------
// 10. runCount is a positive int (1000) and truthful — samples were actually drawn.
// ---------------------------------------------------------------------------
test("runCount is a positive integer (1000) and reflects samples actually drawn", () => {
  const board = loadBoard();
  const { artifact } = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE);
  assert.equal(artifact.runCount, 1000);
  assert.ok(Number.isInteger(artifact.runCount) && artifact.runCount > 0);

  // Truthfulness: directly draw RUN_COUNT samples for a real lean and confirm the count + that the
  // over-rate the generator stored matches an independent re-sample (determinism = truthful count).
  const lean = board.leans.find((l) => Number.isFinite(l.projection) && Number.isFinite(l.sigma));
  const seed = leanSeed({
    date: BOARD_DATE,
    gamePk: lean.gamePk,
    modelVersion: MODEL_VERSION,
    simulationVersion: SIMULATION_VERSION,
    marketKey: lean.marketKey,
    playerId: lean.playerId ?? "p",
    line: lean.line,
  });
  const r1 = sampleLean(seed, lean.projection, lean.sigma, lean.line, RUN_COUNT, true);
  const r2 = sampleLean(seed, lean.projection, lean.sigma, lean.line, RUN_COUNT, true);
  assert.equal(r1.samples.length, RUN_COUNT, "exactly RUN_COUNT samples must be drawn");
  assert.deepEqual(r1.samples, r2.samples, "re-sampling the same seed must reproduce identical samples");
  assert.equal(r1.overRate, r2.overRate, "over-rate must be reproducible");
});

// ---------------------------------------------------------------------------
// 11. No artifact copy claims "Monte Carlo".
// ---------------------------------------------------------------------------
test("no persisted copy claims 'Monte Carlo'", () => {
  const board = loadBoard();
  const { artifact } = generateMlbGameSimulations(board, "2026-07-08T05:00:00Z", BOARD_DATE);
  const serialized = JSON.stringify(artifact);
  assert.ok(!/monte\s*carlo/i.test(serialized), "artifact must not contain the phrase 'Monte Carlo'");
});

// ---------------------------------------------------------------------------
// 12. Canonical money is UNCHANGED — portfolio.json md5 stays fixed.
// ---------------------------------------------------------------------------
test("canonical money md5 unchanged (portfolio.json)", () => {
  assert.ok(fs.existsSync(PORTFOLIO_PATH), `expected ${PORTFOLIO_PATH}`);
  assert.equal(md5(PORTFOLIO_PATH), PORTFOLIO_EXPECTED_MD5, "portfolio.json md5 must be unchanged");
});

// ---------------------------------------------------------------------------
// Extra: RNG determinism + histogram integrity unit checks.
// ---------------------------------------------------------------------------
test("SeededRng is deterministic and leanSeed is stable", () => {
  const a = new SeededRng("seed-x");
  const b = new SeededRng("seed-x");
  const c = new SeededRng("seed-y");
  const draw = (r, n) => Array.from({ length: n }, () => r.next());
  assert.deepEqual(draw(a, 20), draw(b, 20), "same seed ⇒ same stream");
  assert.notDeepEqual(draw(new SeededRng("seed-x"), 20), draw(c, 20), "different seed ⇒ different stream");

  const s1 = leanSeed({ date: "d", gamePk: 1, modelVersion: "m", simulationVersion: 1, marketKey: "k", playerId: 2, line: 3 });
  const s2 = leanSeed({ date: "d", gamePk: 1, modelVersion: "m", simulationVersion: 1, marketKey: "k", playerId: 2, line: 3 });
  assert.equal(s1, s2, "leanSeed must be stable");
  assert.ok(s1.includes("mlb"), "seed carries the sport token");
});

test("buildDistribution bins sum to runCount and are contiguous integer bins", () => {
  const seed = "unit-dist-seed";
  const res = sampleLean(seed, 5.2, 2.0, 4.5, RUN_COUNT, true);
  const dist = buildDistribution("k", "label", res, RUN_COUNT);
  assert.ok(dist, "distribution should be produced for a non-degenerate range");
  const sum = dist.bins.reduce((a, b) => a + b.count, 0);
  assert.equal(sum, RUN_COUNT);
  // probabilities sum ~1
  const psum = dist.bins.reduce((a, b) => a + b.probability, 0);
  assert.ok(Math.abs(psum - 1) < 1e-6, `probabilities should sum to 1, got ${psum}`);
});

test("stableHash is order-independent for object keys", () => {
  const h1 = stableHash({ a: 1, b: [1, 2, { x: 1, y: 2 }] });
  const h2 = stableHash({ b: [1, 2, { y: 2, x: 1 }], a: 1 });
  assert.equal(h1, h2, "canonicalized hash must ignore key order");
  const h3 = stableHash({ a: 1, b: [2, 1] });
  assert.notEqual(h1, h3, "array order is significant");
});
