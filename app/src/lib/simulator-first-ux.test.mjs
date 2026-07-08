/**
 * SIMULATOR-FIRST UX (2026-07-08 UX mission, Phase 5). Pins the simulate-first entry points: a homepage
 * "Simulate Today's Games" CTA, a `/games` lobby reframed to "Simulate Games" with a "Simulation Ready"
 * badge on cards whose artifact exists, and the Generate Simulation card placed ABOVE the dense report on
 * MLB game pages. Honesty preserved (no fake N-run, no banned copy, paper-only). No money change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const band = read("src/components/home/game-lab-home-band.tsx");
// The lobby logic lives in the shared component (mounted at /games and /simulate).
const gamesPage = read("src/components/games/simulate-lobby.tsx");
const gamesExp = read("src/components/games-experience.tsx");
const detailPage = read("src/components/game/game-detail-page.tsx");
const runner = read("src/components/game/game-simulation-runner.tsx");
const BANNED = /\bguaranteed\b|\block\b|\bsafest\b|can'?t lose|Monte Carlo|live betting|free money/i;

test("homepage has a first-class 'Simulate Today's Games' CTA to the games lobby", () => {
  assert.match(band, /Simulate Today.{0,10}s Games/i, "the primary CTA is simulate-first");
  assert.match(band, /href="\/games"/, "links to the lobby");
  assert.match(band, /Simulate today.{0,10}s games/i, "headline is simulate-first");
  assert.ok(!BANNED.test(band), "no banned copy on the band");
});

test("/games communicates SIMULATION clearly (title + sub reframed)", () => {
  assert.match(gamesPage, /title="Simulate Games"/, "the lobby title says Simulate Games");
  assert.match(gamesPage, /run the model simulation/i, "the sub explains simulation");
});

test("MLB game cards show a 'Simulation Ready' badge, gated on a real ready artifact (never fabricated)", () => {
  assert.match(gamesExp, /Simulation Ready/, "the badge exists");
  assert.match(gamesExp, /g\.simReady \?/, "the badge is gated on simReady");
  // simReady is wired from the REAL game-detail simulation status, not invented.
  assert.match(gamesPage, /gameLabSimulation\?\.status === "ready"/, "simReady comes from the ready artifact status");
});

test("game detail places Generate Simulation ABOVE the dense model report", () => {
  const simIdx = detailPage.indexOf("<GameSimulationRunner");
  const reportIdx = detailPage.indexOf("<MlbGameLabReport");
  assert.ok(simIdx > 0 && reportIdx > 0, "both render");
  assert.ok(simIdx < reportIdx, "the simulator comes first (primary experience), the report follows");
});

test("the reveal is honest: N-run claim gated on runCount; no fake claim; no banned copy; paper-only", () => {
  assert.match(runner, /allowsRunCountClaim/, "the 'N-run' copy is gated on a real runCount");
  assert.ok(!BANNED.test(runner), "no banned copy in the runner");
  assert.ok(/paper-only|Paper-only/i.test(runner), "paper-only copy present");
  assert.ok(/precomputed/i.test(runner) && /same/i.test(runner), "'precomputed' + 'same output for every user' framing");
});

test("FUNCTIONAL: today's MLB games carry a ready simulation view (the badge's real source)", async () => {
  const { buildAllGameDetails } = await import("./game-detail.ts");
  const mlb = buildAllGameDetails().filter((d) => d.sport === "mlb");
  const ready = mlb.filter((d) => d.gameLabSimulation && d.gameLabSimulation.status === "ready");
  assert.ok(ready.length >= 1, "at least one MLB game has a ready sim (so a badge legitimately shows)");
});

test("no canonical money change", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
