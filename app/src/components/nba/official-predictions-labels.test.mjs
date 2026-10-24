/**
 * Official Forecast section on /nba/simulation/<id> (founder mandate 2026-10-24): the models are named in words; the
 * exact model ids stay on the page, verbatim, only inside "Model details". The words equal the Theater panel's.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React; // the .tsx under test compiles to React.createElement

const { default: Official, OFFICIAL_MODEL_PLAIN } = await import("./official-predictions.tsx");
const { MODEL_PLAIN } = await import("../../lib/simulation-theater/nba/possession/labels.mjs");
const { loadNbaPossessionTheater } = await import("../../lib/simulation-theater/nba/possession/possession-loader.mjs");

const REPO = path.resolve(process.cwd(), "..");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("models in words outside Model details; exact ids only inside it; same words as the Theater panel", () => {
  assert.deepEqual({ ...OFFICIAL_MODEL_PLAIN }, { ...MODEL_PLAIN });
  const load = loadNbaPossessionTheater(REPO, "401909088");
  assert.equal(load.ok, true);
  const h = renderToStaticMarkup(React.createElement(Official, { official: load.payload.official, teams: load.payload.teams, lane: null, finalNote: null, resultsHref: "/nba/#nba-results", eloCtx: { enabled: false, disclosure: "" } }));
  const i = h.indexOf("data-nba-model-details");
  assert.ok(i > 0, "Model details disclosure");
  const outside = text(h.slice(0, h.lastIndexOf("<details", i))) + text(h.slice(h.indexOf("</details>", i)));
  assert.ok(outside.includes(`Game winner ${MODEL_PLAIN.game}`) && outside.includes(`Player statistics ${MODEL_PLAIN.players}`));
  for (const id of [load.payload.official.models.game, ...load.payload.official.models.players]) {
    assert.ok(!outside.includes(id), `${id} is not printed outside Model details`);
    assert.ok(text(h.slice(i, h.indexOf("</details>", i))).includes(id), `${id} kept inside Model details`);
  }
  assert.doesNotMatch(outside, /\(side\)|\(players\)/);
});

test("projection-unavailable players (lane players.unavailable, PR 1230): listed by name with a reason in words, never a number; another game's list is ignored", async () => {
  const { UNAVAILABLE_REASON_TEXT } = await import("./official-predictions.tsx");
  const LABELS = await import("../../lib/simulation-theater/nba/possession/labels.mjs");
  assert.deepEqual({ ...UNAVAILABLE_REASON_TEXT }, { ...LABELS.UNAVAILABLE_REASON_TEXT }, "one wording on both tables");
  const { OfficialProjectionPanel } = await import("../simulation-theater/nba/possession/possession-parts.tsx");
  const load = loadNbaPossessionTheater(REPO, "401909088");
  const official = load.payload.official;
  const unavailable = {
    away: [{ providerAthleteId: "9000001", name: "Rookie One", position: "G", state: "PROJECTION_UNAVAILABLE", reason: "INSUFFICIENT_HISTORY" }],
    home: [{ providerAthleteId: "9000002", name: "Returner Two", position: null, state: "PROJECTION_UNAVAILABLE", reason: "NO_EXPECTED_MINUTES" }],
  };
  const lane = { providerEventId: official.eventId, receipt: { modelVersion: "none" }, players: { away: [], home: [], unavailable } };
  const props = { official, teams: load.payload.teams, finalNote: null, resultsHref: "/r", eloCtx: { enabled: false, disclosure: "" } };
  const rowsOf = (h, attr) => [...h.matchAll(new RegExp(`<tr[^>]*${attr}="(\\d+)"[^>]*>([\\s\\S]*?)</tr>`, "g"))].map((m) => [m[1], text(m[2])]);
  for (const [h, attr] of [
    [renderToStaticMarkup(React.createElement(Official, { ...props, lane })), "data-nba-projection-unavailable"],
    [renderToStaticMarkup(React.createElement(OfficialProjectionPanel, { official, teams: load.payload.teams, unavailable })), "data-nbp-projection-unavailable"],
  ]) {
    const rows = rowsOf(h, attr);
    assert.deepEqual(rows.map((r) => r[0]), ["9000001", "9000002"]);
    assert.ok(rows[0][1].includes(`Rookie One Projection unavailable — ${UNAVAILABLE_REASON_TEXT.INSUFFICIENT_HISTORY}`), rows[0][1]);
    assert.ok(rows[1][1].includes(`Returner Two Projection unavailable — ${UNAVAILABLE_REASON_TEXT.NO_EXPECTED_MINUTES}`), rows[1][1]);
    for (const [, t] of rows) assert.doesNotMatch(t, /\d/, "no number of any kind, and never 0");
  }
  const other = renderToStaticMarkup(React.createElement(Official, { ...props, lane: { ...lane, providerEventId: "x" } }));
  assert.doesNotMatch(other, /Projection unavailable/, "another game's list never prints here");
  const none = renderToStaticMarkup(React.createElement(OfficialProjectionPanel, { official, teams: load.payload.teams }));
  assert.doesNotMatch(none, /Projection unavailable/, "no list → no rows (the published 10-23 slates carry none)");
});
