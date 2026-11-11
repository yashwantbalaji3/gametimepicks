/**
 * M1 research candidate `nba-sim-v1-availability-margin` (UNARMED): λ recomputes exactly from committed data. The engine
 * identity and margin-only tests live beside v1's own fixtures in game-sim-v1.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("λ recomputes byte-for-byte from committed data (methodology-constants rule); report marked unarmed and pending approval", () => {
  const out = execFileSync("node", [path.join(process.cwd(), "scripts/nba/research-v1-availability-margin.mjs"), "--fit"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const committed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../data/internal/research/nba/reports/v1-availability-margin-fit-2024.json"), "utf8"));
  assert.deepEqual(json, committed);
  assert.equal(committed.armed, false);
  assert.match(committed.approval, /^PENDING/);
  assert.match(committed.availabilityProxy, /TIP-TIME PROXY/);
});

test("M2 · the usage-redistribution and replacement coefficients recompute byte-for-byte from committed data; unarmed, pending", () => {
  const out = execFileSync("node", [path.join(process.cwd(), "scripts/nba/research-v1-availability-margin.mjs"), "--fit-m2"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const committed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../data/internal/research/nba/reports/v1-availability-usage-fit-2024.json"), "utf8"));
  assert.deepEqual(json, committed);
  assert.equal(committed.armed, false);
  assert.match(committed.approval, /^PENDING/);
  assert.ok(Number.isFinite(committed.a_replacement) && Number.isFinite(committed.b_usageRedistribution));
});

test("M2b · the with/without shrinkage constants (K_GAME, K_PLAYER) recompute byte-for-byte from committed data; unarmed, pending", () => {
  const out = execFileSync("node", [path.join(process.cwd(), "scripts/nba/research-v1-availability-wowy.mjs"), "--fit"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const committed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../data/internal/research/nba/reports/v1-availability-wowy-fit-2024.json"), "utf8"));
  assert.deepEqual(json, committed);
  assert.equal(committed.armed, false);
  assert.match(committed.approval, /^PENDING/);
  assert.ok(committed.K_GRID.includes(committed.K_GAME) && committed.K_GRID.includes(committed.K_PLAYER));
});

test("Elo config walk-forward (P0D) re-derives byte-for-byte and reproduces the model card's baseline (0.6161, n 2643)", () => {
  const tmp = path.join(fs.mkdtempSync(path.join((process.env.TMPDIR ?? "/tmp"), "elo-cfg-")), "r.json");
  execFileSync("node", [path.join(process.cwd(), "scripts/nba/research-elo-config-walkforward.mjs"), "--out", tmp], { encoding: "utf8", maxBuffer: 1 << 26 });
  const committed = fs.readFileSync(path.resolve(process.cwd(), "../data/internal/research/nba/reports/elo-config-walkforward-dev.json"), "utf8");
  assert.equal(fs.readFileSync(tmp, "utf8"), committed);
  const r = JSON.parse(committed);
  assert.deepEqual(r.crossCheck.modelCardBaseline.reproduced, { n: 2643, logLoss: 0.6161 });
  assert.deepEqual(r.corpus.evaluatedSeasons, [2025, 2026], "development seasons only; 2026-27 never evaluated");
});
