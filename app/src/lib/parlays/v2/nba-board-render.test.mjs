/**
 * Parlay Lab V2 board · NBA states rendered (server-side, no browser). Run (from app/):
 *   npx tsx --test src/lib/parlays/v2/nba-board-render.test.mjs
 *
 * (1) The REAL board model (/build, committed artifacts, real registry): NBA adds no leg and the board SAYS so —
 *     "NBA legs need an authorized NBA price" — rather than showing an empty, unexplained NBA card.
 * (2) A TEST FIXTURE model (permissive registry + fixture prices): NBA-only and NBA+NFL cards render with their
 *     composition, the official projection + provenance, the same-game note and the FIXTURE label.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// tsx compiles the components with the classic JSX runtime (tsconfig jsx: preserve), so React must be global first
globalThis.React = React;
const { TierBoardView } = await import("../../../components/parlays/v2/TierBoard.tsx");
import { emptySlip } from "../../slip/smart-slip.mjs";
import { buildParlayLabV2Model } from "./board-model.mjs";
import { nbaParlayLab, SAME_GAME_POLICY } from "./nba-source.mjs";
import { COVERAGE, FIXTURE_NBA_SETTLES, FIXTURE_OPERATORS, FIXTURE_SPORT_GATE, NOW, PERMISSIVE_REGISTRY, nbaSlate, nflInputs } from "./__fixtures__/nba-fixtures.mjs";

const APP = process.cwd();
const slipApi = { slip: emptySlip(), nowMs: Date.parse(NOW), openCard: () => {}, remove: () => {}, move: () => {}, clear: () => {} };
const render = (model) => renderToStaticMarkup(createElement(TierBoardView, { model, slipApi }));
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("(1) the real /build model: no NBA leg anywhere, and an NBA note that says an authorized NBA price is needed", () => {
  const now = new Date().toISOString();
  const model = buildParlayLabV2Model({ dataRoot: path.join(APP, "public", "data"), repoRoot: path.resolve(APP, ".."), date: now.slice(0, 10), now });
  assert.ok(model.tiers.every((t) => t.cards.every((c) => c.legs.every((l) => String(l.sport).toLowerCase() !== "nba"))));
  assert.deepEqual(model.sportNotes.map((n) => [n.sport, n.state]), [["nba", "NBA_PRICE_NOT_AUTHORIZED"]]);
  const html = render(model);
  assert.match(html, /data-sport-note="nba"/);
  assert.match(text(html), /NBA legs need an authorized NBA price\./);
  assert.equal((html.match(/data-tier-status=/g) ?? []).length, 4, "the four tiers still render");
});

test("(2) TEST FIXTURE model: NBA-only and NBA+NFL cards render with projection, provenance, same-game note and FIXTURE label", () => {
  const s = nbaSlate();
  const out = nbaParlayLab({ results: s.results, snapshots: s.snapshots, otherInputs: nflInputs(), now: NOW, coverage: COVERAGE, nbaRegistry: PERMISSIVE_REGISTRY, canEnterSport: FIXTURE_SPORT_GATE, settlesNba: FIXTURE_NBA_SETTLES, isVerifiedOperator: FIXTURE_OPERATORS });
  const r = out.recommendation;
  const model = { slateDate: NOW.slice(0, 10), evaluatedAt: r.evaluatedAt, operatorSeam: r.operatorSeam, availabilityNote: "", sportNotes: r.sportNotes, tiers: r.tiers.map((t) => ({ ...t, history: null })) };
  const html = render(model);
  const t = text(html);
  assert.equal((html.match(/data-tier-status="QUALIFIED"/g) ?? []).length, 4);
  assert.match(t, /· NBA /);
  assert.match(t, /· NBA \+ NFL /);
  assert.match(t, /Official projection \d+\.\d% · model nba-preseason-experimental-v0\.1@nba-preseason-experimental-v0 · snapshot /);
  assert.ok(t.includes(SAME_GAME_POLICY.note));
  assert.match(t, /FIXTURE — not real picks, not real prices/);
  assert.doesNotMatch(html, /data-sport-note="nba"/, "no 'not authorized' note when NBA legs exist (fixture)");
  assert.doesNotMatch(t, /\b(guaranteed?|risk-free|sure thing|can't lose)\b/i);
});
