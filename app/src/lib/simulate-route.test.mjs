/**
 * /simulate ROUTE (UX mission, Phase 1). A clean user-facing simulation lobby that reuses the SAME
 * SimulateLobby component as /games (no duplicated business logic), lists today's simulation-ready games
 * with artifact-backed badges, and links to the game pages. Static-export safe; no money change.
 */
import test from "node:test";
import { artifactAbsence } from "./testing/day-in-flight.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const simulatePage = read("src/app/simulate/page.tsx");
const gamesPage = read("src/app/games/page.tsx");
const lobby = read("src/components/games/simulate-lobby.tsx");

test("/simulate is the canonical selection destination; /games is collapsed to a redirect to it (one URL)", () => {
  // P209 Release A: the day selector replaced the aggregate lobby — /simulate and /simulate/d/[date]
  // render the SAME server view from the ONE selector (lib/simulate/day-view). The invariant this
  // guard has always protected is unchanged: one canonical URL, no duplicated data logic in pages.
  assert.match(simulatePage, /from "@\/lib\/simulate\/day-view"/, "/simulate reads the one day selector");
  assert.match(simulatePage, /<SimulateDay view=\{view\} \/>/, "/simulate renders the shared day component");
  const datePage = fs.readFileSync("src/app/simulate/d/[date]/page.tsx", "utf8");
  assert.match(datePage, /buildSimulateDay\(params\.date\)/, "the date route uses the same selector");
  assert.match(datePage, /<SimulateDay view=\{view\} \/>/, "…and the same component");
  // /games no longer duplicates the lobby — it client-redirects to /simulate (static-export-safe).
  assert.match(gamesPage, /ClientRedirect/, "/games renders a ClientRedirect");
  assert.match(gamesPage, /to="\/simulate\/"/, "/games redirects to /simulate");
  assert.ok(!/<SimulateLobby/.test(gamesPage), "/games no longer mounts the lobby (deduped)");
  // The heavy data logic lives ONCE in the selector lib, not duplicated in the pages.
  assert.ok(!/buildAllGameDetails/.test(simulatePage) && !/buildAllGameDetails/.test(gamesPage), "no data logic duplicated in the page files");
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

test("FUNCTIONAL: when today's slate carries MLB games, they surface as simulation-ready for the lobby", async () => {
  const { buildAllGameDetails } = await import("./game-detail.ts");
  const mlb = buildAllGameDetails().filter((d) => d.sport === "mlb");
  // MLB All-Star break (Jul 13–16): 0 MLB games on the active slate is a valid honest empty state — the
  // lobby simply lists no MLB cards. Assert the simulation-ready wiring only when the slate has games.
  if (mlb.length === 0) return;
  /*
   * GAMES WITHOUT SIMULATIONS YET IS A MID-FLIGHT DAY, NOT A DEFECT (P233 · A). The schedule lands
   * early; `mlb-daily-production` builds the simulations later — cron 14:15Z, observed landings
   * 17:00-17:54Z. Between those the slate has games and no ready sims, and asserting readiness there
   * fails a system that is working. Past the producer's deadline the absence IS the finding.
   */
  {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const absence = artifactAbsence({ appDir: process.cwd(), relDir: "public/data/mlb/game-simulations", date: today, producer: "mlb-daily-production" });
    if (absence.inFlight) return;
  }
  const ready = mlb.filter((d) => d.gameLabSimulation?.status === "ready");
  assert.ok(ready.length >= 1, "at least one simulation-ready MLB game is available to list");
  assert.ok(ready.every((d) => d.slug), "each has a slug → a real game page to link to");
});

test("/simulate route touches NO canonical money", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});
