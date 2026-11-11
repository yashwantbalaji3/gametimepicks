/**
 * NFL QB market boards (qb-boards.mjs, components/nfl/qb-boards.tsx) — synthetic receipts; R5 and eligibility@1 gates,
 * the ranking, statuses, labels, the flag-gated import. No real outcome is read.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/qb-boards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QB_BOARDS_LABEL, buildQbBoards } from "./qb-boards.mjs";
import { QB_MARKET_STATUS } from "./qb-props-markets.mjs";

globalThis.React = React;
const { default: QbBoards } = await import("../../../components/nfl/qb-boards.tsx");

const q = (v) => ({ p10: v - 40, p50: v, p90: v + 40 });
const qb = (id, team, yds) => ({ playerId: `nfl-athlete-${id}`, name: `QB${id}`, team, stats: { passAtt: q(32), cmp: q(21), passYds: q(yds), passTd: q(2), int: q(1) }, exactCounts: { passYds: { [yds - 30]: 3, [yds]: 4, [yds + 30]: 3 }, cmp: { 20: 5, 22: 5 }, passAtt: { 30: 5, 34: 5 }, passTd: { 1: 4, 2: 6 }, int: { 0: 6, 1: 4 } } });
const rec = (eventId, players) => ({ receipt: { eventId, eventStart: "2026-11-16T18:00Z", generatedAt: "2026-11-16T12:00:00Z", playerStatDistributions: players } });
const records = [rec("1", [qb(1, "AAA", 280), qb(2, "BBB", 240)]), rec("2", [qb(3, "CCC", 300), qb(4, "DDD", 200)]), rec("3", [qb(5, "EEE", 320), qb(6, "FFF", 190)])];
const ELIG = { state: "ELIGIBLE", reasons: [], contractVersion: "eligibility@1" };
const inputs = { 1: { state: "NO_STARTING_QB_ABSENCE" }, 2: { state: "NO_STARTING_QB_ABSENCE" }, 3: { state: "BLIND_TO_STARTING_QB_ABSENCE" } };
const elig = { "nfl-athlete-4": { ...ELIG, flags: ["QUESTIONABLE"] }, "nfl-athlete-2": { state: "UNKNOWN", reasons: ["ROSTER_STALE"], contractVersion: "eligibility@1" } };
const model = () => buildQbBoards({ records, teamInputsFor: (id) => inputs[id] ?? null, eligibilityFor: (_id, pid) => elig[pid] ?? ELIG });

test("gates: an R5 QB-blind game shows no QB; questionable and unverified QBs are never listed; counted", () => {
  const m = model();
  assert.deepEqual(m.excluded, { r5: 2, eligibility: 2 });
  assert.equal(m.quarterbacks, 2);
  const yds = m.markets.find((x) => x.market === "passYds");
  assert.deepEqual(yds.rows.map((r) => r.playerId), ["nfl-athlete-3", "nfl-athlete-1"], "ordered by the run median; QB5 (R5) and QB4/QB2 (eligibility) absent");
  assert.equal(buildQbBoards({ records, teamInputsFor: () => null, eligibilityFor: () => ELIG }).quarterbacks, 0, "no team-input record ⇒ no QB");
  assert.equal(buildQbBoards({ records, teamInputsFor: (id) => inputs[id], eligibilityFor: () => null }).quarterbacks, 0, "no eligibility record ⇒ no QB");
});

test("five markets from one simulation, each with its frozen status; a maximum, never a quota", () => {
  const m = model();
  assert.deepEqual(m.markets.map((x) => x.market), ["passTd", "passYds", "passCmp", "passAtt", "passInt"]);
  for (const x of m.markets) { assert.equal(x.status, QB_MARKET_STATUS[x.market]); assert.ok(x.rows.length <= m.size); }
  assert.equal(m.label, QB_BOARDS_LABEL);
  assert.equal(m.label, "EXPERIMENTAL · MODEL PROJECTION");
  assert.equal(JSON.stringify(model()), JSON.stringify(m), "deterministic");
});

test("render: labelled EXPERIMENTAL · MODEL PROJECTION; no price, line, pick, edge or confidence word; empty model renders nothing", () => {
  const html = renderToStaticMarkup(React.createElement(QbBoards, { model: model() }));
  assert.match(html, /EXPERIMENTAL · MODEL PROJECTION · RESEARCH/);
  assert.match(html, /data-nfl-qb-board="passYds"/);
  assert.match(html, /QB3<\/a> <span[^>]*>CCC<\/span><\/th><td>300<\/td><td>260–340<\/td>/);
  assert.doesNotMatch(html, /\b(odds|edge|lock|confidence|value bet|bet|price|over\/under)\b/i);
  assert.equal(renderToStaticMarkup(React.createElement(QbBoards, { model: { ...model(), quarterbacks: 0 } })), "");
});

test("flag: the hub imports the QB boards only inside GTP_NFL_QB_BOARDS_PUBLIC === \"1\"; the flag defaults OFF", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/nfl/page.tsx"), "utf8");
  assert.doesNotMatch(page, /^import [^\n]*qb-boards/m, "no static import");
  assert.match(page, /if \(process\.env\.GTP_NFL_QB_BOARDS_PUBLIC === "1"\) \{\s*const \{ default: QbBoards \} = await import\("@\/components\/nfl\/qb-boards"\);/);
  const cfg = fs.readFileSync(path.join(process.cwd(), "next.config.mjs"), "utf8");
  assert.match(cfg, /GTP_NFL_QB_BOARDS_PUBLIC: process\.env\.GTP_NFL_QB_BOARDS_PUBLIC === "1" \? "1" : "0"/);
});
