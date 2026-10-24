/**
 * NBA launch day (2026-10-24): MatchupCrests inferred each side's sport from the team code, and NBA codes collide with
 * NFL and MLB ones — "DET @ CLE" on an NBA archive card drew the Lions' and the Guardians' crests. The sport now always
 * comes from the caller; a crest is drawn in that sport or not at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { MatchupCrests } = await import("./matchup-crests.tsx");
const { default: SettledGameDetail } = await import("../settled-game-detail.tsx");

const logos = (html) => [...html.matchAll(/teamlogos\/([a-z]+)\/500\/([a-z0-9]+)\.png/g)].map((m) => `${m[1]}/${m[2]}`);
const crest = (props) => renderToStaticMarkup(React.createElement(MatchupCrests, props));

test("🔴 DET @ CLE in NBA context draws the Pistons and the Cavaliers — never the Lions or the Guardians", () => {
  assert.deepEqual(logos(crest({ matchup: "DET @ CLE", sport: "nba" })), ["nba/det", "nba/cle"]);
  const card = renderToStaticMarkup(React.createElement(SettledGameDetail, {
    matchup: "DET @ CLE", sport: "nba", wins: 1, losses: 0, pushes: 0, decisive: 1, hitRate: 1, rows: [],
  }));
  assert.deepEqual(logos(card), ["nba/det", "nba/cle"], "the archive card passes its own sport");
  assert.doesNotMatch(card, /teamlogos\/(nfl|mlb)\//);
});

test("🔴 the same codes in MLB context draw MLB crests; MLB full names still resolve through the index", () => {
  assert.deepEqual(logos(crest({ matchup: "DET @ CLE", sport: "mlb" })), ["mlb/det", "mlb/cle"]);
  assert.deepEqual(logos(crest({ matchup: "NY @ SA", sport: "nba" })).map((l) => l.split("/")[0]), ["nba", "nba"]);
  const full = logos(crest({ matchup: "Colorado Rockies @ New York Yankees", sport: "mlb" }));
  assert.ok(full.length === 0 || full.every((l) => l.startsWith("mlb/")), `a full MLB name never draws another sport's crest: ${full}`);
});

test("🔴 a sport the code cannot name draws nothing rather than a guess; UFC keeps its fighter monograms", () => {
  assert.equal(logos(crest({ matchup: "Arsenal @ Chelsea", sport: "epl" })).length, 0);
  assert.equal(logos(crest({ matchup: "DET @ CLE", sport: "epl" })).length, 0, "no team-code crest outside the four US leagues");
  assert.match(crest({ matchup: "Jon Jones vs Stipe Miocic", sport: "ufc" }), /\S/, "a UFC bout still renders its two fighters");
  assert.equal(crest({ matchup: "Jon Jones vs Stipe Miocic", sport: "nba" }), "", "people are a UFC thing only");
});

test("🔴 every caller passes the sport explicitly", () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p); } };
  walk(path.join(process.cwd(), "src"));
  let uses = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/<(MatchupCrests|SelectionCrest|SettledGameDetail)\b([\s\S]*?)\/>/g)) {
      uses += 1;
      assert.match(m[2], /\bsport=/, `${path.relative(process.cwd(), f)}: <${m[1]}> without sport`);
    }
  }
  assert.ok(uses >= 7, `found ${uses} uses`);
});
