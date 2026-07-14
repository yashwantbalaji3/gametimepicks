/**
 * Product reset Phase B — per-sport simulation depth, honestly. Pins: the WC bracket invents no finalists
 * (Final + third-place stay TBD), the methodology panels tell the honest story per sport, and each center
 * mounts the methodology panel + coverage matrix.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd(); // app/
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("WC bracket context invents NO finalists — Final + third-place are TBD", () => {
  const src = read("src/components/world-cup/wc-bracket-context.tsx");
  assert.match(src, /Winner SF1 vs Winner SF2/, "final is Winner SF1 vs Winner SF2, not a real matchup");
  assert.match(src, /Loser SF1 vs Loser SF2/, "third-place is Loser SF1 vs Loser SF2");
  assert.match(src, /TBD/, "finalists shown as TBD");
  // No hardcoded country/team name anywhere in the component (teams only ever arrive via props).
  assert.doesNotMatch(src, /France|Spain|England|Argentina|Brazil|Portugal/, "no fabricated team names in the bracket component");
});

test("sport methodology panels are honest (no overclaim)", () => {
  const src = read("src/components/sport-methodology-panel.tsx");
  assert.match(src, /NOT an independent soccer simulation/i, "soccer is market-implied, not an independent sim");
  assert.match(src, /no independent full-game score model/i, "MLB full-game is not an independent sim");
  assert.match(src, /[Ee]xperimental/, "UFC is experimental");
  assert.match(src, /never faked|never priced|not fabricated|Nothing is fabricated/i, "explicit no-fabrication language");
  const banned = /\block\b|guaranteed|best bet|positive EV|validated edge|sure thing/i;
  assert.doesNotMatch(src, banned, "no forbidden betting claims");
});

test("each sport center mounts the methodology panel + coverage matrix; WC mounts the bracket", () => {
  for (const [rel, sport] of [["src/app/mlb/page.tsx", "mlb"], ["src/app/world-cup/page.tsx", "soccer"], ["src/app/ufc/page.tsx", "ufc"]]) {
    const src = read(rel);
    assert.match(src, /SportMethodologyPanel sport="[a-z]+"/, `${rel} renders the methodology panel`);
    assert.match(src, new RegExp(`SimulationCoverageMatrix sport="${sport}"`), `${rel} renders the ${sport} coverage matrix`);
  }
  const wc = read("src/app/world-cup/page.tsx");
  assert.match(wc, /WcBracketContext/, "/world-cup renders the bracket context");
  assert.match(wc, /sfFixtures/, "/world-cup derives real semifinal fixtures for the bracket");
});
