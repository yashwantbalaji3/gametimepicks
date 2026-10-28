/**
 * SETTLED GAME SIMULATION PAGES (overnight W7 2026-10-28; audit A #17 / reassessment #22: /nba/simulation/<id>/ 404'd the
 * day after the game). A past slate's game keeps its URL as a settled page: the frozen Official Forecast from that date's
 * committed lane file, the official final and the official record's verdict, "Game Simulation archived" — never a
 * simulation, never a guessed score, model ids only inside Technical details.
 *
 * Run (from app/): npx tsx --test src/components/nba/settled-simulation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { EXPIRED_SIMULATION_MAX_DATES, NBA_RESULTS_LINK, settledSimulationIds, settledVerdictText } = await import("./expired-simulation.mjs");
const { loadSettledSimulation, settledSimulationParams } = await import("./settled-simulation-data.ts");
const { default: SettledSimulation, SETTLED_SIMULATION_ATTR, SETTLED_ARCHIVED_HEADING } = await import("./settled-simulation.tsx");

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const lane = (date, ...ids) => ({ date, games: ids.map((id) => ({ providerEventId: id, away: { abbr: "AAA" }, home: { abbr: "BBB" } })) });

test("ids: past slates only (never the build's ET date or later), live Game Simulation ids excluded, the 404 map's window", () => {
  const lanes = [lane("2026-10-25", "401909001"), lane("2026-10-26", "401909002", "401909003"), lane("2026-10-27", "401909004"), lane("2026-10-28", "401909005")];
  assert.deepEqual(settledSimulationIds(lanes, { today: "2026-10-27" }), ["401909001", "401909002", "401909003"], "today's and tomorrow's games are not settled");
  assert.deepEqual(settledSimulationIds(lanes, { today: "2026-10-27", exclude: ["401909002"] }), ["401909001", "401909003"]);
  assert.deepEqual(settledSimulationIds(lanes, { today: "2026-10-27", max: 1 }), ["401909002", "401909003"], "newest dates first under the cap");
  assert.deepEqual(settledSimulationIds(lanes, { today: "" }), [], "no build date, no settled page");
  assert.deepEqual(settledSimulationIds([lane("2026-10-25", "not-an-id")], { today: "2026-10-27" }), [], "only ids the /nba/simulation/<digits>/ URL can carry");
  const many = Array.from({ length: EXPIRED_SIMULATION_MAX_DATES + 3 }, (_, i) => lane(`2026-09-${String(i + 1).padStart(2, "0")}`, String(401800000 + i)));
  assert.equal(settledSimulationIds(many, { today: "2026-12-01" }).length, EXPIRED_SIMULATION_MAX_DATES);
});

test("verdict words follow the official record's states — never recomputed, pending and held never a miss", () => {
  assert.match(settledVerdictText("MATCHED", "Charlotte Hornets"), /favoured Charlotte Hornets — the side won/);
  assert.match(settledVerdictText("MISSED", "Utah Jazz"), /favoured Utah Jazz — the side lost/);
  assert.match(settledVerdictText("PENDING", "X"), /never counted as a miss/);
  assert.match(settledVerdictText("HELD", "X"), /held and not counted/);
  assert.doesNotMatch(settledVerdictText("HELD", "X") + settledVerdictText("PENDING", "X") + settledVerdictText("NO_SIDE", null), /won|lost/);
});

test("REAL DATA · a settled URL for a committed past date: WSH @ CHA, 2026-10-26 (401909868) renders the frozen forecast and the final", () => {
  assert.ok(settledSimulationParams("2026-10-28").includes("401909868"), "the id is a static param once its slate has passed");
  const view = loadSettledSimulation("401909868", "2026-10-28");
  assert.ok(view, "a past-slate game has a settled view (no 404)");
  assert.equal(view.date, "2026-10-26");
  const laneFile = JSON.parse(read("public/data/nba/experimental-public/2026-10-26.json"));
  const laneGame = laneFile.games.find((g) => g.providerEventId === "401909868");
  assert.deepEqual(view.game, laneGame, "the forecast is the committed lane game, exactly as frozen");
  const finals = JSON.parse(read("public/data/nba/results/finals-2026-27.json")).finals.find((f) => f.providerEventId === "401909868");
  assert.deepEqual([view.record.final.away, view.record.final.home, view.record.final.winnerSide], [finals.ftAway, finals.ftHome, finals.winnerSide], "the final is the finals record's, via the official record");
  assert.equal(view.record.state, laneGame.elo.favoured === (finals.winnerSide === "home" ? laneGame.home.abbr : laneGame.away.abbr) ? "MATCHED" : "MISSED");

  const html = renderToStaticMarkup(React.createElement(SettledSimulation, { view }));
  const t = text(html);
  assert.ok(html.includes(`${SETTLED_SIMULATION_ATTR}="401909868"`));
  assert.ok(t.includes(`Final: WSH ${finals.ftAway} – ${finals.ftHome} CHA`), "the official final, verbatim");
  assert.ok(t.includes("The Official Forecast favoured Charlotte Hornets — the side won."));
  assert.ok(t.includes(SETTLED_ARCHIVED_HEADING) && /Game Simulations are shown on game day only\./.test(t) && !/replays are not kept/.test(t), "the simulation is marked archived (REPOINTED audit 2026-10-28: the runs ARE kept; the page says they are not shown)");
  // (next/link drops the trailing slash outside a Next build; the export's trailingSlash config restores it)
  assert.match(html, /href="\/nba\/projections\/2026-10-26\/?"/, "links that day's board");
  assert.equal(NBA_RESULTS_LINK, "/results/nba/");
  assert.match(html, /href="\/results\/nba\/?"/, "links the official record");
  // every published player, every median as frozen (1 dp), "—" for a missing figure, never 0 for it
  for (const p of [...laneGame.players.away, ...laneGame.players.home]) {
    assert.ok(t.includes(p.name), p.name);
    const at = html.indexOf(p.name.replace(/'/g, "&#x27;"));
    const row = html.slice(at, html.indexOf("</tr>", at));
    assert.ok(row.includes(`>${p.medians.pts.toFixed(1)}<`), `${p.name} PTS ${p.medians.pts}`);
  }
  for (const p of [...laneGame.players.away, ...laneGame.players.home].filter((x) => x.injuryStatus)) assert.ok(t.includes(`${p.name} · ${p.injuryStatus}`), `${p.name}'s pre-tip status is shown`);
  // not a simulation: no Theater, no engine, no team score; disclosures kept
  assert.doesNotMatch(html, /data-nbp-|possession/); // "possession" also covers the engine id
  assert.match(t, /Not a betting recommendation/);
  assert.match(t, /Team scores|team scores/);
});

test("model ids, receipts and rules only inside Technical details on the settled page", () => {
  const view = loadSettledSimulation("401909868", "2026-10-28");
  const html = renderToStaticMarkup(React.createElement(SettledSimulation, { view }));
  const at = html.indexOf("Technical details");
  assert.ok(at > 0, "one Technical details disclosure");
  assert.equal(html.split("Technical details").length, 2, "exactly one");
  const outside = text(html.slice(0, html.lastIndexOf("<details", at)));
  const inside = text(html.slice(at));
  for (const id of [view.game.receipt.modelVersion, view.game.receipt.payloadSha256, view.game.elo.rule, "v0.1", "nba-winner-side@1"]) {
    assert.ok(!outside.includes(id), `${id} not in the reading path`);
  }
  assert.ok(inside.includes(view.game.receipt.modelVersion) && inside.includes(view.game.receipt.payloadSha256), "kept, verbatim, inside");
});

test("today's and future games get no settled page (the current slate is the Game Simulation's); unknown ids 404", () => {
  const today = JSON.parse(read("public/data/nba/experimental-public/2026-10-27.json"));
  const id = String(today.games[0].providerEventId);
  assert.equal(loadSettledSimulation(id, "2026-10-27"), null, "on its own slate date the game is not settled");
  assert.ok(loadSettledSimulation(id, "2026-10-28"), "the next ET day it is");
  assert.equal(loadSettledSimulation("401999999", "2026-10-28"), null);
  assert.equal(loadSettledSimulation("nba-theater-disabled", "2026-10-28"), null);
});

test("SOURCE PIN · the route builds settled params only inside the literal flag branch and renders them before the 404", () => {
  const src = read("src/app/nba/simulation/[eventId]/page.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const gsp = src.slice(src.indexOf("export async function generateStaticParams"), src.indexOf("export const dynamicParams"));
  const on = gsp.slice(gsp.indexOf('if (process.env.GTP_NBA_THEATER_PUBLIC === "1") {'), gsp.lastIndexOf("return [{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER }]"));
  assert.match(on, /settledSimulationParams\(currentEtDate\(\), live\.map\(\(p\) => p\.eventId\)\)/, "settled ids exclude the live Game Simulation ids");
  assert.match(on, /nbaPublicTheaterOn\(\) \?/, "and require the two-act gate");
  const body = src.slice(src.indexOf("export default async function"));
  assert.match(body, /if \(!load\.ok\) \{[\s\S]*loadSettledSimulation\(params\.eventId, currentEtDate\(\)\)[\s\S]*if \(!settled\) notFound\(\);[\s\S]*<SettledSimulation view=\{settled\} \/>/);
  // the settled modules read committed PUBLIC files only — never the research tree, never the Theater library
  for (const f of ["src/components/nba/settled-simulation.tsx", "src/components/nba/settled-simulation-data.ts"]) {
    assert.doesNotMatch(read(f), /data\/internal|simulation-theater\/nba\/possession|possession[-]sim/, f);
  }
});

test("the flag-ON export scan recognises this page: same marker attribute, and the page prints every string it requires", async () => {
  const { SETTLED_PAGE_MARKER } = await import("../../lib/simulation-theater/nba/export-boundary.mjs");
  assert.equal(SETTLED_PAGE_MARKER, SETTLED_SIMULATION_ATTR);
  const required = /const SETTLED_REQUIRED = (\[[^\]]+\]);/.exec(read("src/lib/simulation-theater/nba/possession/public-theater-export.test.mjs"));
  assert.ok(required, "the post-build test names its settled-page strings");
  const html = renderToStaticMarkup(React.createElement(SettledSimulation, { view: loadSettledSimulation("401909868", "2026-10-28") }))
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  for (const s of JSON.parse(required[1])) assert.ok(html.includes(s), s);
});
