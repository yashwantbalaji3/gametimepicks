/**
 * One joint text for every Level A card (release owner 2026-10-23): pages, copy text and the recorder's page check
 * all print suggestions.mjs jointShownFor, 1 dp except where 1 dp would read as the neighbouring band.
 * Run: npx tsx --test src/lib/products/level-a/level-a-joint-text.test.mjs
 * Selections marked FIXTURE are test inputs; the HTML is the real component's renderToString output.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

import { cardCopyText, jointShownFor, levelASuggestions, tierForJoint } from "./suggestions.mjs";
import { LEVEL_A_SERVED_SCHEMA, modelSha256 } from "./model.mjs";
import { PAGE_FOR, verifyServed } from "../../../../scripts/products/record-level-a-from-deployment.mjs";

globalThis.React = React;
const { default: LevelASuggestions } = await import("../../../components/products/level-a-suggestions.tsx");
const AS_OF = "2026-10-23T14:00:00.000Z";
let n = 0;
/** FIXTURE selection. */
const sel = (p) => ({
  sport: "epl", eventId: `fx-${++n}`, eventLabel: "Home v Away", startUtc: "2026-10-23T19:00:00Z", market: "1x2",
  selection: { code: "home", label: `Club ${n} to win` }, probability: p,
  forecast: { owner: "fixture", modelId: "fx", stampedAt: "2026-10-23T08:00:00Z", ref: null }, uncertainty: null, participantStatuses: [],
  settlement: { grader: "soccer-1x2-official-final", market: "1x2", side: "home" },
});

test("EDGES: 1 dp, more decimals only where 1 dp would band elsewhere, the tier never moves", () => {
  for (const j of [0.6666, 0.5001, 0.4999, 0.2501, 0.2499, 0.1431, 0.1429, 0.2208, 0.0933]) assert.equal(jointShownFor(j, tierForJoint(j)), `${(j * 100).toFixed(1)}%`, String(j));
  assert.equal(tierForJoint(0.4987), "medium");
  assert.equal(jointShownFor(0.4987, "medium"), "49.87%", "a Medium card never reads 49.9% (which bands Low)");
  for (const [lo, hi] of [[0.66, 0.672], [0.495, 0.505], [0.247, 0.253], [0.1415, 0.1445]]) {
    for (let j = lo; j <= hi; j += 0.00001) {
      const tier = tierForJoint(j);
      if (!tier) continue;
      const shown = jointShownFor(j, tier);
      assert.equal(tierForJoint(Number(shown.slice(0, -1)) / 100), tier, `${j.toFixed(5)} (${tier}) shows ${shown}`);
    }
  }
});

test("ONE TEXT: an edge card prints the same joint on the page, in its copy text and in the recorder's check", () => {
  /* FIXTURE: two legs whose joint is 0.4987 (Medium at +101). */
  const answer = levelASuggestions({ selections: [sel(0.7), sel(0.7124286)], now: AS_OF, productDay: "2026-10-23" });
  const card = answer.parlayLab.find((t) => t.card)?.card;
  assert.ok(card, "the fixture makes a card");
  assert.equal(card.tier, "medium");
  assert.equal(card.jointProbability, 0.4987);
  const model = { asOf: AS_OF, ...answer, refusedByReason: {}, nbaProjections: [] };
  const html = renderToString(React.createElement(LevelASuggestions, { model, mode: "parlay-lab" })).replace(/<!-- -->/g, "");
  assert.match(html, /Medium Risk · model joint probability 49\.87%/);
  assert.doesNotMatch(html, /model joint probability 49\.9%/);
  assert.match(cardCopyText(card), /Model joint probability 49\.87% /);
  const served = { schema: LEVEL_A_SERVED_SCHEMA, public: true, asOf: AS_OF, productDay: model.productDay, modelSha256: modelSha256(model), model };
  const raw = renderToString(React.createElement(LevelASuggestions, { model, mode: "parlay-lab" }));
  const pages = { [PAGE_FOR["parlay-lab"]]: raw, [PAGE_FOR["bank-builder"]]: raw, [PAGE_FOR.moonshot]: raw };
  const buildInfo = { builtAt: AS_OF, commit: { sha: "a".repeat(40) } };
  assert.deepEqual(verifyServed({ sha: "a".repeat(40), buildInfo, served, pages }), { ok: true, problems: [] }, "the recorder reads the page's own text");
  const old = { ...pages, [PAGE_FOR["parlay-lab"]]: raw.replace("49.87%", "49.9%") };
  assert.equal(verifyServed({ sha: "a".repeat(40), buildInfo, served, pages: old }).ok, false, "a page printing its own rounding is refused, never recorded");
});

test("ONE DEFINITION: jointShownFor is defined once; the page, copy text and recorder import it", () => {
  const defs = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "node_modules") walk(f); } else if (/\.(tsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name) && /function jointShownFor\b|const jointShownFor\s*=/.test(fs.readFileSync(f, "utf8"))) defs.push(path.relative(process.cwd(), f)); } };
  for (const d of ["src", "scripts"]) walk(path.resolve(process.cwd(), d));
  assert.deepEqual(defs, ["src/lib/products/level-a/suggestions.mjs"]);
  const read = (f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
  assert.match(read("src/components/products/level-a-suggestions.tsx"), /model joint probability \{jointShownFor\(c\.jointProbability, c\.tier\)\}/);
  assert.doesNotMatch(read("src/components/products/level-a-suggestions.tsx"), /joint probability \{pct\(/);
  assert.match(read("scripts/products/record-level-a-from-deployment.mjs"), /model joint probability \$\{jointShownFor\(it\.card\.jointProbability, it\.card\.tier\)\}/);
});
