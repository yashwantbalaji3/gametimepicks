/**
 * SWAP CANDIDATE PACKING (Phase 5O · /mlb weight). The risk ladder's substitution bench is a client prop carrying every
 * board row; the official StatsAPI headshot URL (~150 bytes) travels as its person id and the panel rebuilds it. The
 * rebuild must be the identical URL, and anything that is not exactly the official URL stays verbatim.
 *
 * Run: npx tsx --test src/lib/mlb/swap-candidate-packing.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { toSwapCandidate } from "./mlb-props.ts";
import { mlbHeadshotUrl, mlbPersonIdFromHeadshotUrl } from "../player-headshots.ts";

const prop = (photoUrl) => ({
  player: "Pete Alonso", photoUrl, teamAbbr: "NYM", opponentAbbr: "BAL", marketLabel: "Total bases", selection: "Over",
  point: 1.5, americanOdds: 120, gameId: "bal-nym", matchup: "BAL @ NYM",
});

test("the id round-trips only for the exact official URL", () => {
  assert.equal(mlbPersonIdFromHeadshotUrl(mlbHeadshotUrl(624413)), "624413");
  assert.equal(mlbPersonIdFromHeadshotUrl("https://img.mlbstatic.com/x/people/624413/headshot/67/current"), null);
  assert.equal(mlbPersonIdFromHeadshotUrl(null), null);
  assert.equal(mlbPersonIdFromHeadshotUrl(undefined), null);
});

test("an official headshot packs to mlbPersonId and the bench rebuilds the same portrait", () => {
  const c = toSwapCandidate(prop(mlbHeadshotUrl(624413)));
  assert.equal("photoUrl" in c, false);
  assert.equal(c.mlbPersonId, "624413");
  assert.equal(c.photoUrl ?? mlbHeadshotUrl(c.mlbPersonId), mlbHeadshotUrl(624413));
  assert.deepEqual({ ...c, mlbPersonId: undefined }, {
    player: "Pete Alonso", mlbPersonId: undefined, teamAbbr: "NYM", opponentAbbr: "BAL", market: "Total bases", marketLabel: "Total bases",
    side: "Over", line: 1.5, americanOdds: 120, gameId: "bal-nym", matchup: "BAL @ NYM",
  });
});

test("no photo stays null (initials), any other URL stays verbatim", () => {
  const none = toSwapCandidate(prop(undefined));
  assert.equal(none.photoUrl, null);
  assert.equal(none.mlbPersonId, undefined);
  assert.equal(toSwapCandidate(prop("https://example.test/p.png")).photoUrl, "https://example.test/p.png");
});

test("the bench panel decodes the packed id (the only place a candidate portrait renders)", () => {
  const src = fs.readFileSync("src/components/parlays/leg-swap-panel.tsx", "utf8");
  assert.match(src, /photo=\{cand\.photoUrl \?\? mlbHeadshotUrl\(cand\.mlbPersonId\)\}/);
  for (const page of ["src/app/mlb/page.tsx", "src/app/build/page.tsx"]) assert.match(fs.readFileSync(page, "utf8"), /\.map\(toSwapCandidate\)/, page);
});
