/**
 * Session 5 · founder decisions D4 (UFC capability-gated from official products) and D5 (no two legs from one event
 * on an official card unless a real SGP receipt or a validated joint-pricing model exists — neither does).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { legsFromDistinctEvents } from "./card-events.mjs";
import { bbEligibility } from "../daily-portfolio/accounting.ts";

const future = new Date(Date.now() + 6 * 3600_000).toISOString();
const lane = (legs) => ({ legs, fitsTarget: true, step: 1 });
const leg = (sport, gameId) => ({ sport, gameId, matchup: `${gameId} matchup`, kickoffUtc: future });

test("D5 · one leg per event; an unidentifiable event fails closed", () => {
  assert.equal(legsFromDistinctEvents([{ gamePk: 1 }, { gamePk: 2 }]), true);
  assert.equal(legsFromDistinctEvents([{ gamePk: 1 }, { gamePk: 1 }]), false);
  assert.equal(legsFromDistinctEvents([{ gameId: "a" }, { eventId: "a" }]), false, "the key is the event, whatever field carries it");
  assert.equal(legsFromDistinctEvents([{ gamePk: 1 }, {}]), false);
  assert.equal(legsFromDistinctEvents([]), false);
});

test("D4/D5 · Bank Builder / Moonshot activation: registry-gated sport and shared game both refuse", () => {
  const now = Date.now();
  assert.equal(bbEligibility(lane([leg("MLB", "g1"), leg("MLB", "g2")]), now).eligible, true);
  const ufc = bbEligibility(lane([leg("MLB", "g1"), leg("UFC", "b1")]), now);
  assert.equal(ufc.eligible, false);
  assert.match(ufc.reason, /UFC may not enter Bank Builder or Moonshot — capability registry state SCAFFOLD_ONLY/);
  const same = bbEligibility(lane([leg("MLB", "g1"), leg("MLB", "g1")]), now);
  assert.equal(same.eligible, false);
  assert.match(same.reason, /two legs share a game/);
});

test("CONTRACT · every official card producer holds one leg per event", () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const ladder = strip(fs.readFileSync("scripts/parlays/build-risk-ladder.mjs", "utf8"));
  assert.match(ladder, /\.filter\(\(s\) => legsFromDistinctEvents\(s\.legs,/, "the MLB ladder (optimizer slips allow 2–3 per game) must filter");
  assert.match(strip(fs.readFileSync("scripts/ufc/build-ufc-ladder.mjs", "utf8")), /used\.(has|add)\(/, "UFC ladder keys its picks on the bout");
  for (const s of ["epl", "nfl"]) assert.match(strip(fs.readFileSync(`scripts/${s}/build-${s}-ladder.mjs`, "utf8")), /assembleBands\(byFixture\)/, `${s} ladder assembles from one candidate set per fixture`);
  assert.match(strip(fs.readFileSync("src/lib/parlays/band-assembly.mjs", "utf8")), /byFixture\.filter\(\(f\) => !used\.has\(f\.eventId\)\)/);
  assert.match(strip(fs.readFileSync("src/lib/moonshot/rung-card.mjs", "utf8")), /if \(a\.gameId === b\.gameId\) continue;/);
  assert.match(strip(fs.readFileSync("src/lib/daily-portfolio/bank-builder-generation.ts", "utf8")), /max 1 leg per game|distinctGames/);
});
