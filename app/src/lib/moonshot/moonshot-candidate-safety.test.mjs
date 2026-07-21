/**
 * Moonshot public candidate safety — the public candidate pool must NEVER contain a settlement-pending player
 * prop (WC goalscorer / shots / SOT / assists are product-ineligible). `publicMoonshotCandidates` drops any card
 * with a `player_*` leg, the committed artifact carries none, and the tracker renders the filtered pool.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { publicMoonshotCandidates } from "./moonshot-lane.ts";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("publicMoonshotCandidates DROPS any card containing a settlement-pending player-prop leg", () => {
  const lane = {
    candidates: [
      { cardId: "team", legs: [{ market: "double_chance", participant: "A or Draw" }, { market: "match_total_goals", participant: "Under 2.5" }] },
      { cardId: "prop", legs: [{ market: "player_goal_scorer_anytime", participant: "Someone" }] },
      { cardId: "mixed", legs: [{ market: "double_chance", participant: "B or Draw" }, { market: "player_shots_on_target", participant: "X" }] },
    ],
  };
  const pub = publicMoonshotCandidates(lane);
  assert.equal(pub.length, 1, "only the pure team-market card survives");
  assert.equal(pub[0].cardId, "team");
  // no surviving card has a player_* leg
  for (const c of pub) assert.ok(!c.legs.some((l) => /^player_/i.test(l.market)), "no player-prop leg in a public candidate");
});

test("publicMoonshotCandidates tolerates a lane with no candidates", () => {
  assert.deepEqual(publicMoonshotCandidates({}), []);
  assert.deepEqual(publicMoonshotCandidates({ candidates: [] }), []);
});

test("the committed Moonshot artifact's candidate pool contains NO settlement-pending player props", () => {
  const lane = JSON.parse(read("public/data/moonshot-lane/active.json"));
  const markets = (lane.candidates ?? []).flatMap((c) => (c.legs ?? []).map((l) => l.market));
  const props = markets.filter((m) => /^player_/i.test(m));
  assert.deepEqual(props, [], `candidate pool must have no player-prop markets; found: ${props.join(", ")}`);
});

test("the tracker renders the FILTERED public candidate pool, not the raw lane.candidates", () => {
  const src = read("src/components/moonshot/moonshot-lane-tracker.tsx");
  assert.match(src, /publicMoonshotCandidates\(lane\)/, "tracker computes the filtered pool");
  assert.match(src, /pubCandidates\.length > 0/, "the candidate section is gated on the filtered pool");
  assert.doesNotMatch(src, /lane\.candidates\.length > 0/, "no longer renders the raw candidate count");
});

test("money untouched (moonshot cleanup is display-only, paper, $0)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
