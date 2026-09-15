/**
 * P308 stage 0 — a run count is EVIDENCE, never a default.
 *
 * The NFL detail builder used to turn a missing artifact run count into `10000`, which the view then converted into
 * permission to print "10,000 runs". Every "N runs" phrase on a sport page must now read the artifact's own count or
 * say nothing. These pins fail if the default, or a literal count on a live surface, ever comes back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildGameSimulationView } from "./game-simulations/game-lab-view.ts";

const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the NFL detail builder never defaults a run count; a missing count is null and forbids the claim", () => {
  const detail = src("src/lib/game-detail.ts");
  assert.doesNotMatch(detail, /runCount:\s*Number\([^)]*\?\?\s*10000\)/, "the `?? 10000` default is gone");
  assert.doesNotMatch(detail, /runCount:[^\n]*\b10000\b/, "no literal run count anywhere in the builder");
  const result = { status: "unavailable", sport: "nfl", date: "2026-09-15", gameId: "x", reason: "no artifact", unavailableModules: [] };
  const view = buildGameSimulationView(result, { modelVersion: "v", simulationVersion: 1, runCount: null, generatedAt: "" });
  assert.equal(view.allowsRunCountClaim, false);
  assert.equal(view.runCount, null);
});

test("no live NFL or MLB surface carries a literal run count — each reads its artifact", () => {
  const nflHub = src("src/app/nfl/page.tsx");
  assert.doesNotMatch(nflHub, /10,000 runs|10,000 simulated/, "the NFL hub prints the forecast's own model.simulations");
  assert.match(nflHub, /model\?\.simulations/, "…and reads it from the forecast row");
  const nflGame = src("src/app/nfl/game/[eventId]/page.tsx");
  assert.doesNotMatch(nflGame, /10,000-run/, "the NFL game metadata prints the forecast's own count");
  const mlbReport = src("src/components/game/mlb-full-game-report.tsx");
  assert.doesNotMatch(mlbReport, /10,000 simulated/, "the MLB report prints g.runCount");
});
