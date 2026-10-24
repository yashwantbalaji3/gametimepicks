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
