/**
 * /simulate ROUTE (UX mission, Phase 1). A clean user-facing simulation lobby that reuses the SAME
 * SimulateLobby component as /games (no duplicated business logic), lists today's simulation-ready games
 * with artifact-backed badges, and links to the game pages. Static-export safe; no money change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const simulatePage = read("src/app/simulate/page.tsx");
const gamesPage = read("src/app/games/page.tsx");
const lobby = read("src/components/games/simulate-lobby.tsx");

test("/simulate is the canonical lobby; /games is collapsed to a redirect to it (one URL)", () => {
  assert.match(simulatePage, /from "@\/components\/games\/simulate-lobby"/, "/simulate imports the shared lobby");
  assert.match(simulatePage, /<SimulateLobby \/>/, "/simulate renders it");
  // /games no longer duplicates the lobby — it client-redirects to /simulate (static-export-safe).
  assert.match(gamesPage, /ClientRedirect/, "/games renders a ClientRedirect");
  assert.match(gamesPage, /to="\/simulate\/"/, "/games redirects to /simulate");
  assert.ok(!/<SimulateLobby/.test(gamesPage), "/games no longer mounts the lobby (deduped)");
  // The heavy data logic lives ONCE in the component, not duplicated in the pages.
  assert.ok(!/buildAllGameDetails/.test(simulatePage) && !/buildAllGameDetails/.test(gamesPage), "no data logic duplicated in the page files");
  assert.match(lobby, /buildAllGameDetails/, "the shared component owns the data logic");
});

test("/simulate has its own metadata (Simulate) and the lobby is simulate-framed", () => {
  assert.match(simulatePage, /title: "Simulate · GameTime Picks"/, "/simulate has a clear title");
  assert.match(lobby, /title="Simulate Games"/, "the lobby says Simulate Games");
  assert.match(lobby, /run the model simulation/i, "the lobby explains simulation");
});

test("the lobby surfaces artifact-backed Simulation-Ready badges + links to game pages", () => {
  assert.match(lobby, /simReady: mlbDetail\?\.gameLabSimulation\?\.status === "ready"/, "badge from the REAL ready artifact");
  assert.match(lobby, /detailHref: mlbDetail \? `\/games\/mlb\//, "MLB cards link to the game (simulation) page");
});

test("FUNCTIONAL: today's slate carries MLB simulation-ready games for the lobby", async () => {
  const { buildAllGameDetails } = await import("./game-detail.ts");
  const ready = buildAllGameDetails().filter((d) => d.sport === "mlb" && d.gameLabSimulation?.status === "ready");
  assert.ok(ready.length >= 1, "at least one simulation-ready MLB game is available to list");
  assert.ok(ready.every((d) => d.slug), "each has a slug → a real game page to link to");
});

test("/simulate route touches NO canonical money", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
