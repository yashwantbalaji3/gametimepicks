#!/usr/bin/env node
/**
 * Read-only audit: run the NFL leg screen over the upcoming player boards EXACTLY as /nfl/builder does — the same loader
 * (lib/sports/nfl/builder-inputs.mjs: the canonical line rule per game, the game page's official projections) at the
 * same instant (lib/build-asof.ts buildAsOfIso: the build stamp when present, else now) — and print how many legs pass
 * and why the rest are refused. A game whose line rule is closed (no display key in this environment) supplies nothing,
 * as on the page. Writes nothing.
 *   npx tsx app/scripts/nfl/audit-leg-screen.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(APP); // the build's cwd: the line reader and the build stamp resolve against app/
const { loadBuilderSlate } = await import("../../src/lib/sports/nfl/builder-inputs.mjs");
const { AMOUNTS, GOAL_CAP, buildScenario } = await import("../../src/lib/sports/nfl/leg-screen.mjs");
const { buildAsOfIso } = await import("../../src/lib/build-asof.ts");

const now = buildAsOfIso();
const { candidates, screen: r, slate, openGames } = loadBuilderSlate({ now });
const scen = {};
for (const [product, amounts] of Object.entries(AMOUNTS)) for (const stake of amounts) { const s = buildScenario(r.passed, { stake, goal: GOAL_CAP[product] }); scen[`${product}:${stake}`] = s.state === "BUILT" ? `BUILT ${s.legs.length} legs ×${s.multiple}` : `${s.state} (${s.reason})`; }
console.log(JSON.stringify({ asOf: now, upcomingGames: slate, gamesWithOpenLines: openGames, candidates: candidates.length, passed: r.passed.length, byTier: { "5/5": r.passed.filter((l) => l.tier === "5/5").length, "4/5": r.passed.filter((l) => l.tier === "4/5").length }, refusedBy: r.reasons, scenarios: scen }, null, 2));
