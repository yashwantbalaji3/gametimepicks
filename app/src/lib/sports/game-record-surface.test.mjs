/**
 * MLB game-level record — surface guards (Program 196 · Release B1).
 *
 * The one mistake these exist to prevent: the game-level ledger and the 32k player-prop ledger
 * flowing into one number. Structure is asserted, never today's values — the artifact regenerates
 * nightly and a test pinned to a count would fail precisely when the product succeeds.
 *
 * Run: npx tsx --test src/lib/sports/game-record-surface.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { GAME_MARKETS } from "../mlb/prediction/grade-games.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the committed record reconciles: family counts sum to the ledger row count, families are exactly the three", () => {
  const rec = JSON.parse(read("public/data/mlb/results/game-predictions-record.json"));
  assert.deepEqual(Object.keys(rec.families).sort(), [...GAME_MARKETS].sort());
  const familySum = Object.values(rec.families).reduce((s, f) => s + f.n, 0);
  assert.equal(familySum, rec.counts.rows, "families must recount to the ledger — a drifted summary is a hand-written number");
  for (const f of Object.values(rec.families)) {
    assert.equal(f.wins + f.losses + f.pushes, f.n, "every graded row is a win, a loss or a push");
  }
  assert.equal(rec.moneyClass, "NEVER_MONEY");
  assert.match(rec.caveat, /separate/i, "the artifact itself carries the separation sentence");
});

test("the ledger and the record agree, and named gaps are counted, not reconstructed", () => {
  const rec = JSON.parse(read("public/data/mlb/results/game-predictions-record.json"));
  const rows = read("public/data/mlb/results/game-predictions-graded.jsonl").split("\n").filter((l) => l.trim());
  assert.equal(rows.length, rec.counts.rows, "record row count restates the ledger exactly");
  assert.ok(Number.isInteger(rec.counts.missingPreEventFinals), "gaps are a number on the artifact, not prose");
  for (const line of rows.slice(0, 50)) {
    const r = JSON.parse(line);
    assert.ok(Date.parse(r.forecastGeneratedAt) < Date.parse(r.firstPitchUtc), `${r.gamePk}:${r.market} graded from a pre-first-pitch revision`);
  }
});

test("both public surfaces render the game record as a SEPARATE block with the separation stated", () => {
  const sportPage = read("src/app/results/picks/[sport]/page.tsx");
  assert.match(sportPage, /loadMlbGameRecord/, "the per-sport page reads the game record");
  assert.match(sportPage, /Separate record · game level/, "the section is labelled separate");
  assert.match(sportPage, /before that game&apos;s first pitch/, "the pre-event rule is stated to the reader");
  const index = read("src/app/results/picks/page.tsx");
  assert.match(index, /game predictions — a separate record/i);
  assert.match(index, /never combined/i, "the index says the two records are never combined");
});

test("the player-prop artifact and the game artifact stay different files with different questions", () => {
  const props = JSON.parse(read("public/data/mlb/graded-picks.json"));
  assert.match(props.what ?? "", /player-prop/i, "graded-picks.json remains the player-prop record");
  assert.ok(!("families" in props), "game families never leak into the player-prop artifact");
});
