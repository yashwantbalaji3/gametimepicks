/**
 * Founder conditions on PR #1297 (2026-11-09):
 *   2 · the Live hub is ONE interaction from Today and from each sport hub Live covers (NFL, MLB) — a visible shortcut that
 *       is stronger while games are in progress;
 *   3 · game cards say which figure is the official prediction, a hypothetical simulation, a live score or a settled result.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const { default: LiveShortcut, liveShortcutText, LIVE_HREF } = await import("../components/live/live-shortcut.tsx");
const { default: GameStateTag, GAME_STATE_TEXT } = await import("../components/game/game-state-tag.tsx");

test("2 · the Live shortcut renders on Today, /today and the NFL and MLB hubs, ahead of their content, as ONE link to the Live hub", () => {
  for (const [rel, where, before] of [["src/app/page.tsx", "home", 'heading="Today\'s games"'], ["src/app/today/page.tsx", "today", "<LiveNow"], ["src/app/nfl/page.tsx", "nfl", "<LiveNow"], ["src/app/mlb/page.tsx", "mlb", "<LiveNow"]]) {
    const src = read(rel);
    const at = src.indexOf(`where="${where}"`);
    assert.ok(at > 0, `${rel} mounts the shortcut`);
    assert.ok(at < src.indexOf(before), `${rel}: the shortcut comes before ${before}`);
  }
  const h = renderToStaticMarkup(React.createElement(LiveShortcut, { sports: ["nfl", "mlb"], where: "home" }));
  assert.equal((h.match(/<a /g) ?? []).length, 1, "one interaction: a single link");
  assert.match(h, new RegExp(`href="${LIVE_HREF.replace(/\/$/, "")}/?"`));
  assert.match(h, /Live scores/, "visible before any fetch (a static page cannot know what is live)");
  assert.doesNotMatch(h, /\d+\s?%|odds/i, "no score, no probability on the shortcut");
});

test("2 · more prominent while games are in progress, quiet otherwise; an unreadable feed never claims live", () => {
  assert.deepEqual(liveShortcutText(3), { title: "Live now · 3 games in progress", sub: "Scores as they happen, beside the frozen forecasts", hot: true });
  assert.equal(liveShortcutText(1).title, "Live now · 1 game in progress");
  for (const n of [0, null]) assert.equal(liveShortcutText(n).hot, false);
  assert.match(read("src/app/globals.css"), /\.gtp-live-shortcut\.is-hot \{ border: 2px solid var\(--vault-accent\)/);
});

test("3 · four card states, each named in words (colour is never the only cue), used by every card type touched", () => {
  assert.deepEqual(GAME_STATE_TEXT, { official: "MODEL PROJECTION", simulation: "SIMULATION · hypothetical", live: "LIVE SCORE", final: "FINAL · settled" });
  for (const s of Object.keys(GAME_STATE_TEXT)) assert.match(renderToStaticMarkup(React.createElement(GameStateTag, { state: s })), new RegExp(`data-game-state="${s}">${GAME_STATE_TEXT[s]}<`));
  const pc = read("src/components/command-center/prediction-card.tsx");
  assert.match(pc, /<GameStateTag state="official" \/>/, "the homepage forecast card tags its forecast");
  assert.match(pc, /card\.signal\.kind === "SIM_STRENGTH" \? <><GameStateTag state="simulation" \/>/, "a share of simulated games is tagged hypothetical");
  assert.match(pc, /<GameStateTag state="final" \/> \{card\.result\.actual\}/, "the settled result is tagged final");
  assert.match(read("src/components/live/live-now-strip.tsx"), /\{stale \? null : <GameStateTag state="live" \/>\}/, "a live card is tagged live — never when the feed is stale");
  // the homepage lane rows are the shared game card's rows, carrying the row's state (lane-card test below)
  assert.match(read("src/components/command-center/command-center.tsx"), /<GameCard key=\{g\.id\} density="row" model=\{\{[^]*?facts: \[\{ state: g\.state \?\? null/);
  assert.match(read("src/app/globals.css"), /\.gtp-state-tag\.is-simulation \{[^}]*border-style: dashed/);
});

test("4 · ONE shared game card: the hubs (card and row), Today and the homepage lanes all render components/game/game-card.tsx", async () => {
  for (const rel of ["src/components/sport-hub/game-summary.tsx", "src/components/today/today-games.tsx", "src/components/command-center/command-center.tsx"]) {
    assert.match(read(rel), /import GameCard(, \{ type GameCardModel \})? from "@\/components\/game\/game-card";/, `${rel} uses the shared card`);
  }
  assert.doesNotMatch(read("src/components/sport-hub/game-summary.tsx"), /<li className="gtp-ev|<li className="gtp-cr"/, "the hub no longer draws its own card markup");
  assert.doesNotMatch(read("src/components/today/today-games.tsx"), /<li className=/, "Today no longer draws its own row markup");
  const { default: GameCard } = await import("../components/game/game-card.tsx");
  const model = { id: "g", startLabel: "7:00 PM ET", statusLabel: "Upcoming", matchup: "AAA @ HHH", separator: "@",
    sides: [{ name: "Away" }, { name: "Home", favoured: true }],
    facts: [{ state: "official", text: "HHH 61%", sub: "model forecast", headline: true }, { state: "simulation", text: "58% of simulated games" }],
    actions: [{ href: "/g/", label: "Open report", primary: true }] };
  const card = renderToStaticMarkup(React.createElement(GameCard, { model }));
  const row = renderToStaticMarkup(React.createElement(GameCard, { model, density: "row" }));
  for (const [name, h] of [["card", card], ["row", row]]) {
    assert.match(h, /data-game-state="official">MODEL PROJECTION</, `${name}: the forecast is tagged`);
    assert.match(h, /data-game-state="simulation">SIMULATION · hypothetical</, `${name}: a simulation is tagged hypothetical`);
    assert.match(h, /href="\/g\/?"/, `${name}: one link to the game`);
  }
  assert.match(card, /class="gtp-ev /);
  assert.match(row, /class="gtp-cr"/);
});

test("4 · a row with no link still says why (the compact row's report note survives the shared card)", async () => {
  const { default: GameCard } = await import("../components/game/game-card.tsx");
  const h = renderToStaticMarkup(React.createElement(GameCard, { density: "row", model: { id: "u", startLabel: "Sat", matchup: "A vs B", facts: [], actions: [], noAction: "not modelled — no tracked history" } }));
  assert.match(h, /not modelled — no tracked history/);
  assert.doesNotMatch(h, /<a /);
});
