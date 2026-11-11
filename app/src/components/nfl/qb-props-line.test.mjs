/**
 * NFL QB props v0 display stub (qb-props-line.tsx): R5-gated, labelled MODEL PROJECTION, no price, and
 * behind a build flag that defaults OFF (the page imports the component only inside the compile-time flag branch).
 * Run (from app/): npx tsx --test src/components/nfl/qb-props-line.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: QbPropsLine, qbLineAllowed, projectedQbRows, QB_PROPS_LABEL } = await import("./qb-props-line.tsx");

const q = (p10, p50, p90) => ({ p10, p50, p90 });
const receipt = { eventId: "9", schemaVersion: "simulation-receipt@2.1", playerStatDistributions: [
  { playerId: "nfl-athlete-1", name: "Home QB", team: "HOM", stats: { passAtt: q(28, 34, 40), cmp: q(18, 22, 27), passYds: q(180, 241.6, 300) }, countPmf: { passTd: [0.2, 0.35, 0.25, 0.12, 0.05, 0.02, 0.01], int: [0.55, 0.3, 0.1, 0.05, 0, 0, 0] } },
  { playerId: "nfl-athlete-2", name: "Backup", team: "HOM", stats: { passAtt: q(0, 1, 3) } },
  { playerId: "nfl-athlete-3", name: "Away QB", team: "AWY", stats: { passAtt: q(26, 31, 37), cmp: q(17, 20, 24), passYds: q(170, 220, 280) },
    exactCounts: { passYds: { 190: 2, 230: 5, 260: 3 }, cmp: { 20: 5, 24: 5 }, passAtt: { 30: 5, 34: 5 }, passTd: { 0: 2, 1: 4, 2: 4 }, int: { 0: 7, 1: 3 } } },
], eventStart: "2026-11-01T17:00Z" };
const g = (week, dateUtc, row) => ({ providerEventId: `g${week}`, season: 2026, week, dateUtc, home: { abbr: "HOM" }, away: { abbr: "XYZ" }, players: [{ playerId: "nfl-athlete-1", teamAbbr: "HOM", ...row }] });
const games = [g(2, "2026-09-20T17:00Z", { passAtt: 30, passCmp: 20, passYds: 210, passTd: 1, passInt: 0 }), g(3, "2026-09-27T17:00Z", { passAtt: 35, passCmp: 25, passYds: 280, passTd: 3, passInt: 1 }), g(9, "2026-11-01T17:00Z", { passAtt: 40, passCmp: 30, passYds: 400, passTd: 4, passInt: 0 })];

test("R5: a QB-blind forecast, an UNKNOWN one, or no team-input record shows nothing", () => {
  for (const ti of [{ state: "BLIND_TO_STARTING_QB_ABSENCE" }, { state: "UNKNOWN" }, null, {}]) {
    assert.equal(qbLineAllowed(ti), false, JSON.stringify(ti));
    assert.equal(renderToStaticMarkup(React.createElement(QbPropsLine, { receipt, teamInputs: ti })), "");
  }
  assert.equal(qbLineAllowed({ state: "NO_STARTING_QB_ABSENCE" }), true);
});

test("the section: projected QB per team, five markets from one simulation, exact chances, history labelled, never a price", async () => {
  assert.deepEqual(projectedQbRows(receipt).map((p) => p.playerId), ["nfl-athlete-3", "nfl-athlete-1"]);
  const { qbHistory } = await import("../../lib/sports/nfl/qb-props-markets.mjs");
  const history = { "nfl-athlete-1": qbHistory(games, "nfl-athlete-1", receipt.eventStart) };
  const html = renderToStaticMarkup(React.createElement(QbPropsLine, { receipt, teamInputs: { state: "NO_STARTING_QB_ABSENCE" }, history }));
  const text = html.replace(/<[^>]+>/g, " ");
  assert.ok(html.includes(QB_PROPS_LABEL) && QB_PROPS_LABEL === "MODEL PROJECTION");
  for (const m of ["Passing TDs", "Passing yards", "Completions", "Attempts", "Interceptions"]) assert.ok(text.includes(m), m);
  assert.match(text, /242/, "pass-yards median from receipt quantiles (no exact counts)");
  assert.match(text, /1\+: 80%/, "1+ pass TD = 1 − P(0) from the count PMF");
  assert.match(text, /2\+: 45%/, "2+ pass TD");
  assert.match(text, /200\+: 80% · 225\+: 80% · 250\+: 30%/, "yards chances exactly from the run counts");
  assert.match(text, /Wider projection range/, "market status shown in plain words (FORWARD_EVALUATION)");
  assert.doesNotMatch(text, /forward evaluation|EXPERIMENTAL|RESEARCH/i, "no research vocabulary (founder language decision 2026-11-11)");
  assert.doesNotMatch(text, /Validated/, "no market is validated");
  assert.match(text, /History: actual results in his previous 2 games before this kickoff\. Not a forecast\./);
  assert.match(text, /2026 wk 3 vs XYZ/);
  assert.doesNotMatch(text, /2026 wk 9/, "a game at or after kickoff is never history");
  assert.doesNotMatch(text, /[+-]\d{3}\b|\bodds\b|\$|over \d|under \d|\bedge\b|confiden|lock\b|best bet|value/i, "no price, line, pick, edge or confidence word");
});

test("flag OFF by default: the page imports the component only inside the compile-time GTP_NFL_QB_PROPS_PUBLIC branch", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/nfl/simulation/[eventId]/page.tsx"), "utf8");
  assert.doesNotMatch(page, /^import [^\n]*qb-props-line/m, "never a static import");
  assert.match(page, /if \(process\.env\.GTP_NFL_QB_PROPS_PUBLIC === "1"\) \{\s*const \{ default: QbPropsLine \} = await import\("@\/components\/nfl\/qb-props-line"\);/);
  const cfg = fs.readFileSync(path.join(process.cwd(), "next.config.mjs"), "utf8");
  assert.match(cfg, /GTP_NFL_QB_PROPS_PUBLIC: process\.env\.GTP_NFL_QB_PROPS_PUBLIC === "1" \? "1" : "0"/);
});
