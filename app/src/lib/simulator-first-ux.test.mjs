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
// 2026-07-08: `/` is now a simulation-first LANDING page — the simulate CTA + headline live in the
// landing hero, and the homepage's real ready-artifact games surface via the featured-simulations
// section (the Game Lab band is retained but no longer rendered on Home).
const hero = read("src/components/home/landing-hero.tsx");
const featured = read("src/components/home/featured-simulations.tsx");
// The lobby logic lives in the shared component (mounted at /games and /simulate).
const gamesPage = read("src/components/games/simulate-lobby.tsx");
const gamesExp = read("src/components/games-experience.tsx");
const detailPage = read("src/components/game/game-detail-page.tsx");
const runner = read("src/components/game/game-simulation-runner.tsx");
const BANNED = /\bguaranteed\b|\block\b|\bsafest\b|can'?t lose|Monte Carlo|live betting|free money/i;

test("homepage has a first-class 'Simulate Today's Games' CTA + a real sim-ready games surface", () => {
  assert.match(hero, /Simulate Today.{0,10}s Games/i, "the primary CTA is simulate-first");
  assert.match(hero, /href="\/simulate"/, "links to the /simulate lobby");
  assert.match(hero, /Simulate today.{0,10}s games/i, "headline is simulate-first");
  assert.ok(!BANNED.test(hero), "no banned copy on the hero");
  // Real ready-artifact games are featured on the homepage with a Simulation Ready badge (never faked).
  assert.match(featured, /Simulation Ready/, "the featured section badges sim-ready games");
  assert.match(featured, /Generate Simulation/, "each featured game links to Generate Simulation");
  assert.ok(!BANNED.test(featured), "no banned copy on the featured section");
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

test("game detail GATES the dense model report behind Generate Simulation (report is in postReveal, not a pre-click sibling)", () => {
  // Simulator-first is now the strongest form: on an MLB-sim page the dense report is not a sibling at all —
  // it is handed to the runner via postReveal and revealed ONLY after the ≥10s reveal completes.
  assert.match(detailPage, /const isMlbSim = detail\.sport === "mlb" && !!detail\.gameLabSimulation/, "the MLB-sim gate exists");
  // Now ONE unified report: the detail is the gated `mlbReportDetails` postReveal (not a competing tabbed
  // dashboard); the dense report lives in a collapsed "Advanced report" disclosure, never a pre-click sibling.
  assert.match(detailPage, /postReveal=\{mlbGameFirstReport\}/, "the unified report detail is the gated postReveal");
  assert.match(detailPage, /mlbAdvanced = \([\s\S]*?title="Advanced report"[\s\S]*?\{mlbReport\}/, "the dense report is inside the gated Advanced report disclosure (demoted into V2's advanced block)");
  // The runner (the whole pre-click experience) is rendered with the sim view on that path.
  assert.match(detailPage, /<GameSimulationRunner\s+view=\{sim\}/, "the runner drives the MLB-sim page");
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
  // MLB All-Star break (Jul 13–16): 0 MLB games on the active slate is a valid honest empty state — no
  // badge shows because there is nothing to simulate. Assert the ready-sim wiring only when games exist.
  if (mlb.length === 0) return;
  const ready = mlb.filter((d) => d.gameLabSimulation && d.gameLabSimulation.status === "ready");
  assert.ok(ready.length >= 1, "at least one MLB game has a ready sim (so a badge legitimately shows)");
});

test("no canonical money change", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
